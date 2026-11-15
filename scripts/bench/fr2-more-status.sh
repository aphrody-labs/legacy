#!/bin/sh
for f in nextest sccache lto; do echo "--- $f"; test -f /srv/bench/$f.log && rg -a -v '^\s*$|warning|help:|^[0-9]+ [|~+]|^\s+\|' /srv/bench/$f.log | tail -12 | cut -c1-180; done
cut -d' ' -f1-3 /proc/loadavg
