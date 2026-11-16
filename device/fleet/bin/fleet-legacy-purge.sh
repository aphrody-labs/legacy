#!/bin/bash
# Purge rescued bare repositories whose every ref is already on a remote (docs/infra/SINGLE-SERVER.md). Run on the host that holds the rescue copy.
#   fleet-legacy-purge.sh <dir-of-bare-repos> [apply]
# For each <repo>.git: take its remote URL (origin), fetch the remote heads and tags into refs/rc/*, then every local head and tag must be
# reachable from them (`git rev-list -n1 <ref> --not --glob=refs/rc/*` empty). Covered = deleted (apply only). A repository with no remote,
# an unreachable remote or any unique ref is kept and listed with its size and unique refs. Output: tab separated report on stdout.
set -u
d=$1; apply=${2:-}
printf 'repo\tsize\tstatus\tdetail\n'
for r in "$d"/*.git; do
  [ -d "$r" ] || continue; n=$(basename "$r"); sz=$(du -sh "$r" 2>/dev/null | cut -f1)
  g() { git -c safe.directory='*' -C "$r" "$@"; }
  url=$(g remote get-url origin 2>/dev/null)
  [ -n "$url" ] || { printf '%s\t%s\tKEEP\tno remote\n' "$n" "$sz"; continue; }
  g for-each-ref --format='%(refname)' refs/rc | xargs -r -n1 g update-ref -d 2>/dev/null
  if ! timeout 300 git -c safe.directory='*' -C "$r" fetch -q --no-tags "$url" '+refs/heads/*:refs/rc/heads/*' '+refs/tags/*:refs/rc/tags/*' 2>/dev/null; then
    printf '%s\t%s\tKEEP\tremote unreachable (%s)\n' "$n" "$sz" "${url//\/\/*@/\/\/***@}"; continue; fi
  uniq=$(g for-each-ref --format='%(refname)' refs/heads refs/tags | while read -r ref; do [ -n "$(g rev-list -n1 "$ref" --not --glob='refs/rc/*' 2>/dev/null)" ] && echo "${ref#refs/}"; done | tr '\n' ' ')
  if [ -z "$uniq" ]; then
    if [ "$apply" = apply ]; then rm -rf "$r"; printf '%s\t%s\tDELETED\tall refs on %s\n' "$n" "$sz" "${url//\/\/*@/\/\/***@}"; else printf '%s\t%s\tCOVERED\tall refs on %s\n' "$n" "$sz" "${url//\/\/*@/\/\/***@}"; fi
  else g for-each-ref --format='%(refname)' refs/rc | xargs -r -n1 g update-ref -d 2>/dev/null; printf '%s\t%s\tKEEP\tunique refs: %s\n' "$n" "$sz" "$uniq"; fi
done
