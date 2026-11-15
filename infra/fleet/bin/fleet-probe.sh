#!/bin/bash
# One-line health probe of this host for fleet-registry status: "cpu10 io10 mem10 rootfreeG buildfs connectors".
# Read-only; it is also the forced command of the restricted mesh key (fleet-mesh-key.sh), so that key can do nothing else.
cfg=/etc/fleet/cluster.toml
if [ "${1:-}" = "--well-known" ]; then
  # Body of /.well-known/aphrody/host (written by fleet-wellknown.timer, served by nginx): role, hostname, mesh addresses, services.
  role=$(tail -n 1 /etc/aphrody/role 2>/dev/null)
  mesh=$( { ip -o -4 addr show scope global; echo ===; ip -o link; } | awk '/^===/{s=1;next} !s{a[$2]=$4;o[++c]=$2;next} /link\/none/{t=$2;sub(/:$/,"",t);tun[t]=1} END{for(i=1;i<=c;i++) if(tun[o[i]]){x=a[o[i]];sub(/\/.*/,"",x);printf "%s\"%s\"", (n++?",":""), x}}')
  services=$(awk -F' *= *' -v r="$role" '/^\[service\./{s=$0;gsub(/[\[\]]|service\./,"",s);next} /^\[/{s=""} s&&$1=="host"{gsub(/"/,"",$2);h[s]=$2} s&&$1=="endpoint"{gsub(/"/,"",$2);e[s]=$2} END{for(k in h) if(h[k]==r||h[k]=="all"){x=e[k];sub(/^[^:]*:/,"",x); if(x !~ /^[0-9]+$/) continue; printf "%s{\"name\":\"%s\",\"port\":\"%s\"}", (n++?",":""), k, x}}' "$cfg" 2>/dev/null)
  printf '{"role":"%s","hostname":"%s","mesh":[%s],"services":[%s]}\n' "$role" "$(hostname -f 2>/dev/null || hostname)" "$mesh" "$services"
  exit 0
fi
mp=$(awk -F' *= *' '/^\[storage\]/{s=1;next} /^\[/{s=0} s&&$1=="build_mount"{gsub(/"/,"",$2);print $2}' "$cfg" 2>/dev/null)
mp=${mp:-/srv/xbuild}
awk '/^some/{printf "%s ", $2}' /proc/pressure/cpu /proc/pressure/io /proc/pressure/memory
printf '%s ' "$(df --output=avail -BG / | tail -n 1 | tr -d ' ')"
printf '%s ' "$(findmnt -rn -o FSTYPE "$mp" 2>/dev/null || echo none)"
systemctl is-active 'cloudflared*' 2>/dev/null | sort -u | tr '\n' ','
echo
