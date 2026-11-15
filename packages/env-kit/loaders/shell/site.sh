#!/bin/sh
# Reads the private site config. Lookup order: $APHRODY_SITE, ~/.config/aphrody/site.toml, /etc/aphrody/site.toml
# (hosts get a copy from the fleet deploy step: infra/fleet/bin/site-push.sh, never from git).
#   . site.sh; site_get hosts.fr1.ssh      -> value of key `ssh` in table [hosts.fr1]
#   site_get accounts.cloudflare_account_ids.0   -> first element of an array
#   site_ssh fr1                           -> ssh alias of a role
#   site_render <file>                     -> file with every @@a.b.c@@ token replaced, on stdout
#   site_install <mode> <src> <dst>        -> `install` of the rendered file
# Flat string values and string arrays only.
if [ -z "${APHRODY_SITE:-}" ]; then
  APHRODY_SITE="${HOME:-${USERPROFILE:-}}/.config/aphrody/site.toml"
  [ -f "$APHRODY_SITE" ] || APHRODY_SITE=/etc/aphrody/site.toml
fi

site_get() {
  [ -f "$APHRODY_SITE" ] || { echo "site: $APHRODY_SITE missing (copy packages/env-kit/site.example.toml)" >&2; return 1; }
  awk -v want="$1" '
    function emit(v) { gsub(/^[ \t]*\[?"|"\]?[ \t]*$/, "", v); print v; found = 1 }
    /^[ \t]*\[/ { t = $0; gsub(/[ \t\[\]]/, "", t); next }
    /^[ \t]*[A-Za-z0-9_]+[ \t]*=/ {
      k = $0; sub(/[ \t]*=.*/, "", k); gsub(/[ \t]/, "", k)
      full = (t == "" ? k : t "." k)
      v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]*(#.*)?$/, "", v)
      if (full == want) { emit(v); exit }
      if (v ~ /^\[/ && index(want, full ".") == 1) {
        i = substr(want, length(full) + 2) + 0
        body = v; gsub(/^\[|\]$/, "", body); n = split(body, a, /"[ \t]*,[ \t]*"/)
        if (i < n || n == 1) { e = a[i + 1]; emit(e); exit }
      }
    }
    END { exit found ? 0 : 1 }
  ' "$APHRODY_SITE"
}

site_ssh() { site_get "hosts.$1.ssh"; }

site_render() {
  _sr_sed=
  for _sr_k in $(grep -o '@@[A-Za-z0-9_.]*@@' "$1" | sort -u | tr -d '@'); do
    _sr_v=$(site_get "$_sr_k") || { echo "site: no value for $_sr_k" >&2; return 1; }
    _sr_sed="$_sr_sed -e s|@@$_sr_k@@|$_sr_v|g"
  done
  if [ -n "$_sr_sed" ]; then sed $_sr_sed "$1"; else cat "$1"; fi
}

site_install() {
  _si_mode=$1; _si_src=$2; _si_dst=$3
  _si_tmp=$(mktemp) && site_render "$_si_src" > "$_si_tmp" && install -m "$_si_mode" "$_si_tmp" "$_si_dst"; _si_rc=$?
  rm -f "$_si_tmp"; return $_si_rc
}
