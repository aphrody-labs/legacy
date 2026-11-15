# Craft: one repository, one workspace, every platform

Owner order (2026-11-15): consolidate every repository of the `storytold` GitHub organization (the Craft apps, `craft-libs` and their forks of egui, wgpu, winit, harfbuzz and others) into one repository with history, built as one Cargo workspace with a shared cache, exposed as a C ABI and full-stack framework to any language, and distributed on every store.

## Decisions

- **Repository:** `aphrody-labs/craft`, a history-preserving monorepo. Each `storytold/<repo>` is first forked into `aphrody-labs` (the fork network keeps the upstream link), then merged into `craft` under its own directory with its full history (`git filter-repo --to-subdirectory-filter <dir>` + `git merge --allow-unrelated-histories`). A sync command re-imports upstream changes per directory.
- **Location in C:\aphrody:** git submodule `apps/craft`. Products live in `apps/`; the platform stays in `src/`, `packages/` and `third_party/`.
- **Layout inside `craft`:**
  - `apps/<name>craft`: the Craft applications;
  - `libs/`: `craft-libs` and the other shared crates;
  - `forks/<name>`: the patched forks (egui, wgpu, winit, harfbuzz, ...), wired through one `[patch]` table;
  - `services/`: `artcraft-services` and the other backends;
  - `legacy/`: repositories with no recent activity, kept with their history, out of the workspace.
- **Workspace:** one root `Cargo.toml`. Dependencies are resolved to the newest published or upstream release at import time (tauri, egui, taffy, wgpu, winit, bevy, ...), and our forks sit on top through `[patch]`. Aphrody crates (`src/*`, including the Bun crates) are path dependencies when built inside C:\src. Release builds use fat LTO; the toolchain and the cache are the ones of C:\aphrody (pinned nightly, sccache backed by the fr1 cache).
- **ABI:** every library exports a C ABI (cbindgen headers next to the crate). Language bindings are generated from it: `bun:ffi` and npm for JS/TS, UniFFI for Kotlin, Swift and Python, C# via the C header. No language is privileged.
- **Desktop and UI:** the shell itself (Material 3, Wayland, WebAssembly, WebGPU targets) is UI and belongs to `aphrody-labs/open` ([open ownership](../../apps/open/docs/roadmap/decisions.md)); `craft` consumes it.
- **Distribution:** one release pipeline (cargo-dist plus per-channel manifests) for Microsoft Store and winget (MSIX), Flathub (Flatpak), Snap, pacman/AUR, apt, crates.io, npm, vcpkg and Play Store. Store accounts and signing keys are created by the owner; the pipeline only reads them from the vault.

## Related consolidations

- Legacy forks and builds scattered across our GitHub organizations, crates.io, npm, the VPSes and this PC: inventoried with their divergence from upstream, then merged into the current code (`docs/audit/legacy-forks.md`).
- Spacedrive (`spacedriveapp/spacedrive`), COSMIC desktop (`pop-os/cosmic-epoch` and its components) and Locally Uncensored (`PurpleDoubleD/locally-uncensored`): forked into `aphrody-labs`, pinned, and mapped to the parts of src or open they replace or extend.
- Every dependency in C:\aphrody that points at a legacy version is moved to the newest published release.

## Phases

1. Fork and import: forks in `aphrody-labs`, `craft` repository with merged histories, `apps/craft` submodule.
2. One workspace: active Rust repositories compile together on fr1 with the shared cache; legacy ones are kept out of the workspace.
3. ABI and bindings: C headers per library, generated bindings, tests per language.
4. Distribution: release pipeline and channel manifests, dry runs first, publication once the owner's store credentials exist.
