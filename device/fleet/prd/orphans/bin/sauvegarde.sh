#!/bin/sh
# Nightly backup of auto on usa (auto-sauvegarde.timer unit): Postgres dump encrypted by the master key
# (auto-sauvegarde image, AUTO_PG_LOCAL=1) and RustFS bucket archive, 14 of each kept.
set -eu
D=/srv/auto/sauvegardes
GARDER=14
V=$(docker inspect -f '{{.Config.Image}}' auto-api | sed 's/^auto-app://')
docker run --rm --network auto-prod --env-file /srv/auto/prod.env -e AUTO_SAUVEGARDES_GARDER=$GARDER \
  -v "$D":/sauvegardes "auto-sauvegarde:$V"
# RustFS bucket: immutable objects (evidentiary archives), copy of the hot data directory.
H=$(date -u +%Y-%m-%dT%H-%M-%SZ)
tar --zstd -cf "$D/s3-$H.tar.zst.part" -C /srv/auto s3 && mv "$D/s3-$H.tar.zst.part" "$D/s3-$H.tar.zst"
chmod 0600 "$D/s3-$H.tar.zst"
ls -1 "$D"/s3-*.tar.zst | sort | head -n -$GARDER | xargs -r rm -f
echo "sauvegarde auto : $(ls -1 "$D"/auto-*.dump.chiffre | wc -l) dump(s), $(ls -1 "$D"/s3-*.tar.zst | wc -l) archive(s) S3"
