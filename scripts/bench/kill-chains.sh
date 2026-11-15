#!/bin/sh
# fr1: stop my bench chains only (scen.sh / run-variant / cargo under /srv/bench), leave other work alone.
pkill -f 'scen.sh' ; pkill -f 'run-variant' ; pkill -f '/srv/bench/t-' ; pkill -f 'CARGO_TARGET_DIR=/srv/bench'
for p in $(pgrep -f 'cargo.*-p depot'); do kill $p; done
for p in $(pgrep -u ubuntu rustc); do tr '\0' ' ' < /proc/$p/cmdline | rg -q '/srv/bench' && kill $p; done
sleep 2
ps -eo etime,args | rg '/srv/bench' | rg -v ' rg ' | head -3
cut -d' ' -f1-3 /proc/loadavg
