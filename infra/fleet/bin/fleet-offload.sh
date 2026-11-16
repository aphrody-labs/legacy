#!/bin/bash
# Apply / check the offload layer of a fleet host. Idempotent, run as root from /srv/src.
#   fleet-offload.sh apply|check [host]      host defaults to /etc/aphrody/role (fr1|fr2|prd)
# Installs: bin scripts -> /usr/local/bin (with and without .sh), fleet-cgsample units, <host>/offload/systemd/** -> /etc/systemd/system
# (slices + drop-ins), <host>/offload/etc/** -> /etc (udev bfq rule, modules-load, /etc/fleet/run.conf), atop 30 s history.
# prd: only what its offload dir ships; its services are never touched.
set -eu
mode=${1:-check}
role=${2:-$(tail -n 1 /etc/aphrody/role 2>/dev/null || echo unknown)}
src=$(cd "$(dirname "$0")/.." && pwd)
off=$src/$role/offload
changed=0 sysd=0 udev=0
inst() { # inst <from> <to> <mode>
  if ! cmp -s "$1" "$2" 2>/dev/null; then
    [ "$mode" = apply ] && install -D -m "$3" "$1" "$2"
    echo "$mode: $2"; changed=1; return 0
  fi
  return 1
}
for b in fleet-cgsample fleet-cgreport fleet-atopreport fleet-run fleet-offload-bench fleet-xfs fleet-registry fleet-probe fleet-nfs fleet-pool fleet-layout; do
  inst "$src/bin/$b.sh" "/usr/local/bin/$b.sh" 0755 || true
  inst "$src/bin/$b.sh" "/usr/local/bin/$b" 0755 || true
done
inst "$src/cluster.toml" /etc/fleet/cluster.toml 0644 || true
[ -f "$src/../../tools/identity.toml" ] && { inst "$src/../../tools/identity.toml" /etc/fleet/identity.toml 0644 || true; }
inst "$src/../../packages/env-kit/loaders/shell/discover.sh" /usr/local/lib/aphrody/discover.sh 0644 || true
inst "$src/../../packages/env-kit/loaders/shell/site.sh" /usr/local/lib/aphrody/site.sh 0644 || true
# /.well-known/aphrody/host listener (mesh + loopback :8399) in nginx, rendered for this host. prd (production) gets the files and the timer only:
# its nginx conf and reload wait for the owner's prd window (listed at the end of apply).
ngx=0 ngx_skipped=0
if [ -d /etc/nginx/conf.d ]; then
  . "$src/../../packages/env-kit/loaders/shell/site.sh"
  wk=$(mktemp); sed "s/__ROLE__/$role/g" "$src/nginx-wellknown.conf.in" > "$wk.in"
  if site_render "$wk.in" > "$wk"; then
    if [ "$role" = prd ]; then cmp -s "$wk" /etc/nginx/conf.d/aphrody-wellknown.conf 2>/dev/null || ngx_skipped=1
    else inst "$wk" /etc/nginx/conf.d/aphrody-wellknown.conf 0644 && ngx=1; fi
  else echo "wellknown: mesh address of $role not discovered, nginx listener skipped" >&2; fi
  rm -f "$wk" "$wk.in"
fi
for u in fleet-cgsample.service fleet-cgsample.timer fleet-wellknown.service fleet-wellknown.timer; do inst "$src/systemd/$u" "/etc/systemd/system/$u" 0644 && sysd=1; done
if [ -d "$off/systemd" ]; then
  while IFS= read -r f; do inst "$f" "/etc/systemd/system/${f#"$off/systemd/"}" 0644 && sysd=1; done < <(find "$off/systemd" -type f)
fi
if [ -d "$off/etc" ]; then
  while IFS= read -r f; do
    rel=${f#"$off/etc/"}; inst "$f" "/etc/$rel" 0644 && { case $rel in udev/*|modules-load.d/*) udev=1;; esac; }
  done < <(find "$off/etc" -type f)
fi
[ "$mode" = apply ] && [ -e /etc/udev/rules.d/60-fleet-bfq.rules ] && rm -f /etc/udev/rules.d/60-fleet-bfq.rules   # renamed to 66 (must sort after 65-aphrody-vps)
if [ -f "$off/atop.default" ]; then inst "$off/atop.default" /etc/default/atop 0644 && atopcfg=1 || atopcfg=0; else atopcfg=0; fi

if [ "$mode" = apply ]; then
  if [ -f "$off/atop.default" ]; then
    command -v atop >/dev/null 2>&1 || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq atop >/dev/null; atopcfg=1; }
    systemctl enable atop.service atopacct.service >/dev/null 2>&1 || true
    [ "$atopcfg" = 1 ] && systemctl restart atop.service
  fi
  # shared writable dirs: bench TSV (any agent user), synthetic cargo bench crate on the SSD root
  install -d -m 1777 /var/log/fleet /srv/offload-bench
  [ -e /var/log/fleet/offload-bench.tsv ] || install -m 0666 /dev/null /var/log/fleet/offload-bench.tsv
  [ "$sysd" = 1 ] && systemctl daemon-reload
  systemctl enable --now fleet-cgsample.timer >/dev/null
  systemctl enable --now fleet-wellknown.timer >/dev/null; systemctl start fleet-wellknown.service || true
  if [ "$ngx" = 1 ]; then
    if nginx -t -q 2>/dev/null; then systemctl reload nginx; else rm -f /etc/nginx/conf.d/aphrody-wellknown.conf; echo "nginx -t failed: wellknown listener removed" >&2; fi
  fi
  [ "$ngx_skipped" = 1 ] && echo "prd window: render $src/nginx-wellknown.conf.in to /etc/nginx/conf.d/aphrody-wellknown.conf (site_render after sed __ROLE__=prd), nginx -t, reload nginx"
  if [ "$udev" = 1 ] || { [ -f "$off/etc/modules-load.d/fleet-bfq.conf" ] && ! rg -q '\[bfq\]' /sys/block/sdb/queue/scheduler 2>/dev/null; }; then
    modprobe bfq 2>/dev/null || true
    udevadm control --reload; udevadm trigger --subsystem-match=block --action=change
  fi
  # Slice= drop-ins only take effect when the unit restarts: restart a unit only if its current slice differs
  if [ -d "$off/systemd" ]; then
    for d in "$off"/systemd/*.service.d; do
      [ -d "$d" ] || continue
      unit=$(basename "$d" .d); want=$(awk -F= '$1=="Slice"{print $2}' "$d"/*.conf | tail -n 1)
      [ -n "$want" ] || continue
      [ "$(systemctl show -p Slice --value "$unit")" = "$want" ] || { echo "restart $unit -> $want"; systemctl restart "$unit"; }
    done
  fi
  echo "applied $role (changed=$changed)"
else
  [ $changed = 0 ] && echo "ok $role" || { echo "drift $role"; exit 1; }
fi
