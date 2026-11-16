#!/bin/bash
# Mesh ssh key for fleet-registry status (docs/infra/SINGLE-SERVER.md stage 2). Run from the workstation, idempotent:
#   fleet-mesh-key.sh apply|check [role ...]      default roles: the `[host.*]` of device/fleet/cluster.toml
# Each host generates its own ed25519 key ~/.ssh/fleet_mesh (the private key never leaves it, nothing is written to the repo).
# Every other host gets the public key in authorized_keys with `restrict,from=<mesh subnet>,command="fleet-probe"`:
# the key can only run the read-only probe, from the mesh. fleet-probe is installed to /usr/local/bin on each host.
# The mesh subnet is discovered from the WireGuard interface of fr1 (discover.sh network.mesh_cidr), or taken from FLEET_MESH_FROM; no address is committed here.
# Rollback: delete the lines tagged `fleet-mesh` from authorized_keys and ~/.ssh/fleet_mesh*.
set -eu
mode=${1:-check}; shift || true
here=$(cd "$(dirname "$0")" && pwd)
aliases=$*
[ -n "$aliases" ] || aliases=$(awk '/^\[host\./{gsub(/[\[\]]|host\./,""); print}' "$here/../cluster.toml")
. "$here/../../../packages/env-kit/loaders/shell/site.sh"
FLEET_MESH_FROM=${FLEET_MESH_FROM:-$(site_get network.mesh_cidr)}
: "${FLEET_MESH_FROM:?no mesh subnet discovered (is fr1 reachable over ssh?)}"
declare -A pub
for h in $aliases; do
  if [ "$mode" = apply ]; then
    timeout 60 ssh "$h" 'cat > /tmp/fleet-probe.sh' < "$here/fleet-probe.sh"
    timeout 60 ssh "$h" 'sudo install -m 0755 /tmp/fleet-probe.sh /usr/local/bin/fleet-probe; rm -f /tmp/fleet-probe.sh; [ -f ~/.ssh/fleet_mesh ] || ssh-keygen -q -t ed25519 -N "" -C "fleet-mesh $(hostname)" -f ~/.ssh/fleet_mesh'
  fi
  pub[$h]=$(timeout 30 ssh "$h" 'cat ~/.ssh/fleet_mesh.pub 2>/dev/null' || true)
  [ -n "${pub[$h]}" ] || { echo "$h: no mesh key yet (run apply)"; [ "$mode" = check ] && exit 1; }
done
for dst in $aliases; do
  for src in $aliases; do
    [ "$src" = "$dst" ] && continue
    line="restrict,from=\"$FLEET_MESH_FROM\",command=\"/usr/local/bin/fleet-probe\" ${pub[$src]}"
    blob=$(echo "${pub[$src]}" | cut -d" " -f2)
    if [ "$mode" = apply ]; then
      timeout 30 ssh "$dst" "grep -qF '$blob' ~/.ssh/authorized_keys 2>/dev/null || { [ -z \"\$(tail -c1 ~/.ssh/authorized_keys)\" ] || echo >> ~/.ssh/authorized_keys; echo '$line' >> ~/.ssh/authorized_keys; echo '$dst: added key of $src'; }"
    else
      timeout 30 ssh "$dst" "grep -qF '$blob' ~/.ssh/authorized_keys" && echo "$dst accepts $src" || { echo "$dst missing $src"; exit 1; }
    fi
  done
done
