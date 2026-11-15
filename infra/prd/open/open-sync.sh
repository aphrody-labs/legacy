#!/bin/sh
# Deploy-only mirror of aphrody-labs/open on prd: fetch, reset, build, atomic symlink swap.
# Installed as /srv/open-deploy/open-sync.sh (infra/prd/open/README: apply step = apply.sh).
set -eu
SRC=/srv/open
WWW=/srv/open-www
REL=/srv/open-releases
D=/srv/open-deploy

git -C "$SRC" fetch -q --depth 1 origin main
git -C "$SRC" reset -q --hard FETCH_HEAD
head=$(git -C "$SRC" rev-parse --short=9 HEAD)

if [ -f "$WWW/.open-head" ] && [ "$(cat "$WWW/.open-head")" = "$head" ]; then
  echo "open-sync: $head already live"
  exit 0
fi

mkdir -p "$REL"
tmp=$(mktemp -d "$REL/.build.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
if [ -f "$SRC/site/build.ts" ]; then
  (cd "$SRC" && OUT_DIR="$tmp" bun site/build.ts "$tmp") || echo "open-sync: site/build.ts failed, falling back to render.ts"
fi
[ -f "$tmp/index.html" ] || bun "$D/render.ts" "$SRC" "$tmp"
echo "$head" > "$tmp/.open-head"
chmod 755 "$tmp"
rel="$REL/$head-$(date +%s)"
mv "$tmp" "$rel"
ln -sfn "$rel" "$WWW.next"
mv -T "$WWW.next" "$WWW"
# keep the 3 newest releases
ls -1dt "$REL"/*-* | tail -n +4 | xargs -r rm -rf
echo "open-sync: live $head"
