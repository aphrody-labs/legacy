#!/bin/bash
# LVM over the pool disks + one XFS at the build mount, by UUID (docs/infra/SINGLE-SERVER.md stage 11). Run as root on the host.
#   fleet-pool.sh plan              dry-run (default): every check and every command that apply would run; changes nothing
#   fleet-pool.sh apply             needs CONFIRM=WIPE-<role> and /srv/xbuild/rescue/RESCUE-COMPLETE (written by the rescue step)
# /etc/fleet/pool.conf: POOL_DEVS="/dev/sdb /dev/sdc"  POOL_VG=xbuild  POOL_LV=data  POOL_MOUNT=/srv/xbuild
# Order of apply: refuse if any pool device (or child) is mounted, wipefs, pvcreate, vgcreate, lvcreate -l 100%FREE,
# mkfs.xfs -m reflink=1 -d agcount=<cores>, mount at /mnt/xnew, rsync the current build volume into it (hard links, xattrs),
# umount both, replace the fstab line of the old volume by `UUID=<uuid> <mount> xfs noatime,nofail`, mount. The old loop image is
# only removed by `fleet-pool.sh drop-image` after the new volume has been checked. Rollback before drop-image: restore the old fstab line.
set -eu
mode=${1:-plan}; role=$(tail -n 1 /etc/aphrody/role)
POOL_DEVS=; POOL_VG=xbuild; POOL_LV=data; POOL_MOUNT=/srv/xbuild
. /etc/fleet/pool.conf
[ -n "$POOL_DEVS" ] || { echo "pool.conf: POOL_DEVS empty"; exit 64; }
dry=1; [ "$mode" = apply ] && dry=0
run() { if [ $dry = 1 ]; then echo "  would run: $*"; else echo "+ $*"; "$@"; fi; }
bad=0
for d in $POOL_DEVS; do
  [ -b "$d" ] || { echo "FAIL $d is not a block device"; bad=1; continue; }
  mp=$(lsblk -nro MOUNTPOINTS "$d" | rg . | tr '\n' ' ' || true)
  [ -z "$mp" ] && echo "ok   $d unmounted" || { echo "FAIL $d still mounted at: $mp"; bad=1; }
  echo "info $d signatures: $(blkid -p -o value -s TYPE "$d"1 "$d" 2>/dev/null | tr '\n' ' ') size $(lsblk -nbdo SIZE "$d" | numfmt --to=iec)"
done
for u in $(systemctl list-units --no-legend --state=running 2>/dev/null | awk '{print $1}' | rg 'nativelink|yolo' || true); do echo "info running unit tied to the old pool, stop before apply: $u"; done
if [ -f /srv/xbuild/rescue/RESCUE-COMPLETE ]; then echo "ok   rescue marker present"; else echo "FAIL rescue marker /srv/xbuild/rescue/RESCUE-COMPLETE missing (inventory, pushes and copies not confirmed)"; bad=1; fi
[ "${CONFIRM:-}" = "WIPE-$role" ] && echo "ok   CONFIRM given" || { echo "FAIL CONFIRM=WIPE-$role not given"; bad=1; }
if [ $dry = 0 ] && [ $bad = 1 ]; then echo "refusing to apply"; exit 73; fi
[ $dry = 1 ] && echo "--- plan (checks above ${bad:+must all pass})"
run wipefs -a $POOL_DEVS
run pvcreate -y $POOL_DEVS
run vgcreate "$POOL_VG" $POOL_DEVS
run lvcreate -y -l 100%FREE -n "$POOL_LV" "$POOL_VG"
run mkfs.xfs -L build -m reflink=1 -d agcount="$(nproc)" "/dev/$POOL_VG/$POOL_LV"
run install -d /mnt/xnew
run mount "/dev/$POOL_VG/$POOL_LV" /mnt/xnew
run rsync -aHAX --info=stats1 "$POOL_MOUNT"/ /mnt/xnew/
run umount /mnt/xnew
run umount "$POOL_MOUNT"
if [ $dry = 0 ]; then
  uuid=$(blkid -s UUID -o value "/dev/$POOL_VG/$POOL_LV")
  sed -i "\|[[:space:]]$POOL_MOUNT[[:space:]]xfs|d" /etc/fstab
  echo "UUID=$uuid $POOL_MOUNT xfs noatime,nofail 0 0" >> /etc/fstab
  systemctl daemon-reload; mount "$POOL_MOUNT"; xfs_info "$POOL_MOUNT" | rg -o 'agcount=[0-9]+|reflink=[01]' | tr '\n' ' '; echo
else
  echo "  would run: fstab line -> UUID=<uuid of /dev/$POOL_VG/$POOL_LV> $POOL_MOUNT xfs noatime,nofail 0 0 ; mount $POOL_MOUNT"
fi
