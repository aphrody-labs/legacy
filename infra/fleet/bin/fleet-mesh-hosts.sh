#!/bin/bash
# Writes the `<role>.mesh` names of the mesh into /etc/hosts of every host, from the addresses the WireGuard interfaces
# carry (discovered over ssh, never listed in the repository). Run from the workstation:
#   fleet-mesh-hosts.sh [role ...]      default roles: the `[host.*]` of infra/fleet/cluster.toml
# The block is delimited by `# aphrody-mesh begin/end` and replaced as a whole; it is generated, not committed.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
. "$here/../../../packages/env-kit/loaders/shell/discover.sh"
roles=${*:-$(awk '/^\[host\./{gsub(/[\[\]]|host\./,""); print}' "$here/../cluster.toml")}
block="# aphrody-mesh begin"
for r in $roles; do
  m=$(discover_get "hosts.$r.mesh_ip") || { echo "fleet-mesh-hosts: no mesh address for $r" >&2; exit 1; }
  block="$block
$m $r.mesh"
done
block="$block
# aphrody-mesh end"
for r in $roles; do
  printf '%s\n' "$block" | timeout 60 ssh -o BatchMode=yes "$r" "sudo sh -c 'sed -i \"/# aphrody-mesh begin/,/# aphrody-mesh end/d\" /etc/hosts && cat >> /etc/hosts'" && echo "$r: ok"
done
