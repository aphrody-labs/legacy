#!/bin/bash
# Why does sccache hit ~0 % on the fleet (fr1: 3 hits / 2614 Rust compiles, 2026-11-15)? Rebuild the same dependency set (regex)
# three times with a private sccache server: (A) cold, (B) same CARGO_HOME + other target dir, (C) other CARGO_HOME path.
# Prints cache hits/misses after each step. Needs network once (crates.io). Scratch under $W (default /tmp/sccache-keytest).
set -eu
W=${W:-/tmp/sccache-keytest}; rm -rf "$W"; mkdir -p "$W/app/src"; cd "$W/app"
printf '[package]\nname="app"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nregex="1"\n' > Cargo.toml
echo 'fn main(){ println!("{}", regex::Regex::new("a+").unwrap().is_match("caat")); }' > src/main.rs
export RUSTC_WRAPPER=sccache CARGO_INCREMENTAL=0 SCCACHE_DIR=$W/sc SCCACHE_SERVER_PORT=${PORT:-4999}
sccache --stop-server >/dev/null 2>&1 || true; sccache --start-server >/dev/null
step() { # step <label> <cargo_home> <target>
  CARGO_HOME=$2 CARGO_TARGET_DIR=$3 cargo build -q 2>/dev/null
  printf '%-34s hits=%s misses=%s\n' "$1" "$(sccache --show-stats | awk '/^Cache hits  /{print $3}')" "$(sccache --show-stats | awk '/^Cache misses  /{print $3}')"
}
step "A cold"                       "$W/ch1" "$W/t1"
step "B same CARGO_HOME, new target" "$W/ch1" "$W/t2"
cp -r "$W/ch1" "$W/ch2"
step "C other CARGO_HOME path"      "$W/ch2" "$W/t3"
sccache --stop-server >/dev/null 2>&1 || true
