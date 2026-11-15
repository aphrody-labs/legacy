#!/bin/sh
# Local: push scripts to fr1 and start 3 parallel variant chains (own src copy + target dir each).
for f in run-variant.sh scen.sh; do
  timeout 60 ssh vps "cat > /srv/bench/$f" < C:/src/scripts/bench/$f
done
timeout 60 ssh vps 'cd /srv/bench; nohup sh scen.sh t16 t4 > chain1.log 2>&1 < /dev/null &
nohup sh scen.sh t0 sgn > chain2.log 2>&1 < /dev/null &
nohup sh scen.sh mold lld > chain3.log 2>&1 < /dev/null &'
echo launched
