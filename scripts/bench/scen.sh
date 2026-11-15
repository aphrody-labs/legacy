#!/bin/sh
# scen.sh <variant>... : build deps once per variant, then hyperfine (N=5) the workspace-crate scenarios.
# Results: /srv/bench/res/<tc>-<variant>-<scenario>.json (mean, stddev, user, system, times).
export PATH=$HOME/.cargo/bin:$PATH
S=/srv/bench/run-variant.sh
R=/srv/bench/res
mkdir -p $R
TC=${TC:-chromium-157}
export JOBS=${JOBS:-6}
for V in "$@"; do
  echo "== $V start $(date +%T) load $(cut -d' ' -f1-3 /proc/loadavg)"
  sh $S $V build || { echo "BUILD FAIL $V"; continue; }
  sh $S $V tests || echo "tests build fail $V"
  H="hyperfine --runs 5 --warmup 0 --style basic"
  $H --prepare "sh $S $V wsclean" --export-json $R/$TC-$V-wsclean.json "sh $S $V build"
  $H --prepare "sh $S $V editcore" --export-json $R/$TC-$V-editcore.json "sh $S $V build"
  $H --prepare "sh $S $V editleaf" --export-json $R/$TC-$V-editleaf.json "sh $S $V build"
  $H --prepare "sh $S $V editcore" --export-json $R/$TC-$V-editcore-tests.json "sh $S $V tests"
  echo "== $V done $(date +%T)"
done
