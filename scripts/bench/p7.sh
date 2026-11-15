export RUSTC_WRAPPER= CARGO_HOME=/tmp/bench-cargo-home CARGO_TARGET_DIR=/tmp/cv/target
rm -rf $CARGO_HOME
mkdir -p $CARGO_HOME
cd /tmp/cv/t
cargo fetch 2>&1 | tail -2
cargo check -p tauri --offline -q 2>&1 | tail -5
echo done
