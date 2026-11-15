#!/bin/bash
# One-line health probe of this host for fleet-registry status: "cpu10 io10 mem10 rootfreeG buildfs connectors".
# Read-only; it is also the forced command of the restricted mesh key (fleet-mesh-key.sh), so that key can do nothing else.
cfg=/etc/fleet/cluster.toml
mp=$(awk -F' *= *' '/^\[storage\]/{s=1;next} /^\[/{s=0} s&&$1=="build_mount"{gsub(/"/,"",$2);print $2}' "$cfg" 2>/dev/null)
mp=${mp:-/srv/xbuild}
awk '/^some/{printf "%s ", $2}' /proc/pressure/cpu /proc/pressure/io /proc/pressure/memory
printf '%s ' "$(df --output=avail -BG / | tail -n 1 | tr -d ' ')"
printf '%s ' "$(findmnt -rn -o FSTYPE "$mp" 2>/dev/null || echo none)"
systemctl is-active 'cloudflared*' 2>/dev/null | sort -u | tr '\n' ','
echo
