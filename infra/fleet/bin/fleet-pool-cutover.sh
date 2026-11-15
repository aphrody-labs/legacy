#!/bin/bash
# Cutover of the fr1 btrfs pool (sdb+sdc) to one LVM + XFS at the build mount (docs/infra/SINGLE-SERVER.md stage 11). Root, detached:
#   sudo systemd-run --unit=fleet-pool-cutover --collect bash fleet-pool-cutover.sh
# Everything up to the wipe is reversible (fstab restored, mounts back); the wipe itself is fleet-pool.sh apply. Log: /var/log/fleet/pool-cutover.log
# Order: stage the login home of the admin user on the root disk (ssh keys, tool binaries, config) -> RESCUE-COMPLETE marker -> stop the units that
# use the pool -> drop the pool lines from fstab -> kill remaining holders and unmount -> verify sdb/sdc are free -> CONFIRM=WIPE-<role>
# fleet-pool.sh apply (wipefs, LVM, mkfs.xfs reflink=1, rsync of the loop volume, fstab by UUID) -> rebuild /home/<user> from the stage ->
# bind the NativeLink state under the new volume -> restart NativeLink.
set -u
exec >>/var/log/fleet/pool-cutover.log 2>&1
role=$(tail -n 1 /etc/aphrody/role); admin=${ADMIN_USER:-ubuntu}; st=/var/lib/fleet/home-stage
say() { echo "[$(date -u +%T)] $*"; }
POOLM="/var/lib/private/nativelink /srv/build /srv/artifacts /opt/android-sdk /var/lib/yolo-cache /home"
say "start role=$role"
install -d -m 0700 "$st/$admin"
( cd /home/$admin && rsync -aR --ignore-missing-args ./.ssh ./.gitconfig ./.bashrc ./.profile ./.bash_logout ./.local/bin ./.cargo/bin ./.config ./.claude "$st/$admin/" ) || say "stage rsync warnings"
[ -s "$st/$admin/.ssh/authorized_keys" ] || { say "ABORT: no authorized_keys staged for $admin"; exit 70; }
say "staged: $(du -sh "$st/$admin" | cut -f1)"
install -d /srv/xbuild/rescue; printf 'set %s by fleet-pool-cutover on the owner order; fr1 sources covered by docs/project/restore-inventory.json (vps:fr1 619 rows, 618 identical, 1 cache); artifacts copy stopped at the owner order\n' "$(date -u +%FT%TZ)" > /srv/xbuild/rescue/RESCUE-COMPLETE
systemctl stop 'actions.runner.*' nativelink-worker nativelink-server 2>&1 | head -3
cp /etc/fstab /var/lib/fleet/fstab.pre-pool
sed -i -E '\#^UUID=[^ ]+[[:space:]]+/home[[:space:]]+btrfs#d; \#^/home/[^ ]+[[:space:]]+/(var/lib/private/nativelink|srv/build|srv/artifacts|opt/android-sdk|var/lib/yolo-cache)[[:space:]]#d' /etc/fstab
systemctl daemon-reload
for m in $POOLM; do
  for t in 1 2 3; do
    mountpoint -q "$m" || break
    fuser -km "$m" >/dev/null 2>&1; sleep 2; umount "$m" 2>/dev/null && break
  done
  mountpoint -q "$m" && say "STILL MOUNTED: $m"
done
bad=0; for d in /dev/sdb /dev/sdc; do lsblk -nro MOUNTPOINTS "$d" | rg -q . && { say "FAIL $d busy: $(lsblk -nro MOUNTPOINTS $d | tr '\n' ' ')"; bad=1; }; done
if [ $bad = 1 ]; then say "ROLLBACK: restoring fstab, remounting"; cp /var/lib/fleet/fstab.pre-pool /etc/fstab; systemctl daemon-reload; mount -a; systemctl start nativelink-server nativelink-worker 'actions.runner.*' 2>&1 | head -2; exit 73; fi
say "pool devices free; applying"
CONFIRM=WIPE-$role /usr/local/bin/fleet-pool apply; rc=$?
say "fleet-pool apply rc=$rc"
[ $rc = 0 ] || exit $rc
# login home back (root filesystem), then NativeLink state under the new volume
install -d -m 0755 -o "$admin" -g "$admin" "/home/$admin"; rsync -a "$st/$admin/" "/home/$admin/"; chown -R "$admin:$admin" "/home/$admin"; chmod 700 "/home/$admin/.ssh"
id agent >/dev/null 2>&1 && install -d -m 0755 -o agent -g agent /home/agent
install -d /home/nativelink /var/lib/private/nativelink /srv/xbuild/cas/nativelink /srv/xbuild/cas/worker /srv/build /srv/artifacts /opt/android-sdk /var/lib/yolo-cache
printf '/srv/xbuild/cas/nativelink /home/nativelink none bind 0 0\n/srv/xbuild/cas/worker /var/lib/private/nativelink none bind 0 0\n' >> /etc/fstab
systemctl daemon-reload; mount /home/nativelink; mount /var/lib/private/nativelink
systemctl start nativelink-server nativelink-worker 2>&1 | head -2
say "done: $(findmnt -no SOURCE,FSTYPE /srv/xbuild) $(df -h /srv/xbuild | tail -1)"
