#!/usr/bin/env bash
# PGO training run for `ay`: runs an instrumented binary (built with -Cprofile-generate=<rawdir>) over a realistic
# workload and merges the raw profiles with the llvm-profdata of the same LLVM as rustc (Chromium's clang package).
#   llvm-pgo-train.sh <instrumented-ay> <rawdir> <training-corpus> <merged.profdata>
# The workload is the one `ay` runs every day: tree-sitter code graph, LLM digest outline, wyhash, the architecture
# gate and the index pipeline of a source tree. The corpus given here must not be the one the benchmark times
# (scripts/bench/llvm-bench.sh), or the gain would be fitted to the benchmark.
set -eu
ay=$1 raw=$2 corpus=$3 merged=$4
rm -rf "$raw"
mkdir -p "$raw"
export LLVM_PROFILE_FILE="$raw/ay-%m-%p.profraw"
work=$(mktemp -d)
cd "$work"
"$ay" --version > /dev/null
for round in 1 2 3; do
	"$ay" graph build "$corpus" > /dev/null
	"$ay" ingest --outline -o /dev/null "$corpus"
	"$ay" ingest -f xml -m 20000 -o /dev/null "$corpus"
done
big=$(find "$corpus" -type f -printf '%s %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
for i in 1 2 3 4 5; do "$ay" hash "$big" > /dev/null; done
"$ay" index "$corpus" > /dev/null 2>&1 || true
"$ay" arch rules > /dev/null 2>&1 || true
cd - > /dev/null
rm -rf "$work"
llvm-profdata merge -sparse "$raw"/*.profraw -o "$merged"
ls -l "$merged"
