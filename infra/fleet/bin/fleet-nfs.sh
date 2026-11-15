#!/bin/bash
# One XFS shared over NFSv4.2 on the mesh (docs/infra/SINGLE-SERVER.md). Run as root on the host.
#   fleet-nfs.sh server            export the build volume to the mesh peers allowed to run jobs (fr1)
#   fleet-nfs.sh client [mount]    automount the export at the same path (default /srv/xbuild; pass another path to test)
#   fleet-nfs.sh down [mount]      unmount, remove the fstab line / export file (rollback)
# No address is committed: the export list is rendered here from `wg show wg1 allowed-ips` intersected with the registry
# (`fleet-registry hosts`, hosts that have job classes, so prd is never an export target), and the server address comes
# from the registry host of the build volume's owner. NFS v4.2 only (nfs.conf.d), no udp, no v3.
set -eu
mode=${1:?server|client|down}; mnt=${2:-/srv/xbuild}
self=$(tail -n 1 /etc/aphrody/role)
owner=fr1                      # role that owns the XFS (cluster.toml host with the factory role)
hosts() { fleet-registry hosts | awk '{print $1, $3, $6}'; }   # name mesh classes...
case $mode in
server)
  [ "$self" = "$owner" ] || { echo "server runs on $owner"; exit 64; }
  mountpoint -q /srv/xbuild || { echo "/srv/xbuild not mounted"; exit 66; }
  wgips=$(wg show wg1 allowed-ips | awk '{for(i=2;i<=NF;i++) if($i ~ /\/32$/){sub(/\/32/,"",$i); print $i}}')
  : > /tmp/fleet-exports.$$
  hosts | while read -r n ip cl; do
    [ "$n" = "$self" ] && continue; [ -n "$cl" ] || continue
    echo "$wgips" | grep -qx "$ip" && echo "/srv/xbuild $ip(rw,sync,no_subtree_check,fsid=7)"
  done > /tmp/fleet-exports.$$
  [ -s /tmp/fleet-exports.$$ ] || { echo "no mesh peer to export to"; exit 1; }
  install -d /etc/exports.d /etc/nfs.conf.d
  install -m 0644 /tmp/fleet-exports.$$ /etc/exports.d/fleet-xbuild.exports; rm -f /tmp/fleet-exports.$$
  printf '[nfsd]\nvers3=n\nvers4=y\nvers4.2=y\nudp=n\nthreads=16\n' > /etc/nfs.conf.d/fleet.conf
  systemctl enable --now nfs-server >/dev/null 2>&1; systemctl restart nfs-server; exportfs -ra; exportfs -v | tr '\n' ' '; echo;;
client)
  srv=$(hosts | awk -v o="$owner" '$1==o{print $2}')
  [ -n "$srv" ] || { echo "owner host not in registry"; exit 66; }
  command -v mount.nfs4 >/dev/null || { echo "nfs-common missing"; exit 69; }
  opts=vers=4.2,nconnect=8,_netdev,nofail,x-systemd.automount,x-systemd.idle-timeout=600,noatime
  [ "${FLEET_NFS_FSC:-0}" = 1 ] && opts=$opts,fsc
  install -d "$mnt"
  sed -i "\|[[:space:]]$mnt[[:space:]]nfs4|d" /etc/fstab
  echo "$srv:/srv/xbuild $mnt nfs4 $opts 0 0" >> /etc/fstab
  systemctl daemon-reload; systemctl restart "$(systemd-escape -p --suffix=automount "$mnt")"
  ls "$mnt" >/dev/null && findmnt -rn "$mnt" -o FSTYPE,OPTIONS | cut -c1-120;;
down)
  [ "$self" = "$owner" ] && { rm -f /etc/exports.d/fleet-xbuild.exports; exportfs -ra; systemctl disable --now nfs-server; echo "export removed"; exit 0; }
  systemctl stop "$(systemd-escape -p --suffix=automount "$mnt")" 2>/dev/null || true; umount "$mnt" 2>/dev/null || true
  sed -i "\|[[:space:]]$mnt[[:space:]]nfs4|d" /etc/fstab; systemctl daemon-reload; echo "client removed";;
esac
