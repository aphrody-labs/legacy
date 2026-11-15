#!/bin/bash
# Reproducible load probe for the offload work: PSI avg300, load, NativeLink scheduler latency, cargo incremental build time.
#   fleet-offload-bench.sh <label>            appends one TSV line to /var/log/fleet/offload-bench.tsv (or $OUT) and prints it
# cargo: synthetic dependency-free crate (60 modules x 300 fns, generated on first use under $WORK, on the SSD root), warm build,
#   then touch one module and rebuild incrementally: the number is dominated by CPU/IO contention, not by the code.
# NativeLink: 120 GET /status on the scheduler HTTP listener (REAPI itself needs a siso/bazel client; none ran during the study).
label=${1:?label}
WORK=${WORK:-/srv/offload-bench}; OUT=${OUT:-/var/log/fleet/offload-bench.tsv}
NL=${NL:-http://10.200.77.1:50061/status}
psi() { awk -v k="$2" '/^some/{split($4,a,"=");print a[2]}' /proc/pressure/"$1"; }
cpu300=$(psi cpu); io300=$(psi io); mem300=$(psi memory); load=$(cut -d' ' -f1-3 /proc/loadavg | tr ' ' '/')
nl=""; if command -v curl >/dev/null; then
  nl=$(for i in $(seq 120); do curl -s -o /dev/null -w '%{time_total}\n' "$NL"; done | sort -n |
       awk '{v[NR]=$1} END{printf "p50=%.1fms p95=%.1fms max=%.1fms", v[int(NR*.5)]*1000, v[int(NR*.95)]*1000, v[NR]*1000}')
fi
mkdir -p "$WORK/crate/src"; cd "$WORK/crate" || exit 1
if [ ! -f Cargo.toml ]; then
  printf '[package]\nname="inc"\nversion="0.0.0"\nedition="2024"\n[profile.dev]\nincremental=true\n' > Cargo.toml
  : > src/main.rs
  for m in $(seq 60); do
    { for f in $(seq 300); do echo "pub fn f${m}_$f(x: u64) -> u64 { let mut a = x; for i in 0..$f { a = a.wrapping_mul(6364136223846793005).wrapping_add(i as u64 ^ $m); } a }"; done; } > src/m$m.rs
    echo "mod m$m;" >> src/main.rs
  done
  echo 'fn main(){ println!("{}", m1::f1_1(1)); }' >> src/main.rs
  sed -i 's/^mod m\([0-9]*\);/pub mod m\1;/' src/main.rs
fi
export CARGO_TARGET_DIR=$WORK/target CARGO_INCREMENTAL=1 RUSTC_WRAPPER=
cargo build -q 2>/dev/null
echo "// $RANDOM" >> src/m7.rs
t0=$(date +%s.%N); cargo build -q 2>/dev/null; t1=$(date +%s.%N)
inc=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')
mkdir -p "$(dirname "$OUT")"
line=$(printf '%s\t%s\tcpuPSI300=%s\tioPSI300=%s\tmemPSI300=%s\tload=%s\tnativelink[%s]\tcargo_inc_s=%s' "$(date -u +%FT%TZ)" "$label" "$cpu300" "$io300" "$mem300" "$load" "$nl" "$inc")
echo "$line" | tee -a "$OUT"
