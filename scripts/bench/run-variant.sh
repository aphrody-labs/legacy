#!/bin/sh
# fr1 bench runner: run-variant.sh <variant> <action>
# Variant = rustflags/profile/wrapper combination, action = what to build. One target dir per variant.
# Needs /srv/bench/src (setup-bench-ws.sh). Never wraps rustc unless the variant says so.
export PATH=$HOME/.cargo/bin:$PATH
V=$1
A=$2
B=/srv/bench
BASE="--cfg tokio_unstable --cfg uuid_unstable -Cforce-unwind-tables=yes -Cforce-frame-pointers=yes"
TC=${TC:?the rustup toolchain named by rust-toolchain.toml}
export RUSTUP_TOOLCHAIN=$TC
export RUSTC_BOOTSTRAP=1
export CARGO_TARGET_DIR=$B/t-$TC-$V
export RUSTC_WRAPPER=
export CARGO_BUILD_JOBS=${JOBS:-12}
export CARGO_INCREMENTAL=${INCR:-1}
PROFILE_ARGS=""
CARGO_UNSTABLE=""
case $V in
  t16) F="$BASE -Zthreads=16" ;;
  t0) F="$BASE" ;;
  nw) F="$BASE"; export CARGO_INCREMENTAL=0 ;;
  t4) F="$BASE -Zthreads=4" ;;
  t8) F="$BASE -Zthreads=8" ;;
  sgn) F="$BASE -Zshare-generics=n" ;;
  sgy) F="$BASE -Zshare-generics=y" ;;
  mold) F="$BASE -Clink-arg=-fuse-ld=mold" ;;
  lld) F="$BASE -Clink-arg=-fuse-ld=lld" ;;
  bfd) F="$BASE" ;;
  noinc) F="$BASE"; export CARGO_INCREMENTAL=0 ;;
  inc) F="$BASE"; export CARGO_INCREMENTAL=1 ;;
  fu-pkg) F="$BASE" ;;
  fu-ws) F="$BASE"; export CARGO_UNSTABLE_FEATURE_UNIFICATION=true; export CARGO_RESOLVER_FEATURE_UNIFICATION=workspace ;;
  sccache) F="$BASE"; export CARGO_INCREMENTAL=0; export RUSTC_WRAPPER=/usr/local/bin/sccache; export SCCACHE_DIR=$B/sccache-local; export SCCACHE_CACHE_SIZE=20G ;;
  cl) F="$BASE"; PROFILE_ARGS="-Zcodegen-backend=cranelift" ;;
  *) echo "unknown variant $V"; exit 2 ;;
esac
export RUSTFLAGS="$F"
test -d $B/src-$V || cp -a $B/src $B/src-$V
cd $B/src-$V || exit 1
case $A in
  clean) rm -rf "$CARGO_TARGET_DIR" ;;
  build) cargo build -q -p depot-cli $PROFILE_ARGS ;;
  buildcore) cargo build -q -p depot-core $PROFILE_ARGS ;;
  buildgraph) cargo build -q -p depot-graph $PROFILE_ARGS ;;
  tests) cargo test -q --no-run -p depot-core -p depot-forge -p depot-graph -p depot-ingest -p depot-migrate $PROFILE_ARGS ;;
  editcore) echo "pub fn __bench_edit_$(date +%s%N)() {}" >> src/depot/core/src/lib.rs ;;
  editleaf) echo "pub fn __bench_edit_$(date +%s%N)() {}" >> src/depot/graph/src/lib.rs ;;
  touchcore) touch src/depot/core/src/lib.rs ;;
  wsclean) cargo clean -q -p depot-core -p depot-forge -p depot-graph -p depot-ingest -p depot-migrate -p depot-cli -p aphrody-core ;;
  release) cargo build -q --release -p depot-cli $PROFILE_ARGS ;;
  *) echo "unknown action $A"; exit 2 ;;
esac
