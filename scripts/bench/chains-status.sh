#!/bin/sh
cut -d' ' -f1-3 /proc/loadavg
ps -eo etime,args | rg 'scen.sh|hyperfine|run-variant' | rg -v ' rg ' | cut -c1-130 | head -8
for f in /srv/bench/chain1.log /srv/bench/chain2.log /srv/bench/chain3.log; do echo "--- $f"; wc -c < $f; rg -a '^== |^error|FAIL' $f | tail -4 | cut -c1-160; done
ls /srv/bench/res | wc -l
