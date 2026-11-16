---
name: browser-engines
description: Use when choosing, driving, building or comparing a browser engine for Aphrody — render oracle, agent browser, embedded browser, cross-engine diff, conformance runs, CDP/WebDriver or Playwright/Puppeteer compatibility, building Servo/Obscura/Blitz/rusty_v8/cef-rs/agent-browser from source. Triggers: "quel moteur", "headless", "oracle de rendu", "agent browser", "Servo", "Obscura", "Helium", "Brave", "chrome-headless-shell", "CEF", "Electron", "CDP", "Playwright", "Puppeteer", "build from source".
---

# browser-engines

Evidence and figures live (+ `docs/native/bench/*.json`), produced by a harness that lives on fr1 (`~/browser-bench/harness`, TypeScript on Bun), not in the repository; cite no figure outside these files. Pins: Chromium `third_party/chrome-channels.toml`, clone commits `git -C third_party/<name> log -1`. Owner amendments: V8 follows the Chromium of cef-rs; oracle = Chrome Stable; the `third_party/chromium` checkout is extraction only.

Removed engines: Lightpanda and Firefox (Nightly, Zen, Playwright firefox) are no longer engines of the stack; their REPORT.md rows are history only. The Brave and Helium clones are gone too.

## Roles

| role            | engine                                                          | limits (see REPORT.md)                                 |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Render oracle   | chrome-headless-shell Stable; Canary = early warning            | -                                                      |
| JSC oracle      | WebKit through Playwright                                       | no CDP; Playwright only                                |
| Full agent      | chrome-headless-shell over direct CDP (Puppeteer/Playwright)    | agent-browser adds latency per command                 |
| Light agent     | Obscura (watchlist)                                             | client navigation and Lighthouse limits in REPORT.md   |
| Embedded VPS    | Electron                                                        | `Target.createTarget` not supported                    |
| Embedded (alt.) | CEF                                                             | Xvfb required, no new CDP target                       |
| Watch           | Servo                                                           | WebDriver only                                         |
| JS server       | Node reference, Bun option                                      | compare in REPORT.md                                   |

## Driver matrix (goto+evaluate+click+screenshot, REPORT § Driver compatibility)

| engine                              | protocol                          | Puppeteer | Playwright |
| ----------------------------------- | --------------------------------- | --------- | ---------- |
| chrome-headless-shell, pw-chromium  | CDP                               | ok        | ok         |
| Obscura                             | CDP (subset)                      | ok        | ok         |
| pw-webkit                           | Playwright WebKit protocol        | n/a       | ok         |
| Servo                               | WebDriver classic only            | n/a       | n/a        |
| CEF, Electron                       | CDP without `Target.createTarget` | KO newPage | KO newPage |

Rule: drive the existing page for CEF/Electron; direct CDP otherwise.

## Build from source (clones in `third_party/`)

| project       | clone                       | command                                                                                                              |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Chromium      | `third_party/chromium`      | `fetch chromium` + `gn gen out/X` + `autoninja -C out/X chrome` (upstream docs); see the `chromium` skill            |
| servo         | `third_party/servo`                           | `./mach bootstrap` then `./mach build` (Windows `.\mach`)                                                            |
| obscura       | `third_party/obscura`                           | `cargo build --release -p obscura-cli --bins --features render[,stealth]`; CDP protected by `OBSCURA_CDP_TOKEN`      |
| blitz         | `third_party/blitz`                           | `cargo run -rp browser` / `rdme` / `todomvc`                                                                         |
| cef-rs        | `third_party/cef-rs`                           | Cargo workspace (CEF bindings)                                                                                   |
| rusty_v8      | `third_party/rusty_v8`                           | `cargo build` (prebuilt binary); `RUSTY_V8_ARCHIVE`, `RUSTY_V8_MIRROR`; source: `V8_FROM_SOURCE=1` + `LIBCLANG_PATH` |
| agent-browser | `third_party/agent-browser`                           | `bun add -g agent-browser`; dev (upstream, needs Node and pnpm): `pnpm install && pnpm build:source`; `cargo test e2e -- --ignored --test-threads=1`   |

Re-read the clone's README before running a command; the Chromium commands come from upstream docs.

## Workflow

1. Need for pixel/Lighthouse truth: chs-stable; cross-engine diff: add WebKit.
2. New version of an engine: rerun the fr1 harness, update REPORT.md, then this table.
3. Inventory of the orgs (Chrome, Chromium, Brave, imputnet, Servo, h4ckf0r0day, vercel-labs; a GitHub listing, not a statement that the Brave clone exists): `references/org-inventory.md`.

## Links

- https://googlechromelabs.github.io/chrome-for-testing/ · https://chromium.googlesource.com/chromium/src · https://github.com/servo/servo · https://github.com/h4ckf0r0day/obscura · https://github.com/vercel-labs/agent-browser · https://github.com/DioxusLabs/blitz · https://github.com/denoland/rusty_v8

## Not verified

Chromium commands (not reread in the clone).
