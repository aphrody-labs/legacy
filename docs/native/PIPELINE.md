# Index pipeline

One stage graph per file or artifact, one SQLite file for the whole monorepo, one Valkey for the fleet.
Code: `src/core/src/pipeline` (engine, store, Valkey client), `src/re/src/index.rs` (binary stages), `src/ay/src/index.rs` (`ay index`).

```text
walk (parallel, gitignore-aware)
  -> stat skip (path, size, mtime already in fstat: no read)
  -> read + BLAKE3
  -> same hash as before? refresh fstat only
  -> detect: extension, magic bytes, Magika (only for what they cannot place)
  -> stages, content-addressed by (stage, version, BLAKE3):
       source  tree-sitter   symbols, calls, imports          local
       text    documents     text_fts                         local
       binary  triage        headers, entropy, imports/exports   local
       binary  ghidra        P-Code CFG, Pseudo-C, call edges    heavy: Valkey queue, fr1/fr2 workers
       ir      llvm          functions, blocks, SIMD            local (.ll), heavy (.bc)
  -> one writer thread, one SQLite transaction per chunk
```

A stage is `trait Stage { name, version, accepts, heavy, run(file, bytes) -> Facts }`. `Facts` is the single output
type (AST summary, binary header facts, functions, edges, IR facts, text); `Store::apply` is the single writer.
There is no framework: the engine is a loop over `Vec<Arc<dyn Stage>>`.

## SQLite schema (`var/index/core.db`, WAL, FTS5)

The five historical tables keep their exact columns (`files`, `symbols`, `refs`, `imports`, `meta`), so
`packages/core`, `packages/ai-os` and the relay tools read the same file as before. Added:

| table / view   | content                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `fstat`        | path, size, mtime_ns, BLAKE3, kind, label (Magika/extension), mime, score: the skip index |
| `bin`          | format, arch, entry, sections, imports, exports, max entropy, libraries                   |
| `funcs`        | native (Ghidra lift) and IR functions: address, size, instructions, blocks, Pseudo-C      |
| `xrefs`        | binary edges: `call`, `import`, `needs`, `export`                                         |
| `ir`           | LLVM module facts                                                                         |
| `pending`      | deep results owed by a worker (path, stage, version, hash)                                |
| `sym_fts`      | FTS5 trigram over symbol names and paths (external content: `symbols`)                    |
| `text_fts`     | FTS5 over documents                                                                       |
| `edges` (view) | `refs` + `imports` + `xrefs` as one edge list                                             |

Recursive over the whole monorepo; `third_party` is opt-in (`--all`, which also ignores `.gitignore`).

## Fleet

Valkey 9.1 on fr2 (`valkey-server.service`, bound to `10.200.77.3` and loopback, password, AOF `everysec`,
`maxmemory 3gb` `volatile-lru`, ordered after `wg-quick@wg1`). Client: a 250-line RESP2 client in
`pipeline/resp.rs` (pipelining, no runtime, no dependency). The URL is `AY_VALKEY_URL` or `~/.config/ay/valkey.url`
(mode 600, never printed); with neither, every shared feature is off and the pipeline is purely local.

| key                               | use                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ay:1:res:<stage>:<ver>:<blake3>` | stage result (JSON, zstd above 256 bytes), TTL 30 days                                          |
| `ay:1:jobs:heavy`                 | stream + consumer group `workers`: heavy stages; `XAUTOCLAIM` after 120 s recovers dead workers |
| `ay:1:job:<stage>:<ver>:<blake3>` | enqueue de-duplication (10 minutes)                                                             |
| `ay:1:blob:<blake3>`              | file bytes (`--blobs`, up to 32 MiB, 1 h) for a worker that lacks the file                      |
| `ay:1:evt`                        | pub/sub: `res` events; `ay index watch` pulls finished deep results into SQLite                 |

SQLite is the local source of truth: a result is written locally first; Valkey only avoids recomputation.
`pending` rows are completed by `ay index sync` (also run after every timer pass and on every `res` event).

| host | permanent services (all `enabled`, survive reboot)                                           |
| ---- | -------------------------------------------------------------------------------------------- |
| fr2  | `valkey-server`, `ay-index-worker`, `ay-index.timer` (5 min), `ay-index-bench.timer` (daily) |
| fr1  | `ay-index-worker` (heavy stages: Ghidra, LLVM), `ay-index.timer` (5 min)                     |
| PC   | scheduled task `AyIndexWatch` (every minute, no-op while running): `ay index watch C:\src`   |

Install: `infra/pipeline/valkey-install.sh` (fr2), `infra/pipeline/install.sh fr1|fr2`, `bun infra/pipeline/pc-install.ts`.

## Commands

```text
ay index [root] [--all] [--include a,b] [--db path] [--deep off|queue|inline] [--sniff] [--force] [--no-shared]
ay index watch [root]          notify watcher, 150 ms batching, index_paths(changed), pulls deep results
ay index worker [--role heavy] run queued heavy stages; reconnects when Valkey restarts
ay index sync | status | query <name> [--exact] | text <words> | bench [--binary file]
bun packages/core/src/cli.ts index [root]     same engine through the C ABI (core_pipeline_run_json)
```

C ABI (`src/core/capi/include/aphrody_core.h`): `core_pipeline_run_json`, `core_pipeline_query_json` (tree-sitter and
document stages; the binary stages need `aphrody-re`, which is L3 and runs in `ay`). Relay tools: `core_pipeline`,
`core_symbols`.

## Bottlenecks removed

1. `Parser::new` + `set_language` per file: one parser per language and thread (`extractor.rs`).
2. `Query::new(tags.scm)` compiled per file for every registry grammar: compiled once per grammar and thread (`grammars.rs`).
3. Single-threaded directory walk: `ignore` parallel walker.
4. Everything re-parsed on every run: `fstat` skip, BLAKE3 content addressing, `index_paths` for watchers.
5. Rust -> JSON string per file -> `JSCallback` -> `JSON.parse` -> `bun:sqlite` row by row: the engine writes SQLite in
   process (prepared statements, one transaction per chunk, writer thread overlapping the parse).
6. `LIKE '%q%'` full scan for symbol search: trigram FTS5.
7. A `bun` subprocess behind `ay index`: `ay index` is Rust, in process.

## Measurements

fr2 (6 cores, idle), 2026-11-15, hyperfine; tree = `git archive HEAD src` (2,554 files, 69,944 symbols, 347,696 calls, 1.14 M lines).
Before = `bun packages/core/src/cli.ts index` over the previous C ABI (Rust walk and parse, one JSON string per file,
`JSCallback`, `bun:sqlite`); after = `ay index`. Reproduce: `bash infra/pipeline/bench.sh <ay> <old-capi.so> <checkout> [binary]`.
The counts of symbols, calls and imports are identical before and after.

| case                                | before                            | after                         | gain |
| ----------------------------------- | --------------------------------- | ----------------------------- | ---- |
| full index of `src/`, cold database | 6742 ± 508 ms                     | 3498 ± 122 ms                 | 1.9x |
| unchanged tree                      | 8191 ± 494 ms                     | 29.9 ± 2.6 ms                 | 274x |
| one file changed                    | 8321 ± 677 ms (no incremental)    | 54.7 ± 9.9 ms                 | 152x |
| symbol lookup, whole process        | 196 ± 43 ms (`bun cli.ts search`) | 34 ± 11 ms (`ay index query`) | 5.7x |

Inside one process (2,000 random symbol names, 69,944 symbols):

| query                            | p50     | p99     |
| -------------------------------- | ------- | ------- |
| exact name (b-tree)              | 47 us   | 542 us  |
| substring, trigram FTS5          | 1.85 ms | 7.7 ms  |
| substring, old `LIKE '%q%'` scan | 17.0 ms | 26.5 ms |
| Valkey `GET` 1 KB (fr2 loopback) | 115 us  | 360 us  |

`MGET` of 256 keys: 2.3 ms on fr2. Round trips cost the network: 10.6 ms from fr1 over WireGuard, 76 ms from the PC, which
is why the engine does one pipelined `MGET` per chunk of 1,024 files and one pipelined `SET` batch, never a call per file.

Shared cache: a cold index that computes 2,552 results and writes them costs 4,025 ms; the same cold index on a fresh
database served by those results (`--cache-cheap`, 2,553 hits, 0 misses) costs 2,233 ms against 3,498 ms computed without the
cache. Cheap stages are only read from the cache with `--cache-cheap`; heavy stages always are.

Whole monorepo, as the fr2 timer runs it (`ay index /srv/src`): 25,479 files, 1,247,224 symbols, 2,236,010 calls,
8.4 M lines in 32.3 s cold, 1.8 GB peak. The 3 binaries went to `ay:1:jobs:heavy`, the fr2 worker lifted them
(22 functions, call and import edges) and `ay index sync` applied the results in under a second: the queue round trip works.

Not a gain, stated plainly: binary triage costs 8.3 ms p50 (19 ms p99) for a 1.35 MB binary inside the process and 8.4 ms
for `ay re --json` as a process, so the work itself (SHA-256, entropy) dominates, not the spawn. Remaining items:
`ay index query` still opens the database read-write (schema check and a `meta` write, most of its 34 ms); the Magika
detector is behind `ay --features magika` and not in the shipped build; the trigram index costs about 1.5 s for 70 k
symbols and is built on the first substring search, not on every cold index.
