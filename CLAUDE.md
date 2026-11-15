# CLAUDE.md

Guidance for Claude Code (`claude.ai/code`). Canonical contract: [`AGENTS.md`](./AGENTS.md) + [`.agents/SOUL.md`](./.agents/SOUL.md).

@AGENTS.md
@.agents/SOUL.md

## Key Conventions

- Layout, scope and execution rules: `AGENTS.md` (imported above); not repeated here.
- C and WebAssembly targets in `src/` build locally (`src/Makefile`); heavy Rust workspace builds run on `fr1` or CI (`.github/workflows/ci.yml`).
- Never run bare `bun test` at root: target a package (`bun test packages/core`).
- Subagents: use the project types in `.claude/agents/`, each with its skills preloaded (`general-purpose` is denied in `.claude/settings.json`):
  - `rust-crates`: cargo on fr1.
  - `c-core`: `src/` C core.
  - `upstream-absorber`: absorb or flatten upstream, dedup third party.
  - `chromium-integrator`
  - `ts-packages`: Bun.
  - `coherence-fixer`
  - `fact-checker`: read-only.
  - `reviewer`: Gemini Carbon review, verdict archived.
  - `researcher`: Context7 and live source, read-only.
  - `fleet-operator`: the three VPS.
  - `web-ui`: apps/aphrody and the design system.
  - `re-analyst`: REA and `ay re`.
  - `Explore` / `Plan` for read-only research.
- Commits in the shared tree go through `bun scripts/commit.ts -m "<msg>" --push <paths>...`.
  - It builds the commit in a private index and refuses a tree that loses files: b38c8de7 shipped an empty tree on 2026-11-15.
  - Never use a plain `git commit` of the shared index.
- Sessions talk through the relay mailbox, via MCP `session_send`, `session_inbox` and `session_list`, or the A2A skill `session_send`.
  - Each Claude Code session learns its name from the SessionStart hook.

## Essential Commands

```sh
wasm-validate --enable-all target/sys/aysys.wasm apps/aphrody/public/wayland.wasm
bun test packages/core/test/sys.test.ts
bun scripts/checkdeps.ts
bun fmt && bun check
just agents-sync --check   # agent tooling drift (infra/agents/toolchain.toml): plugins, MCP, skills; without --check = apply
bun packages/ai-os/src/brain/cli.ts sync   # global CLAUDE.md + memory index -> agy, Codex, OpenCode prompts
```

## Gotchas (Windows shell)

- `gh api ... --jq '<expr with quotes/pipes>'` breaks (gh is a cmd shim): pipe to `jaq` instead.
- `git pull` aborts on `would clobber existing tag` or push is rejected: `git fetch aphrody main --no-tags` then `git merge --no-edit aphrody/main` (works on the dirty shared tree; never stash or `--autostash`, other sessions share it).
- Committing a file another session also edited: stage only your hunks with context (`git diff -- <file>` filtered, `git apply --cached`), never `git add` the whole file; `--unidiff-zero` misplaces pure insertions, so re-read `git diff --cached` before committing.
- MCP: Claude Code declares only `relay` (`/mcp/core`), `cloudflare`, `cloudflare-docs`. `rea`, `agent-desktop`, `agent-browser` sit behind the relay: `hub_tools` (list, search, schema) then `hub_call` with `<server>__<tool>`; where a skill names an `mcp__rea__*` tool, call it that way. Change servers in `infra/agents/toolchain.toml` (`claude mcp remove` drops stored OAuth).
- Leftover `.git/rebase-merge/` holding only `autostash`: `git stash store -m orphan <sha>` then remove the dir before rebasing.
- Headless Claude from a shell: `claude -p "..." < /dev/null`; without it the CLI waits 3 s for stdin on every run .
- Never `cmd //c ...` from the Bash tool (niubash opens an interactive cmd and hangs): remove a junction with `bun -e` (`fs.unlinkSync`, fallback `fs.rmdirSync`).
- Relay code changes load only after `pwsh -NoProfile -c "Restart-Service AphrodyRelay -Force"` (service runs `packages/ai-os/src/relay/cli.ts serve` from source; killing the bun child is not enough).
- Fleet update (`/srv/src` on fr1, prd, fr2; roles fr1, fr2 and prd are ssh Host aliases): `git fetch -q --no-recurse-submodules origin main && git merge --ff-only FETCH_HEAD`. Blocked by a file identical to upstream: `git checkout FETCH_HEAD -- <file>`. Blocked by a submodule upstream absorbed: `git submodule deinit -f <path>` only if it is clean and its HEAD is on a remote branch.
- Gemini review, headless first: `bun packages/ai-os/src/review/cli.ts <paths|A..B> --voice gemini --json` (or `--bundle <file>`); Vertex service account, then Gemini API key, then agy, then other engines, each skipped with its recorded health reason (`docs/reviews/README.md`).
- Gemini review, last manual fallback when no headless engine answers (billing off, key blocked, no credits): gemini.google.com through claude-in-chrome; insert long text with `document.execCommand("insertText")` (synthetic paste is ignored, page CSP blocks fetch to localhost and raw.githubusercontent.com). A large bundle goes through an `<input type=file>` appended to the page, filled with the `file_upload` tool, read with `files[0].text()`. The browser tool withholds response slices that look like cookies or query strings: extract title, location and severity lines. Sub-agents have no claude-in-chrome, so the main session runs this route.
- R2 listing: `cf r2 buckets list`, `cf r2 objects list --bucket-name <b>` (discover others with `cf cli search`).
