# AGENTS.md

Contract for every agent CLI. Names (repo, folders, binaries, scopes) come from [`tools/identity.toml`](tools/identity.toml).

## Vision
Aphrody crafts four products:
- an OS;
- a browser;
- a Google: search, apps, AI and self-hosted services;
- a Cloudflare/Vercel: edge, deploy and hosting.

Each uses whatever language and stack does the job best (Rust, C, C++, Go, Bun/TypeScript, .NET, Python or anything else). The project is flexible and generalist: no language, framework, OS, locale or provider is fixed.

## How
- No human in the loop: decide, execute, prove, then report what is done, not done and failed. No approval gates, blocking warnings or slow backups.
- Assemble before writing: take the newest upstream (fork, package, prebuilt) and wire it in, then dedupe. First-party code is glue, optimization and dedup.
- Forked upstreams are git submodules with relative URLs (`../<name>.git`) and one checkout each, kept beside this repo and linked by `bun scripts/vcs.ts submodules init`. `src.lock.json` is the pin; `submodules pin` updates it.
- Nothing hardcoded: values come from live sources, discovery or config, names from identity. Upstream namespaces (win32, ffmpeg, Linux, crates, packages) keep their names.
- "Purge legacy" means fixing legacy errors, deleting dead code and modernizing old architecture. It never removes a feature or causes a regression.
- Commits go through `bun scripts/commit.ts`, on the current branch. Never stash, reset or use worktrees.
- Fleet: heavy builds on fr1 or CI, tests and research on fr2, production only on prd.
- Verify every claim you rely on (CLAUDE.md, memory, skills, docs) and fix what is wrong.
- Proof is a screenshot, a checked API response or a real UI test, never an HTTP status.
- Docs: short, generated indexes. Scripts and infra: short and declarative, using upstream tools.

## Limits
- Secrets are never printed, logged or committed; the repo is public; no personal data.
- Licenses never decide anything. No emoji, no AI attribution. `C:\Windows\System32` is never modified.

## Agent CLIs
- Gemini CLI and Antigravity read this file (`.gemini/settings.json` sets `context.fileName` to `AGENTS.md`).
- `frameworks/ai-os` owns AI and MCP:
  - MCP over stdio: `ai-os relay mcp-stdio`;
  - MCP over HTTP: the relay's `POST /mcp`.
- Providers and models are discovered at run time.
- GitHub auth runs through the GitHub App (`tools/agents/gh-token.ts`).
- Run `bun fmt`, `bun check` and the affected package's tests. Use `graphify` first when `graphify-out/` exists.
