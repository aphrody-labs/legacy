---
name: private-index-race
description: Hand-rolled private-index commits can revert other sessions' commits when HEAD moves after read-tree; use scripts/commit.ts
metadata:
  type: feedback
---

Build the private index and run commit-tree in one command, right after `read-tree HEAD`, and check `git diff --cached --stat HEAD` shows only your paths. Prefer `bun scripts/commit.ts -m "<msg>" --push <paths>` (owner-session rule, 2026-11-15).

**Why:** 2026-11-15 I read-tree'd HEAD, then spent minutes on edits; another session committed (d2a9d994), my commit-tree then used the new HEAD as parent with the old tree and deleted three Ghidra files plus a forks.txt line; a concurrent bare `git push` published it. Repaired with a merge commit (tree = corrected commit) 1d193bcf.

**How to apply:** never carry a private index across tool calls; never `update-ref` without the CAS old-value; if a faulty commit is already pushed, fix forward with a merge whose tree is the corrected one, do not force-push. A pin edit for src.lock.json/DEPS/forks.txt must be re-derived from the current HEAD blobs (those files are edited by many sessions).

Also: on fr1, `sccache` is configured but missing, so cargo needs `RUSTC_WRAPPER=`; a shallow clone makes `git push` report non-fast-forward, use `--force-with-lease=<ref>:<expected-sha>` after proving ancestry with `gh api compare`.
