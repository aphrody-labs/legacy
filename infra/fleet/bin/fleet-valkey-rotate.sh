#!/bin/bash
# Rotate the password of the shared Valkey, from the workstation. The value is generated here, sealed in the
# vault (`ay vault add`), pushed over ssh stdin and never printed or written to the repo.
#   fleet-valkey-rotate.sh <valkey-host> <client-host> [<client-host> ...]       (ssh aliases; clients = non-production consumers)
# 1 vault add FLEET_VALKEY_PASSWORD   2 CONFIG SET requirepass on the server (live, no restart, no connection dropped) and
# /etc/valkey/ay.conf + ay.pass   3 each client: ~/.config/ay/valkey.url password part, then fleet-cache-wire.sh (secrets.env),
# ay-index-worker restarted   4 proof: AUTH with the old password fails, with the new one succeeds.
set -eu
vh=$1; shift; clients=$*
here=$(cd "$(dirname "$0")" && pwd)
new=$(bun -e 'process.stdout.write(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))')
old=$(timeout 30 ssh "$vh" 'sudo cat /etc/valkey/ay.pass' | tr -d '\r\n')
printf %s "$new" | ay vault add FLEET_VALKEY_PASSWORD --kind token >/dev/null
# server: apply live first (old password authenticates the change), then persist
printf '%s\n%s' "$old" "$new" | timeout 60 ssh "$vh" 'read -r o; read -r n; REDISCLI_AUTH=$o valkey-cli --no-auth-warning config set requirepass "$n" >/dev/null &&
  printf %s "$n" | sudo tee /etc/valkey/ay.pass >/dev/null && sudo chmod 600 /etc/valkey/ay.pass && sudo chown root:valkey /etc/valkey/ay.pass &&
  sudo sed -i "s|^requirepass .*|requirepass $n|" /etc/valkey/ay.conf && echo server-updated'
for c in $clients; do
  printf %s "$new" | timeout 60 ssh "$c" 'n=$(cat); f=$HOME/.config/ay/valkey.url; [ -f "$f" ] && sed -i -E "s#(valkey://:)[^@]*(@)#\1${n}\2#" "$f" && echo "$(hostname): valkey.url updated"'
done
bash "$here/fleet-cache-wire.sh" apply "$vh" $clients
for c in $clients; do timeout 60 ssh "$c" 'sudo systemctl restart ay-index-worker && systemctl is-active ay-index-worker'; done
printf '%s\n%s' "$old" "$new" | timeout 60 ssh "$vh" 'read -r o; read -r n;
  REDISCLI_AUTH=$o valkey-cli --no-auth-warning ping 2>&1 | sed "s/^/old password: /";
  REDISCLI_AUTH=$n valkey-cli --no-auth-warning ping 2>&1 | sed "s/^/new password: /"'
