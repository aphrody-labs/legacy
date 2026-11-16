---
name: hygiene
description: Scan the tracked tree for hardcoded values (pinned versions, magic dates, dated files, absolute paths, hand-kept URL lists, home-made scrapers) and slop (Sovereign wording, AI filler, stubs, backups, dead references). Use before a docs or scripts change, for a purge batch, or when `just hygiene` is red.
---

# hygiene

One engine, `scripts/hygiene.ts`, three front ends: `just hygiene [--summary | --rule id | --json | --paths a,b]`, the relay hub tool `hygiene__hygiene_scan` and `hygiene__hygiene_rules` (server `hygiene`, `scripts/hygiene-mcp.ts`, declared in `infra/agents/toolchain.toml`), and the library import. It lists hits; it never edits.

## Rules

| id | flags | fix |
| --- | --- | --- |
| `pinned-version` | `pkg@x.y.z`, `git clone -b vX.Y`, `--tag`, `uses: x@vX.Y.Z` outside manifests and lockfiles | resolve latest at run time, or read the manifest |
| `dated-filename` | `2026-11-12` or `202611` in a file name | rename to a timeless name, or generate the file from a script |
| `dated-snapshot` | "as of / état au / validated on <date>" in prose | delete the date or regenerate the section |
| `magic-date` | date literal in code | compute it or read the source of truth |
| `absolute-path` | `C:\aphrody`, `C:/Users/...`, `/home/<user>`, `/srv/src` | repo root, `SRC_ROOT`, `os.homedir()` |
| `hardcoded-list` | 8+ `owner/repo` slugs in one file | GitHub API listing or a manifest |
| `home-scraper` | fetch or curl of release or tag pages, kernel.org, googlesource without an API | releases API, gitiles `?format=JSON`, kernel.org `releases.json`, Repology, nvchecker |
| `non-english` | prose (comments, long strings, docs) detected as a language other than the project's source locale (`packages/i18n/i18n.config.json`, default en), outside locale catalogs; detector `eld` | translate to the source locale, route user-facing text through `ay i18n` catalogs |
| `sovereign` | "Sovereign" or "Antigravity" wording | verify the claim against a real run, else delete |
| `ai-filler` | AI-filler vocabulary in docs | rewrite with the humanizer skill |
| `stub` | `TODO: implement`, fake output, demo-only in non-test code | implement or delete |
| `backup-file` | `.bak`, `.orig`, `.old`, `~` | delete; git is the history |
| `dead-ref` (opt-in) | repo paths and relative links that point to nothing | rewrite to the real path or delete the line |

## Tree-sitter engine

Rules that read code do not match text lines: `node-builtin` reads import specifiers (import, export-from, dynamic import, require) and calls, `literal-identity` and `personal-data` read string literals, `non-english` reads comments and string literals. `scripts/ay-facts.ts` asks `ay code query` (src/core/src/facts.rs, queries in `src/core/queries/facts`) for the nodes of every code file in one parallel call; a quote inside a comment, a regex literal or an identifier is not a hit. Files without a grammar (ps1, just, zig, cs, docs, manifests) and runs without the binary (build `aphrody-code`: `cargo build -p aphrody-core --features cli`, or set `APHRODY_CODE_BIN`) keep the line scanners; `HYGIENE_ENGINE=lines` forces them. `bun scripts/hygiene-compare.ts` prints both engines side by side on the whole tree.

## Suppression

A justified hit gets `hygiene-ok: <reason>` on its line, or a glob in `scripts/hygiene.allow.json` (`{ "<rule>": ["<glob>"] }`). Every allowance is listed with its reason in `docs/reviews/hardcode-slop-purge-2026-11-15.md`.

Never scanned: `third_party/`, lockfiles, root manifests, verdict archive `docs/reviews/`, upstream copies (`.agents/skills/*/references/`, `docs/bun`, `apps/auto/vendor`, `tools/lore`), and the areas other sessions own.

## Criteria (fetch live before citing)

- Google eng-practices, "What to look for in a code review": no over-engineering or functionality not needed now; comments explain why, not what. https://google.github.io/eng-practices/review/reviewer/looking-for.html
- Google developer documentation style guide, "Timeless documentation": no statements that rot with time or version. https://developers.google.com/style/timeless-documentation

Generated files are allowed only when a script produces them and the script is the single source.
