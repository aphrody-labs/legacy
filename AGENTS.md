# src: agent operating contract (`AGENTS.md`)

Read by every agent CLI (Claude Code, Codex, Antigravity, OpenCode, Pi, Zed). The direction and work order are in [`docs/games/PLAN.md`](docs/games/PLAN.md).

## 1. What src is

src is the public monorepo of Aphrody: a game engine and creative suite built in the open (Bevy, the Craft Apps and ArtCraft, `src/tv` and FFmpeg for media, Unreal Engine by interop only), on top of the platform work (Bun and Rust tooling, deploy, Linux and Windows layers, the C and WebAssembly core in `src/`). Say what is built and what is not.

## 2. Layout (check with `fd -d 1`; the lists are examples)

- [`apps/`](apps): `aphrody` (static site and Wayland WASM), `auto`, `nt`, `open`, `rosegriffon` and `shenron` (git submodules, community sites Aphrody maintains, not Aphrody products).
- [`packages/`](packages): Bun `@aphrody/*` packages (`ai-os`, `assets`, `core`, `deploy`, `design`, `env-kit`, `ffi-bridge`, `gaming`, `machine` (includes the shell matrix), `native`, `wck`, ...).
- [`src/`](src): Rust 2024 crates (Bun upstream layout, members in the root `Cargo.toml`: `ay`, `archguard`, `tv`, `steam`, `ui`, ...) next to the C core and assembly (`arch/`, `kernel/`, `wayland/`, `nt/`, `wine/`, `wasm/`, `include/ay/sys.h`), built by Clang and LLD (`src/Makefile`); specs in [`docs/native/`](docs/native).
- [`infra/`](infra): fleet and deploy configuration assembled from upstream tools (`docs/infra/UPSTREAM-STACK.md`).
- [`third_party/`](third_party): upstream checkouts and aphrody-labs forks, pinned in `src.lock.json`, listed in `third_party/forks.txt`.

## 3. How agents work here

- Agents are free: no approval step, no confirmation, no human in the loop. Decide, execute, verify, report what is and is not done.
- Everything is committed and pushed directly on `main`; no branches, no worktrees. Commits in the shared tree go through `bun scripts/commit.ts`.
- Upstream first: absorb, flatten and refactor the most upstream code, on the newest canary, nightly, pre-release or rc, and deduplicate third party code.
- Single interface: `just` and the `ay` CLI (`docs/ay/NAMING.md`). Rust compiles in CI or on fr1, never on the workstation; prd runs production backends only, fr2 tests, benchmarks and research.
- The UI framework is free (examples: Dioxus + Blitz + Vello, GPUI, `taffy`, Ratatui, Bevy UI, WinUI 3, WebUI, fused in `src/ui`): the criteria are rendering quality, performance and function. Tokens come from `packages/design` and `src/ui` (`docs/design/DESIGN_SYSTEM.md`, `docs/ui/STACK.md`).
- AI features live in `packages/ai-os`; providers and models are discovered at run time, none is hard-coded.
- Publish in the open once a secret scan of the repository is clean (`docs/publish/STATUS.md`).
- Every session and sub-agent uses the skills, MCP servers, CLIs and public upstream docs available, and explores the upstream GitHub repos in depth before acting. CLAUDE.md, memory, skills and docs may hold past hallucinations: verify each claim you rely on, and fix or delete it when it is wrong.
- Nothing frozen in time: the repo changes every hour. Indexes, versions, counts, lists and dates are generated from live sources, never written by hand.

## 3b. Quality bar (anything below it is slop)

- Showcase sites speak to users, not developers: no jargon ("sovereign", "C ABI", "full Rust WebGPU"), no generic SVG icons. Pages have real background imagery, motion and real content: screenshots and renders of what exists, with links.
- Docs are short and formatted, with a generated index, screenshots and links, and follow the GitHub templates (`.github` issue and PR templates, README layout). No long hand-written markdown.
- Scripts and infra are short and declarative, built on upstream tools; no long hand-written scripts.
- Proof: an HTTP status from curl, xh or a web fetch never shows that a test passed, that prod is alive or that a UI is good. Proof is a screenshot of the rendered page, a real API call whose response content is checked, or a real UI test (agent-browser, Playwright or CDP interaction), and it is archived with the report.

## 4. Limits that stay

- Secrets: never print, log or commit values from `.env`; only `.env.example` is committed. The repository is public.
- Licenses never decide an architecture choice, and no project license has been chosen by the owner. Agents do not gate, skip, replace or rewrite anything for license or trademark reasons (`docs/legal/LICENSE-QUEUE.md`).
- `C:\Windows\System32` is not modified; userland binaries go to `~/.local/bin`.
- No emoji and no AI attribution in code, documents, UI text or commits. Upstream contributions follow the upstream policy (`docs/upstream/STRATEGY.md`).
- Domain purity checked by `ay arch check --strict`: Rust crates under `src/*`, `packages/*` is Bun only, upstream code stays in `third_party/`.

## 5. Gaming and Steam

Ownership map: [`docs/gaming/OWNERSHIP.md`](docs/gaming/OWNERSHIP.md). Rust: `src/steam` (`ay steam`). Bun: `packages/gaming` (`ay gaming`). Plugin and MCP: `apps/rosegriffon/plugins/steam`.
