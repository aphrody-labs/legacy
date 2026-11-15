#!/bin/bash
# Git packfile/transport tuning on COPIES of /srv/bench/repo (full-history clone of aphrody-labs/aphrody), never /srv/src.
B=/srv/bench; R=$B/repo; W=$B/gcopies; rm -rf $W; mkdir -p $W
git --version; echo "load: $(cut -d' ' -f1-3 /proc/loadavg) cores: $(nproc)"
git -C $R count-objects -v | grep -E 'in-pack|size-pack|packs'
t() { /usr/bin/time -f "%e s wall, %U+%S s cpu, %M KB rss" "$@" 2>&1 | tail -1; }
sz() { git -C "$1" count-objects -vH | awk '/size-pack/{print $2,$3}'; }
mk() { cp -a $R $W/$1; git -C $W/$1 config gc.auto 0; }
echo "== baseline (as cloned from GitHub)"; sz $R
echo "== A: gc --aggressive (window=250 depth=50)"; mk a; t git -C $W/a gc --aggressive --prune=now -q; sz $W/a
echo "== B: repack -adf window=10 depth=50"; mk b; t git -C $W/b repack -adfq --window=10 --depth=50; sz $W/b
echo "== C: repack -adf window=50 depth=50 -T12"; mk c; t git -C $W/c -c pack.threads=12 repack -adfq --window=50 --depth=50; sz $W/c
echo "== D: repack -adf window=250 depth=250"; mk d; t git -C $W/d -c pack.threads=12 repack -adfq --window=250 --depth=250; sz $W/d
echo "== E: repack -ad --write-bitmap-index + commit-graph (changed paths)"; mk e
t git -C $W/e repack -adq --write-bitmap-index; t git -C $W/e commit-graph write --reachable --changed-paths; sz $W/e
echo "== F: geometric repack + midx bitmap"; mk f
t git -C $W/f repack --geometric=2 -dq --write-midx --write-bitmap-index; sz $W/f
echo "== transport: clone --no-local over file:// (upload-pack work + resulting pack)"
for v in repo gcopies/a gcopies/c gcopies/e; do
  rm -rf $W/cl; echo "-- source $v"
  git -C $B/$v config uploadpack.allowFilter true
  t git clone -q --no-checkout --no-local file://$B/$v $W/cl; sz $W/cl
done
echo "== partial/shallow clone of source (file://, allowFilter)"
for o in "" "--filter=blob:none" "--filter=tree:0" "--depth=1" "--depth=1 --filter=blob:none"; do
  rm -rf $W/cl; echo "-- clone $o"
  t git clone -q --no-checkout --no-local $o file://$B/repo $W/cl; sz $W/cl
done
echo "== status/index tuning on worktree of the snapshot ($(find /tmp/snap/src -type f | wc -l) files)"
WT=$B/wt; rm -rf $WT; mkdir -p $WT; cp -a /tmp/snap/src/. $WT/
git -C $WT init -q; git -C $WT add -A; git -C $WT -c user.email=a@b -c user.name=bench commit -qm snap
hyperfine -w 2 -r 10 -N --export-json /tmp/h_default.json "git -C $WT status --porcelain" 2>&1 | grep -E 'Time|Range'
git -C $WT config feature.manyFiles true
hyperfine -w 2 -r 10 -N "git -C $WT status --porcelain" 2>&1 | grep -E 'Time|Range'
git -C $WT config core.fsmonitor true
git -C $WT status --porcelain >/dev/null 2>&1
hyperfine -w 2 -r 10 -N "git -C $WT status --porcelain" 2>&1 | grep -E 'Time|Range'
git -C $WT fsmonitor--daemon stop 2>/dev/null
rm -rf $W $WT
