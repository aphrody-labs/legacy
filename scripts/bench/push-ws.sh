#!/bin/sh
. "$(git rev-parse --show-toplevel)/packages/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local: ship a trimmed copy of the workspace sources to fr1:/srv/bench and set it up.
set -e
git -C C:/src archive HEAD Cargo.toml Cargo.lock rust-toolchain.toml .cargo src/depot src/core src/taffy | timeout 300 ssh "$FR1" 'mkdir -p /srv/bench && cat > /srv/bench/in.tar'
timeout 60 ssh "$FR1" 'cat > /srv/bench/members.txt' < C:/src/scripts/bench/members.txt
timeout 60 ssh "$FR1" 'cat > /srv/bench/setup-bench-ws.sh' < C:/src/scripts/bench/setup-bench-ws.sh
timeout 300 ssh "$FR1" 'sh /srv/bench/setup-bench-ws.sh < /srv/bench/in.tar'
