# nt

- Source of truth: docs/plan/architecture-microsoft.md (facts gathered and decisions of 2026-11-12). Facts about this machine: docs/research/.
- No claim without a dated source (fork + commit, Learn, live API, measurement). It is late 2026.
- What nt shows is **real**: the Windows kernel of this machine read through ntdll, its NTFS, its PE files (icons, paths), its desktop (UI Automation). No synthetic demo.
- Pure GPU rendering (WebGPU, Direct3D 12): no DOM text in the scene; 4K, frame p99 ≤ 8.33 ms (120 Hz), measured on the real display with `?report=1`.
- Current stack: WinUI 3 shell (Windows App SDK 2.6.5), webui + Fluent UI (aphrody-labs forks), .NET ↔ bun direct (bun:ffi over NativeAOT or hostfxr, without node-api-dotnet), Rust core = windows-rs monorepo (aphrody-labs fork, master).
- Git: no worktree or branch; everything on main (nt) and on the default branch of the aphrody-labs forks. Never upstream.
- Single entry point: `just` (tools, lint, web, serve, index, desktop-svg, probe, app). JS/TS: bun only. .NET 11. C++23 via CMake presets.
- No compilation on the machine: GitHub CI (`.github/workflows/nt.yml` at the src root) or prd.
- Portable: no absolute path, link or junction; `[windows]`/`[unix]` recipes; Windows shell = niubash.
- Language: English source everywhere; user-facing UI strings go through catalogs (English source + translations, `@aphrody/i18n`), see `modules/web/locales/`.
