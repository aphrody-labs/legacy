#!/usr/bin/env bash
# Latency proof of the index pipeline against the previous stack. Run on fr2.
#   bash bench.sh <new-ay> <old-capi.so> <checkout> [binary]
#     new-ay     the built `ay` with `ay index`
#     old-capi   libaphrody_core_capi.so built from the commit before the pipeline (baseline C ABI)
#     checkout   a src checkout whose system/core-ts/src/cli.ts is the baseline bun indexer
#     binary     a native binary for the triage comparison (default /usr/bin/hyperfine)
# Baseline = `bun system/core-ts/src/cli.ts index` over the old C ABI (Rust walk+parse -> JSON per file -> JSCallback ->
# bun:sqlite). New = `ay index` (in process). Tree = `git archive HEAD src` extracted to $W/tree.
set -euo pipefail
AY="${1:?new ay}"; OLD="${2:?old capi}"; CK="${3:?checkout}"; BIN="${4:-/usr/bin/hyperfine}"
W="${BENCH_DIR:-/srv/bench}"; T="$W/tree"; R="$W/results"; mkdir -p "$R"
CLI="$CK/system/core-ts/src/cli.ts"
OLDIDX="env APHRODY_CORE_LIB=$OLD bun $CLI index $T --include src --db $W/b.db"
NEWIDX="$AY index $T --include src --db $W/n.db --no-shared"
HF="hyperfine --style basic --time-unit millisecond"

echo "## full index of src/ (cold database)"
$HF --runs 5 --warmup 1 --export-json "$R/full.json" \
  --prepare "rm -f $W/b.db $W/b.db-wal $W/b.db-shm" -n "bun + C ABI (before)" "$OLDIDX" \
  --prepare "rm -f $W/n.db $W/n.db-wal $W/n.db-shm" -n "ay index (after)" "$NEWIDX" 2>&1 | rg -v "^$"

echo "## unchanged tree"
$OLDIDX >/dev/null; $NEWIDX >/dev/null
$HF --runs 10 --warmup 1 --export-json "$R/noop.json" -n "bun + C ABI (before)" "$OLDIDX" -n "ay index (after)" "$NEWIDX" 2>&1 | rg -v "^$"

echo "## one file changed (append a comment to src/core/src/hash.rs)"
EDIT="echo \"// bench \$RANDOM\" >> $T/src/core/src/hash.rs"
$HF --runs 10 --warmup 1 --export-json "$R/edit.json" --prepare "$EDIT" \
  -n "bun + C ABI (before, no incremental)" "$OLDIDX" -n "ay index (after)" "$NEWIDX" 2>&1 | rg -v "^$"

echo "## symbol lookup, whole process (open + query + print)"
$HF --runs 20 --warmup 2 --export-json "$R/query.json" \
  -n "bun cli.ts search (before)" "env APHRODY_CORE_LIB=$OLD bun $CLI search TreeSitterEngine --db $W/b.db" \
  -n "ay index query (after)" "$AY index query TreeSitterEngine --db $W/n.db --limit 20" 2>&1 | rg -v "^$"

echo "## symbol lookup and cache latency inside one process (p50/p99, microseconds)"
$AY index bench --db "$W/n.db" --binary "$BIN" --pretty | tee "$R/bench.json"

echo "## binary triage, whole process"
$HF --runs 20 --warmup 2 --export-json "$R/triage.json" \
  -n "ay re --json (before: process per file)" "$AY re --json $BIN" 2>&1 | rg -v "^$"

echo "## cold index served by the shared cache (Valkey) vs computed"
$AY index "$T" --include src --db "$W/c1.db" --cache-cheap | rg -o '"(cache_hits|cache_misses|cache_writes|total_ms)":[0-9]+' | tr '\n' ' '; echo
rm -f "$W"/c2.db*
$AY index "$T" --include src --db "$W/c2.db" --cache-cheap | rg -o '"(cache_hits|cache_misses|cache_writes|total_ms)":[0-9]+' | tr '\n' ' '; echo
rm -f "$W"/c1.db* "$W"/c2.db*
