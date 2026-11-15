#!/bin/sh
# fr2 only. host-bench.sh <base|cachy> : apply tunables, hyperfine git + cargo scenarios.
# Originals saved once in /srv/bench/host-orig.env for rollback (host-rollback.sh).
export PATH=$HOME/.cargo/bin:$PATH
export RUSTC_BOOTSTRAP=1
export RUSTUP_TOOLCHAIN=stable
C=$1
TS=$(date +%H%M%S)
B=/srv/bench
R=$B/res
mkdir -p $R
W() { echo "$1" | sudo -n tee "$2" >/dev/null; }
if [ ! -f $B/host-orig.env ]; then
  {
    echo "SW=$(sysctl -n vm.swappiness)"
    echo "DB=$(sysctl -n vm.dirty_bytes)"
    echo "DBB=$(sysctl -n vm.dirty_background_bytes)"
    echo "SCHED=$(sed 's/.*\[\(.*\)\].*/\1/' /sys/block/sda/queue/scheduler)"
    echo "THP=$(sed 's/.*\[\(.*\)\].*/\1/' /sys/kernel/mm/transparent_hugepage/defrag)"
  } > $B/host-orig.env
fi
. $B/host-orig.env
case $C in
  base)
    sudo -n sysctl -q -w vm.swappiness=$SW vm.dirty_bytes=$DB vm.dirty_background_bytes=$DBB
    W $SCHED /sys/block/sda/queue/scheduler
    W $THP /sys/kernel/mm/transparent_hugepage/defrag
    ;;
  cachy)
    sudo -n sysctl -q -w vm.swappiness=100 vm.dirty_ratio=10 vm.dirty_background_ratio=3
    W kyber /sys/block/sda/queue/scheduler
    W defer+madvise /sys/kernel/mm/transparent_hugepage/defrag
    ;;
esac
echo "== $C sw=$(sysctl -n vm.swappiness) dr=$(sysctl -n vm.dirty_ratio) db=$(sysctl -n vm.dirty_bytes) sched=$(cat /sys/block/sda/queue/scheduler) thp=$(cat /sys/kernel/mm/transparent_hugepage/defrag) load=$(cut -d' ' -f1 /proc/loadavg)"
H="hyperfine --runs 5 --warmup 1 --style basic"
G="git -C /srv/src"
$H --export-json $R/host-$C-$TS-gitstatus.json "$G status --porcelain -uno"
$H --prepare "sync; echo 3 | sudo -n tee /proc/sys/vm/drop_caches >/dev/null" --export-json $R/host-$C-$TS-gitstatus-cold.json "$G status --porcelain -uno"
export CARGO_TARGET_DIR=$B/th-$C
export RUSTC_WRAPPER=
cd $B/src
if [ "$CLEAN" = 1 ]; then
  hyperfine --runs 3 --warmup 0 --style basic --prepare "rm -rf $CARGO_TARGET_DIR" --export-json $R/host-$C-$TS-cargoclean.json "cargo build -q -p depot-core"
fi
cargo build -q -p depot-core 2>/dev/null
$H --prepare "sed -i '/__b_/d' src/depot/core/src/lib.rs; echo \"pub fn __b_\$(date +%s%N)() {}\" >> src/depot/core/src/lib.rs" --export-json $R/host-$C-$TS-cargoinc.json "cargo build -q -p depot-core"
