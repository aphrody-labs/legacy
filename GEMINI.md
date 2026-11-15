# Aphrody — Google Antigravity Contract (`GEMINI.md`)

The canonical operating contract is [`AGENTS.md`](./AGENTS.md) plus [`.agents/SOUL.md`](./.agents/SOUL.md); this file adds only what Antigravity (`agy`) needs.

- `packages/ai-os` is the sole AI and MCP owner. MCP over stdio: `ai-os relay mcp-stdio` (`packages/ai-os/src/relay/cli.ts`); over HTTP: the relay `POST /mcp` (`packages/ai-os/docs/RELAY.md`). Providers and models are discovered at run time, never hard-coded.
- Antigravity hooks: `.agents/hooks.json` runs `.agents/scripts/pre-tool-guard.ts` (`AGENT_GUARD=off|warn|enforce`, default `off`).
- Run `bun fmt`, `bun check` and the affected `bun test` (target a package, never bare `bun test` at root).
- Use `graphify` first when `graphify-out/` exists for architectural graph queries.
