#!/bin/sh
# Apply step, run on prd from a checkout (or after scp of this dir): installs units, script, vhost; idempotent.
#   timeout 120 ssh prd 'sh /srv/open-deploy/apply.sh'
set -eu
D=$(dirname "$(readlink -f "$0")")
install -d /srv/open-deploy /srv/open-releases
[ -d /srv/open/.git ] || git clone -q --depth 1 --filter=blob:none https://github.com/aphrody-labs/open /srv/open
[ "$D" = /srv/open-deploy ] || install -m 755 "$D/open-sync.sh" "$D/apply.sh" /srv/open-deploy/
[ "$D" = /srv/open-deploy ] || install -m 644 "$D/render.ts" /srv/open-deploy/
chmod 755 /srv/open-deploy/open-sync.sh /srv/open-deploy/apply.sh
install -m 644 "$D/open-sync.service" "$D/open-sync.timer" /etc/systemd/system/
install -m 644 "$D/open-origin.conf" /etc/nginx/conf.d/open-origin.conf
nginx -t
# systemctl reload fails with 226/NAMESPACE when the master's PrivateTmp dir was cleaned (seen 2026-11-15): HUP it directly
systemctl reload nginx || nginx -s reload
systemctl daemon-reload
systemctl enable --now open-sync.timer
systemctl start open-sync.service
