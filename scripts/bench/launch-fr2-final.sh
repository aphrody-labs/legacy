#!/bin/sh
# Local: rerun lto (fixed member) and nextest (-i) on fr2, sequential, detached.
for f in lto.sh nextest.sh; do
  timeout 60 ssh fr2 "cat > /srv/bench/$f" < C:/src/scripts/bench/$f
done
timeout 60 ssh fr2 'rm -rf /srv/bench/src-lto /srv/bench/t-lto-*; rm -f /srv/bench/res/lto-*.json; nohup sh -c "export TC=stable; sh /srv/bench/nextest.sh > /srv/bench/nextest.log 2>&1; sh /srv/bench/lto.sh > /srv/bench/lto.log 2>&1; echo done > /srv/bench/final.done" > /dev/null 2>&1 < /dev/null &'
echo queued
