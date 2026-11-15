#!/bin/sh
rg -a '^== |FAIL|CHAINDONE|^error' /srv/bench/chain-fr2.log | tail -8
ps -eo etime,args | rg 'scen.sh|run-variant|hyperfine' | rg -v ' rg ' | cut -c1-120 | head -4
ls /srv/bench/res | rg -v host
