#!/bin/sh
# fr1: sccache local-disk cold vs warm vs none, clean build of depot-core (deps included), N=3 clean (slow) + warm N=5.
export PATH=$HOME/.cargo/bin:$PATH
S=/srv/bench/run-variant-b.sh
R=/srv/bench/res
export JOBS=6
export SCCACHE_DIR=/srv/bench/sccache-local
export SCCACHE_CACHE_SIZE=20G
rm -rf $SCCACHE_DIR
sccache --stop-server >/dev/null 2>&1
echo "== sccache start $(date +%T) load $(cut -d' ' -f1-3 /proc/loadavg)"
sh $S sccache clean
/usr/bin/time -f "cold-fill wall=%e user=%U sys=%S" sh $S sccache buildcore 2>&1 | tail -2
sccache --show-stats | rg -i 'hits|misses|Compile requests'
hyperfine --runs 5 --warmup 0 --style basic --prepare "sh $S sccache clean" --export-json $R/sccache-warm.json "sh $S sccache buildcore"
sccache --show-stats | rg -i 'hits|misses|Compile requests'
# no wrapper, same flags, same crate
hyperfine --runs 3 --warmup 0 --style basic --prepare "sh $S nw clean" --export-json $R/nowrapper-clean-core.json "sh $S nw buildcore"
echo "== sccache done $(date +%T)"
