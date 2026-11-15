#!/bin/sh
. "$(git rev-parse --show-toplevel)/packages/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local: block until all chain logs on fr1 contain 'lld done'/'t4 done'/'sgn done' (or 40 min), printing progress.
i=0
while [ $i -lt 80 ]; do
  n=$(timeout 30 ssh "$FR1" 'rg -c "^== .* done" /srv/bench/chain1.log /srv/bench/chain2.log /srv/bench/chain3.log' 2>/dev/null | tr '\n' ' ')
  echo "$(date +%T) $n"
  case "$n" in *chain1.log:2*chain2.log:2*chain3.log:2*) break ;; esac
  sleep 30
  i=$((i+1))
done
