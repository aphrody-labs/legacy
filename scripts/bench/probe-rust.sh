#!/bin/sh
# Probe Rust toolchain state on fr1 (ssh <fr1> sh -s < probe-rust.sh).
export PATH=$HOME/.cargo/bin:$PATH
cd /srv/src || exit 1
git rev-parse --short HEAD
git status --short | wc -l
rustc -Vv | head -3
cargo -V
rustup component list --installed 2>/dev/null | tr '\n' ' '
echo
ls /srv/bench 2>&1 | head
ls crates | head -40
du -sh /srv/src/target 2>/dev/null
echo "wrapper=$RUSTC_WRAPPER target=$CARGO_TARGET_DIR"
uptime
ls -la ~/.cargo/config.toml
rg -v -i 'key|secret|token' ~/.cargo/config.toml
