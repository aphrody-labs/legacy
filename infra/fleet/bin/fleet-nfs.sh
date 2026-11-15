#!/bin/bash
# The cold part of the one XFS shared over NFSv4.2 on the mesh (docs/infra/SINGLE-SERVER.md, measured: file-heavy work is 100-1000x slower
# over NFS, so only <xbuild>/shared is exported: artifacts, datasets, models, releases, cold caches). Run as root on the host.
#   fleet-nfs.sh server            export <xbuild>/shared: rw to the mesh peers that run jobs, ro to the others (prd)
#   fleet-nfs.sh client            automount it at the same path on this host
#   fleet-nfs.sh down              rollback (export removed / client line removed)
# Paths come from `fleet-registry layout`; no address is committed: peers = `wg show wg1 allowed-ips` intersected with
# `fleet-registry hosts`; the server address is the registry address of the host that owns the XFS. NFS v4.2 only.
# Nothing a production service depends on may live under shared/ on prd: the mount is automount + nofail + _netdev.
set -eu
mode=${1:?server|client|down}
self=$(tail -n 1 /etc/aphrody/role)
owner=fr1                      # role that owns the XFS (cluster.toml host with the factory role)
shared=$(fleet-registry layout xbuild)/shared
hosts() { fleet-registry hosts | awk '{print $1, $3, $6}'; }   # name mesh first-class
case $mode in
server)
  [ "$self" = "$owner" ] || { echo "server runs on $owner"; exit 64; }
  findmnt -rn "$(dirname "$shared")" >/dev/null || { echo "$(dirname "$shared") not mounted"; exit 66; }
  install -d -m 1777 "$shared"
  wgips=$(wg show wg1 allowed-ips | awk '{for(i=2;i<=NF;i++) if($i ~ /\/32$/){sub(/\/32/,"",$i); print $i}}')
  hosts | while read -r n ip cl; do
    [ "$n" = "$self" ] && continue
    echo "$wgips" | grep -qx "$ip" || continue
    if [ -n "$cl" ]; then echo "$shared $ip(rw,sync,no_subtree_check,fsid=7)"; else echo "$shared $ip(ro,sync,no_subtree_check,fsid=7)"; fi
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
  install -d "$shared"
  sed -i "\|[[:space:]]$shared[[:space:]]nfs4|d" /etc/fstab
  echo "$srv:$shared $shared nfs4 $opts 0 0" >> /etc/fstab
  systemctl daemon-reload; systemctl restart "$(systemd-escape -p --suffix=automount "$shared")"
  ls "$shared" >/dev/null && findmnt -rn "$shared" -o FSTYPE,OPTIONS | cut -c1-120;;
down)
  if [ "$self" = "$owner" ]; then rm -f /etc/exports.d/fleet-xbuild.exports; exportfs -ra; systemctl disable --now nfs-server; echo "export removed"; exit 0; fi
  systemctl stop "$(systemd-escape -p --suffix=automount "$shared")" 2>/dev/null || true; umount "$shared" 2>/dev/null || true
  sed -i "\|[[:space:]]$shared[[:space:]]nfs4|d" /etc/fstab; systemctl daemon-reload; echo "client removed";;
esac
