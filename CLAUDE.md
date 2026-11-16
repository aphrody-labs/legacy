# CLAUDE.md

@AGENTS.md

## Claude Code
- Sub-agents: any type (the ones in `.claude/agents/` are tuned for this repo). Sub-agents have no SendMessage and no claude-in-chrome: the main session relays handoffs and runs browser steps.
- Commit: `bun scripts/commit.ts -m "<msg>" [--allow-shrink N] [--content path=file] --push <paths>` (private index; `--content` = HEAD plus your hunk for files other sessions edit). Push rejected: `git fetch aphrody main --no-tags && git merge --no-edit aphrody/main`.
- MCP: only `relay`, `cloudflare`, `cloudflare-docs`; everything else behind the relay (`hub_tools`, then `hub_call <server>__<tool>`), declared in `tools/agents/toolchain.toml`, applied by `just agents-sync`. Relay code changes need `Restart-Service AphrodyRelay`.
- Sessions talk through the relay mailbox (`session_send`, `session_inbox`, `session_list`).
- Review: `ai-os review <paths> --voice gemini --json` (Gemini web in the relay's headless Chrome); sign-in: `ay auth login [service]`.
- Shell (niubash): pipe `gh api` to `jaq`; headless `claude -p "..." < /dev/null`; never `cmd //c`.
- Fleet checkout update: `git fetch -q origin main && git merge --ff-only FETCH_HEAD`; always `timeout N ssh <role>`.
