#!/bin/bash
# Host and service registry of the single logical server (infra/fleet/cluster.toml, docs/infra/SINGLE-SERVER.md).
#   fleet-registry hosts                     name ssh mesh user role classes (one host per line)
#   fleet-registry peers <class>             "name=user@mesh" of every other host allowed to run <class> (feeds fleet-run)
#   fleet-registry endpoint <service>        mesh endpoint of a service
#   fleet-registry status                    one view: per host PSI cpu/io/mem avg10, root free, build volume, tunnel connector
# Config: /etc/fleet/cluster.toml (copy of the repo file), else the file next to this script's repo checkout.
set -u
cfg=/etc/fleet/cluster.toml
[ -f "$cfg" ] || cfg=$(dirname "$0")/../cluster.toml
[ -f "$cfg" ] || { echo "fleet-registry: no cluster.toml" >&2; exit 66; }
self=$(tail -n 1 /etc/aphrody/role 2>/dev/null || echo unknown)

# section key -> value, as "section<TAB>key<TAB>value"
flat() { awk -F' *= *' '/^\[/{s=$0; gsub(/[\[\]]/,"",s); next} /^[a-z_]+ *=/{k=$1; v=$2; gsub(/^"|"$/,"",v); print s "\t" k "\t" v}' "$cfg"; }
hosts() { flat | awk -F'\t' '$1 ~ /^host\./{h=substr($1,6); a[h,$2]=$3; seen[h]=1} END{for(h in seen) print h, a[h,"ssh"], a[h,"mesh"], a[h,"user"], a[h,"role"], a[h,"classes"]}' | sort; }

case ${1:-hosts} in
hosts) hosts;;
peers) cls=${2:?class}; hosts | while read -r n _ m u _ c; do
         [ "$n" = "$self" ] && continue; case " $c " in *" $cls "*) echo "$n=$u@$m";; esac; done;;
endpoint) flat | awk -F'\t' -v s="service.${2:?service}" '$1==s && $2=="endpoint"{print $3; f=1} END{exit !f}';;
status)
  mp=$(flat | awk -F'\t' '$1=="storage" && $2=="build_mount"{print $3}')
  probe='awk "/^some/{printf \"%s \", \$2}" /proc/pressure/cpu /proc/pressure/io /proc/pressure/memory; df --output=avail -BG / | tail -n 1 | tr -d " \n"; echo -n " "; (findmnt -rn -o FSTYPE '"$mp"' || echo none) | tr -d "\n"; echo -n " "; (systemctl is-active "cloudflared*" 2>/dev/null | sort -u | tr "\n" ",")'
  printf '%-4s %-18s %-30s %-30s %-30s\n' host role "psi cpu/io/mem (avg10)" "root free / build fs" "tunnel connectors"
  hosts | while read -r n s m u r c; do
    if [ "$n" = "$self" ]; then out=$(bash -c "$probe" 2>/dev/null); else out=$(timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=4 "$u@$m" "$probe" 2>/dev/null); fi
    [ -n "$out" ] || { printf '%-4s %-18s unreachable\n' "$n" "$r"; continue; }
    # shellcheck disable=SC2086
    set -- $out; printf '%-4s %-18s %-30s %-30s %-30s\n' "$n" "$r" "${1#avg10=}/${2#avg10=}/${3#avg10=}" "$4 / $5" "${6:-none}"
  done;;
*) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 64;;
esac
