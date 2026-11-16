---
name: electron-migrate
description: Analyze an Electron app (app.asar + .unpacked, Electron version and fuses, windows, preloads, IPC channels, contextBridge, Node APIs, natives, protocols, menus, tray, updater, deep links), migrate it to Tauri v3 (aphrody-labs/tauri fork) or GPUI with a Bun sidecar, tune the generated project (fat LTO, PGO, bun --compile --minify --bytecode) and bench it against the original. Use for `ay electron`, the electron MCP tools, or src/electron-migrate.
---

# Electron migration (`ay electron`)

Crate `src/electron-migrate` (package `aphrody-electron-migrate`, layer 4), wired by `src/ay/src/electron.rs`. ASAR parsing is `aphrody_re::asar`; version and fuses are `aphrody_re::electron`.

Proof run, measured numbers, 1:1 / stubbed / unsupported tables and open items: [docs/native/ui/ELECTRON-MIGRATION.md](../../../docs/native/ui/ELECTRON-MIGRATION.md).

## CLI

- `ay electron analyze <app dir|install dir|app.asar> [--out manifest.json] [--node-modules]`: JSON manifest (schema `ay-electron-manifest/1`). Version order: `version` file, executable bytes, package.json range. Every fact has `confidence` (`resolved` through the scope-aware alias table, `heuristic` by distinctive name such as `ipcMain` when a bundler hid the import). `limits` lists what a static scan cannot know (dynamic channel names, bytenode, webpack externals).
- `ay electron migrate --to tauri|gpui <input> --out <dir> [--no-sidecar-app] [--json]`: project, `frontend/`, `shim/electron-compat.ts` (window.<bridge> over invoke/listen), `sidecar/` (Bun project that runs the original main process under an `electron` shim, newline JSON over stdio), `MAPPING.md`, `coverage.json`, `manifest.json`. Statuses: `1:1` emitted and working, `stubbed` scaffold needing review, `unsupported` no equivalent.
- `ay electron optimize <project> [--opt-level 3|2|1|s|z] [--build]`: `[profile.release]` (lto fat, codegen-units 1, panic abort, strip symbols), `scripts/pgo.ts`, `scripts/build-sidecar.ts` with `--compile --minify --bytecode` (checked against `bun build --help`), `optimize-report.json` with sizes.
- `ay electron bench --electron <exe> --migrated <exe> [--ipc-expr-electron <js>] [--runs N] [--out r.json]`: hyperfine cold start (launch to first committed page over CDP), RSS of the process tree, sizes, IPC round trip; Markdown table, JSON with `--json`. WebKitGTK has no CDP: `--ready alive`.

## Pins (generator constants, `src/electron-migrate/src/tauri.rs` and `gpui.rs`)

- Tauri: aphrody-labs/tauri `v3` rev `271c15e1eaebb8e12aac8c4e63eead1ff17fd93a` (3.0.0-alpha.6), applied through `[patch.crates-io]`; plugins from tauri-apps/plugins-workspace `v3`; npm `@tauri-apps/api` `^3.0.0-alpha.3`. v3 takes the runtime as a value: `Builder::default().runtime(tauri_runtime_wry::Wry::default())`.
- GPUI: aphrody-labs/zed `main` rev `2de90a45a393db5f5e7dc64eceaaaa2fbdd5dfb4`; `gpui_platform::application().run`, menus through `cx.set_menus`. GPUI renders no HTML: the `webview` feature hosts the renderer in wry (stubbed).
- Cargo rejects `branch` together with `rev`: manifests pin the rev only. Re-verify pins before trusting them.

## Traps

- `bun build --bytecode` emits CommonJS: no top-level await in `sidecar/main.ts`. `--trim` is not supported by Bun 1.4.5 builds without a trim table.
- Linux lists threads as processes: RSS sums skip `thread_kind().is_some()`.
- Generated `tauri::generate_context!` needs `src-tauri/icons/icon.png` (copied from the app, else a generated placeholder), `shim/electron-compat.js` (`bun run build:shim`), `dist/` and `binaries/electron-main-<triple>` before `cargo check`.
- Build and test on fr1 only (`env -C <scratch> cargo ...`, `RUSTC_WRAPPER=`); the only app data read is the bundle (resources + executable), never profile data.

## MCP (relay hub, server `electron`)

`hub_call` with `electron__electron_analyze` (input, node_modules), `electron__electron_migrate` (to, input, out, no_sidecar_app), `electron__electron_optimize` (project, opt_level, build), `electron__electron_bench` (electron, migrated, runs, ipc_expr_electron, ready). Server: `frameworks/ai-os/src/relay/electron-mcp.ts`, declared by `[[hub.mcp]] electron` in `tools/agents/toolchain.toml`; it runs `ay electron ...` (`AY_BIN` overrides the binary).
