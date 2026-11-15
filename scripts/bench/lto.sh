#!/bin/sh
# fr1: release LTO modes on a tiny bin that links depot-cli. Edit-core + release rebuild, N=5 each.
export PATH=$HOME/.cargo/bin:$PATH RUSTUP_TOOLCHAIN=${TC:-stable} RUSTC_BOOTSTRAP=1 RUSTC_WRAPPER=
B=/srv/bench
D=$B/src-lto
R=$B/res
mkdir -p $R
if [ ! -d $D ]; then
  cp -a $B/src $D
  mkdir -p $D/src/benchbin/src
  cat > $D/src/benchbin/Cargo.toml <<'E'
[package]
name = "benchbin"
version.workspace = true
edition.workspace = true
license.workspace = true
[dependencies]
depot-cli.workspace = true
E
  cat > $D/src/benchbin/src/main.rs <<'E'
fn main() {
    let a: Vec<String> = std::env::args().skip(2).collect();
    let c = std::env::args().nth(1).unwrap_or_default();
    std::process::exit(depot_cli::run(&c, &a));
}
E
  sed -i 's#  "src/depot/cli",#  "src/depot/cli",\n  "src/benchbin",#' $D/Cargo.toml
  rg -c benchbin $D/Cargo.toml
fi
cd $D
BASE="--cfg tokio_unstable --cfg uuid_unstable -Cforce-unwind-tables=yes -Cforce-frame-pointers=yes"
for L in off thin fat; do
  export CARGO_TARGET_DIR=$B/t-lto-$L
  export CARGO_PROFILE_RELEASE_LTO=$L
  export CARGO_PROFILE_RELEASE_CODEGEN_UNITS=$([ $L = fat ] && echo 1 || echo 16)
  export RUSTFLAGS="$BASE"
  export CARGO_BUILD_JOBS=6
  echo "== lto=$L start $(date +%T) load $(cut -d' ' -f1-3 /proc/loadavg)"
  /usr/bin/time -f "initial wall=%e user=%U sys=%S" cargo build -q --release -p benchbin 2>&1 | tail -3
  hyperfine --runs 5 --warmup 0 --style basic \
    --prepare "echo \"pub fn __b_\$(date +%s%N)() {}\" >> src/depot/core/src/lib.rs" \
    --export-json $R/lto-$L.json "cargo build -q --release -p benchbin"
  ls -l $CARGO_TARGET_DIR/release/benchbin | awk '{print "binsize", $5}'
  echo "== lto=$L done $(date +%T)"
done
