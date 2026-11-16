---
name: relayout-tooling
description: How the 2026-11-16 reorganization (infra, packages, src split into build/device/prebuilts/tools/frameworks/system/kernel/hardware) was applied with tools/layout.toml + scripts/relayout.ts, and the traps met
metadata:
  type: project
---

`tools/layout.toml` holds `[[area]]` (table of docs/project/layout.md), `[[move]]` and `[[group]]` (from, to, names, rename) rows with a `batch`; `bun scripts/relayout.ts apply --batch N`, `check --upto N`, `table --write`. Batches: 1 infra, 2 packages, 3 kernel+hardware, 4 frameworks crates, 5 system crates (src/ gone). The `layout.yml` workflow (hosted runner) runs `check --upto 5`, frozen bun install, cargo metadata on nightly, checkdeps baseline (3 known errors).

**Why:** owner asked for an AOSP/Chromium-shaped root. The fr1 runners are offline, so ci.yml (self-hosted) never runs; layout.yml is the verification that works.

**How to apply (traps):**
- File list must be `git ls-files --cached --others --exclude-standard` (moved files are untracked until committed).
- Relative tokens (`../x`, `/../x`) are recomputed against the OLD tree (existence check, extension-less imports included); root-relative `src/<name>` matches only after a root marker (`aphrody/`, `${var}/`, `}`/`)`), and is left alone when the file's own unit has `src/<name>` (local reference).
- Not caught, grep after apply: `join("src","x")` chains (partly handled), `b.push("src")`, `root.join("src")` scans, glob lists in workflows (`"src/**"`), `make -C src`, `CARGO_MANIFEST_DIR` + `/../../src/`, package scanners (`readdir("packages")`), extension-less `../../src/runtime.bun`.
- Generators (`docs-index`, `catalog`) read the git index: commit first, regenerate, commit again.
- `sd` multi-line patterns silently do nothing here; use Edit or `bun -e`. A test commit with `commit.ts -m x` really commits (and pushes nothing, but a later push ships it).
- Never rewrite tools/layout.toml, docs/proofs, restore-inventory.*, lock files; regenerate bun.lock with `bun install` (relinks node_modules/@aphrody workspace symlinks, needed or `gh` shim breaks).
- Owner machine files outside the repo hold repo paths (`~/.local/bin/gh{,.cmd}` for tools/agents/gh-token.ts).
- The Bun `build/` output dir now collides with our `build/`: .gitignore ignores `/build/debug*`, `/build/release*`.
