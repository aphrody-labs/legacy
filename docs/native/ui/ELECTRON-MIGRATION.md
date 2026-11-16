# Electron migration (`ay electron`): proof run

Crate `system/electron-migrate`, CLI `system/ay/src/electron.rs`, skill `.agents/skills/electron-migrate`. Run date 2026-11-15. Everything here was measured in that run; anything not measured says so.

Hosts: fr1 (build, load average 55 to 100 during the run: builds are slow, timings of builds are not a result), fr2 (hyperfine of the CLI and of the sidecars, load 1), the PC (Windows 11, WebView2, relay hub + agent-desktop). The `ay` workspace build is red on HEAD (other sessions' manifests), so the CLI ran through a harness binary that compiles `system/ay/src/electron.rs` unchanged next to the crate (`ay-electron-check`: Linux release on fr1 and fr2, `x86_64-pc-windows-msvc` through cargo-xwin on nightly-2026-11-13 for the PC).

## Inputs

| App | Source | Electron | Files | Windows | Preloads | IPC channels | Bridges |
|---|---|---|---|---|---|---|---|
| Gemini 1.19.0 | `%LOCALAPPDATA%\Google\Gemini\app-1.19.0` bundle (resources + executable only; no profile data read or copied) | 44.6.0 (version file), Chromium 152.0.7977.130 | 176, 5 195 559 bytes | 14 (1 BaseWindow, 2 BrowserWindow, 11 WebContentsView) | 12 | 90 (+6 dynamic names) | 5 (`geminiNative`, `settingsApi`, `signInAPI`, `stcBridge`, `crashReportingApi`) |
| electron/electron-quick-start | GitHub, commit afcc34c (2026-11-12), `package.json` `electron ^45.2.3` (no Electron 44 sample exists) | 45.2.3 | 13, 19 820 bytes | 1 | 1 | 0 | 0 |

Gemini scan: 16 scripts, 0 parse errors, 1 native module, 2 menus, no tray. `ay electron analyze` mean 304 ms (Gemini) and 6 ms (quick-start); `migrate` 312 ms (Tauri) and 318 ms (GPUI) for Gemini, 9 ms for quick-start (fr2, hyperfine, 10 to 20 runs).

### Gemini renderer is mostly remote web

`src/main.js` is a bundle. The main content window loads `https://gemini.google.com/app` through a variable (`startUrl ?? "https://gemini.google.com/app"`); the scanner only follows literal `loadURL` arguments, so `renderer.remote_urls` is empty for Gemini although the product is a remote web app. What the bundle holds locally is the chrome around it: 12 HTML pages (mini chat, settings, sign-in, top bar, back bar, find bar, loading, offline, permission / display-capture / crash dialogs, update banner) plus shared `assets/`. The migrated project therefore carries only those local pages; the Gemini web UI is not part of any migration output and no account page was opened. The first Tauri window shows the local mini chat page ("Mini chat is coming soon.").

## Mapping: 1:1 / stubbed / unsupported

| Input | Target | Constructs | 1:1 | stubbed | unsupported |
|---|---|---:|---:|---:|---:|
| Gemini | Tauri v3 | 364 | 231 (63.5%) | 107 (29.4%) | 26 (7.1%) |
| Gemini | GPUI | 364 | 46 (12.6%) | 258 (70.9%) | 60 (16.5%) |
| quick-start | Tauri v3 | 16 | 13 (81.3%) | 3 (18.8%) | 0 |
| quick-start | GPUI | 16 | 7 (43.8%) | 9 (56.3%) | 0 |

Gemini by category (1:1 / stubbed / unsupported):

| Category | Tauri | GPUI |
|---|---|---|
| electron-api (122) | 44 / 59 / 19 | 22 / 62 / 38 |
| ipc (96) | 86 / 9 / 1 | 0 / 95 / 1 |
| bridge (62) | 57 / 5 / 0 | 0 / 62 / 0 |
| window-option (26) | 16 / 4 / 6 | 10 / 6 / 10 |
| window (14) | 2 / 12 / 0 | 1 / 2 / 11 |
| preload (12) | 0 / 12 / 0 | 0 / 12 / 0 |
| renderer (12) | 12 / 0 / 0 | 0 / 12 / 0 |
| node (8) | 8 / 0 / 0 | 8 / 0 / 0 |
| app-event (7) | 4 / 3 / 0 | 4 / 3 / 0 |
| menu (3) | 1 / 2 / 0 | 1 / 2 / 0 |
| deep-link, native-module | 1 / 0 / 0, 0 / 1 / 0 | 0 / 1 / 0, 0 / 1 / 0 |

GPUI renders no HTML, so renderer pages, bridges and IPC are stubs behind the wry `webview` feature; Tauri is the target that runs the original renderer.

## Build (fr1, release) and size before / after `optimize`

`before` is the default release profile; `after` is `ay electron optimize --build` (fat LTO, one codegen unit, panic abort, strip; opt-level s for Tauri, 3 for GPUI). The sidecar is the Bun-compiled original main process (`--compile`, then `--compile --minify --bytecode`).

| Build | Host binary before | after | Sidecar before | after |
|---|---:|---:|---:|---:|
| Gemini, Tauri, linux-gnu | 21 130 384 | 6 846 336 (-67.6%) | 155 364 088 | 157 915 896 (+1.6%) |
| quick-start, Tauri, linux-gnu | 12 638 136 | 3 949 024 (-68.8%) | 155 114 232 | 155 421 432 (+0.2%) |
| Gemini, GPUI, linux-gnu | 18 627 808 | 9 138 304 (-51.0%) | 155 364 088 | 157 915 896 |
| quick-start, GPUI, linux-gnu | 18 617 560 | 9 133 184 (-50.9%) | 155 114 232 | 155 421 432 |
| Gemini, Tauri, x86_64-pc-windows-msvc (cargo-xwin) | 11 404 800 | 4 881 408 (-57.2%) | native bun build on the PC: 165 990 400 | 168 560 128 (+1.5%) |

The sidecar is 98% of the install size: it embeds the Bun runtime (155 to 166 MB). `--bytecode` adds 0.3 to 2.6 MB. Replacing the embedded runtime is the open size lever (see "Not done").

### Bun flags (cited)

`bun --version` 1.4.5, `bun build --help` on fr1 (2026-11-15):

- `--compile`: "Generate a standalone Bun executable containing your bundled code. Implies --production"
- `--minify`: "Enable all minification flags"
- `--bytecode`: "Use a bytecode cache"
- `--format=<val>`: "Defaults to esm, or cjs with --bytecode" (hence no top-level await in `sidecar/main.ts`)
- `--root=<val>`: "Root directory used for multiple entry points" (used by `build:frontend`, see fixes)
- `--compile-executable-path=<val>`: "Path to a Bun executable to use for cross-compilation instead of downloading"

`bun build --compile --target=bun-windows-x64` does not download on 1.4.5 ("bun-windows-x64-v1.4.5 is not available for download"); with the PC's `bun.exe` as `--compile-executable-path` `--compile` works but `--compile --bytecode` fails (`InvalidBuiltinsSection`), so Windows sidecars were compiled by Bun on the PC itself.

### Sidecar cold start (fr2, `hyperfine -N --warmup 3 --runs 40`, stdin closed, page cache warm)

Process start to exit on EOF, no UI.

| Sidecar | `--compile` | `--compile --minify --bytecode` | Max RSS before / after |
|---|---:|---:|---|
| quick-start | 17 +/- 5 ms | 13 +/- 4 ms | 38.8 / 38.6 MB |
| Gemini | 71 +/- 16 ms | 36 +/- 10 ms | 57.0 / 57.3 MB |

## Windows proof (PC, WebView2)

PLACEHOLDER_WINDOWS

## Fixes found by this run (all with tests, `cargo test -p aphrody-electron-migrate`: 20 tests)

1. Pages that reference files outside their own directory (`../../assets/spark.svg`, CSS `url()`) lost them: `bun build` failed on Gemini. `renderer.outside_refs` records them and `renderer_root` widens `frontend/` (Gemini: root becomes the bundle root, pages at `frontend/src/<page>/`).
2. `bun build` keeps the path below the lowest common directory of the entry points, so the window url `src/minichat/minichat.html` was missing from `dist/` (the first PC launch showed "asset not found: src/minichat/minichat.html"). `build:frontend` now passes `--root frontend`.
3. `optimize --build --json` printed bun and cargo output on stdout next to the JSON report; child output now goes to stderr.
4. hyperfine 2.x (schema_version 2, `summary.time_wall_clock`) parsed as 0 ms; both JSON schemas are read and a missing mean is an error.
5. WebView2 ignores `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` once the host passes its own arguments (wry does), so `--remote-debugging-port` never opened and `bench` could not see a page. The generated `main.rs` forwards the variable through `additional_browser_args` on Windows.
6. `scripts/electron-proof-desktop.ts` captures one accessibility tree and screenshot per window (an app with several windows is `AMBIGUOUS_TARGET` without `window_id`).

## Not done

- No runtime or visual verification of the Linux builds (no display on fr1/fr2 for WebKitGTK/GPUI; sizes only). No GPUI run anywhere.
- Gemini main web UI (remote `gemini.google.com/app`) is not migrated and the scanner does not report it (`remote_urls` empty); sign-in and account flows are untested by design.
- 107 (Tauri) and 258 (GPUI) constructs are scaffolds; 26 and 60 have no equivalent (`MAPPING.md` lists each).
- The Bun runtime inside the sidecar (155 MB) is not reduced: `--trim` is unavailable, `--aot` was not tried.
- PGO (`scripts/pgo.ts`) generated, never run.
- `optimize` before/after for GPUI lists the host binary twice (target dir probed twice).
- Cold start numbers are warm-cache (the OS file cache is not dropped); Electron IPC round trip is n/a for quick-start (no bridge to call).
- The `ay` binary itself was not rebuilt: workspace red on HEAD.
