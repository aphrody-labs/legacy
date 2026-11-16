---
name: lock-edit-on-shared-tree
description: How to edit src.lock.json, DEPS, forks.txt safely when other sessions have the working-tree copies dirty or shrunk (2026-11-15)
metadata:
  type: feedback
---

Edit pin files on the HEAD version, not the working tree, then commit through a private index with `hash-object -w` + `update-index --cacheinfo`; scripts/commit.ts adds whole working files and would commit another session's edits.

**Why:** on 2026-11-15 the working src.lock.json held 263 entries against 513 at HEAD (another session regenerated it from a partial checkout; third_party/ has no checkouts locally), and DEPS/forks.ts were edited concurrently.

**How to apply:**

- `src.lock.json` is formatted by `bun fmt` (inline short arrays): edit it as text, no JSON round-trip.
- Derive DEPS with `ay manifests --root <scratch git root holding the lock + identity.toml>`; HEAD's DEPS may already be stale against HEAD's lock, so the diff can show extra repos.
- Regenerate the HEAD-based files right before committing (HEAD moves), then `git restore --staged` the paths.
- Do not run `ay lock` here: it writes the lock from the checkout and drops pins with no local clone.
- Windows cannot check out some git trees (models.dev has `...v1:0.toml`): read them through `git ls-tree` / `git cat-file --batch`.
- `ls`, `cat` and `cd` are rejected by the Bash hook; use fd, Read, rg.
