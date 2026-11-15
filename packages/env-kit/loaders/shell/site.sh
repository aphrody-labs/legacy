#!/bin/sh
# Reads the private site config (~/.config/aphrody/site.toml, override: APHRODY_SITE).
#   . site.sh; site_get hosts.fr1.ssh      -> value of key `ssh` in table [hosts.fr1]
#   site_ssh fr1                           -> ssh alias of a role
# Flat string values only; arrays are returned as written.
APHRODY_SITE="${APHRODY_SITE:-${HOME:-$USERPROFILE}/.config/aphrody/site.toml}"

site_get() {
  [ -f "$APHRODY_SITE" ] || { echo "site: $APHRODY_SITE missing (copy packages/env-kit/site.example.toml)" >&2; return 1; }
  awk -v want="$1" '
    /^[ \t]*\[/ { t = $0; gsub(/[ \t\[\]]/, "", t); next }
    /^[ \t]*[A-Za-z0-9_]+[ \t]*=/ {
      k = $0; sub(/[ \t]*=.*/, "", k); gsub(/[ \t]/, "", k)
      full = (t == "" ? k : t "." k)
      if (full == want) {
        v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]*(#.*)?$/, "", v)
        gsub(/^"|"$/, "", v); print v; found = 1; exit
      }
    }
    END { exit found ? 0 : 1 }
  ' "$APHRODY_SITE"
}

site_ssh() { site_get "hosts.$1.ssh"; }
