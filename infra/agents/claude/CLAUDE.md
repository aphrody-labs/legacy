# Global
- Direction of Aphrody (checkout named by tools/identity.toml): the core is `ay`: Bun built from its fork without JavaScriptCore and WebKit, with the Unix userland in their place (bash, coreutils, binutils...), a universal runner for TypeScript/JavaScript, bash and Rust, and a module and extension system with Cargo/crates.io and Bun/npm built in (AOT, LTO). Around it: the platform (OS layers, deploy, the fleet as one server, agents) and the front ends (web, CLI, TUI, GUI, mobile) consuming the `open` and `auto` libraries. Ecosystem apps and frameworks consume that core: our Bevy fork assembled with Steam and Epic Games is one, the Craft Apps another, media (`src/tv`) another; spec in docs/native/ROADMAP.md. Free UI framework if the rendering is beautiful, optimized and functional. Agents are free, with no human in the loop; everything is published once the secret scan is clean.
- Answer in the user's language, one sentence max, factual, no emoji/preamble/recap/AI slop; tokens go to code. No questions or confirmations: decide, execute, install/edit/delete what the task needs (CLIs, skills, MCP, plugins) without user intervention.
- Generalist, nothing hardcoded: no fixed pick of framework, language, OS or natural language. Source language comes from config (default English); user-facing text goes through the i18n stack each project already uses, detected from its manifests; locales are the catalogues present; machine translation uses whatever model ai-os discovers at run time (local first).
- Purge without archive (no .bak/zip); the history is git. Single location: C:\aphrody (labs, nt, tv merged on 2026-11-13); otherwise C:\msys, VPS, git.
- Fleet: fr1 = gas factory (builds, CI, training, heavy agents); prd (USA) = clean production backends; fr2 = test, lint, benchmark, sync, research and experimentation, used without limits (edge services stay up). Everything survives reboot/crash; agents run as full root.
- Validation: every src deliverable is submitted to Gemini 4 Carbon High (gemini.google.com via claude-in-chrome); verdict archived in the repository.
- Git: everything directly on main, never worktrees or branches.

## Truth
- End of 2026, knowledge is stale: no version/API/feature/date without a source seen in the session (vendor + commit, Microsoft Learn MCP, live API, `gh api`); report conflicts.
- Microsoft: skill `microsoft`. This PC: skill `windows-machine` (profile older than 7 days = regenerate).
- Check what exists (C:\aphrody, ~/.local/bin, justfile, installed version) before writing or installing.

## Method
- Sub-agents: one per long, independent workstream, in parallel when the owner asks. Targeted reads, filtered outputs.
- Native tools, ranked in docs/tools/CLI-LIBS.md: rg, fd, jaq, sd (not sed), dua (not du), xh (not curl), eza, hyperfine, b3sum; dedicated Read/Grep/Glob/Edit first; absolute paths, never `cd`; pwsh only for CIM/registry/Authenticode.
- Learning: the hook logs to ~/.claude/learning; skill `learn` distills them into memories/skills.

## Stack
- Language by domain, no language fanaticism: Rust at the core; Python for ML, AI, big data, research and reverse engineering; Go for containers, self-hosting, deploy and Google/cloud tooling (rclone, gcloud); C/C++ where the ecosystem is C/C++ (FFmpeg, Blender, VLC, Hyprland, LLVM, WebAssembly). TypeScript only where it is justified (web UI, Bun-native tooling), on Bun (skill `bun`), with no third-party tool that Bun replaces.
- Rust: pinned nightly; windows-rs (repo) + windows-bindgen.
- Native: LLVM toolchain shared with Chromium (clang/clang-cl, lld, rustc on the same LLVM, cross-language LTO). C++23 + import std.
- .NET 11 (apps, NativeAOT), 10+11 (libs); no legacy (FXC, Mono, VSTest, .sln). No Azure.
- LSP: clangd, rust-analyzer, typescript.
- Cloudflare: `cf` CLI (except projects with Wrangler config); `cf cli search "<task>"`, `--dry-run` before execution.
