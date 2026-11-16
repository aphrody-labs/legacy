---
name: ay-docs-sources
description: ay docs multi-source design (system/docs), live-verified facts about Android/Chromium/ChromiumOS/Linux doc origins, and how the Windows ay.exe artifact is produced
metadata:
  type: project
---

`ay docs` (crate system/docs = aphrody-docs, CLI system/ay/src/low/docs.rs) is data-driven by system/docs/sources.toml (embedded; `--sources-file` / $AY_DOCS_SOURCES overrides). Kinds: local, git (local checkout else cached shallow partial sparse clone in var/cache/docs), llms, sitemap, skills. Index: var/index/docs.db (gitignored).

Live facts (2026-11-16): developer.android.com and source.android.com have NO llms.txt and NO markdown form (404); only sitemap.xml (index of 10 / 5 shards of 37-55 MB, ~77k English URLs incl. ~70k reference/api_diff pages; per-url and per-shard lastmod). The git repo android.googlesource.com/platform/docs/source.android.com stopped in 2021. chromium.org sitemap has no lastmod (507 /chromium-os/ pages). chromiumos/docs is on chromium.googlesource.com only (not GitHub). third_party/linux is sparse without Documentation (cache clone of github.com/torvalds/linux instead); third_party/chromium/src has docs and */docs (9 dirs).

**Why:** owner order 2026-11-16 to download all Android/Chromium/ChromiumOS/Linux docs via ay, no VPS, Rust builds only through CI.
**How to apply:** Windows ay.exe comes from the unixwin workflow artifact `ay-windows-x86_64` (windows-latest, triggers on system/ay/** and system/docs/**); ci.yml runs on the self-hosted fr1 runner. Both workflows run `cargo test -p aphrody-docs`. Cargo.lock has several `toml` versions: the docs crate entry needs `"toml 1.2.1+spec-1.1.0"`.
