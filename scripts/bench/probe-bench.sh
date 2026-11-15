#!/bin/sh
# Probe targets, cranelift, bolt on fr1.
export PATH=$HOME/.cargo/bin:$PATH
cd /srv/bench/src
cargo metadata --format-version 1 --no-deps 2>/dev/null | jaq -r '.packages[] | .name as $n | .targets[] | "\($n) \(.kind|join(",")) \(.name)"' 2>/dev/null || echo nojaq
which jaq jq
for t in chromium-157 nightly-2026-11-13 nightly; do
  echo "== $t"
  ls ~/.rustup/toolchains/$t/bin | tr '\n' ' '
  echo
  ls ~/.rustup/toolchains/$t/lib/rustlib/x86_64-unknown-linux-gnu/bin 2>/dev/null | tr '\n' ' '
  echo
  ls ~/.rustup/toolchains/$t/lib | rg -i 'cranelift|rustc_codegen' | head -3
  RUSTUP_TOOLCHAIN=$t rustc -V
done
which llvm-bolt llvm-profdata perf2bolt merge-fdata
ls /usr/lib | rg -i 'llvm' | head
apt-cache policy bolt-18 bolt-19 bolt-20 bolt 2>/dev/null | head -12
rg -n 'profile.dev|test-affected|^affected' -A12 /srv/bench/src/Cargo.toml | head -0
cargo hakari --version 2>&1 | head -1
cargo pgo --version 2>&1 | head -1
bun --version
