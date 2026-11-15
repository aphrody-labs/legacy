#!/bin/sh
rg -a '^==|rror|ALLDONE' /srv/bench/host.log | tail -8
ls /srv/bench/res | wc -l
tail -c 300 /srv/bench/chain-fr2.log
cut -d' ' -f1-3 /proc/loadavg
