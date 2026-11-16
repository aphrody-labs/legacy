---
name: ay-index
description: The monorepo index pipeline (detect, tree-sitter, triage, Ghidra, SQLite+FTS5, Valkey). Use to index or reindex src, look up symbols without re-parsing, feed or inspect the fleet cache and queue, or change a stage. `ay index`, relay tools core_pipeline and core_symbols, docs/native/PIPELINE.md.
---

# ay index

One stage graph per file, one SQLite (`var/index/core.db`, WAL, FTS5), one Valkey on fr2. Code: `src/core/src/pipeline` (engine, store, RESP client), `src/re/src/index.rs` (triage, ghidra, Magika detector), `src/ay/src/index.rs` (CLI). Full design and measurements: `docs/native/PIPELINE.md`.

- Index: `ay index [root] [--all] [--include a,b] [--deep off|queue|inline] [--no-shared]` (unchanged files cost one `stat`; changed ones are BLAKE3-addressed). Bun path, same engine: `bun packages/core/src/cli.ts index [root]`.
- Query: `ay index query <name> [--exact]`, `ay index text <words>`, `ay index status`. Relay MCP tools (via `hub_call`): `core_pipeline` (incremental run), `core_symbols` (lookup in the same DB).
- Fleet: `ay index watch` (PC, notify), `ay index worker` (fr1, fr2: heavy stages from `ay:1:jobs:heavy`), `ay index sync`. Valkey URL: `AY_VALKEY_URL` or `~/.config/ay/valkey.url` (never print it); unset means purely local.
- Add a stage: implement `aphrody_core::pipeline::Stage` (`name`, `version`, `accepts`, `heavy`, `run -> Facts`), register it in `aphrody_re::index::engine()`. Bump `version` when the output changes: it is part of the cache key.
- Build and test on fr1 only: `cargo test -p aphrody-core --features pipeline` (live Valkey test with `AY_TEST_VALKEY`), `cargo test -p aphrody-re --features index index::`.
- Services: fr2 `valkey-server`, `ay-index-worker`, `ay-index.timer`, `ay-index-bench.timer`; fr1 `ay-index-worker`, `ay-index.timer`; PC task `AyIndexWatch`. Install: `infra/ci/pipeline/`.
