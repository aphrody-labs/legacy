#!/bin/bash
# Read-only scan for the restore inventory. Run as: timeout 300 ssh <host> bash -s < scripts/restore-vps-scan.sh
# Emits TSV: kind<TAB>path<TAB>fields...
export GIT_OPTIONAL_LOCKS=0
roots="/srv /home /opt /root /var/lib /data /mnt"
prune='-name node_modules -o -name target -o -name .cargo -o -name .rustup -o -name .cache -o -name .npm -o -name .bun -o -name proc -o -name .local -o -name site-packages -o -name vendor -o -name registry'
echo "host	$(hostname)	$(date -u +%FT%TZ)"
# 1. git repos (working trees and bare)
{
  for r in $roots; do [ -d "$r" ] && find "$r" -xdev -maxdepth 7 \( $prune \) -prune -o \( -name .git -print \) 2>/dev/null; done
  for r in $roots; do [ -d "$r" ] && find "$r" -xdev -maxdepth 7 \( $prune \) -prune -o -type d -name '*.git' -print 2>/dev/null; done
} | sort -u | while read -r g; do
  if [ "$(basename "$g")" = ".git" ]; then d=$(dirname "$g"); gd="$g"; else d="$g"; gd="$g"; fi
  [ -d "$gd" ] || continue
  rem=$(git --git-dir="$gd" remote -v 2>/dev/null | awk '{gsub(/https:\/\/[^@\/]*@/,"https://",$2); print $1"="$2}' | sort -u | tr '\n' ',')
  last=$(git --git-dir="$gd" log -1 --format=%cI 2>/dev/null)
  head=$(git --git-dir="$gd" rev-parse HEAD 2>/dev/null)
  unp=$(git --git-dir="$gd" log --branches --not --remotes --oneline 2>/dev/null | wc -l)
  nb=$(git --git-dir="$gd" branch -a 2>/dev/null | wc -l)
  dirty=""
  [ "$(basename "$g")" = ".git" ] && dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
  echo "git	$d	remotes=$rem	last=$last	head=$head	unpushed=$unp	branches=$nb	dirty=$dirty"
done
# 2. source trees without .git (package.json, Cargo.toml, pyproject.toml, go.mod) not inside a repo
for r in $roots; do [ -d "$r" ] && find "$r" -xdev -maxdepth 6 \( $prune \) -prune -o \( -name package.json -o -name Cargo.toml -o -name pyproject.toml -o -name go.mod \) -print 2>/dev/null; done | while read -r f; do
  d=$(dirname "$f")
  git -C "$d" rev-parse --git-dir >/dev/null 2>&1 && continue
  echo "tree	$d	manifest=$(basename "$f")	mtime=$(stat -c %y "$f" | cut -c1-19)"
done | sort -u
