#!/bin/bash
# ext4 root vs the XFS build volume on one host (docs/infra/SINGLE-SERVER.md stage 1 proof) + syscall counts that bound a network FS.
#   scripts/bench/fs-fr2.sh [srctree]     run on the host (fr2): needs hyperfine, strace, git; uses /var/tmp/fsb-ext4 and /srv/xbuild/clones/fsb
#   srctree = plain working tree (its .git is skipped: fr2 /srv/src is a partial clone whose promisor fetch is disabled)
set -eu
src=${1:-/srv/gbfull}; E=/var/tmp/fsb-ext4; X=/srv/xbuild/clones/fsb
trap 'rm -rf "$E" "$X"' EXIT
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)  $(findmnt -no FSTYPE,SOURCE "$X/.." | head -1)"
for d in "$E" "$X"; do
  rm -rf "$d"; mkdir -p "$d"
  mkdir -p "$d/r"; tar -C "$src" --exclude=.git -cf - . | tar -C "$d/r" -xf -
  git -C "$d/r" init -q; git -C "$d/r" add -A; git -C "$d/r" -c user.name=b -c user.email=b@b commit -qm base
  git -C "$d/r" ls-files | awk "NR%8==0" | while read -r f; do if [ -f "$d/r/$f" ] && [ ! -L "$d/r/$f" ]; then echo x >> "$d/r/$f"; fi; done
  git -C "$d/r" -c user.name=b -c user.email=b@b commit -qam change
done
echo "files: $(git -C "$E/r" ls-files | wc -l)  size: $(du -sh --apparent-size "$E/r" | cut -f1)"
for d in "$E" "$X"; do
  echo "== $d"
  hyperfine -N -w 2 -r 10 --export-json "$d/status.json" "git -C $d/r status --porcelain" 2>&1 | rg "Time|Range"
  hyperfine -w 1 -r 6 "git -C $d/r checkout -q HEAD~1 && git -C $d/r checkout -q -" 2>&1 | rg "Time|Range"
  hyperfine -r 6 -p "rm -rf $d/c" "cp -a $d/r $d/c" 2>&1 | rg "Time|Range"
done
echo "== reflink clone on XFS"
hyperfine -r 6 -p "rm -rf $X/c" "cp -a --reflink=always $X/r $X/c" 2>&1 | rg "Time|Range"
echo "== syscalls of one warm git status (bound for a network FS: every metadata call is >= one RTT without client cache)"
strace -f -c -o /tmp/fsb-strace.txt git -C "$X/r" status --porcelain >/dev/null
awk 'NR>2 && $NF!="total"{c[$NF]=$4} /total/{t=$4} END{print "total syscalls", t}' /tmp/fsb-strace.txt
rg -w "newfstatat|statx|stat|lstat|openat|getdents64|access" /tmp/fsb-strace.txt | awk '{print $NF, $4}' | tr '\n' ' '; echo
