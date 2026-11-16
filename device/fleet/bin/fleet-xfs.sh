#!/bin/bash
# Dedicated XFS build volume, same mount point on every host (docs/infra/SINGLE-SERVER.md stage 1).
#   fleet-xfs.sh apply|check|down [--purge]      run as root; config /etc/fleet/xfs.conf (from device/fleet/<host>/xfs.conf)
# xfs.conf:  XFS_MOUNT=/srv/xbuild  XFS_LABEL=build  and ONE of
#            XFS_DEV=/dev/sdX1          a new empty block device (refused if mounted or if blkid sees any signature)
#            XFS_IMG=/var/lib/fleet/xbuild.img XFS_IMG_SIZE=4G   sparse loop image on the root (proof volume, no spare device)
# mkfs.xfs -d agcount=<cores> (mkfs.xfs(8): agcount is the allocation-group count, parallel metadata); defaults keep crc, reflink,
# finobt, bigtime. fstab: noatime,nofail (a missing volume never blocks boot). The ext4/btrfs root is never touched.
# Layout created on the volume (same on all hosts): target/ cache/ ci/ cas/ clones/  (see SINGLE-SERVER.md, shared namespace).
# down: umount + remove the fstab line; --purge also removes the image (data on it is regenerable by construction).
set -eu
mode=${1:-check}; purge=${2:-}
[ -f /etc/fleet/xfs.conf ] || { echo "fleet-xfs: /etc/fleet/xfs.conf missing"; exit 64; }
XFS_DEV= XFS_IMG= XFS_IMG_SIZE=4G XFS_LABEL=build XFS_MOUNT=/srv/xbuild
. /etc/fleet/xfs.conf
[ -n "$XFS_DEV$XFS_IMG" ] || { echo "fleet-xfs: set XFS_DEV or XFS_IMG"; exit 64; }
if [ -n "$XFS_DEV" ]; then src=$XFS_DEV; opts=noatime,nofail; else src=$XFS_IMG; opts=loop,noatime,nofail; fi
line="$src $XFS_MOUNT xfs $opts 0 0"
mounted() { findmnt -rn "$XFS_MOUNT" >/dev/null 2>&1; }
log() { logger -t fleet-xfs "$*" 2>/dev/null || true; echo "fleet-xfs: $*"; }

case $mode in
check)
  mounted || { echo "drift: $XFS_MOUNT not mounted"; exit 1; }
  xfs_info "$XFS_MOUNT" | rg -o 'agcount=[0-9]+|reflink=[01]' | tr '\n' ' '; echo
  rg -qF "$line" /etc/fstab || { echo "drift: fstab line differs"; exit 1; }
  echo "ok $(df -h --output=size,avail "$XFS_MOUNT" | tail -n 1)";;
apply)
  command -v mkfs.xfs >/dev/null || { echo "fleet-xfs: xfsprogs missing"; exit 69; }
  if ! mounted; then
    if [ -n "$XFS_DEV" ]; then
      [ -b "$XFS_DEV" ] || { echo "fleet-xfs: $XFS_DEV is not a block device"; exit 66; }
      if [ -n "$(blkid -p -o value -s TYPE "$XFS_DEV" 2>/dev/null)" ] && ! blkid -p -s LABEL -o value "$XFS_DEV" 2>/dev/null | rg -qx "$XFS_LABEL"; then
        echo "fleet-xfs: $XFS_DEV already carries a filesystem that is not ours: refusing to format"; exit 73
      fi
      lsblk -nro MOUNTPOINT "$XFS_DEV" | rg -q . && { echo "fleet-xfs: $XFS_DEV or a child is mounted: refusing"; exit 73; }
    else
      if [ ! -e "$XFS_IMG" ]; then
        install -d -m 0755 "$(dirname "$XFS_IMG")"; truncate -s "$XFS_IMG_SIZE" "$XFS_IMG"
      fi
    fi
    if ! blkid -p -o value -s TYPE "$src" 2>/dev/null | rg -qx xfs; then
      mkfs.xfs -L "$XFS_LABEL" -d agcount="$(nproc)" "$src" >/dev/null; log "mkfs.xfs $src agcount=$(nproc)"
    fi
    install -d -m 0755 "$XFS_MOUNT"
    rg -qF "$line" /etc/fstab || { echo "$line" >> /etc/fstab; log "fstab: $line"; }
    systemctl daemon-reload; mount "$XFS_MOUNT"
  fi
  for d in $(fleet-registry layout xbuild_subdirs 2>/dev/null || echo "target cache ci cas clones"); do install -d -m 1777 "$XFS_MOUNT/$d"; done
  # reflink smoke test (same filesystem is required, cp(1) --reflink=always fails otherwise)
  t=$XFS_MOUNT/.smoke.$$; head -c 1048576 /dev/urandom > "$t"; cp --reflink=always "$t" "$t.c" && log "reflink ok"; rm -f "$t" "$t.c"
  xfs_info "$XFS_MOUNT" | rg -o 'agcount=[0-9]+|reflink=[01]' | tr '\n' ' '; echo;;
down)
  mounted && umount "$XFS_MOUNT"
  sed -i "\|^$src $XFS_MOUNT xfs |d" /etc/fstab; systemctl daemon-reload; log "down (fstab line removed)"
  [ "$purge" = --purge ] && [ -n "$XFS_IMG" ] && rm -f "$XFS_IMG" && log "image removed";;
*) echo "usage: fleet-xfs.sh apply|check|down [--purge]"; exit 64;;
esac
