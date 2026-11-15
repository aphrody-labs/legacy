# Spacedrive, COSMIC and Locally Uncensored: fork, pin, map

Status 2026-11-15. Forks and pins exist; no first-party code is deleted or rewritten (the first-party audit, `docs/audit/first-party.md`, is under owner review). Principles: assemble rather than reinvent, generalist (every part is a registry row or adapter, not a fixed pick), licenses decide nothing (recorded for the owner, never a gate).

## 1. Forks and pins

Mechanism: `src.lock.json` (path, url = fork, `upstream_url`, commit, branch, remotes origin and upstream) plus the matching `DEPS` line (`url@sha`) plus `third_party/forks.txt`. A fresh fork equals upstream, so each pin is the upstream head. No new submodules. `ay manifests` was not run (it rewrites the whole lock); entries were inserted by text.

| Upstream (head resolved 2026-11-15 via `gh api` / `git ls-remote`) | Fork | Pinned sha |
|---|---|---|
| spacedriveapp/spacedrive `main` (2026-11-14T13:09Z) | aphrody-labs/spacedrive | 4a1fa9ed50c4 |
| spacedriveapp/zed branch `spacedrive` (GPUI fork; rev in spacedrive Cargo.toml) | aphrody-labs/zed-spacedrive (name `zed` was taken by the zed-industries fork) | e0931d5a9dbf |
| jamiepine/specta `main` (git dependency of spacedrive core) | aphrody-labs/specta | 9bfc2a4e3ec1 |
| PurpleDoubleD/locally-uncensored `master` (2026-11-14T13:19Z); was pinned to upstream at 3dff4291 | aphrody-labs/locally-uncensored | dfe45f019127 |
| pop-os/cosmic-epoch `master` (2026-10-20) | aphrody-labs/cosmic-epoch | e98f8289a22f |
| pop-os/libcosmic `master` (2026-11-13) | aphrody-labs/libcosmic | dfc68d1e1a1f |
| pop-os/cosmic-comp `master` (2026-11-12) | aphrody-labs/cosmic-comp | f2beba6eccb7 |
| pop-os/cosmic-protocols `main`, cosmic-text `main` (comp and apps depend on both by git/crate) | cosmic-protocols, cosmic-text | 815b2c5df84a, b07cb90a872c |

Other COSMIC components, all from the `.gitmodules` of cosmic-epoch, pinned at their default-branch head: cosmic-session 3fe5d42eda0c, cosmic-panel 160a951c8c05, cosmic-applets ecb6b61986f9, cosmic-app-library (upstream cosmic-applibrary) 90c399d882e7, cosmic-launcher 29c1bac5e8f9, simple-wrapper 95db0daff42a (branch `master_jammy`), cosmic-settings 6aaf30d69ec3, cosmic-settings-daemon a8d9d84cd1c1, xdg-desktop-portal-cosmic 2d701019e9c6, cosmic-osd 552753febb27, cosmic-bg 243990320904, cosmic-workspaces-epoch cb953ea0e6fb, cosmic-notifications 6131f80143b9, cosmic-icons f1a282a0822a, cosmic-greeter 20af06335800, cosmic-screenshot 45549f7e940d, cosmic-edit e14ce78d5add, cosmic-term b209f70c3f0a, cosmic-randr f1a97655c97e, cosmic-files 2c20e74a0bd0, cosmic-store 377ed6b88a91, cosmic-wallpapers da595bba495c, cosmic-idle 6d6f07af60bb, cosmic-player 34a41f247a37, cosmic-initial-setup 58d0e4c837dd, cosmic-monitor 2f5aa4d6a8c8, cosmic-sound-theme bf5335fe1af0, cosmic-osk 6b146a2b0a23, cosmic-viewer 300210f1c7d8, pop-launcher (upstream pop-os/launcher, fork renamed) 4111617b7345. Total 35 COSMIC forks; all are `aphrody-labs/<name>` with parent `pop-os/<name>`.

Already present and kept: `third_party/smithay` (still pinned to upstream Smithay/smithay 3a08ff96; fork aphrody-labs/smithay exists, re-point is step 1 below), `aphrody-labs/iced`, `wgpu`, `winit`, `softbuffer`, `third_party/zed`, `third_party/gpui-kit` (a duplicate fork of longbridge gpui-kit created by mistake was deleted at once). Not forked: other spacedriveapp repos (spaceui, spacebot, prisma/rspc forks) are not git dependencies in the root or core Cargo.toml.

## 2. Spacedrive

Upstream shape (`core/src`: library, volume, ops, filetype, crypto, domain, infra, service, device, cqrs; `crates/`: fs-watcher, task-system, store, images, imageio, ffmpeg, media-metadata, photos, archive, sidecar-path, supervisor, pvcache, actors, job-derive, sdk, sd-client; `apps/`: cli, server, tauri, mobile, native, web; GPUI via the zed fork). 2.0 beta is announced for 2026-11-15 (README), Linux and macOS first.

Ours: `src/lore/*` (storage, fuse, revision, server, client, capi; upstream mirror of EpicGames/lore), `src/depot/cas` (FastCDC and blake3, used by cipd/gclient), `packages/vault` and `src/vault` (secrets), `packages/env-kit` (sync of env/editor/agent state).

| Spacedrive part | Replaces or extends | Owner |
|---|---|---|
| VDFS library, volumes, devices, ops, cqrs, sync | Extends: no first-party file-library or multi-device index exists; lore is a VCS, not a library. Both hash with blake3, so lore-storage and `src/depot/cas` become the content store under the Spacedrive library | C:\aphrody |
| fs-watcher, task-system, store, supervisor, archive, sidecar-path | Extends the indexing and job layer; candidates to replace the ad hoc watchers and job runners in `src/depot` and `packages/*` after an inventory | C:\aphrody |
| images, imageio, ffmpeg, media-metadata, photos | Media pipeline for the creative suite | aphrody-labs/craft |
| tauri, mobile, native, web, GPUI front ends, extension-ui | File manager UI and shells | open |
| specta, zed-spacedrive (GPUI fork) | Typed bindings; the GPUI rev is a patch stack on top of zed, to rebase on `third_party/zed` | C:\aphrody (pins), open (use) |

Merge steps:
1. Add `third_party/spacedrive`, `specta`, `zed-spacedrive` as `[patch]` sources of one cargo workspace and run `cargo check -p sd-core` on fr1 (fr1 only; heavy build).
2. Wire the Spacedrive content store to `src/depot/cas` and lore-storage through a thin adapter crate; no edits to the lore mirror.
3. Record the `spacedrive` branch patches of zed-spacedrive in `infra/upstream/stacks.d/` and rebase them onto `aphrody-labs/zed` main; drop the duplicate pin when the stack applies cleanly.
4. Inventory file-watch, job, and sync code in src against `fs-watcher`, `task-system`, `store`; add rows to the first-party audit before any deletion.
5. Hand `apps/*` and the GPUI front ends to open; hand `images`/`ffmpeg`/`media-metadata`/`photos` to craft.

## 3. COSMIC desktop

Ours (audit rows): `src/wayland/smithay` (crate `smithay-wayland-wire`, first-party wire layer for WSLg with Hyper-V socket and D3D12 dmabuf mapping; audit: replace with Smithay/smithay for wire and state, keep a thin transport crate), `src/wayland/cosmic` (crate `cosmic-compat`, no shared code with cosmic-comp; audit: merge into `src/posix/wslg`), `src/wayland/tiler` (Hyprland-style; keep), `src/wayland/gamescope`, `src/posix/wslg`. `cosmic-comp` itself depends on `smithay` 0.7.0, `cosmic-protocols`, `cosmic-text` 0.19 and libcosmic crates, so one Smithay lineage serves both.

| COSMIC part | Replaces or extends | Owner |
|---|---|---|
| cosmic-comp, cosmic-protocols, cosmic-settings-daemon (config crates), cosmic-randr, cosmic-idle, cosmic-osd, xdg-desktop-portal-cosmic | Replaces `cosmic-compat` and the compositor logic of `smithay-wayland-wire`; keeps tiler as an alternative layout engine | C:\aphrody |
| cosmic-session, cosmic-greeter, cosmic-initial-setup, cosmic-bg, cosmic-notifications, cosmic-panel, cosmic-workspaces-epoch, cosmic-launcher, pop-launcher, cosmic-app-library, cosmic-applets, cosmic-settings, cosmic-screenshot, cosmic-osk | Desktop session and shell; extends (nothing equivalent in src) | C:\aphrody (session, system daemons), open (shell UI) |
| libcosmic + iced fork, cosmic-text | UI toolkit and text layout; overlaps open's Material 3 stack, so it enters as one adapter in open's registry, not a pick | open |
| cosmic-files, cosmic-term, cosmic-edit, cosmic-store, cosmic-player, cosmic-viewer, cosmic-monitor | Reference desktop apps; cosmic-files is the model for the Spacedrive file manager front end | open |
| cosmic-icons, cosmic-wallpapers, cosmic-sound-theme | Assets | open |

Merge steps:
1. Re-point `third_party/smithay` to `aphrody-labs/smithay` (cosmic-comp requires smithay 0.7.0; check the fork head against it first); keep only `hyperv` + `dx12` transport in `src/wayland/smithay`, deleting wire/state after the audit verdict.
2. Fold `src/wayland/cosmic` into `src/posix/wslg` (audit row), then swap its theme/tiler glue for `cosmic-protocols` and `cosmic-settings-daemon` config crates.
3. Build `cosmic-comp` + `cosmic-session` on fr1 (Linux target) against the pinned forks via `[patch]`; run it under the existing WSLg replacement as the first real session (audit: WSLg is WIP until a real session runs).
4. Pin `aphrody-labs/iced`, `wgpu`, `winit` the same way (forks exist, lock entries do not) so libcosmic resolves to our forks, then give libcosmic and cosmic-text to open as an adapter row.
5. Track upstream through `infra/upstream/stacks.d/` with `ay upstream status`; patch stacks only where we diverge.

## 4. Locally Uncensored

Upstream: Tauri + React desktop app (`src`, `src-tauri`, `mobile-client`, `COMPUTER-CONTROL.md`, `VOICE.md`) bundling chat, image and video generation, coding agent and agent mode over local backends. README states AGPL v3 (recorded for the owner; not a gate).

Ours: `packages/ai-os` (relay, router, llm, providers, orch, nhitl, brain, term) and open's local-first inference. Ownership rule: AI routing and inference belong to open; src keeps relay, nhitl, orch and the agent context store.

| Locally Uncensored part | Replaces or extends | Owner |
|---|---|---|
| Local model discovery, provider adapters, ComfyUI image/video flow | Extends open's inference registry (rows, not hardcoded picks); not added to `packages/ai-os/src/router` | open |
| Coding agent, agent mode, computer control, voice | Compare with `ai-os` orch/nhitl and open's agent surfaces; keep the better, delete the duplicate after audit | open (surface), C:\aphrody (orch, nhitl) |
| Tauri shell, React UI | Reference UI; open rebuilds it on Material 3 | open |
| Image/video generation pipeline | Feed for the creative suite | aphrody-labs/craft |

Merge steps:
1. Diff the provider/model catalog in LU's own `src/` against `packages/ai-os/src/router/catalog.ts`; export the delta as registry rows to open (no edits to the router in src).
2. Map the ComfyUI and Ollama-style local backends to open's inference adapters; add tests there.
3. Port LU's agent safeguards (diff-first coding review) into nhitl/orch only if the audit lacks an equivalent.
4. Pin stays at `third_party/locally-uncensored` (now the fork); re-sync with `git fetch upstream`.

## 5. Top merge steps (ordered)

1. Smithay re-point and transport-only `src/wayland/smithay`.
2. `cosmic-compat` into `src/posix/wslg`, then cosmic-protocols for the glue.
3. One cargo workspace on fr1 with `[patch]` forks (spacedrive, specta, zed-spacedrive, libcosmic, iced, wgpu, winit, smithay).
4. Spacedrive library over lore-storage and `src/depot/cas`.
5. Locally Uncensored catalog delta and COSMIC/Spacedrive UI hand-off to open; media crates to craft.
