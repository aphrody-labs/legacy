#!/bin/bash
# Create the one directory layout of cluster.toml [layout] on this host (non-destructive: mkdir only). Run as root.
#   fleet-layout.sh apply|check
# Scripts and units must take their paths from `fleet-registry layout <key>`; migration of existing checkouts is
# device/fleet/bin/fleet-migrate.ts (inventory-driven, per host).
set -eu
mode=${1:-check}
for k in monorepo repos data www xbuild; do
  d=$(fleet-registry layout "$k")
  case $k in repos|data|www) m=0755;; *) m=0755;; esac
  if [ -d "$d" ]; then echo "ok   $k $d"; elif [ "$mode" = apply ]; then install -d -m "$m" "$d"; echo "made $k $d"; else echo "MISSING $k $d"; fi
done
