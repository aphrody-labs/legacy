#!/bin/bash
# Give the consumer hosts the Valkey password for the shared sccache backend (docs/infra/SINGLE-SERVER.md stage 5).
#   fleet-cache-wire.sh apply|check <valkey-host> <consumer-host> [<consumer-host> ...]     (ssh aliases, run from the workstation)
# The password is read on the Valkey host (/etc/valkey/ay.pass, root only) and written, through the pipe and never printed, to
# /etc/aphrody/secrets.env on every consumer as VALKEY_PASSWORD (root:ubuntu 0640, other lines kept). fleet-run reads it,
# resolves the endpoint with `fleet-registry endpoint valkey` and exports the sccache variables. Nothing secret enters the repo.
# Rollback: delete the VALKEY_PASSWORD line from /etc/aphrody/secrets.env on the consumers.
set -eu
mode=${1:?apply|check}; vh=${2:?valkey host}; shift 2; [ $# -gt 0 ] || { echo "no consumer host" >&2; exit 64; }
for c in "$@"; do
  if [ "$mode" = apply ]; then
    timeout 30 ssh "$vh" 'sudo cat /etc/valkey/ay.pass' | tr -d '\r\n' |
      timeout 30 ssh "$c" 'p=$(cat); [ -n "$p" ] || exit 1; sudo install -d -m 0755 /etc/aphrody; f=/etc/aphrody/secrets.env;
        sudo touch $f; sudo sed -i "/^VALKEY_PASSWORD=/d" $f; printf "VALKEY_PASSWORD=%s\n" "$p" | sudo tee -a $f >/dev/null; sudo chown root:ubuntu $f; sudo chmod 0640 $f'
  fi
  timeout 30 ssh "$c" 'sudo grep -q "^VALKEY_PASSWORD=." /etc/aphrody/secrets.env' && echo "$c: VALKEY_PASSWORD present" || { echo "$c: missing"; exit 1; }
done
