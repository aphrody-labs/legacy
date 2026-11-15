#!/usr/bin/env bash
# Rotation of the Windows peer key (<pc-mesh-ip> / <pc-mesh-ip-2>), key leaked in aphrody-labs/mesh-vn.
# Run from the PC in an elevated session (Claude Code runs elevated: no prompt). Rotation done on 2026-11-13 (new key in ~/.ssh/fleet/wg/wg-win.pub).
# ssh goes through the public IPs: cutting the tunnel does not cut access to the servers.
# New pair: ~/.ssh/fleet/wg/wg-win.{key,pub}, conf: ~/.ssh/fleet/wg/wg-win.conf (outside the repository).
set -euo pipefail
OLD='up+fbCDKsbVlLZSFXR3k4U3I784oSqwO8/ijyHSM/yM='
NEW=$(cat ~/.ssh/fleet/wg/wg-win.pub)
WGDIR='C:\Program Files\WireGuard'
CONF=$(cygpath -w ~/.ssh/fleet/wg/wg-win.conf 2>/dev/null || echo "$USERPROFILE\\.ssh\\fleet\\wg\\wg-win.conf")

swap() { # host iface allowed-ip from to
  ssh "$1" "
    sudo sed -i 's#$4#$5#' /etc/wireguard/$2.conf &&
    sudo wg set $2 peer '$5' allowed-ips $3 persistent-keepalive 25 &&
    sudo wg set $2 peer '$4' remove"
}
rollback() { swap vps wg1 10.200.77.2/32 "$NEW" "$OLD"; swap prd prod 10.200.78.2/32 "$NEW" "$OLD"; echo "ROLLBACK serveurs faits"; }

# 1. client first (sudo/UAC); if refused, nothing moved on the server side
# The tunnel service runs as LocalSystem: the conf must be in WireGuard's store (Data\Configurations,
# DPAPI-encrypted at import), not under ~/.ssh whose ACL only allows the user. Elevated session required.
pwsh -NoProfile -Command "\$wg='$WGDIR\\wireguard.exe'; \$store='$WGDIR\\Data\\Configurations';
  & \$wg /uninstalltunnelservice wg-win; Start-Sleep 3;
  Copy-Item '$CONF' (Join-Path \$store 'wg-win.conf') -Force; Start-Sleep 3;
  & \$wg /installtunnelservice (Join-Path \$store 'wg-win.conf.dpapi'); Start-Sleep 5;
  if ((Get-Service 'WireGuardTunnel\$wg-win').Status -ne 'Running') { exit 1 }"
# 2. serveurs
swap vps wg1 10.200.77.2/32 "$OLD" "$NEW"
swap prd prod 10.200.78.2/32 "$OLD" "$NEW"
# 3. verification (fr1, prd, fr2); automatic rollback on failure
ok=1
for ip in 10.200.77.1 10.200.77.5 10.200.77.3; do ping -n 3 "$ip" >/dev/null || { echo "KO $ip"; ok=0; }; done
if [ $ok = 1 ]; then echo "mesh OK avec la nouvelle clé $NEW"; else rollback; echo "Remettre l'ancien tunnel : réimporter la conf précédente dans l'UI WireGuard"; exit 1; fi
