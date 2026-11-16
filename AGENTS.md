# Aphrody: agent operating contract (`AGENTS.md`)

Read by every agent CLI (Claude Code, Codex, Antigravity, OpenCode, Pi, Zed). The spec and work order are in [`docs/native/ROADMAP.md`](docs/native/ROADMAP.md).

## 1. What Aphrody is

Aphrody (`aphrody-labs/aphrody`, checkout folder named after `tools/identity.toml`) is a public, generalist monorepo; the core is `ay`: Bun built from its fork without JavaScriptCore and WebKit, with the Unix userland in their place (bash, coreutils, binutils...), a universal runner for TypeScript/JavaScript, bash and Rust, and a module and extension system with Cargo/crates.io and Bun/npm built in (AOT, LTO). Around it: the platform (OS layers, deploy, the fleet as one server, agents) and the front ends (web, CLI, TUI, GUI, mobile) consuming the `open` and `auto` libraries. Ecosystem apps and frameworks consume that core: our Bevy fork assembled with Steam and Epic Games is one app and framework, the Craft Apps another, media (`src/tv`) another. Say what is built and what is not.

## 2. Layout (check with `fd -d 1`; the lists are examples)

- [`apps/`](apps): `web` (aphrody.com and aphrody.app: static site, Angular app in `web/web`, Wayland WASM), `auto` and `nt` (in tree), `open` (separate clone, `aphrody-labs/open`, not tracked here), `rosegriffon` and `shenron` (git submodules, community sites Aphrody maintains, not Aphrody products).
- [`packages/`](packages): Bun `@aphrody/*` packages (`ai-os`, `assets`, `core`, `deploy`, `design`, `env-kit`, `ffi-bridge`, `gaming`, `machine` (includes the shell matrix), `native`, `wck`, ...).
- [`src/`](src): Rust 2024 crates (Bun upstream layout, members in the root `Cargo.toml`: `ay`, `tv`, `steam`, `ui`, ...) next to the C core and assembly (`arch/`, `kernel/`, `wayland/`, `nt/`, `wine/`, `wasm/`, `include/ay/sys.h`), built by Clang and LLD (`src/Makefile`); specs in [`docs/native/`](docs/native).
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
- Names are variables: the project, repo, checkout folder, VPS paths, binary and package names come from `tools/identity.toml` (rename = `just identity apply`). "src", "ay" and "aphrody" are never hardcoded where a rename would break them. Upstream and system namespaces (win32, ffmpeg, Linux, POSIX, Chromium, upstream crate and package names) are not ours and never change.
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
- Language by domain, no fanaticism: Rust at the core; Python for ML, AI, big data, research and reverse engineering; Go for containers, self-hosting, deploy and cloud tooling; C/C++ for C/C++ ecosystems (FFmpeg, Blender, VLC, Hyprland, LLVM, WebAssembly); TypeScript only where justified (web UI, Bun-native tooling). Each package declares its language through its own manifest (Cargo.toml, pyproject.toml, go.mod, package.json, CMake/meson); upstream code stays in `third_party/`.

## 5. Gaming and Steam

Ownership map: [`docs/gaming/OWNERSHIP.md`](docs/gaming/OWNERSHIP.md). Rust: `src/steam` (`ay steam`). Bun: `packages/gaming` (`ay gaming`). Plugin and MCP: `apps/rosegriffon/plugins/steam`.
