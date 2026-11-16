#!/bin/sh
# Install or refresh the GNU tracker on fr2 (ubuntu user with passwordless sudo, checkout in /srv/src).
# Idempotent. Doc: docs/native/gnu/DISTRIBUTION.md.
set -eu
SRC=${SRC:-/srv/src}
export PATH="$HOME/.local/bin:$PATH"

sudo install -d -o ubuntu -g ubuntu /srv/gnu
sudo install -m 644 "$SRC"/device/gnu/systemd/aphrody-gnu.service "$SRC"/device/gnu/systemd/aphrody-gnu-watch.service "$SRC"/device/gnu/systemd/aphrody-gnu-watch.timer /etc/systemd/system/
sudo install -m 644 "$SRC"/device/gnu/nginx/gnu.aphrody.com.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx

# Dedicated R2 bucket (rclone remote "r2"; bucket creation needs an admin token, an existing bucket is kept).
rclone mkdir r2:aphrody-gnu || echo "bucket aphrody-gnu: create it with: cf r2 buckets create aphrody-gnu"

# kernel.org developer keys through WKD (trust on first fetch; the fingerprints are published on the kernel.org signatures page).
if [ ! -s /srv/gnu/kernel-keyring.pgp ]; then
  GH=$(mktemp -d)
  gpg --homedir "$GH" --batch --auto-key-locate clear,wkd --locate-keys torvalds@kernel.org gregkh@kernel.org sashal@kernel.org >/dev/null 2>&1 || true
  gpg --homedir "$GH" --export > /srv/gnu/kernel-keyring.pgp
  rm -rf "$GH"
fi

sudo systemctl daemon-reload
sudo systemctl enable --now aphrody-gnu.service aphrody-gnu-watch.timer
systemctl is-active aphrody-gnu.service aphrody-gnu-watch.timer
