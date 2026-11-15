#!/bin/sh
# Probe build/bench prerequisites on a fleet node (run: ssh <node> sh -s < probe-fleet.sh).
findmnt -no FSTYPE,SOURCE /srv /tmp /
nproc
free -g | awk 'NR==2'
df -h /srv /tmp | awk 'NR>1'
for t in hyperfine sccache cargo-nextest zstd lz4 brotli xz bzip3 7z zpaq mksquashfs mkfs.erofs mkfs.xfs mkfs.btrfs mkfs.ext4 mold wild ld.lld fio mkdwarfs cargo-hakari cargo-pgo llvm-bolt perf losetup; do
  printf "%s=" "$t"; command -v "$t" || echo no
done
git -C /srv/src rev-parse --short HEAD
