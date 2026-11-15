#!/bin/sh
# On fr1: build /srv/bench/src, a trimmed copy of the workspace (depot crates) from a tar on stdin.
# Usage: git -C C:/src archive HEAD <paths> | ssh vps 'sh /srv/bench/setup-bench-ws.sh'  (tar read from stdin)
set -e
D=/srv/bench/src
rm -rf "$D"
mkdir -p "$D"
tar -x -C "$D"
cd "$D"
# keep only the members listed in members.txt
awk -v list="$(cat /srv/bench/members.txt | tr '\n' ' ')" '
BEGIN { n = split(list, m, " ") }
/^members = \[/ { print "members = ["; for (i = 1; i <= n; i++) printf "  \"%s\",\n", m[i]; skip = 1; next }
skip && /^\]/ { skip = 0; print "]"; next }
skip { next }
{ print }' Cargo.toml > Cargo.toml.new
mv Cargo.toml.new Cargo.toml
export PATH=$HOME/.cargo/bin:$PATH
cargo metadata --format-version 1 --no-deps >/dev/null && echo METADATA_OK
