# Gemini web + MCP gateway + skills archive

Checked 2026-11-14. Goal: Gemini works like Claude in the cloud (same MCP tools, same skills, same memory).

## What Gemini web supports (evidence)

- gemini.google.com (consumer app): no custom remote MCP server or custom connector. The release notes (https://gemini.google/release-notes/) mention only Google-built apps (Google Workspace connected app, help: support.google.com/gemini/answer/15229592) and no MCP entry. Gems are being replaced by "skills" (same notes: "Skills will soon replace Gems ... Gems migrate automatically to skills").
- Remote MCP exists elsewhere in Gemini: the Gemini API Interactions tool `mcp_server` (https://ai.google.dev/gemini-api/docs/function-calling, "Remote MCP"): Streamable HTTP only, SSE unsupported, static `headers` (bearer). Gemini CLI (https://geminicli.com/docs/tools/mcp-server/): stdio, SSE, Streamable HTTP (`httpUrl`), OAuth discovery on 401 plus dynamic client registration.
- Paths therefore implemented: (1) a public standards-compliant MCP endpoint for Gemini CLI / agy / API / any client, (2) the skills + memory markdown archive as Gem / skill knowledge for gemini.google.com (upload the files, or put them in Drive and attach), (3) Gemini web writes memory back through the MCP tools only where a client supports them.
- Re-check this section when the Gemini app release notes add custom connectors: the gateway already speaks the contract that clients use (below), no change expected.

## Gateway

- `https://mcp.aphrody.com/mcp` = Worker `infra/cloudflare/workers/aphrody-mcp-gateway` (source `index.ts`, test `index.test.ts`).
- Origin: relay on fr2 (`infra/fleet/fr2/systemd/aphrody-relay.service`, Restart=always) behind tunnel `fr2`, hostname `mcp-origin.aphrody.com` (`infra/cloudflare/cloudflare.toml`). fr2 chosen over the PC: always on; the PC relay (agent-desktop, agent-browser) stays local. Origin auth: bearer `RELAY_TOKEN` (fr2 `/etc/aphrody/relay.env`, same value as the Worker secret); optional Access service token headers (`CF_ACCESS_CLIENT_ID/SECRET`) when an Access app is added on the hostname.
- OAuth 2.1 (served by the Worker, stateless HMAC blobs): RFC 9728 `/.well-known/oauth-protected-resource`, RFC 8414 `/.well-known/oauth-authorization-server`, RFC 7591 `/register` (public clients, https or loopback redirect only), `/authorize` (PKCE S256 required, RFC 9207 `iss`), `/token` (authorization_code, refresh_token), resource indicator = `<origin>/mcp`, scope `mcp`. Login = Google OIDC (`openid email`), allowed only if the verified email equals the secret `OWNER_GOOGLE_ACCOUNT` (vault `APHRODY_OWNER_GOOGLE_ACCOUNT`); anyone else gets `access_denied`.
- Secrets (Worker secrets, never in git): `OAUTH_SECRET`, `RELAY_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OWNER_GOOGLE_ACCOUNT`. Var: `ORIGIN_URL=https://mcp-origin.aphrody.com`. R2 binding `ARCHIVE` (bucket `aphrody-skills-archive`) serves `GET /archive/<file>` with the same bearer.
- Limits and logs: per-IP window in the Worker (600/min MCP, 60/min OAuth), JSON logs without tokens; add a zone rate-limit rule for a hard cap.
- Google OAuth client (type Web, redirect `https://mcp.aphrody.com/google/callback`, scopes openid email) must be created once in Google Cloud Console; it cannot be created from the API for consumer OAuth consent.

## Skills archive and memory

- `just skills-archive [--publish]` (`packages/ai-os/src/brain/skills-archive.ts`): 195 skills + references -> `var/skills-archive/` (`00-index.md` with TOC, AGENTS/SOUL/CLAUDE conventions and memory index; `skills-<domain>*.md`; `refs-<domain>*.md`; `memory.md`; `manifest.json` with sha256). Frontmatter reduced to name/description, duplicate paragraphs dropped, relative links turned into anchors, 900 KB budget per file (`--budget`), references capped at 60 KB (`--refs-cap`), secret scan aborts the run. `--publish` uploads to R2 with `cf r2 objects put`.
- fr2 timer `skills-archive.timer` (every 6 h): git ff, build, publish, memory sync.
- Memory (`packages/ai-os/src/brain/memory-sync.ts`): push = Claude memory files upserted as `claude-mem:<file>` scope `claude` (searchable with `memory_search`); pull = entries with scope `gemini` or `gemini:*` (written by Gemini via `memory_add`) appended to `memory/gemini-inbox.md` as `- <iso> [source=gemini id=<id> scope=<scope>] <text>`. Append-only, timestamped, source recorded; Claude files always win; secret-looking entries skipped. Tell Gemini in the Gem instructions: "persist durable facts with memory_add, scope gemini".

## Operate

- Deploy Worker: `cf` Workers script upload (or wrangler with a config next to `index.ts`), custom domain `mcp.aphrody.com`, then set the secrets above.
- Test through the public URL: bun MCP client: 401 + `WWW-Authenticate` resource_metadata, DCR, authorize (browser, owner Google login), token, `tools/list`, one `tools/call`.
