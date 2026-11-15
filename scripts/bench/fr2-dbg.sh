#!/bin/sh
rg -n 'benchbin|"src/core"' /srv/bench/src-lto/Cargo.toml | head
command -v sd
rg -a 'cold-fill|wall=' /srv/bench/sccache.log
rg -a 'passed|FAIL|failed' /srv/bench/nextest.log | head -6
cd /srv/bench/src-t16 && RUSTUP_TOOLCHAIN=stable RUSTC_BOOTSTRAP=1 CARGO_TARGET_DIR=/srv/bench/t-stable-t16 cargo test -q -p depot-core 2>&1 | rg -a 'panicked|FAILED|failed' | head -6
