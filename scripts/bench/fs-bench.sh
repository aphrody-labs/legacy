#!/bin/sh
# Loop-image filesystem benchmark on fr1. Usage: fs-bench.sh <variant>...  (ext4 xfs xfs-tuned btrfs)
# Never touches a live disk: sparse image under /srv/bench-img, loop-mounted at /mnt/fsb. Run as root.
export PATH=/home/ubuntu/.cargo/bin:$PATH RUSTUP_HOME=/home/ubuntu/.rustup
export RUSTC_WRAPPER=
export CARGO_HOME=/srv/bench-cargo-home
mkdir -p $CARGO_HOME
[ -d /tmp/cv/t ] && ( cd /tmp/cv/t && cargo fetch -q )
export GIT_CONFIG_GLOBAL=/tmp/fsbench-gitconfig
printf '[safe]\n\tdirectory = *\n' > $GIT_CONFIG_GLOBAL
IMG_DIR=/srv/bench-img
M=/mnt/fsb
OUT=/tmp/fsbench
SIZE=10G
DROP='sync; echo 3 > /proc/sys/vm/drop_caches'
mkdir -p $IMG_DIR $M $OUT
[ -f /tmp/ghidra-rust.tar ] || git -C /srv/ghidra-rust archive HEAD -o /tmp/ghidra-rust.tar
HEADSHA=$(git -C /srv/ghidra-rust rev-parse HEAD)
OLDSHA=$(git -C /srv/ghidra-rust rev-parse HEAD~300)

for V in "$@"; do
  L=$OUT/$V$SUF.log
  : > $L
  echo "=== $V $(date -u +%FT%TZ)" >> $L
  rm -f $IMG_DIR/$V.img
  truncate -s $SIZE $IMG_DIR/$V.img
  DEV=$(losetup -f --show $IMG_DIR/$V.img)
  echo "dev $DEV" >> $L
  T0=$(date +%s.%N)
  case $V in
    ext4) mkfs.ext4 -q -F $DEV; OPTS=noatime ; T=ext4;;
    xfs) mkfs.xfs -q -f $DEV; OPTS=noatime; T=xfs;;
    xfs-tuned) mkfs.xfs -q -f -m bigtime=1,inobtcount=1 $DEV; OPTS=noatime,logbsize=256k; T=xfs;;
    btrfs) mkfs.btrfs -q -f $DEV; OPTS=noatime; T=btrfs;;
  esac
  T1=$(date +%s.%N)
  echo "mkfs_seconds $(echo "$T1 $T0" | awk '{print $1-$2}')" >> $L
  mount -t $T -o $OPTS $DEV $M
  mount | grep " $M " >> $L
  [ $T = xfs ] && xfs_info $M >> $L
  hf() { echo "load: $(uptime | sed 's/.*load average: //')" >> $L; hyperfine --style basic "$@" 2>&1 | grep -E 'Benchmark|Time \(mean|Range' >> $L; }

  if [ -z "$ONLY" ]; then
  echo "--- W1 git clone --local --no-hardlinks (cold)" >> $L
  hf -w 0 -r 5 --prepare "rm -rf $M/ghidra; $DROP" "git clone -q --local --no-hardlinks /srv/ghidra-rust $M/ghidra"
  [ -d $M/ghidra ] || git clone -q --local --no-hardlinks /srv/ghidra-rust $M/ghidra
  echo "--- W2 git status cold" >> $L
  hf -w 0 -r 5 --prepare "$DROP" "git -C $M/ghidra status -s"
  echo "--- W2b git status warm" >> $L
  hf -w 2 -r 10 "git -C $M/ghidra status -s"
  echo "--- W3 git checkout HEAD~300 <-> HEAD (warm, 2 checkouts per run)" >> $L
  git -C $M/ghidra checkout -q -f --detach $HEADSHA
  hf -w 1 -r 5 "git -C $M/ghidra checkout -q -f --detach $OLDSHA && git -C $M/ghidra checkout -q -f --detach $HEADSHA"
  echo "--- W4 untar git archive (cold)" >> $L
  hf -w 0 -r 5 --prepare "rm -rf $M/untar; mkdir -p $M/untar; $DROP" "tar -xf /tmp/ghidra-rust.tar -C $M/untar"
  echo "--- W5 fio small files 4 jobs x 5000 x 4k, end_fsync" >> $L
  for i in 1 2 3; do
    rm -rf $M/fio; mkdir -p $M/fio; sh -c "$DROP"
    fio --name=sm --directory=$M/fio --numjobs=4 --nrfiles=5000 --filesize=4k --rw=write --bs=4k --end_fsync=1 --group_reporting 2>&1 | grep -E 'WRITE:|write:' >> $L
  done
  rm -rf $M/fio $M/untar
  fi

  echo "--- W6 cargo check -p tauri full (cold target, rustc, deps from tmpfs CARGO_HOME)" >> $L
  rm -rf $M/t $M/target
  git clone -q --local --no-hardlinks /srv/upabs/tauri $M/t
  export CARGO_TARGET_DIR=$M/target
  hf -w 0 -r 3 --prepare "rm -rf $M/target; $DROP" "cd $M/t && timeout 900 cargo check -p tauri-utils --offline -q"
  echo "--- W7 cargo check -p tauri incremental after touching lib.rs (warm)" >> $L
  hf -w 1 -r 5 --prepare "touch $M/t/crates/tauri-utils/src/lib.rs" "cd $M/t && timeout 900 cargo check -p tauri-utils --offline -q"
  echo "target_files $(find $M/target -type f | wc -l) target_MB $(du -sm $M/target | cut -f1)" >> $L

  echo "--- W8 clone of target dir: cp -a (plain)" >> $L
  hf -w 0 -r 5 --prepare "rm -rf $M/target2; $DROP" "cp -a $M/target $M/target2"
  if [ $T != ext4 ]; then
    echo "--- W8b cp -a --reflink=always" >> $L
    hf -w 0 -r 5 --prepare "rm -rf $M/target2; $DROP" "cp -a --reflink=always $M/target $M/target2"
  else
    cp -a --reflink=always $M/target $M/target_x 2>> $L
    echo "ext4 reflink exit $?" >> $L
  fi
  rm -rf $M/target2 $M/target_x
  df -T $M >> $L
  echo "--- W9 rm -rf target (once)" >> $L
  sh -c "$DROP"; R0=$(date +%s.%N); rm -rf $M/target; R1=$(date +%s.%N)
  echo "rm_target_seconds $(echo "$R1 $R0" | awk '{print $1-$2}')" >> $L

  sync; umount $M; losetup -d $DEV; rm -f $IMG_DIR/$V.img
  echo "=== done $V $(date -u +%FT%TZ)" >> $L
done
rmdir $IMG_DIR 2>/dev/null
echo ALLDONE >> $OUT/status
