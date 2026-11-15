#!/bin/sh
# Local: tar results from a node into C:/src/target/bench-res/<node> (node = fr2|vps) and print summary rows.
N=$1
D=C:/src/target/bench-res/$N
mkdir -p $D
timeout 60 ssh $N 'tar -C /srv/bench/res -cf - .' | tar -C $D -xf -
for f in $D/*.json; do
  n=$(basename $f .json)
  jaq -r --arg n "$n" '.results[0] | "\($n)\t\(.mean*1000|round/1000)\t\(.stddev*1000|round/1000)\t\(.user*100|round/100)\t\(.system*100|round/100)\t\(.times|length)"' $f
done
