#!/bin/sh
# fr1: cargo test vs nextest (full, and slice 1/2 + 2/2) on the depot crates; tests already built by scen.sh (variant t16).
export PATH=$HOME/.cargo/bin:$PATH RUSTUP_TOOLCHAIN=${TC:-stable} RUSTC_BOOTSTRAP=1 RUSTC_WRAPPER= CARGO_BUILD_JOBS=6
export CARGO_TARGET_DIR=/srv/bench/t-${TC:-stable}-t16
export RUSTFLAGS="--cfg tokio_unstable --cfg uuid_unstable -Cforce-unwind-tables=yes -Cforce-frame-pointers=yes -Zthreads=16"
R=/srv/bench/res
cd /srv/bench/src-t16 || exit 1
P="-p depot-core -p depot-forge -p depot-graph -p depot-ingest -p depot-migrate"
cargo test -q --no-run $P 2>&1 | tail -1
cargo test -q $P 2>&1 | rg 'test result' | head -8
H="hyperfine -i --runs 5 --warmup 1 --style basic"
$H --export-json $R/test-cargo.json "cargo test -q $P"
$H --export-json $R/test-nextest.json "cargo nextest run --no-fail-fast $P"
$H --export-json $R/test-nextest-slice1.json "cargo nextest run --no-fail-fast --partition slice:1/2 $P"
$H --export-json $R/test-nextest-slice2.json "cargo nextest run --no-fail-fast --partition slice:2/2 $P"
