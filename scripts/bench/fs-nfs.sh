#!/bin/bash
# Same workload on one directory: git status, checkout, clone of a 18k-file tree, cargo check of a
# dependency-free crate (cold target in the same directory). Run it once per location: NFS mount and ext4 from fr2, local XFS from fr1.
#   scripts/bench/fs-nfs.sh <dir> [make <srctree>|prep]   "make" builds <dir>/r from <srctree> (untar timed, git init + 2 commits); "prep" = the git and crate steps only. Long runs: nohup ... > log &
#   NFILES=2000 (default) files of the tree; the same count on every location. TC=+1.100.0 pins the cargo toolchain.   Output: label, mean ± sd, from hyperfine (N=6, warm-ups 1).
set -eu
d=$1; mode=${2:-run}; src=${3:-/srv/gbfull}; tc=${TC:-}
if [ "$mode" = make ] || [ "$mode" = prep ]; then
  if [ "$mode" = make ]; then
    rm -rf "$d"; mkdir -p "$d/r"
    s=$(date +%s.%N); (cd "$src" && find . -type f -not -path './.git/*' | sort | head -n "${NFILES:-2000}" | tar -cf - -T -) | tar -C "$d/r" -xf -; e=$(date +%s.%N)
    echo "untar $(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.2f s", b-a}')"
  fi
  g() { git -C "$d/r" -c user.name=b -c user.email=b@b "$@"; }
  git -C "$d/r" init -q; git -C "$d/r" add -A; g commit -qm base
  git -C "$d/r" ls-files | awk 'NR%8==0' | while read -r f; do if [ -f "$d/r/$f" ] && [ ! -L "$d/r/$f" ]; then echo x >> "$d/r/$f"; fi; done
  g commit -qam change
  mkdir -p "$d/crate/src"; printf '[package]\nname="synth"\nversion="0.1.0"\nedition="2021"\n' > "$d/crate/Cargo.toml"
  for m in $(seq 1 60); do for f in $(seq 1 300); do echo "pub fn f${m}_$f(x: u64) -> u64 { x.wrapping_mul($f).wrapping_add($m) }"; done > "$d/crate/src/m$m.rs"; echo "pub mod m$m;" >> "$d/crate/src/lib.rs"; done
  exit 0
fi
H="hyperfine -w 1 -r 6"
echo "== $d ($(findmnt -no FSTYPE -T "$d")) load $(cut -d' ' -f1 /proc/loadavg)"
$H -N "git -C $d/r status --porcelain" 2>&1 | rg "Time"
$H "git -C $d/r checkout -q HEAD~1 && git -C $d/r checkout -q -" 2>&1 | rg "Time"
$H -p "rm -rf $d/c" "cp -a $d/r $d/c" 2>&1 | rg "Time"
rm -rf "$d/c"
$H -p "rm -rf $d/tgt" "env RUSTC_WRAPPER= CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=$d/tgt cargo $tc check --manifest-path $d/crate/Cargo.toml --offline -q" 2>&1 | rg "Time"
rm -rf "$d/tgt"
