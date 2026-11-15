#!/bin/bash
# Host and service registry of the single logical server (infra/fleet/cluster.toml, docs/infra/SINGLE-SERVER.md).
#   fleet-registry hosts                     name ssh mesh user role classes (one host per line)
#   fleet-registry peers <class>             "name=user@mesh" of every other host allowed to run <class> (feeds fleet-run)
#   fleet-registry endpoint <service>        mesh endpoint (address:port) of a service
#   fleet-registry status                    one view: per host PSI cpu/io/mem avg10, root free, build volume, tunnel connector
# Config: /etc/fleet/cluster.toml (copy of the repo file), else the file next to this script's repo checkout.
# cluster.toml lists roles and `role:port` endpoints only. A role becomes an address through discovery (discover.sh): this host's
# tunnel interface for itself, `getent hosts <role>.mesh` (the /etc/hosts block fleet-mesh-hosts.sh writes from WireGuard), then
# `ssh -G <role>`. The user comes from `ssh -G` as well.
set -u
cfg=/etc/fleet/cluster.toml
[ -f "$cfg" ] || cfg=$(dirname "$0")/../cluster.toml
[ -f "$cfg" ] || { echo "fleet-registry: no cluster.toml" >&2; exit 66; }
for d in /usr/local/lib/aphrody/discover.sh "$(dirname "$0")/../../../packages/env-kit/loaders/shell/discover.sh"; do [ -f "$d" ] && { . "$d"; break; }; done
command -v discover_self >/dev/null 2>&1 || { echo "fleet-registry: discover.sh not installed" >&2; exit 66; }
self=$(discover_self); self=${self:-unknown}

# section key -> value, as "section<TAB>key<TAB>value"
flat() { awk -F' *= *' '/^\[/{s=$0; gsub(/[\[\]]/,"",s); next} /^[a-z_]+ *=/{k=$1; v=$2; gsub(/^"|"$/,"",v); print s "\t" k "\t" v}' "$cfg"; }
mesh_of() { # role -> mesh address
  if [ "$1" = "$self" ]; then _dc_mesh "$1" 1; return; fi
  getent hosts "$1.mesh" 2>/dev/null | awk '{print $1; exit}' | grep . && return
  discover_addr "$1"
}
user_of() { _dc_sshg "$1" user; }
hosts() {
  flat | awk -F'\t' '$1 ~ /^host\./{h=substr($1,6); a[h,$2]=$3; seen[h]=1} END{for(h in seen) print h, a[h,"role"], a[h,"classes"]}' | sort |
    while read -r n r c; do echo "$n $n $(mesh_of "$n") $(user_of "$n") $r $c"; done
}

case ${1:-hosts} in
hosts) hosts;;
peers) cls=${2:?class}; hosts | while read -r n _ m u _ c; do
         [ "$n" = "$self" ] && continue; case " $c " in *" $cls "*) echo "$n=$u@$m";; esac; done;;
endpoint) ep=$(flat | awk -F'\t' -v s="service.${2:?service}" '$1==s && $2=="endpoint"{print $3; f=1} END{exit !f}') || exit 1
          case $ep in
            *:[0-9]*) a=$(mesh_of "${ep%:*}") && [ -n "$a" ] && { echo "$a:${ep##*:}"; exit 0; }; echo "$ep";;
            *) echo "$ep";;
          esac;;
status)
  printf '%-4s %-18s %-30s %-30s %-30s\n' host role "psi cpu/io/mem (avg10)" "root free GB / build fs" "tunnel connectors"
  hosts | while read -r n s m u r c; do
    if [ "$n" = "$self" ]; then out=$(fleet-probe 2>/dev/null); else
      # the mesh key is installed in one account per host: the ssh -G user first, then the usual service accounts
      out=; for uu in "$u" root ubuntu; do
        out=$(timeout 10 ssh -n -i "$HOME/.ssh/fleet_mesh" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=4 -l "$uu" "$m" fleet-probe 2>/dev/null); [ -n "$out" ] && break
      done
    fi
    [ -n "$out" ] || { printf '%-4s %-18s unreachable\n' "$n" "$r"; continue; }
    # shellcheck disable=SC2086
    set -- $out; printf '%-4s %-18s %-30s %-30s %-30s\n' "$n" "$r" "${1#avg10=}/${2#avg10=}/${3#avg10=}" "$4 / $5" "${6:-none}"
  done;;
*) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 64;;
esac
