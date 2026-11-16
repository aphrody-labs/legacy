---
name: mixed-hunks-commit-method
description: How to commit translation-only hunks of files another session also edits (U0 hunk script + commit.ts --content), and generator/output coupling traps
metadata:
  type: project
---

Method (2026-11-15): `git diff -U0 HEAD -- file` parsed into hunks; build `<tmp>/file` = `git show HEAD:file` with chosen hunks spliced by line (insertions after oldStart); mixed hunks (translation + functional on one line) re-done by hand on the HEAD line; verify with `bun build --no-bundle` (TS), `bash -n`, `Bun.TOML.parse`; commit with `bun scripts/commit.ts -m ... --content <path>=<tmp>`.

**Why:** the shared tree holds other sessions' uncommitted hunks; staging whole files would publish them.
**How to apply:** if HEAD generated outputs are ahead of the HEAD generator (design adapters: Theme.kt springs), translate outputs by same-line-count hunks only. Emitter templates that flow into env.* generated files (packages/machine/src/shells.ts `#` heredoc comments, tag "géré par") stay French until the generated files can be regenerated cleanly. `git push` plain works after a `--push` race rejection.
