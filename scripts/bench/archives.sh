#!/bin/bash
# usage: archives.sh SET DIR   (directory-based archive formats; decompress = full extract to tmpfs /tmp/xout)
. /srv/bench/lib.sh
SET=$1; IN=$2
INBYTES=$(find "$IN" -type f -printf '%s\n' | awk '{s+=$1} END{print s}')
X=/srv/bench/bin/bin
export PATH=$X:$PATH
run $SET "tar.zst-3" 12 "tar -cf - -C \$IN . | zstd -q -T12 -3 -o \$OUT" "mkdir -p /tmp/xout; zstd -d -q -c \$OUT | tar -xf - -C /tmp/xout"
run $SET "tar.zst-19 --long=27" 12 "tar -cf - -C \$IN . | zstd -q -T12 -19 --long=27 -o \$OUT" "mkdir -p /tmp/xout; zstd -d -q --long=27 -c \$OUT | tar -xf - -C /tmp/xout"
run $SET "squashfs zstd-3 128K" 12 "mksquashfs \$IN \$OUT -comp zstd -Xcompression-level 3 -b 128K -processors 12 -noappend -quiet" "unsquashfs -q -f -d /tmp/xout \$OUT"
run $SET "squashfs zstd-19 1M" 12 "mksquashfs \$IN \$OUT -comp zstd -Xcompression-level 19 -b 1M -processors 12 -noappend -quiet" "unsquashfs -q -f -d /tmp/xout \$OUT"
run $SET "squashfs lz4hc 128K" 12 "mksquashfs \$IN \$OUT -comp lz4 -Xhc -b 128K -processors 12 -noappend -quiet" "unsquashfs -q -f -d /tmp/xout \$OUT"
run $SET "erofs lz4hc,12" 12 "mkfs.erofs -zlz4hc,12 \$OUT \$IN" "fsck.erofs --extract=/tmp/xout \$OUT"
run $SET "erofs zstd,3" 12 "mkfs.erofs -zzstd,level=3 \$OUT \$IN" "fsck.erofs --extract=/tmp/xout \$OUT"
run $SET "erofs zstd,19" 12 "mkfs.erofs -zzstd,level=19 \$OUT \$IN" "fsck.erofs --extract=/tmp/xout \$OUT"
if command -v mkdwarfs >/dev/null; then
  run $SET "dwarfs l3" 12 "mkdwarfs -i \$IN -o \$OUT -l 3 --num-workers 12 --force -q" "dwarfsextract -i \$OUT -o /tmp/xout"
  run $SET "dwarfs l7" 12 "mkdwarfs -i \$IN -o \$OUT -l 7 --num-workers 12 --force -q" "dwarfsextract -i \$OUT -o /tmp/xout"
  run $SET "dwarfs l9" 12 "mkdwarfs -i \$IN -o \$OUT -l 9 --num-workers 12 --force -q" "dwarfsextract -i \$OUT -o /tmp/xout"
fi
