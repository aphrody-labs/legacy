#!/bin/sh
export PATH=$HOME/.cargo/bin:$PATH RUSTC_BOOTSTRAP=1 RUSTUP_TOOLCHAIN=stable RUSTC_WRAPPER=
cd /srv/bench/src && CARGO_TARGET_DIR=/srv/bench/th-dbg cargo build -p depot-core 2>&1 | tail -15
