---
name: tree-sitter
description: tree-sitter in src. Multi-language parsing, symbol/call/import extraction and S-expression queries via src/core (aphrody-core); C ABI core_parse_json/core_query_json; TS @aphrody/core parse()/query(). Use before writing or modifying tree-sitter code.
---

# tree-sitter in src

- Rust: `src/core` (`extractor.rs`, `grammars.rs`, `index.rs`, `languages.rs`, `query.rs`, `registry_build.rs`; tests in `src/core/tests/registry.rs`).
- C ABI: `src/core/capi/src/lib.rs` (`core_parse_json`, `core_query_json`). Bun side: `packages/core/src/ffi.ts`, test `packages/core/test/ffi.test.ts`.
- Other users: `src/depot/migrate` (transformer), `src/ffi/src/depot.rs`, `apps/rosegriffon/crates/aphrody-nie-lua/src/static_analysis.rs`. List them with `bun packages/core/src/cli.ts users tree_sitter`.
- Grammars: clones `third_party/tree-sitter` and `third_party/tree-sitter-<lang>` (pinned in `src.lock.json`).
- Facts layer (one engine, every tool): `src/core/src/facts.rs` runs the `.scm` queries of `src/core/queries/facts/` (capture vocabulary: `@comment @string @import.source @import.name @call`; Markdown: `@frontmatter @heading @paragraph @code @html @table @item`) over every grammar in parallel (rayon, one parser and query per grammar and worker); a grammar without a file gets a query derived from its node kinds. CLI: `aphrody-code query|outline|grammars` (`cargo build -p aphrody-core --features cli`; `ay code` embeds `aphrody_core::cli::Cmd`; `aphrody-code grammars --sync` lists grammars of the `tree-sitter` and `tree-sitter-grammars` orgs missing from `third_party/ECOSYSTEM.toml`). C ABI: `core_facts_json`; Bun: `facts()` in `packages/core/src/ffi.ts`.
- Tools that read code through facts (TS rules, Rust analysis): `scripts/ay-facts.ts` is the one bridge (hygiene rules node-builtin, literal-identity, personal-data, non-english; docs index and catalog through the Markdown grammar; `checkdeps --imports`); without `ay` each tool keeps its line scanner. Proof against the former scanners: `bun scripts/hygiene-compare.ts`.
- Version: `tree-sitter` 0.27.2 and the grammar crates are the newest on crates.io (checked with the sparse index); the registry grammars come from `third_party/ECOSYSTEM.toml`.
- Reindex: `bun packages/core/src/cli.ts index <root> --all` (sqlite `var/index/core.db` + JSON); `ay index` is the same CLI. Round trip: `bun test packages/core`.
- Docs: https://tree-sitter.github.io/tree-sitter/ (queries: `using-parsers/queries/`).
