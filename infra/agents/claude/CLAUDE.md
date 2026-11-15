# Global
- Direction of src: open-source game engine and creative suite (Bevy, Craft Apps, crates/tv-*, Unreal via interop), plan in C:\src\docs\games\PLAN.md. Free UI framework if the rendering is beautiful, optimized and functional. Agents are free, with no human in the loop; everything is published once the secret scan is clean.
- Answer in English, one sentence max, factual, no emoji/preamble/recap/AI slop; tokens go to code. No questions or confirmations: decide, execute, install/edit/delete what the task needs (CLIs, skills, MCP, plugins) without user intervention.
- Language: English is the only source language (code, identifiers, comments, docs, commits, CLI output, skills). User-facing text goes through i18n (Paraglide JS + inlang for TS, @angular/localize for Angular, Fluent + ICU4X for Rust, ARB gen-l10n for Flutter, Compose resources for Android); translations machine-drafted locally with TranslateGemma, never hand-written French in source.
- Purge without archive (no .bak/zip); the history is git. Single location: C:\src (labs, nt, tv merged on 2026-11-13); otherwise C:\msys, VPS, git.
- Fleet: fr1 = gas factory (builds, CI, training, heavy agents); prd (USA) = clean production backends; fr2 = test, lint, benchmark, sync, research and experimentation, used without limits (edge services stay up). Everything survives reboot/crash; agents run as full root.
- Validation: every src deliverable is submitted to Gemini 4 Carbon High (gemini.google.com via claude-in-chrome); verdict archived in the repository.
- Git: everything directly on main, never worktrees or branches.

## Truth
- End of 2026, knowledge is stale: no version/API/feature/date without a source seen in the session (vendor + commit, Microsoft Learn MCP, live API, `gh api`); report conflicts.
- Microsoft: skill `microsoft`. This PC: skill `windows-machine` (profile older than 7 days = regenerate).
- Check what exists (C:\src, ~/.local/bin, justfile, installed version) before writing or installing.

## Method
- Sub-agents: one per long, independent workstream, in parallel when the owner asks. Targeted reads, filtered outputs.
- Native tools, ranked in docs/tools/CLI-LIBS.md: rg, fd, jaq, sd (not sed), dua (not du), xh (not curl), eza, hyperfine, b3sum; dedicated Read/Grep/Glob/Edit first; absolute paths, never `cd`; pwsh only for CIM/registry/Authenticode.
- Learning: the hook logs to ~/.claude/learning; skill `learn` distills them into memories/skills.

## Stack
- JS/TS: bun only (skill `bun`), no third-party tool that bun replaces.
- Rust: pinned nightly; windows-rs (repo) + windows-bindgen.
- Native: LLVM toolchain shared with Chromium (clang/clang-cl, lld, rustc on the same LLVM, cross-language LTO). C++23 + import std.
- .NET 11 (apps, NativeAOT), 10+11 (libs); no legacy (FXC, Mono, VSTest, .sln). No Azure.
- LSP: clangd, rust-analyzer, typescript.
- Cloudflare: `cf` CLI (except projects with Wrangler config); `cf cli search "<task>"`, `--dry-run` before execution.
