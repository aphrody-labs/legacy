#!/bin/sh
# Aphrody Box installation (Linux, macOS): fetches the box if needed, prepares the secrets, detects an NVIDIA
# graphics card, then starts everything. Running the script again updates without touching your data.
#   curl -fsSL https://raw.githubusercontent.com/aphrody-labs/auto/main/box/installer.sh | sh
# Options: BOX_DOSSIER (default ~/aphrody-box), BOX_EMAIL, BOX_DOMAINE (HTTPS on subdomains).
set -eu

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is required: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "the \"docker compose\" module is required (Docker 24 or newer)."
docker info >/dev/null 2>&1 || fail "Docker is not responding: start it, or run this script with sudo."

DOSSIER=${BOX_DOSSIER:-"$HOME/aphrody-box"}
if [ -f "./compose.yaml" ] && grep -q "name: aphrody-box" ./compose.yaml; then DOSSIER=$(pwd); fi
mkdir -p "$DOSSIER"
cd "$DOSSIER"

# Box files: downloaded if missing, or replaced with BOX_MAJ=1 (.env, donnees and coffre stay).
if [ ! -f compose.yaml ] || [ "${BOX_MAJ:-0}" = 1 ]; then
    say "Downloading the box into $DOSSIER…"
  curl -fsSL https://codeload.github.com/aphrody-labs/auto/tar.gz/refs/heads/main \
    | tar -xz --strip-components=2 auto-main/box
fi

IMAGE=${BOX_IMAGE_CONSOLE:-ghcr.io/aphrody-labs/aphrody-box:latest}
if ! docker pull -q "$IMAGE" >/dev/null 2>&1; then
    say "Console image not found online: building on this machine (a few minutes)…"
  docker build -q -t "$IMAGE" console >/dev/null
fi

GPU=--sans-gpu
if command -v nvidia-smi >/dev/null 2>&1 && docker info 2>/dev/null | grep -qi nvidia; then GPU=--gpu; fi

HOTE=${BOX_HOTE:-}
if [ -z "$HOTE" ]; then
  HOTE=$( (hostname -I 2>/dev/null || true) | awk '{print $1}')
  [ -n "$HOTE" ] || HOTE=$(ipconfig getifaddr en0 2>/dev/null || true)
  [ -n "$HOTE" ] || HOTE=localhost
fi

set -- preparer /box "$GPU" --hote "$HOTE"
[ -n "${BOX_EMAIL:-}" ] && set -- "$@" --email "$BOX_EMAIL"
[ -n "${BOX_DOMAINE:-}" ] && set -- "$@" --domaine "$BOX_DOMAINE"
docker run --rm -v "$DOSSIER:/box" "$IMAGE" "$@"

say "Starting the services (the first launch downloads the images and a 2.5 GB AI model)…"
docker compose up -d --remove-orphans

PORT_CONSOLE=8080
if [ -n "${BOX_DOMAINE:-}" ]; then URL="https://console.$BOX_DOMAINE"; else URL="http://$HOTE:$PORT_CONSOLE"; fi
MDP=$(sed -n "s/^BOX_ADMIN_MOT_DE_PASSE='\(.*\)'$/\1/p" .env)
say ""
say "The Aphrody Box is running."
echo "  Console: $URL"
echo "  Username: admin"
echo "  Password: $MDP"
echo "The access details of Auto, n8n, Hermes and Obsidian are in the console, \"Access\" section."
