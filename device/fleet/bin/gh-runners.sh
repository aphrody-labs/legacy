#!/bin/bash
# N GitHub Actions self-hosted runner instances of the monorepo on fr1, one systemd unit each (Restart=always),
# labels self-hosted,Linux,X64,fr1,build. Instance 1 is ~/actions-runner (name fr1, historical unit
# actions.runner.aphrody-dev-src.fr1, listed in fr1/resilience.conf); 2..N are ~/actions-runner-K (name fr1-K)
# cloned from its binaries. Idempotent: configured instances are left as is.
# A missing instance 1 is rebuilt from the newest actions/runner release: version and SHA-256 are read from the
# GitHub API and the archive is checked before it is unpacked.
#   Registration token on stdin (only needed when an instance is missing), never printed; REPO is <org>/<repo>:
#   gh api -X POST repos/$REPO/actions/runners/registration-token --jq .token | ssh <fr1> sudo REPO=$REPO gh-runners.sh 6
set -euo pipefail
N=${1:-6}; U=${RUNNER_USER:-ubuntu}; H=/home/$U
TOKEN=""; [ -t 0 ] || read -r TOKEN || true
D1=$H/actions-runner; UNIT1=actions.runner.aphrody-dev-src.fr1.service

repo_url() { printf %s "${REPO_URL:-https://github.com/${REPO:?gh-runners: set REPO=<org>/<repo>}}"; }
configure() { # <dir> <name>: register one instance; the job PATH is the login PATH of the runner user (cargo, bun, ~/.local/bin)
  [ -n "$TOKEN" ] || { echo "gh-runners: instance $2 missing and no token on stdin" >&2; exit 1; }
  chown -R "$U:$U" "$1"
  sudo -u "$U" bash -lc "cd '$1' && ./config.sh --unattended --url '$(repo_url)' --token '$TOKEN' --name '$2' --labels fr1,build --work _work --replace" >/dev/null
  sudo -u "$U" bash -lc 'printf %s "$PATH"' > "$1/.path"
  chown "$U:$U" "$1/.path"
}
unit() { # <unit> <dir> <label>
  cat > "/etc/systemd/system/$1" <<UNIT
[Unit]
Description=GitHub Actions Runner ($3)
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=600
StartLimitBurst=20
[Service]
ExecStart=$2/runsvc.sh
User=$U
WorkingDirectory=$2
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min
Restart=always
RestartSec=5s
[Install]
WantedBy=multi-user.target
UNIT
}

if [ ! -f "$D1/.runner" ]; then
  rel=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
  ver=$(printf %s "$rel" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))')
  sha=$(printf %s "$rel" | python3 -c 'import json,re,sys; print(re.search(r"BEGIN SHA linux-x64 -->([0-9a-f]{64})", json.load(sys.stdin)["body"]).group(1))')
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/runner.tgz" "https://github.com/actions/runner/releases/download/v$ver/actions-runner-linux-x64-$ver.tar.gz"
  echo "$sha  $tmp/runner.tgz" | sha256sum -c - >/dev/null
  mkdir -p "$D1" && tar -xzf "$tmp/runner.tgz" -C "$D1"
  configure "$D1" fr1
fi
[ -f "/etc/systemd/system/$UNIT1" ] || unit "$UNIT1" "$D1" aphrody-dev-src.fr1

for k in $(seq 2 "$N"); do
  d=$H/actions-runner-$k; name=fr1-$k
  if [ ! -f "$d/.runner" ]; then
    mkdir -p "$d"
    for f in bin externals config.sh env.sh run.sh runsvc.sh svc.sh run-helper.cmd.template run-helper.sh.template safe_sleep.sh; do
      [ -e "$D1/$f" ] && cp -a "$D1/$f" "$d/"
    done
    configure "$d" "$name"
  fi
  unit "actions.runner.aphrody-labs-src.$name.service" "$d" "aphrody-labs-src.$name"
done
systemctl daemon-reload
for k in $(seq 2 "$N"); do for f in .path .env; do cp -a "$D1/$f" "$H/actions-runner-$k/$f" 2>/dev/null || true; done; chown -R "$U:$U" "$H/actions-runner-$k"; done
# The units start runsvc.sh at the instance root; the release ships it under bin/ (what `svc.sh install` copies).
for d in "$D1" $(seq -f "$H/actions-runner-%g" 2 "$N"); do [ -x "$d/runsvc.sh" ] || install -m 0755 -o "$U" -g "$U" "$d/bin/runsvc.sh" "$d/runsvc.sh"; done
systemctl reset-failed 'actions.runner.*' 2>/dev/null || true
systemctl enable --now "$UNIT1" >/dev/null
for k in $(seq 2 "$N"); do systemctl enable --now "actions.runner.aphrody-labs-src.fr1-$k.service" >/dev/null; done
systemctl list-units "actions.runner.*" --no-legend | awk '{print $1, $3, $4}'
