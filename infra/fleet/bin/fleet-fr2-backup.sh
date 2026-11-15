#!/bin/bash
# Back up what only fr2 holds before its disk is reinstalled as XFS (docs/infra/SINGLE-SERVER.md section 4), host to host over the mesh.
#   fleet-fr2-backup.sh                      run from the workstation; roles are ssh Host aliases and the fr2 mesh address is discovered (discover.sh)
# 1 fr1 gets fleet-recv (forced command: write stdin to /srv/xbuild/backup/fr2/<name>, print its sha256)  2 fr2 gets its own key
# ~/.ssh/fleet_xfer, authorised on fr1 only with restrict,from=<fr2 mesh address>,command=fleet-recv  3 fr2 streams
# tar | zstd | ssh fr1, computing the sha256 on its side while fr1 computes it on the stored bytes; they must match.
#   valkey   BGSAVE then /var/lib/valkey (RDB + AOF), /etc/valkey      dbfr   /srv/dbfr, /srv/cdn-shenron
#   relay    /etc/aphrody, /etc/fleet, the relay unit                  edge   /etc/nginx, /etc/letsencrypt, /etc/cloudflared, units
# Restore = zstd -dc <archive> | sudo tar -C / -x on the reinstalled host. Nothing is deleted by this script.
set -eu
here=$(cd "$(dirname "$0")" && pwd); root=$(git -C "$here" rev-parse --show-toplevel)
. "$root/packages/env-kit/loaders/shell/site.sh"
src=$(site_ssh fr2); dst=$(site_ssh fr1); from=$(site_get hosts.fr2.mesh_ip)
timeout 60 ssh "$dst" 'cat > /tmp/fleet-recv.sh' < "$here/fleet-recv.sh"
timeout 60 ssh "$dst" 'sudo install -m 0755 /tmp/fleet-recv.sh /usr/local/bin/fleet-recv; rm /tmp/fleet-recv.sh; sudo install -d -m 0700 -o ubuntu /srv/xbuild/backup /srv/xbuild/backup/fr2'
pub=$(timeout 60 ssh "$src" '[ -f ~/.ssh/fleet_xfer ] || ssh-keygen -q -t ed25519 -N "" -C "fleet-xfer $(hostname)" -f ~/.ssh/fleet_xfer; cat ~/.ssh/fleet_xfer.pub')
blob=$(echo "$pub" | cut -d' ' -f2)
timeout 60 ssh "$dst" "grep -qF '$blob' ~/.ssh/authorized_keys || { [ -z \"\$(tail -c1 ~/.ssh/authorized_keys)\" ] || echo >> ~/.ssh/authorized_keys; echo 'restrict,from=\"$from\",command=\"/usr/local/bin/fleet-recv\" $pub' >> ~/.ssh/authorized_keys; }"
timeout 600 ssh "$src" 'bash -s' <<'R'
set -eu
stamp=$(date -u +%Y%m%dt%H%Mz)
peer=$(fleet-registry hosts | awk '$1=="fr1"{print $4 "@" $3}')
pw=$(sudo cat /etc/valkey/ay.pass)
REDISCLI_AUTH=$pw valkey-cli --no-auth-warning bgsave >/dev/null
for i in $(seq 1 60); do REDISCLI_AUTH=$pw valkey-cli --no-auth-warning info persistence | grep -q rdb_bgsave_in_progress:0 && break; sleep 2; done
push() { # push <name> <paths...>
  n=$1; shift; f=$n-$stamp.tar.zst
  loc=$(sudo tar -C / --ignore-failed-read -c "$@" 2>/dev/null | zstd -T2 -3 -q | tee >(sha256sum | cut -d' ' -f1 > /tmp/xfer.$$) |
        ssh -i ~/.ssh/fleet_xfer -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$peer" "$f")
  sleep 1; mine=$(cat /tmp/xfer.$$); rm -f /tmp/xfer.$$
  [ "$loc" = "$mine" ] && echo "$f sha256 $mine sender=receiver" || { echo "$f MISMATCH sender=$mine receiver=$loc"; return 1; }
}
push valkey var/lib/valkey etc/valkey
push dbfr srv/dbfr srv/cdn-shenron
push relay etc/aphrody etc/fleet etc/systemd/system/aphrody-relay.service
push edge etc/nginx etc/letsencrypt etc/cloudflared etc/systemd/system
R
timeout 120 ssh "$dst" 'cd /srv/xbuild/backup/fr2 && for f in *.tar.zst; do echo "$f $(zstd -t -q "$f" && echo zstd-ok) $(sha256sum "$f" | cut -c1-16) $(stat -c %s "$f") bytes"; done'
