#!/usr/bin/env bash
# Install the ay index pipeline units on a fleet host (run as root, from a checkout of this directory).
#   sudo bash install.sh fr1     worker + 5-minute index timer
#   sudo bash install.sh fr2     worker + 5-minute index timer + daily bench timer (Valkey lives here: valkey-install.sh)
# Everything is enabled, so it survives reboot; the Valkey URL is read from ~ubuntu/.config/ay/valkey.url.
set -euo pipefail
role="${1:?usage: install.sh fr1|fr2}"
here="$(cd "$(dirname "$0")" && pwd)"
units=(ay-index-worker.service ay-index.service ay-index.timer)
[ "$role" = fr2 ] && units+=(ay-index-bench.service ay-index-bench.timer)
for u in "${units[@]}"; do install -m 644 "$here/$u" "/etc/systemd/system/$u"; done
systemctl daemon-reload
systemctl enable --now ay-index-worker.service ay-index.timer
[ "$role" = fr2 ] && systemctl enable --now ay-index-bench.timer
systemctl --no-pager list-timers 'ay-index*' | head -6
systemctl is-active ay-index-worker.service
