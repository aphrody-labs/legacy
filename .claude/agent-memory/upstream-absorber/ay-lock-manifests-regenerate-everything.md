---
name: ay-lock-manifests-regenerate-everything
description: `ay manifests` and `ay lock` rewrite the whole src.lock.json from the checkout (dozens of unrelated pins); bump a pin by hand-editing only its commit lines
metadata:
  type: feedback
---

To bump a third_party pin, update the clone (`git -C third_party/<n> fetch origin main`, `checkout -B main <sha>`), then edit only that entry's `commit` in `src.lock.json` and the matching line in `DEPS` (`.gitmodules` and `docs/patches/series` do not change for a pure bump).

**Why:** on 2026-11-15 `ay manifests` regenerated src.lock.json from the working tree: 47 unrelated entries changed, about 3600 lines, other sessions' pins dropped. `ay lock --lock-only --out <tmp>` is the safe dry-run (it writes only the tmp file) to see drift; `ay manifests` is not. I restored both files from `git show HEAD:<f>` written with bun (no index touch) and re-applied 6 lines.

**How to apply:** never run `ay manifests` or `ay lock` without `--out` on the shared tree. After a detached `checkout FETCH_HEAD` the lock records `"branch": "detached"`; use `checkout -B main <sha>` in the clone to keep `main`.
