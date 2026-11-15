export RUSTC_WRAPPER=
export CARGO_HOME=/tmp/bench-cargo-home
mkdir -p $CARGO_HOME
cd /tmp/cv/t || exit 1
export CARGO_TARGET_DIR=/tmp/cv/target
cargo fetch 2>&1 | tail -3
( time cargo check -p tauri-utils --offline 2>&1 | tail -4 ) 2>&1 | tail -8
( time cargo check -p tauri --offline 2>&1 | tail -4 ) 2>&1 | tail -8
du -sm /tmp/cv/target $CARGO_HOME
find /tmp/cv/target -type f | wc -l
