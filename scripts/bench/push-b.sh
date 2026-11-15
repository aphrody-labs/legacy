#!/bin/sh
. "$(git rev-parse --show-toplevel)/packages/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local: push run-variant.sh as run-variant-b.sh plus the sccache/nextest/lto scripts to fr1 (no overwrite of the running one).
timeout 60 ssh "$FR1" 'cat > /srv/bench/run-variant-b.sh' < C:/src/scripts/bench/run-variant.sh
for f in sccache.sh nextest.sh lto.sh; do
  timeout 60 ssh "$FR1" "cat > /srv/bench/$f" < C:/src/scripts/bench/$f
done
echo pushed
