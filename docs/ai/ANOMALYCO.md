# anomalyco (github.com/orgs/anomalyco) in src

Verified 2026-11-15 with `gh api orgs/anomalyco/repos`, `gh api repos/<o>/<r>/commits/<branch>` and the READMEs of the forks. Excluded: `sst` (owner order), `guide`, demo and sample repos. Every fork is `aphrody-labs/<name>` (fork=true, synced with `gh repo sync` the same day, so fork sha = upstream sha). Pins: `src.lock.json` (`url` = fork, `upstream_url` = anomalyco); `DEPS` is derived with `ay manifests`; fork lists: `third_party/forks.txt`, `packages/machine/src/forks.ts`.

| Repo | Pin (fork main = upstream) | Upstream head date | Our counterpart | Verdict | Next step |
|---|---|---|---|---|---|
| models.dev | `dev` aeba6448 | 2026-11-14 | `packages/ai-os/src/providers` (read `https://models.dev/api.json`) | wired | Router (ts-packages) reads `docs/ai/providers.json`, whose format is unchanged |
| opencode | `dev` 38bd7378 (was anomalyco c5a15328) | 2026-11-14 | `infra/agents/toolchain.toml` `[[mcpfile]] opencode`, `packages/machine/src/toolchain.ts` | wired (MCP), reference (rest) | Add `providers` and `agents` once the router serves streaming `/v1`; see "opencode changes" |
| opentui | `main` 0c48678d (was 4d40024a) | 2026-11-14 | none: `packages/ai-os/src/term` is a PTY and VTerm host, not a TUI toolkit | reference only | Dependency of opencode's TUI; revisit when a TUI is built outside ratatui |
| openauth | `master` 98dc5962 | 2025-04-09 (last commit) | better-auth (`src/rust-stack`, `packages/env-kit`); `docs/infra/AUTH-ECOSYSTEM.md` already lists `@openauthjs/openauth` as discarded | reference only (better-auth survives) | None; keep the pin only to track a revival |
| rune | `dev` bd4d42b1 (was d80c872f) | 2026-11-14 | `src/ui/kit` (`aphrody-ui`: M3 color, tokens, component contracts, layout; no renderer) | reference only, candidate renderer | `cargo check -p rune --example hello` on fr1 and on Windows MSVC, then decide survivor vs gpui |
| hex | `dev` 31feb6f0 (was e14c0304) | 2026-11-14 | none (voice) | reference only, candidate `ay voice` | Not built here; upstream CI has `check-windows.yml` and Windows installers, and it depends on rune (rev d6715352) and transcribe-rs (onnx). Build on a Windows runner, then wire as an `ay` feature |
| rift | `dev` 7077f47a | 2026-11-11 | none (git worktrees are not used in the shared tree) | reference only | README: Windows backend "None; workspace creation is unsupported". Try on fr1 (btrfs/XFS reflink) as agent workspaces |
| browse | `dev` e3a45fd9 | 2026-11-14 | claude-in-chrome setup, `agent-browser`, relay `browser` (CDP); `apps/open/packages/chromium-bun` (aphrody-labs/open) is a CDP client and crawler, not a duplicate | reference only, candidate MCP | Install via its `install.ps1`, run as MCP behind the relay and compare with claude-in-chrome |
| browser-control | `main` 9ea31dc4 | 2026-10-25 (archived upstream) | same function as browse (extension + local relay + Playwright on the real profile) | reference only | None; superseded in practice by browse, kept for the pin |
| opentunnel | `dev` 6e757aa2 (was 42af396d) | 2026-11-14 | Cloudflare Tunnel: `infra/cloudflare/tunnel-token.ts`, `infra/fleet/prd/systemd/fleet-tunnel-nativelink.service` | reference only | Server crate `opentunnel-server` is self-hostable (`OPENTUNNEL_API`); README lists Linux and macOS binaries only |
| terminal-control | `main` 6c255aa4 (unchanged) | 2026-11-11 | `packages/ai-os/src/term` (`term-bench.ts` follows its bench method); `infra/fleet/bin/terminal-prd-build.sh` builds it on prd | wired (prd build) | `termctrl mcp` (stdio) next to `term/mcp-tools.ts`; needs Zig 0.15.2, no Windows claim in README |
| deadbolt | `dev` 11a56948 (unchanged) | 2026-11-11 | none (decentralized password manager over iroh, alpha) | reference only | None |

## models.dev (wired)

- Repo layout: `providers/<id>/provider.toml` (name, env, npm, api, doc) and `providers/<id>/models/**/*.toml`, plus `labs/<lab>/lab.toml`. At dev aeba6448: 334 `provider.toml`, 10667 model files.
- `packages/ai-os/src/providers/sources.toml`: the `models.dev` source gains `dir = "third_party/models.dev"`; `url` stays as fallback. `cli.ts` reads the checkout through git objects (`git ls-tree -r HEAD` + one `git cat-file --batch`), not the work tree: files such as `amazon.nova-lite-v1:0.toml` cannot be checked out on Windows.
- Output unchanged: `docs/ai/providers.json` keeps `{sources, failed, providers[{id, sources, api, doc, probe}]}`. Counts differ from the published api.json: the repo has 333 providers with models against 328 in api.json, and 58 providers have more models in the repo (for example openai 80 against 51, alibaba 88 against 53), so the repo carries entries that api.json does not publish.
- CI (`ai-providers.yml`) has no checkout and falls back to the URL.

## opencode changes (not applied: the router is not there yet)

Facts: opencode 2 config (`services/site/src/docs/content/config.mdx`, `providers.mdx` at dev 38bd7378) uses plural keys `providers` and `agents`, `mcp.servers`, and agent files in `agents/*.md`. Our `toolchain.ts` already writes `mcp.servers` with `{type: "remote", url}`. The relay (`packages/ai-os/src/relay/server.ts`) serves `/mcp`, `/mcp/core`, `/a2a`, `/acp`, `/rpc`, `/ws`, no `/v1`; `packages/ai-os/src/gateway/index.ts` serves `/v1/chat/completions` non-streaming only.

1. Router: expose OpenAI-compatible streaming `/v1/chat/completions` and `/v1/models` (fed by the catalog above).
2. `toolchain.toml`: new key per `[[mcpfile]]` for `providers`, written by `toolchain.ts` as `providers.aphrody = {name, env, package: "@opencode/ai/providers/openai-compatible", settings: {baseURL: <relay>/v1}, models}`; top-level `model` = `aphrody/<id>`.
3. `agents`: generate `~/.config/opencode/agents/*.md` from `.agents/skills` roles instead of hand files.
4. Absorption candidates that ai-os lacks (searched `packages/ai-os`: no code mode, no cassette recorder): `packages/codemode` (tool-calling interpreter, 886 KB, depends on `effect`), `packages/http-recorder` (deterministic cassettes), `packages/process-daemon` (Rust, from opencode-pty). Not absorbed: the Effect dependency conflicts with the zero-dependency rule; port only after a decision.
5. models.dev ships `.opencode/agent/{ci-fixer,issue-fixer,pr-reviewer}.md` and a skill `audit-reasoning-options`: reference for our CI agents.

## Rust members (not added; root `Cargo.toml` is being rewritten by the Bun-crate import)

Each upstream has its own `[workspace]`, and the root has `exclude = ["third_party", ...]`; adding them needs that exclude lifted and the nested `[workspace]` tables removed or flattened (`ay flat sync`).

```toml
"third_party/rune/crates/*",
"third_party/rune/themes/opencode",
"third_party/hex",
"third_party/hex/crates/console",
"third_party/hex/crates/router",
"third_party/rift/crates/*",
"third_party/opentunnel/crates/*",
"third_party/deadbolt/crates/*",
"third_party/terminal-control",
```

hex also needs a root `[patch]` for `winit`, `parley_engine`, `wgpu-hal` and `accesskit_windows` taken from the rune pin (see hex `Cargo.toml`).
