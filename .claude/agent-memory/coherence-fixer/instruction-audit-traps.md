---
name: instruction-audit-traps
description: Traps met while auditing CLAUDE.md, agents, skills and the private memory dir (2026-11-15): untracked helpers, sd multiline, no shell-deny hook
metadata:
  type: feedback
---

- `var/coh/` (commit.ts, deadrefs.ts) is gitignored and local; the tracked committer is `bun scripts/commit.ts -m <msg> [--content path=file] --push <paths>`. A push can be rejected by a racing session: `git fetch aphrody main --no-tags` then `git push aphrody HEAD:main`.
- `sd` with `\n` in the pattern did not match (CRLF files or per-line mode): use the Edit tool for multi-line replacements; `sed -i '/regex/d'` for line deletion.
- `rg -c <pattern>` without a path searches the cwd (C:\aphrody root) and hangs: always pass a path.
- No hook denies cat/grep/ls in this setup (the plugin `tools/agents/plugins/aphrody-nhitl` states there is no deny-list engine); do not write "a hook denies them" in agent files.
- The installed `ay --help` is older than `system/ay/src/lib.rs`: verify subcommands (`code`, `electron`, `re`, `applet`, `sh`, `index`) in the source, not only the binary.
- Private memory (`~/.claude/projects/<project>/memory`) is outside the repo: edit in place, regenerate MEMORY.md from frontmatter (one line per file, 150 chars max).

**Why:** each cost a retry in the 2026-11-15 audit. **How to apply:** before editing instruction files or memory.
