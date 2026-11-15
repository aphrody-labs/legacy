#!/bin/bash
# Ship infra/fleet of the committed HEAD to a host and apply the offload layer, with site tokens rendered (run from the workstation).
#   fleet-ship.sh <role>        role = fr1|fr2   (the role is a Host alias of ~/.ssh/config)
# Files carry @@role.key@@ tokens instead of addresses (packages/env-kit/loaders/shell/site.sh); they are rendered here, never on the host
# from the repo, and nothing rendered is committed. A host checkout is not used: it may hold local changes.
set -e
role=${1:?role fr1|fr2}
root=$(git rev-parse --show-toplevel)
. "$root/packages/env-kit/loaders/shell/site.sh"
alias=$(site_ssh "$role")
tmp=$(mktemp -d)
git -C "$root" archive HEAD infra/fleet -o "$tmp/a.tar"
tar -xf "$tmp/a.tar" -C "$tmp"
rg -l '@@[A-Za-z0-9_.]+@@' "$tmp" > "$tmp.list" || true
for f in $(cat "$tmp.list"); do site_render "$f" > "$f.r" && mv "$f.r" "$f"; done
rm -f "$tmp.list"
if rg -q '@@[A-Za-z0-9_.]+@@' "$tmp/infra/fleet/cluster.toml" "$tmp/infra/fleet/$role/offload" 2>/dev/null; then echo "fleet-ship: unrendered token left" >&2; exit 1; fi
tar -cf "$tmp/b.tar" -C "$tmp" infra
timeout 200 ssh "$alias" "rm -rf /tmp/fs && mkdir /tmp/fs && tar -x -C /tmp/fs && cd /tmp/fs/infra/fleet && sudo bash bin/fleet-offload.sh apply $role 2>&1 | tail -3" < "$tmp/b.tar"
rm -rf "$tmp"
