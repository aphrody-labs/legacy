# AGENTS.md

Contract for every agent CLI. Spec and work order: [`docs/native/ROADMAP.md`](docs/native/ROADMAP.md). Repo, folder, binary and scope names come from [`tools/identity.toml`](tools/identity.toml).

## Sources of truth
- The only third-party code and sources of truth in the tree are `third_party/linux` and `third_party/chromium`. Everything else (other upstreams, sites, repos) is ideas and inspiration, never a pin or a dependency.
- Vision: [storytold/craft-anything](https://github.com/storytold/craft-anything).
- Stack: [zed-industries/zed](https://github.com/zed-industries/zed). UI: one gpui-os (our Zed fork, worked by the agy CLI session) unifying GPUI, the kit, native shell, taffy and wgpu for web, mobile and desktop (LTO, AOT); Dioxus and GPUI work together on it, sharing deduplicated dependencies (taffy, wgpu, winit, text and layout crates); src/ui and other UI stacks converge on it.
- Design, UI and UX: [design.google](https://design.google/).
- Architecture, philosophy and core: [kernel.org](https://www.kernel.org/).
- Ultimate goal: [GNU software](https://www.gnu.org/software/software.html), [uutils](https://uutils.org/), [AOSP](https://android.googlesource.com/), [Chromium](https://chromium.googlesource.com/chromium/src.git).
- Rust references: Rust for Linux, Rust in Chromium, Rust in AOSP. depot_tools is rewritten in Rust; Bun is purified to leave JS/TS behind and move to Rust, C and C++.
- Style: the [Google style guides](https://google.github.io/styleguide/), rethought for AOT, LTO and LLVM.

## What
- Aphrody is an AI OS with self-hosted Google services (Gemini, Google APIs and apps, Chromium, A2A, local inference...); those packages and crates are features, never legacy to purge.
- Core: `ay` is Bun built from its fork without JSC and WebKit, plus the Unix userland (bash, coreutils, binutils), a universal TS/JS, bash and Rust runner, and modules and extensions through crates.io and npm (AOT, LTO).
- Around it: the platform (OS layers, deploy, the fleet as one server, agents) and the front ends (web, CLI, TUI, GUI, mobile) built on the `open` and `auto` libraries.
- Ecosystem apps and frameworks on that core: games (Bevy fork with Steam and Epic), the Craft Apps, media.
- Layout follows Bun ([`docs/project/layout.md`](docs/project/layout.md)): `src/` Rust and C, `packages/` libraries by language manifest, `apps/` (`web`, `auto`, `nt`; `open` is its own repo; `shenron` and `rosegriffon` are separate products checked out next to this repo, not part of it), `build/` (CI, images, SDK pins), `device/` (fleet, cluster, OS images, cloud, deploy), `prebuilts/` (`ay up` pins), `tools/` (agents, upstream, identity), `third_party/` (pins in `src.lock.json`).

## How
- "Purge legacy" means fixing legacy errors, deleting dead code and modernizing old architecture; it never removes a feature or causes a regression.
- No human in the loop: decide, execute, prove, report done, not done and failed. No approval gates, blocking warnings or slow backups.
- Everything on `main` through `bun scripts/commit.ts`; never stash, reset, branch or use worktrees.
- Upstream first at the newest canary, nightly or rc; assemble, never reinvent; dedupe.
- Language by domain: Rust core; Python for ML, AI, data, research and RE; Go for containers, deploy and cloud tooling; C/C++ for C/C++ ecosystems; TypeScript only where justified, on Bun.
- Nothing hardcoded or frozen: values from live sources or discovery, names from identity; upstream namespaces (win32, ffmpeg, Linux, crates, packages) never change.
- Rust builds on fr1 or CI, tests on fr2, production only on prd; no Rust build on the PC.
- Use the skills, MCP servers, CLIs and upstream docs; verify every claim you rely on in CLAUDE.md, memory, skills and docs, and fix what is wrong.
- Proof is a screenshot, a checked API response or a real UI test, never an HTTP status.
- Showcase sites: user language, real imagery, motion and content. Docs: short, generated indexes. Scripts and infra: short, declarative, upstream tools.

## Limits
- Secrets are never printed, logged or committed; the repo is public; no personal data.
- Licenses never decide anything. No emoji, no AI attribution. `C:\Windows\System32` is never modified.

## Antigravity and Gemini CLI
- Both read this file: `.gemini/settings.json` sets `context.fileName` to `AGENTS.md` (Gemini CLI settings reference, `context.fileName`: string or array); there is no separate `GEMINI.md`.
- `frameworks/ai-os` is the sole AI and MCP owner. MCP over stdio: `ai-os relay mcp-stdio` (`frameworks/ai-os/src/relay/cli.ts`); over HTTP: the relay `POST /mcp` (`frameworks/ai-os/docs/RELAY.md`). Providers and models are discovered at run time, never hard-coded.
- Antigravity `PreToolUse` hooks are disabled (`{}` in `.agents/hooks.json`); GitHub auth runs through the `aphrody-labs` GitHub App (`tools/agents/gh-token.ts`).
- Run `bun fmt`, `bun check` and the affected `bun test` (a package, never bare `bun test` at root). Use `graphify` first when `graphify-out/` exists.
