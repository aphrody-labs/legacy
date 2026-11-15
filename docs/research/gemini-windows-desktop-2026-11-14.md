# Gemini Windows desktop: inventory and test results (2026-11-14/15)

Method: pwsh `Get-AuthenticodeSignature` / `Get-CimInstance`, rea (relay hub), `scripts/asar-list.ts` (read-only ASAR header), agent-desktop. No profile data, cookie or token was read or copied.

## Variants

| Variant | Present | Facts |
|---|---|---|
| Gemini (Electron, Squirrel-style) | yes, running | `%LOCALAPPDATA%\Google\Gemini\app-1.19.0\`; GEMINI_BUILD_INFO: channel=prod, version=1.19.0, arch=x64; `version` file = 44.6.0 (Electron); AUMID `com.google.gemini.windows` |
| Antigravity (Electron) / IDE | yes, running | `%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe` (not analysed further) |
| `GeminiSetup.exe` | running | `C:\src\var\GeminiSetup.exe` (downloaded installer, parent pid 28016) |
| gemini-api.exe | yes | `%LOCALAPPDATA%\Programs\gemini-api\gemini-api.exe`, 18 182 656 bytes, NotSigned, no file version, dated 2026-10-30; no reference in C:\src docs/ai-os/scripts/infra (origin unknown) |
| `Get-AppxPackage *gemini*` / `*google*` | none | no packaged app is installed; the AppID `com.google.gemini.windows` is only the Electron AUMID |
| `C:\Users\aphro\google\dist\win32-google-apps\*.exe` | does not exist | `C:\Users\aphro\google` is absent; no reference to `GoogleGeminiWin32` or `win32-google-apps` anywhere in C:\src. The "local wrapper" premise is false on this machine (2026-11-15) |

## Gemini 1.19.0 (the real app)

- Signer: all three binaries `Valid`, CN=Google LLC (Mountain View, serial 3582691): Gemini.exe (246 783 128 bytes, ProductVersion 44.6.0, sha256 25764acf...109d), GeminiAppLauncher.exe (1 395 352 bytes), GeminiCrashpadHandler.exe (1 526 424 bytes).
- Process model (command lines): launcher `GeminiAppLauncher.exe` (pid 36732, pipe `\\.\pipe\Google.Gemini.AppLauncher`, RegisterHotKey, tray icon) spawns Crashpad; `Gemini.exe` main + `--type=gpu-process`, `--type=utility network.mojom.NetworkService`, 2x `--type=renderer --app-user-model-id=com.google.gemini.windows`, crashpad-handler (`--url=https://clients2.google.com/cr/report`). User data dir `%APPDATA%\Gemini`. Sandbox enabled, schemes `app`.
- Transport: Chromium-based Electron (not WebView2). `src/main.js` in `resources/app.asar` loads `https://gemini.google.com/app`; sign-in `https://accounts.google.com/AccountChooser`; metrics `https://play.google.com/log`; crash `https://clients2.google.com/cr/report`.
- ASAR (sha256 95bf69b7...b64): 176 files, 5.2 MB (src 163, assets 12). Preloads exposing contextBridge APIs: `geminiNative`, `settingsApi`, `signInAPI`, `stcBridge`, `crashReportingApi`. IPC channels in main.js: `gemini:get-app-version`, `get-local-device-id`, `notify-turn-lifecycle`, `renderer-error`, `log`, `get-cached-flags`, `sync-experiment-flags`, `poll-web-flags`, `get-app-logs`, `reload`, `get-crash-annotations`; `stc:*` (`update`, `audio-data`, `accept`, `cancel`, `log`, `localized-strings`). No MCP or extension-host string found (regex `MCP|ModelContext`: no match). `remote-debugging-port` string present in main.js (not enabled by default).
- Electron fuses (rea `inspect_electron_fuses`): RunAsNode off, EnableCookieEncryption on, NodeOptionsEnvVar off, NodeCliInspect off, EmbeddedAsarIntegrity off, OnlyLoadAppFromAsar on, BrowserSpecificV8Snapshot off, FileProtocolExtraPrivileges off, WasmTrapHandlers on.
- Launcher imports (rea `inspect_pe_imports`, 9 DLLs): USER32 (38, RegisterHotKey, CreateWindowExW), KERNEL32 (151, named pipes, CreateProcessW), ADVAPI32 (18, security descriptors, registry notify), SHELL32 (7), plus SHLWAPI, COMCTL32, ole32, OLEAUT32, dwmapi.
- Ghidra (relay `core_ghidra_decompile`, GeminiAppLauncher.exe, maxFunctions=4): returned PE64 metadata, 10 sections, imports and 1 decompiled function (`entry_point` 0x140087288, 4 instructions, CRT stub calling 0x14008729C); 1 of 4 requested, 5 ms. Limitation of the relay tool, not a failure of the binary.
- Accessibility: the window is Chromium; the tree is only produced while the window is not minimized (minimized windows time out at 3 s to 60 s). Account shown in the header, mode picker "Carbon High", textbox "Enter a prompt for Gemini".

## Findings in our code (reported to src-b0, patch in `var/mcp-hub-agent-desktop-state-root.patch`)

1. `hub_call agent-desktop__*` PERM_DENIED: `~/.agent-desktop` mixes owners (BUILTIN\Administrateurs for elevated sessions, aphro otherwise). Fix: `AGENT_DESKTOP_HOME=<relayHome>/agent-desktop` at spawn.
2. About 20 orphan `agent-desktop.exe mcp` processes (one per `mcp-stdio` bridge). Fix: kill tracked children on exit.
3. `desktop_type` and `desktop_press` are POLICY_DENIED / not foreground in the default strict headless MCP mode; the suite uses `desktop_set_value` + semantic `desktop_click`. A `--headed` hub entry (infra/agents/toolchain.toml) would enable physical input.
4. `desktop_snapshot` with `max_depth 25` times out on Chromium; depth 10 + `compact` takes 150 to 700 ms.
5. hub requests are capped at 120 s; long `desktop_wait` must be sliced.

## Results and latency

See `docs/reviews/e2e-desktop-2026-11-14.md` (generated by `just e2e-desktop`, JSON in `var/`).
