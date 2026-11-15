# Legacy forks and builds

Inventory of the forks the owner maintains (GitHub `aphrody-labs` org and `aphrody-dev` user), with divergence from their parent (GitHub compare API), plus crates.io, npm, the VPSes and this PC. Data: `docs/audit/legacy-forks.jsonl` (one row per fork). Read-only: no fork is deleted or archived from this file without an owner decision.

## Counts

| Source | Result |
|---|---|
| GitHub forks | 839 (811 in aphrody-labs, 28 under aphrody-dev) |
| Ahead of parent (our commits) | 27 |
| Behind parent | 309 |
| Proposed: merge or rebase | 27 |
| Proposed: archive (no push since 2026-06 or parent archived) | 81 |
| Proposed: delete or resync (ahead 0, more than 50 behind) | 52 |
| Proposed: keep synced | 679 |
| crates.io (user aphrody-dev) | 370 crates published 2026-10-03 to 2026-11-13; 309 have no matching package in C:\src |
| npm | 15 of 25 local `@aphrody/*` packages published (1.4.7) |
| VPSes | fr1: 6 aphrody-labs clones (src, ghidra x3, bun, WebKit) and 2 src copies under /home/ubuntu; prd and fr2: /srv/src (fr2 also /srv/corp ghidra) |
| This PC | 6 repositories outside C:\src; only C:\\msys is first-party (clean); no unpushed commits |

## Forks with our own commits

| Fork | Parent | Ahead | Behind | Last push | Pinned in C:\src |
|---|---|---:|---:|---|---|
| `aphrody-labs/gamescope` | `ValveSoftware/gamescope` | 2831 | 13 | 2026-11-14 | yes |
| `aphrody-labs/yolo-ui-dup-labs` | `DioxusLabs/dioxus` | 101 | 2 | 2026-11-07 | no |
| `aphrody-labs/windows-rs` | `microsoft/windows-rs` | 29 | 10 | 2026-11-12 | yes |
| `aphrody-labs/lfs` | `lfs-book/lfs` | 29 | 0 | 2026-11-13 | yes |
| `aphrody-labs/bun` | `oven-sh/bun` | 26 | 29 | 2026-11-14 | yes |
| `aphrody-labs/rubash` | `unixwin/rubash` | 20 | 99 | 2026-11-13 | yes |
| `aphrody-labs/niubash` | `unixwin/niubash` | 9 | 8 | 2026-11-15 | yes |
| `aphrody-labs/ghidra` | `NationalSecurityAgency/ghidra` | 9 | 0 | 2026-11-14 | yes |
| `aphrody-labs/fluentui` | `microsoft/fluentui` | 7 | 2 | 2026-11-12 | yes |
| `aphrody-labs/better-auth` | `better-auth/better-auth` | 7 | 7 | 2026-11-14 | yes |
| `aphrody-labs/next.js` | `vercel/next.js` | 6 | 4 | 2026-11-14 | no |
| `aphrody-labs/base-ui` | `mui/base-ui` | 4 | 0 | 2026-11-14 | yes |
| `aphrody-labs/webui` | `microsoft/webui` | 4 | 4 | 2026-11-12 | yes |
| `aphrody-labs/ui` | `shadcn-ui/ui` | 3 | 0 | 2026-11-14 | yes |
| `aphrody-labs/openclaw` | `openclaw/openclaw` | 3 | 786 | 2026-11-12 | yes |
| `aphrody-labs/russh` | `Eugeny/russh` | 2 | 0 | 2026-11-13 | yes |
| `aphrody-labs/tailwindcss` | `tailwindlabs/tailwindcss` | 2 | 0 | 2026-11-14 | yes |
| `aphrody-labs/mochi-desktop` | `miflow13/mochi-desktop` | 1 | 0 | 2026-11-01 | no |
| `aphrody-labs/gitingest` | `coderamp-labs/gitingest` | 1 | 0 | 2026-11-09 | no |
| `aphrody-labs/rclone` | `rclone/rclone` | 1 | 4 | 2026-11-14 | no |
| `aphrody-labs/zed` | `zed-industries/zed` | 1 | 0 | 2026-11-14 | yes |
| `aphrody-labs/node-api-dotnet` | `microsoft/node-api-dotnet` | 1 | 1 | 2026-11-12 | yes |
| `aphrody-labs/hermes-agent` | `NousResearch/hermes-agent` | 1 | 3554 | 2026-11-12 | yes |
| `aphrody-labs/A2A` | `a2aproject/A2A` | 1 | 2 | 2026-11-13 | yes |
| `aphrody-labs/agent-client-protocol` | `agentclientprotocol/agent-client-protocol` | 1 | 26 | 2026-11-13 | yes |
| `aphrody-labs/jules-action` | `google-labs-code/jules-action` | 1 | 0 | 2026-11-13 | yes |
| `aphrody-labs/allocative` | `facebookexperimental/allocative` | 1 | 0 | 2026-11-15 | no |

Notable unmerged work found in those commits: gamescope (Wayland touch frames, client size hints; merge into src/wayland and packages/gaming, then rebase), windows-rs (nt/wasm merge), lfs (Bun stages, uutils musl, preinit as init), bun (order file, trace-order CI, gnu linking: rebase, stays the pin), rubash (CI, completion tests), ghidra (clang full LTO natives, AOT cache), better-auth (bun:test), next.js (Bun built-ins instead of ESLint/Prettier/jest/Playwright), russh (sntrup761x25519 key exchange: upstream PR candidate), rclone (IEVR CPK VFS backend: merge into the nie-studio crates).

Open points: the compare API returned 404 for 3 forks (UnrealEngine and two eve templates); 309 published crates have no source in C:\src (source of truth to recover); npm packages that exist only on the npm account are not covered (registry search returned nothing for the scope).
