#!/bin/bash
# GNU testsuite of one first-party port, GNU binary against the aphrody-gnu binary. Runs on fr2 (`just gnu-check <id>`).
# Usage: gnu-proof.sh <time|ed|m4|bc|which> <gnu version> <sha256 of the GSRC distfile>
# Needs the aphrody binary in $R (shipped from fr1 by scripts/gnu-check.ts). Writes $L/proof-<id>.txt (key=value).
# Phase 1 (network): tarball by sha256, configure, make. Phase 2 (sandbox, docs/native/gnu/OS.md rule 9): the tests.
B=/srv/build/gnu-rust; S=$B/gnu-src; R=$B/target/ws/release; L=$B/log; mkdir -p $S $L $B/gnu-bin $B/home $B/tmp
# GNU C built like the CachyOS recipes (docs/research/cachyos.md): -O3 -march=x86-64-v3, so the benchmark compares like with like
export CC=gcc CFLAGS="-O3 -march=x86-64-v3 -pipe -fno-plt -std=gnu17 -Wno-error" MAKEFLAGS=-j6 TERM=dumb LC_ALL=C
id=$1; ver=$2; sha=$3; out=$L/proof-$id.txt; : > $out
kv() { echo "$1=$2" >> $out; }

# No network, read-only root, fresh /tmp, memory and task limits, empty environment (no credentials).
sbx() {
  if command -v bwrap >/dev/null && sudo -n true 2>/dev/null; then
    sudo systemd-run --quiet --scope --uid="$(id -un)" -p MemoryMax=10G -p TasksMax=4096 \
      bwrap --unshare-net --unshare-pid --die-with-parent --ro-bind / / --bind $B $B --dev /dev --proc /proc --tmpfs /tmp \
      --clearenv --setenv PATH "$PATH" --setenv HOME $B/home --setenv LC_ALL C --setenv TERM dumb "$@"
  else
    "$@"
  fi
}
command -v bwrap >/dev/null && sudo -n true 2>/dev/null && kv sandbox "bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096)" || kv sandbox "none (bwrap or sudo missing)"

# GNU tarball (checked against the GSRC sha256), configured and built once.
if [ ! -x $S/$id/.built ]; then
  rm -rf $S/$id; mkdir -p $S/$id; ok=
  for ext in tar.gz tar.xz tar.lz; do
    # ftp.gnu.org answers slowly or not at all from the fleet: the kernel.org mirror first, short timeouts
    wget -q -T 30 -t 1 "https://mirrors.kernel.org/gnu/$id/$id-$ver.$ext" -O $S/$id.tar 2>/dev/null \
      || wget -q -T 30 -t 1 "https://ftp.gnu.org/gnu/$id/$id-$ver.$ext" -O $S/$id.tar 2>/dev/null || continue
    [ "$(sha256sum $S/$id.tar | cut -d' ' -f1)" = "$sha" ] || { echo "sha256 mismatch for $id-$ver.$ext" >&2; continue; }
    tar -xf $S/$id.tar -C $S/$id --strip-components=1 2>/dev/null || tar --lzip -xf $S/$id.tar -C $S/$id --strip-components=1 && ok=1 && break
  done
  [ -n "$ok" ] || { kv error "cannot fetch $id-$ver"; exit 1; }
  case $id in
    bc) (cd $S/$id && ./configure -q >$L/cfg-$id.log 2>&1; for d in lib bc dc; do make -C $d >$L/make-$id-$d.log 2>&1; done) ;;
    ed) (cd $S/$id && ./configure >$L/cfg-$id.log 2>&1 && make >$L/make-$id.log 2>&1) ;;
    *)  (cd $S/$id && ./configure -q >$L/cfg-$id.log 2>&1 && make -s >$L/make-$id.log 2>&1) ;;
  esac
  case $id in bc) art=bc/bc ;; time|m4) art=src/$id ;; *) art=$id ;; esac
  [ -x $S/$id/$art ] || { kv error "build of $id-$ver left no $art"; exit 1; }
  touch $S/$id/.built; chmod +x $S/$id/.built
fi

kv id $id; kv gnu_version $ver; kv sha256 $sha; kv host "$(hostname)"; kv date "$(date -u +%FT%TZ)"
kv ours_bytes "$(stat -c %s $R/$id)"; kv ours_sha256 "$(sha256sum $R/$id | cut -c1-16)"

am_totals() { # automake test-suite.log
  local n=
  for k in TOTAL PASS SKIP XFAIL FAIL XPASS ERROR; do n="$n $(echo $k | tr A-Z a-z)=$(rg -N "^# $k:" $1 | rg -o '[0-9]+' | head -1)"; done
  echo $n
}
# hyperfine, GNU against ours (outside the sandbox: timing only): kv bench "<label>: gnu <ms> ms, ours <ms> ms"
bench() { # label gnu-cmd ours-cmd
  [ -x $B/hyperfine ] || return 0
  $B/hyperfine --warmup 3 --runs 15 --shell=none --export-json $B/tmp/h-$id.json -n gnu "$2" -n ours "$3" >/dev/null 2>&1 || return 0
  set -- "$1" $(rg -o '"mean": *[0-9.eE+-]+' $B/tmp/h-$id.json | rg -o '[0-9.eE+-]+$')
  kv bench "$1: gnu $(awk -v x=$2 'BEGIN{printf "%.2f", x*1000}') ms, ours $(awk -v x=$3 'BEGIN{printf "%.2f", x*1000}') ms"
}
# differential: same stdout and exit code on the same stdin and arguments
diffcase() { # gnu ours stdin-file args...
  local g=$1 o=$2 in=$3; shift 3
  local go gr oo or
  go=$(sbx timeout 60 "$g" "$@" < $in 2>/dev/null); gr=$?
  oo=$(sbx timeout 60 "$o" "$@" < $in 2>/dev/null); or=$?
  [ "$go" = "$oo" ] && [ $gr = $or ]
}

case $id in
time)
  [ -x $B/gnu-bin/time ] || { rm -f $S/time/src/time; make -C $S/time >/dev/null 2>&1; cp $S/time/src/time $B/gnu-bin/time; }
  cp $B/gnu-bin/time $S/time/src/time && touch $S/time/src/time
  sbx make -C $S/time check >$L/check-time-gnu.log 2>&1
  kv gnu "$(am_totals $S/time/tests/test-suite.log)"
  kv gnu_bytes "$(stat -c %s $B/gnu-bin/time)"
  cp $R/time $S/time/src/time && touch $S/time/src/time
  sbx make -C $S/time check >$L/check-time-ours.log 2>&1
  kv ours "$(am_totals $S/time/tests/test-suite.log)"
  kv ours_failed "$(rg -N '^FAIL: ' $L/check-time-ours.log | tr '\n' ' ')"
  cp $B/gnu-bin/time $S/time/src/time
  bench "time true" "$B/gnu-bin/time true" "$R/time true"
  ;;
ed)
  kv gnu_bytes "$(stat -c %s $S/ed/ed)"
  nscripts=$(rg --files $S/ed/testsuite | rg -c '\.(ed|err)$')
  for w in gnu ours; do
    d=$B/ed-obj-$w; rm -rf $d; mkdir -p $d
    if [ $w = gnu ]; then cp $S/ed/ed $d/ed; else cp $R/ed $d/ed; fi
    (cd $d && sbx timeout 300 sh $S/ed/testsuite/check.sh $S/ed/testsuite $w > $L/check-ed-$w.log 2>&1; echo $? > rc)
    kv ${w}_rc "$(cat $d/rc)"
    kv ${w}_scripts_failed "$(rg -N '^\*\*\* ' $L/check-ed-$w.log | rg -o '[A-Za-z0-9_]+\.(ed|err)' | sort -u | wc -l) of $nscripts"
    kv ${w}_failed_lines "$(rg -N -o '^( [0-9]+(\([a-z0-9._]*\))?)+$' $L/check-ed-$w.log | tr '\n' ' ')"
    kv ${w}_tail "$(rg -N '' $L/check-ed-$w.log | tail -1 | cut -c1-120)"
  done
  yes "the quick brown fox aaa bbb ccc 0123456789" | head -n 20000 > $B/tmp/ed-small.txt; printf '%s\n' ',s/aaa/zzz/g' 'w' 'q' > $B/tmp/ed.in
  bench "ed: global substitute on 20000 lines" "bash -c 'cp $B/tmp/ed-small.txt $B/tmp/e1.txt; $S/ed/ed -s $B/tmp/e1.txt < $B/tmp/ed.in'" "bash -c 'cp $B/tmp/ed-small.txt $B/tmp/e2.txt; $R/ed -s $B/tmp/e2.txt < $B/tmp/ed.in'"
  ;;
m4)
  kv gnu_bytes "$(stat -c %s $S/m4/src/m4)"
  for w in gnu ours; do
    # the checks compare stderr, which carries the program name: run both as `m4` from a directory of their own
    mkdir -p $B/m4-bin-$w; if [ $w = gnu ]; then cp $S/m4/src/m4 $B/m4-bin-$w/m4; else cp $R/m4 $B/m4-bin-$w/m4; fi
    (cd $S/m4/checks && f=$(ls [0-9]*.*) && PATH=$B/m4-bin-$w:$PATH sbx timeout 1200 sh ./check-them -I ../examples -m m4 $f > $L/check-m4-$w.log 2>&1; echo $? > $B/m4-$w.rc)
    kv ${w}_rc "$(cat $B/m4-$w.rc)"
    kv ${w}_failed_checks "$(rg -N -A1 '^Failed checks were:' $L/check-m4-$w.log | tail -n +2 | tr ' ' '\n' | cut -d: -f1 | sort -u | rg -c '[0-9]')"
    kv ${w}_skipped_checks "$(rg -N -A1 '^Skipped checks were:' $L/check-m4-$w.log | tail -n +2 | tr ' ' '\n' | rg -c '[0-9]')"
    kv ${w}_total_checks "$(ls $S/m4/checks/[0-9]*.* | wc -l)"
  done
  cat > $B/tmp/m4.in <<'EOM'
define(`f',`ifelse($1,0,0,`f(decr($1))')')f(3000)
define(`g',`ifelse($1,0,0,`eval($1+g(decr($1)))')')g(300)
EOM
  bench "m4: 3000-deep recursion and eval" "bash -c '$S/m4/src/m4 < $B/tmp/m4.in'" "bash -c '$R/m4 < $B/tmp/m4.in'"
  ;;
bc)
  kv gnu_bytes "$(stat -c %s $S/bc/bc/bc)"
  p=0; t=0; fails=
  for f in $S/bc/Test/*.b; do
    t=$((t+1)); if diffcase $S/bc/bc/bc $R/bc $f -l; then p=$((p+1)); else fails="$fails $(basename $f)"; fi
  done
  kv differential "pass=$p total=$t"; kv differential_failed "$fails"
  echo 'scale=300; 4*a(1)' > $B/tmp/bc.in
  bench "bc -l: pi at scale 300" "bash -c '$S/bc/bc/bc -l < $B/tmp/bc.in'" "bash -c '$R/bc -l < $B/tmp/bc.in'"
  ;;
which)
  T=$(mktemp -d -p $B/tmp); mkdir -p $T/d1 $T/d2 $T/.dot $T/d1/baz; printf '#!/bin/sh\n' > $T/d1/foo; cp $T/d1/foo $T/d2/foo; cp $T/d1/foo $T/d1/bar; cp $T/d1/foo $T/.dot/dotcmd
  chmod 755 $T/d1/foo $T/d2/foo $T/.dot/dotcmd; chmod 644 $T/d1/bar
  G=$S/which/which; O=$R/which; p=0; t=0; fails=; kv gnu_bytes "$(stat -c %s $G)"
  run() { # PATH args...
    local P=$1; shift; t=$((t+1))
    local go gr oo or
    go=$(cd $T && sbx env PATH=$P HOME=$T/d1 timeout 20 $G "$@" 2>/dev/null < /dev/null); gr=$?
    oo=$(cd $T && sbx env PATH=$P HOME=$T/d1 timeout 20 $O "$@" 2>/dev/null < /dev/null); or=$?
    if [ "$go" = "$oo" ] && [ $gr = $or ]; then p=$((p+1)); else fails="$fails [$*]"; fi
  }
  P1="$T/d1:$T/d2:/usr/bin:/bin"; P2=".dot:d1:/usr/bin"
  run $P1 foo; run $P1 -a foo; run $P1 bar; run $P1 baz; run $P1 nosuch; run $P1 foo nosuch foo; run $P1 sh; run $P1 -a sh
  run $P1 $T/d1/foo; run $P1 d1/foo; run $P1 /nonexistent/x; run $P1 --all foo; run $P1 -- foo
  run $P2 dotcmd; run $P2 --skip-dot dotcmd; run $P2 --show-dot dotcmd; run $P2 -a foo; run $P2 --skip-dot foo
  run "$T/d1:~/d2" -a foo; run "~/d2:$T/d1" --skip-tilde foo; run "$T/d1:$T/d2" --show-tilde foo; run "$T/d1" --show-tilde -a foo
  run "$P1:" foo; run ":$P1" foo; run "" foo; run $P1 --tty-only foo; run $P1 -i foo; run $P1 --skip-alias foo
  run $P1; run $P1 --bogus; run $P1 -x
  kv differential "pass=$p total=$t"; kv differential_failed "$fails"
  bench "which sh" "$G sh" "$O sh"
  ;;
esac
echo done >> $out
