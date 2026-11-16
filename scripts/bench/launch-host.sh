#!/bin/sh
# Local: ship workspace copy to fr2 and run the ABBA host-tuning bench detached (log /srv/bench/host.log).
set -e
timeout 60 ssh fr2 'mkdir -p /srv/bench; command -v hyperfine'
git -C C:/aphrody archive HEAD Cargo.toml Cargo.lock rust-toolchain.toml .cargo src/depot src/core frameworks/taffy | timeout 300 ssh fr2 'cat > /srv/bench/in.tar'
for f in members.txt setup-bench-ws.sh host-bench.sh host-rollback.sh; do
  timeout 60 ssh fr2 "cat > /srv/bench/$f" < C:/aphrody/scripts/bench/$f
done
timeout 60 ssh fr2 'nohup sh -c "sh /srv/bench/setup-bench-ws.sh < /srv/bench/in.tar; RUSTUP_TOOLCHAIN=stable; export RUSTUP_TOOLCHAIN; for c in base cachy base cachy; do sh /srv/bench/host-bench.sh \$c; done; for c in base cachy; do CLEAN=1 sh /srv/bench/host-bench.sh \$c; done; sh /srv/bench/host-rollback.sh; echo ALLDONE" > /srv/bench/host.log 2>&1 < /dev/null &'
echo launched
