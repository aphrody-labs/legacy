---
name: i18n-stack-traps
description: Non-obvious facts from building the shared i18n stack (frameworks/i18n-ts, frameworks/i18n): detector choice, checkdeps edge, fr1 cargo contention, commit.ts --content meaning
metadata:
  type: project
---

- No maintained JS/WASM lingua exists on npm (lingua-node 0.4.1 is a 2021 napi wrapper); `eld` (pure JS, `eld/medium`) is the detector behind the hygiene `non-english` rule. lingua-rs 1.8.0 was not needed.
- `translate` loads `@aphrody/ai-os/llm` lazily; frameworks/i18n-ts is L3 and ai-os L4, so `frameworks/i18n-ts/DEPS.rules` carries a ticketed `!frameworks/ai-os` and an optional peerDependency (checkdeps counts peers).
- `bun scripts/commit.ts --content <path>=<file>` commits explicit file content; it is not a "foreign edits" flag. `.claude/skills` is gitignored: stage `.agents/skills/...`.
- fr1 is saturated (load ~90, cargo in D state, "Blocking waiting for file lock on package cache"): a workspace `cargo check -p` can sit for 20+ minutes. Fast loop: copy frameworks/i18n + frameworks/i18n-ts into a local temp mini-workspace (replace `.workspace = true`) and `cargo test` on the PC (local nightly cargo works for small crates), then confirm on fr1.
- xh without `< /dev/null` hangs in this shell; use bun fetch for registry queries.
- Other sessions edit frameworks/i18n-ts concurrently (deploy session added keys and a browser entry): `git log -5 -- frameworks/i18n-ts frameworks/i18n` before each commit.
