#!/bin/bash
# usage: codecs.sh SET TARFILE [heavy]   (heavy=1 includes very slow codecs)
. /srv/bench/lib.sh
SET=$1; IN=$2; HEAVY=${3:-0}
INBYTES=$(stat -c %s "$IN")
Z='zstd -q -f'
for L in 1 3 9 19; do
  run $SET "zstd-$L" 0 "$Z -T0 -$L \$IN -o \$OUT" "zstd -d -q -f \$OUT -o /dev/null"
done
for L in 3 9 19; do
  run $SET "zstd-$L --long=27" 12 "$Z -T0 -$L --long=27 \$IN -o \$OUT" "zstd -d -q -f --long=27 \$OUT -o /dev/null"
done
run $SET "zstd-19 --long=31" 12 "$Z -T0 -19 --long=31 \$IN -o \$OUT" "zstd -d -q -f --long=31 \$OUT -o /dev/null"
run $SET "zstd-19 T1" 1 "$Z -T1 -19 \$IN -o \$OUT" "zstd -d -q -f \$OUT -o /dev/null"
run $SET "zstd --ultra -22 --long=31" 12 "$Z -T0 --ultra -22 --long=31 \$IN -o \$OUT" "zstd -d -q -f --long=31 \$OUT -o /dev/null"
run $SET "zstd --fast=3" 12 "$Z -T0 --fast=3 \$IN -o \$OUT" "zstd -d -q -f \$OUT -o /dev/null"
for L in 1 9 12; do
  run $SET "lz4-$L" 1 "lz4 -q -f -$L \$IN \$OUT" "lz4 -d -q -f \$OUT /dev/null"
done
for L in 5 9; do
  run $SET "brotli-q$L" 1 "brotli -q $L -f -o \$OUT \$IN" "brotli -d -f -o /dev/null \$OUT"
done
for L in 3 6; do
  run $SET "xz-$L" 12 "xz -T12 -$L -k -c \$IN > \$OUT" "xz -d -T12 -c \$OUT > /dev/null"
done
run $SET "pigz-6 (gzip)" 12 "pigz -6 -p12 -k -c \$IN > \$OUT" "pigz -d -c \$OUT > /dev/null"
run $SET "bzip3 j12" 12 "bzip3 -e -b 64 -j 12 -c \$IN > \$OUT" "bzip3 -d -j 12 -c \$OUT > /dev/null"
run $SET "7z-mx5 lzma2" 12 "7z a -t7z -mx=5 -mmt=12 -bd -bso0 \$OUT \$IN" "7z x -so -bd -bso0 \$OUT > /dev/null"
run $SET "zpaq-m1" 12 "zpaq a \$OUT \$IN -m1 -t12" "zpaq x \$OUT -to /tmp/xout -t12 -force"
if [ "$HEAVY" = 1 ]; then
  run $SET "brotli-q11" 1 "brotli -q 11 -f -o \$OUT \$IN" "brotli -d -f -o /dev/null \$OUT"
  run $SET "xz-9e" 12 "xz -T12 -9e -k -c \$IN > \$OUT" "xz -d -T12 -c \$OUT > /dev/null"
  run $SET "7z-mx9 lzma2" 12 "7z a -t7z -mx=9 -mmt=12 -bd -bso0 \$OUT \$IN" "7z x -so -bd -bso0 \$OUT > /dev/null"
  run $SET "zpaq-m2" 12 "zpaq a \$OUT \$IN -m2 -t12" "zpaq x \$OUT -to /tmp/xout -t12 -force"
  run $SET "zpaq-m3" 12 "zpaq a \$OUT \$IN -m3 -t12" "zpaq x \$OUT -to /tmp/xout -t12 -force"
fi
