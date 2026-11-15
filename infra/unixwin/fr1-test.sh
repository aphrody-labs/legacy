#!/bin/sh
# Targeted Rust tests of rubash on fr1, the factory (mandatory filter), at the commit pinned in src.lock.json.
# prd (production) and fr2 (edge) never compile. The full suite runs in the fork's CI (aphrody-labs/rubash).
# aphrody-heavy: one heavy task at a time, nice 19, ionice idle, load wait; JOBS tasks (4), as many
# test threads, TMPDIR under the work folder (not /tmp on tmpfs).
# Usage : JOBS=4 sh fr1-test.sh <commit rubash> <filtre cargo test>
# Output: log in $UNIXWIN_WORK/logs/rubash-test-<commit>.log; last line "RESULT <code>".
set -u
[ $# -eq 2 ] && [ -n "$2" ] || { echo "usage: fr1-test.sh <rubash> <filter> (full suite: fork CI)" >&2; exit 2; }
RUB=$1
FILTER=$2
W=${UNIXWIN_WORK:-$HOME/unixwin}
JOBS=${JOBS:-4}
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$W/target-test" TMPDIR="$W/tmp"
mkdir -p "$W/logs" "$TMPDIR"
# The tests open many descriptors: the default limit (1024) gives EMFILE.
ulimit -n 65536 2>/dev/null || ulimit -n 4096 2>/dev/null || true
d="$W/rubash"
[ -d "$d/.git" ] || git clone -q --filter=blob:none --no-checkout https://github.com/aphrody-labs/rubash.git "$d"
git -C "$d" fetch -q --filter=blob:none origin "$RUB" 2>/dev/null || git -C "$d" fetch -q --filter=blob:none origin
git -C "$d" -c advice.detachedHead=false checkout -q --force "$RUB" || exit 1
log="$W/logs/rubash-test-$(git -C "$d" rev-parse --short=12 HEAD).log"
cd "$d" || exit 1
aphrody-heavy cargo test --locked -j "$JOBS" "$FILTER" -- --test-threads="$JOBS" >"$log" 2>&1
code=$?
grep -E '^test result:|^failures:|FAILED|panicked' "$log" | tail -40
echo "LOG $log"
echo "RESULT $code"
exit "$code"
