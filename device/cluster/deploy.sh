#!/usr/bin/env bash
# Push the generated cluster data plane to one member, validate, then reload (keeps services up).
# Usage: device/cluster/deploy.sh <member> [down]     (the member is a role: a Host alias of ~/.ssh/config; @@tokens@@ of the generated files are discovered at push time)
# Rollback (one line): device/cluster/deploy.sh <member> down   -> HAProxy stopped, nginx shard conf removed.
set -euo pipefail
m=$1; here=$(cd "$(dirname "$0")" && pwd); g="$here/generated/$m"
tgt=$m
run() { timeout 120 ssh "$tgt" "sudo bash -s" ; }
if [ "${2:-}" = down ]; then
  run <<'R'
systemctl disable --now aphrody-cluster-haproxy 2>/dev/null || true
rm -f /etc/ssh/ssh_config.d/50-aphrody-mesh.conf /usr/local/bin/aphrody-ssh-mesh /etc/systemd/system/nginx.service.d/50-aphrody-cluster-restart.conf
systemctl daemon-reload
rm -f /etc/nginx/conf.d/aphrody-cluster.conf && nginx -t -q && systemctl reload nginx
echo down
R
  exit 0
fi
[ -f "$g/haproxy.cfg" ] || { echo "run: bun device/cluster/gen.ts" >&2; exit 1; }
stage=$(mktemp -d); trap "rm -rf $stage" EXIT
for f in "$g"/haproxy.cfg "$g"/nginx-cluster.conf "$g"/aphrody-cluster.slice "$here"/systemd/aphrody-cluster-haproxy.service "$here"/systemd/nginx-restart.conf "$here"/generated/ssh/aphrody-ssh-mesh "$here"/generated/ssh/ssh_config.host; do
  bun "$here/../../packages/env-kit/src/render.ts" "$f" "$stage/$(basename "$f")"
done
tar -cf - -C "$stage" haproxy.cfg nginx-cluster.conf aphrody-cluster.slice aphrody-cluster-haproxy.service nginx-restart.conf aphrody-ssh-mesh ssh_config.host \
  | timeout 120 ssh "$tgt" 'rm -rf /tmp/aphrody-cluster && mkdir -p /tmp/aphrody-cluster && tar -xf - -C /tmp/aphrody-cluster'
run <<'R'
set -euo pipefail
s=/tmp/aphrody-cluster
install -d -m 755 /etc/aphrody-cluster /var/cache/nginx /var/lib/aphrody-cluster/bench
[ -s /var/lib/aphrody-cluster/bench/64m ] || head -c 64M /dev/urandom > /var/lib/aphrody-cluster/bench/64m
[ -s /var/lib/aphrody-cluster/bench/1k ] || head -c 1024 /dev/urandom > /var/lib/aphrody-cluster/bench/1k
echo ok > /var/lib/aphrody-cluster/bench/health
chmod -R a+rX /var/lib/aphrody-cluster
haproxy -c -q -f $s/haproxy.cfg
had=0; [ -f /etc/nginx/conf.d/aphrody-cluster.conf ] && had=1 && cp /etc/nginx/conf.d/aphrody-cluster.conf $s/prev.conf
install -m 644 $s/nginx-cluster.conf /etc/nginx/conf.d/aphrody-cluster.conf
if ! nginx -t -q; then
  if [ $had = 1 ]; then install -m 644 $s/prev.conf /etc/nginx/conf.d/aphrody-cluster.conf; else rm -f /etc/nginx/conf.d/aphrody-cluster.conf; fi
  echo "nginx -t failed: previous state restored" >&2; exit 1
fi
systemctl reload nginx || nginx -s reload   # prd: the unit reload can fail with 226/NAMESPACE (private /tmp removed under a running nginx); HUP is the same graceful reload
install -m 644 $s/haproxy.cfg /etc/aphrody-cluster/haproxy.cfg
install -m 644 $s/aphrody-cluster.slice /etc/systemd/system/aphrody-cluster.slice
install -m 644 $s/aphrody-cluster-haproxy.service /etc/systemd/system/aphrody-cluster-haproxy.service
install -m 755 $s/aphrody-ssh-mesh /usr/local/bin/aphrody-ssh-mesh
install -d -m 755 /etc/ssh/ssh_config.d
install -m 644 $s/ssh_config.host /etc/ssh/ssh_config.d/50-aphrody-mesh.conf
install -d -m 755 /etc/systemd/system/nginx.service.d
install -m 644 $s/nginx-restart.conf /etc/systemd/system/nginx.service.d/50-aphrody-cluster-restart.conf
systemctl daemon-reload
systemctl enable -q nginx
if systemctl is-active -q aphrody-cluster-haproxy; then systemctl reload aphrody-cluster-haproxy; else systemctl enable --now aphrody-cluster-haproxy; fi
rm -rf $s
systemctl is-active aphrody-cluster-haproxy
R
