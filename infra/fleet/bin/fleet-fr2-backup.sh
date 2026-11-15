#!/bin/bash
# Back up what only fr2 holds before its disk is reinstalled as XFS (docs/infra/SINGLE-SERVER.md section 4). Run from the workstation:
#   fleet-fr2-backup.sh <fr2-alias> <store-alias>         store = the host that owns the shared XFS (fr1); target /srv/xbuild/backup/fr2/
# Streams ssh to ssh (nothing lands on the workstation disk), root-only files (0600), with a sha256 per archive so a restore can be verified.
#   valkey   BGSAVE then /var/lib/valkey (RDB + AOF) and /etc/valkey (config, password file)
#   dbfr     /srv/dbfr, /srv/cdn-shenron          relay: /etc/aphrody (relay.env, tokens), the relay unit, /etc/fleet
#   edge     /etc/nginx, /etc/letsencrypt (when present), /etc/systemd/system units of the host, /etc/cloudflared*
# Restore = extract each archive at / on the reinstalled host, then enable the units; nothing is deleted by this script.
set -eu
src=$1; dst=$2; dir=/srv/xbuild/backup/fr2; stamp=$(date -u +%Y%m%dT%H%MZ)
timeout 60 ssh "$dst" "sudo install -d -m 0700 $dir"
timeout 120 ssh "$src" 'sudo valkey-cli -a "$(sudo cat /etc/valkey/ay.pass)" --no-auth-warning bgsave >/dev/null; for i in $(seq 1 40); do sudo valkey-cli -a "$(sudo cat /etc/valkey/ay.pass)" --no-auth-warning info persistence | grep -q "rdb_bgsave_in_progress:0" && break; sleep 2; done; echo bgsave-done'
pull() { # pull <name> <paths...>
  n=$1; shift
  timeout 900 ssh "$src" "sudo tar -C / --ignore-failed-read -czf - $* 2>/dev/null" |
    timeout 900 ssh "$dst" "umask 077; sudo tee $dir/$n-$stamp.tgz >/dev/null; sudo sha256sum $dir/$n-$stamp.tgz | cut -c1-16; sudo ls -l $dir/$n-$stamp.tgz | awk '{print \$5, \$NF}'"
}
pull valkey var/lib/valkey etc/valkey
pull dbfr srv/dbfr srv/cdn-shenron
pull relay etc/aphrody etc/fleet etc/systemd/system/aphrody-relay.service
pull edge etc/nginx etc/letsencrypt etc/cloudflared etc/systemd/system
