#!/bin/sh
# Run on the node holding /srv/bench/res: print scenario, mean+-sd (s), user, system, n for every hyperfine JSON.
for f in /srv/bench/res/*.json; do
  n=$(basename $f .json)
  jaq -r --arg n "$n" '.results[0] | "\($n)\t\(.mean*100|round/100)\t\(.stddev*100|round/100)\t\(.user*100|round/100)\t\(.system*100|round/100)\t\(.times|length)"' $f
done
