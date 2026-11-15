#!/bin/bash
# Small-file dictionary benchmark: files <=16 KiB from the snapshot, odd=train even=test, each file compressed alone.
S=/tmp/snap/src; D=/tmp/dict; rm -rf $D; mkdir -p $D/train $D/test $D/o
i=0
find $S -type f -size -16385c -size +99c | sort | while read -r f; do
  i=$((i+1)); r=${f#$S/}; n=$(printf '%s' "$r" | tr '/' '_')
  if [ $((i%2)) = 1 ]; then cp "$f" "$D/train/$i.$n"; else cp "$f" "$D/test/$i.$n"; fi
done
echo "train files: $(ls $D/train | wc -l) test files: $(ls $D/test | wc -l)"
RAW=$(find $D/test -type f -printf '%s\n' | awk '{s+=$1} END{print s}')
echo "test raw bytes: $RAW"
for MD in 16384 112640 524288; do
  /usr/bin/time -f "train maxdict=$MD %es rss=%MKB" zstd -q --train $D/train/* --maxdict=$MD -o $D/dict.$MD 2>&1 | tail -1
done
one() { # label, args
  local lab=$1; shift
  rm -rf $D/o; mkdir -p $D/o
  local t0=$(date +%s.%N)
  ls $D/test | xargs -P12 -I{} sh -c "zstd -q $* $D/test/{} -o $D/o/{}.zst"
  local t1=$(date +%s.%N)
  local out=$(find $D/o -type f -printf '%s\n' | awk '{s+=$1} END{print s}')
  local DD=""; for a in "$@"; do case "$a" in -D) ;; esac; done
  echo "$lab out=$out ratio=$(awk "BEGIN{printf \"%.3f\", $RAW/$out}") compress_wall=$(awk "BEGIN{printf \"%.2f\", $t1-$t0}")s (xargs -P12, per-file process incl. spawn)"
}
for L in 3 19; do
  one "zstd-$L nodict" -$L
  for MD in 16384 112640 524288; do one "zstd-$L dict$MD" -$L -D $D/dict.$MD; done
done
# in-process speed via zstd -b (blocks = whole file each), dict vs none
echo "--- zstd -b (in-process, files as units)"
zstd -b3 -e3 $D/test/* 2>&1 | tail -1
zstd -b3 -e3 -D $D/dict.112640 $D/test/* 2>&1 | tail -1
zstd -b19 -e19 $D/test/* 2>&1 | tail -1
zstd -b19 -e19 -D $D/dict.112640 $D/test/* 2>&1 | tail -1
