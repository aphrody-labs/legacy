#!/bin/sh
. "$(git rev-parse --show-toplevel)/system/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local: push scripts to fr1 and start 3 parallel variant chains (own src copy + target dir each).
for f in run-variant.sh scen.sh; do
  timeout 60 ssh "$FR1" "cat > /srv/bench/$f" < C:/aphrody/scripts/bench/$f
done
timeout 60 ssh "$FR1" 'cd /srv/bench; nohup sh scen.sh t16 t4 > chain1.log 2>&1 < /dev/null &
nohup sh scen.sh t0 sgn > chain2.log 2>&1 < /dev/null &
nohup sh scen.sh mold lld > chain3.log 2>&1 < /dev/null &'
echo launched
