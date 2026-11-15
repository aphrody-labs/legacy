# Gemini review of the unixwin fusion (2026-11-15)

Model: Gemini Carbon, gemini.google.com through claude-in-chrome (the relay routes failed: Antigravity credits exhausted, no Google session in the relay Chrome). Input: one bundle of the files listed below at `9e4e0e710`, with an adversarial prompt (real defects only, file, line, severity, fix). Chat `d02885a8335982db`. The browser tool withheld the body of most findings (its cookie and query-string filter), so this record keeps the title, location and severity of each; every finding is verified in the code before a fix, and its outcome is added here.

Files: `docs/native/UNIXWIN.md`, `src/ay/src/{sh,plugin,applet,main}.rs`, `src/winux/extra/src/*.rs`, `src/up/src/{manifest,install}.rs`, `.github/workflows/unixwin.yml`, `packages/omniu/src/*.ts`, `scripts/{unixwin-applets,wpm-import,winuxcmd-i18n-import}.ts`, `packages/ai-os/src/relay/unixwin-mcp.ts`.

Verdict: **FIX FIRST**.

| # | Severity | Finding | Location | Outcome |
| --- | --- | --- | --- | --- |
| 1 | critical | Path traversal on tree unpack: entry paths joined onto the root without rejecting `..`, rooted paths or Windows drive and UNC prefixes | `src/up/src/install.rs` `install_archive` (`Layout::Tree`) | pending |
| 2 | critical | Applet dispatch routes non-coreutils uutils suites to the coreutils binary; the `checksum_common` library is exposed as an applet | `src/ay/src/applet.rs` `run`, `scripts/unixwin-applets.ts` `build`, `UNIXWIN.md` | pending |
| 3 | high | 33 applets marked provider `winux` are not in `winux_cmds::registry()` | `scripts/unixwin-applets.ts` `decide`, `src/ay/src/applet.rs` | pending |
| 4 | high | MCP server breaks JSON-RPC (notifications, errors), crashes on malformed input or missing files, ignores stdout backpressure | `packages/ai-os/src/relay/unixwin-mcp.ts` `handle`, main loop, `send` | pending |
| 5 | high | TOML and shell injection, multi-word and hyphenated identifiers broken | `packages/omniu/src/new-pack.ts`, `convert-jj.ts` | pending |
| 6 | high | `place_file` corrupts dotted file names (`with_extension`) and fails to replace a running Windows binary on the second update | `src/up/src/install.rs` `place_file` | pending |
| 7 | high | Windows CI: unchecked uutils differential step, PATH and Python encoding traps, narrow triggers | `.github/workflows/unixwin.yml` | pending |
| 8 | medium | `UNIXWIN.md` claims the code contradicts | `UNIXWIN.md` vs omniu, i18n import, applet.rs | pending |
| 9 | medium | `ay sh` truncates binary or non-UTF-8 scripts, fixes `$0` on stdin, drops signal exit codes, rejects `--help` | `src/ay/src/sh.rs`, `applet.rs` | pending |
| 10 | n/a | Portable applets correctness and cross-platform bugs (look, eol, strings, envsubst) | `src/winux/extra/src/*.rs` | pending |
| 11 | medium | `probe_name` fails on Windows backslashes; `unsupported` ignored by `supports()` | `src/up/src/manifest.rs`, `scripts/wpm-import.ts` | pending |
| 12 | medium | Invalid MF2 output when a message starts with `.` or holds MF2 syntax characters; CLI argument parsing | `scripts/winuxcmd-i18n-import.ts` `toMf2` | pending |
| 13 | low | ZIP builder breaks past 65,535 entries or 4 GiB; compression | `packages/omniu/src/package.ts` `zip` | pending |
| 14 | low | Dynamic `import()` of Windows absolute paths (needs `pathToFileURL(...).href`); shallow env merge in `ayPlugin` | `packages/omniu/src/host.ts`, `ay.ts` | pending |
