#!/bin/bash
# Apply / check the offload layer of a fleet host (docs/infra/FLEET-OFFLOAD.md). Idempotent, run as root from /srv/src.
#   fleet-offload.sh apply|check [host]      host defaults to /etc/aphrody/role (fr1|fr2|prd)
# Installs: bin scripts -> /usr/local/bin, shared units (fleet-cgsample), <host>/offload/systemd/* (slices, drop-ins),
# atop with 30 s history, then daemon-reload and enable --now of the timers. prd: only sampler + atop, never its services.
set -eu
mode=${1:-check}
role=${2:-$(cat /etc/aphrody/role 2>/dev/null || echo unknown)}
src=$(cd "$(dirname "$0")/../" && pwd)
changed=0
inst() { # inst <from> <to> <mode>
  if ! cmp -s "$1" "$2" 2>/dev/null; then
    [ "$mode" = apply ] && install -D -m "$3" "$1" "$2"
    echo "$mode: $2"; changed=1
  fi
}
for b in fleet-cgsample.sh fleet-cgreport.sh fleet-run.sh; do
  [ -f "$src/bin/$b" ] && inst "$src/bin/$b" "/usr/local/bin/${b%.sh}" 0755
done
# keep the .sh names too (units and docs call them either way)
for b in fleet-cgsample.sh fleet-cgreport.sh; do inst "$src/bin/$b" "/usr/local/bin/$b" 0755; done
for u in fleet-cgsample.service fleet-cgsample.timer; do inst "$src/systemd/$u" "/etc/systemd/system/$u" 0644; done
if [ -d "$src/$role/offload/systemd" ]; then
  while IFS= read -r f; do
    rel=${f#"$src/$role/offload/systemd/"}
    inst "$f" "/etc/systemd/system/$rel" 0644
  done < <(find "$src/$role/offload/systemd" -type f)
fi
if [ -f "$src/$role/offload/atop.default" ]; then inst "$src/$role/offload/atop.default" /etc/default/atop 0644; fi
if [ "$mode" = apply ]; then
  command -v atop >/dev/null 2>&1 || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq atop >/dev/null; changed=1; }
  systemctl daemon-reload
  systemctl enable --now fleet-cgsample.timer >/dev/null
  if [ -f "$src/$role/offload/atop.default" ]; then systemctl enable atop.service atopacct.service >/dev/null 2>&1; [ $changed = 1 ] && systemctl restart atop.service atopacct.service; fi
  # slices: apply live limits of every shipped slice/drop-in without restarting services
  for s in "$src/$role/offload/systemd/"*.slice; do [ -f "$s" ] && systemctl start "$(basename "$s")" 2>/dev/null || true; done
  [ -f "$src/$role/offload/systemd/user.slice.d/50-offload.conf" ] && systemctl daemon-reload
  echo "applied $role (changed=$changed)"
else
  [ $changed = 0 ] && echo "ok $role" || { echo "drift $role"; exit 1; }
fi
