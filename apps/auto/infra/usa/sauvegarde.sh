#!/bin/sh
# Nightly auto backup on usa (auto-sauvegarde.timer unit): Postgres dump encrypted with the master key
# (auto-sauvegarde image, AUTO_PG_LOCAL=1) and archive of the RustFS bucket, 14 of each kept.
set -eu
D=/srv/auto/sauvegardes
GARDER=14
V=$(docker inspect -f '{{.Config.Image}}' auto-api | sed 's/^auto-app://')
docker run --rm --network auto-prod --env-file /srv/auto/prod.env -e AUTO_SAUVEGARDES_GARDER=$GARDER \
  -v "$D":/sauvegardes "auto-sauvegarde:$V"
# RustFS bucket: immutable objects (evidentiary archives), hot copy of the data directory.
H=$(date -u +%Y-%m-%dT%H-%M-%SZ)
tar --zstd -cf "$D/s3-$H.tar.zst.part" -C /srv/auto s3 && mv "$D/s3-$H.tar.zst.part" "$D/s3-$H.tar.zst"
chmod 0600 "$D/s3-$H.tar.zst"
ls -1 "$D"/s3-*.tar.zst | sort | head -n -$GARDER | xargs -r rm -f
echo "auto backup: $(ls -1 "$D"/auto-*.dump.chiffre | wc -l) dump(s), $(ls -1 "$D"/s3-*.tar.zst | wc -l) S3 archive(s)"
