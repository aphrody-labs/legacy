#!/usr/bin/env bash
# Valkey for the ay index pipeline. Run as root on fr2; idempotent.
#   sudo bash valkey-install.sh [wireguard-ip]
# Bound to the WireGuard address and loopback only, password-protected, AOF-persistent, systemd
# (Restart=always, ordered after wg-quick@wg1). The password lives in /etc/valkey/ay.pass and in
# ~ubuntu/.config/ay/valkey.url (mode 600); it is never printed.
for _s in /usr/local/lib/aphrody/site.sh "$(dirname "$0")/../../../system/env-kit/loaders/shell/site.sh"; do [ -f "$_s" ] && { . "$_s"; break; }; done
set -euo pipefail
WG_IP="${1:-$(site_get hosts.fr2.mesh_ip)}"
OWNER="${SUDO_USER:-ubuntu}"
CONF=/etc/valkey/valkey.conf
AYCONF=/etc/valkey/ay.conf
PASSF=/etc/valkey/ay.pass

DEBIAN_FRONTEND=noninteractive apt-get install -y valkey-server >/dev/null

if [ ! -s "$PASSF" ]; then
  umask 077
  head -c 32 /dev/urandom | base64 -w0 | tr -d '/+=' > "$PASSF"
fi
PW="$(<"$PASSF")"

umask 027
{
  echo "# managed by build/ci/pipeline/valkey-install.sh"
  echo "bind -$WG_IP 127.0.0.1"
  echo "port 6379"
  echo "protected-mode yes"
  echo "requirepass $PW"
  echo "appendonly yes"
  echo "appendfsync everysec"
  echo "save 900 1 300 100 60 10000"
  echo "maxmemory 3gb"
  echo "maxmemory-policy volatile-lru"
  echo "latency-tracking yes"
  echo "tcp-keepalive 60"
} > "$AYCONF"
chown valkey:valkey "$AYCONF"
chmod 640 "$AYCONF"
grep -qxF "include $AYCONF" "$CONF" || echo "include $AYCONF" >> "$CONF"

install -d /etc/systemd/system/valkey-server.service.d
cat > /etc/systemd/system/valkey-server.service.d/ay.conf <<'EOF'
[Unit]
After=wg-quick@wg1.service network-online.target
Wants=network-online.target

[Service]
Restart=always
RestartSec=2
LimitNOFILE=65535
EOF
systemctl daemon-reload
systemctl enable valkey-server >/dev/null 2>&1 || true
systemctl restart valkey-server

# Client URL for this host's user.
HOME_DIR="$(getent passwd "$OWNER" | cut -d: -f6)"
install -d -m 700 -o "$OWNER" "$HOME_DIR/.config/ay"
( umask 077; printf 'valkey://:%s@%s:6379\n' "$PW" "$WG_IP" > "$HOME_DIR/.config/ay/valkey.url" )
chown "$OWNER" "$HOME_DIR/.config/ay/valkey.url"

for i in 1 2 3 4 5; do
  valkey-cli -h "$WG_IP" -a "$PW" --no-auth-warning ping 2>/dev/null | grep -q PONG && break
  sleep 1
done
valkey-cli -h "$WG_IP" -a "$PW" --no-auth-warning ping
systemctl is-enabled valkey-server
systemctl is-active valkey-server
ss -ltn | grep ':6379'
