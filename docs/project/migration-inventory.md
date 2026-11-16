# Migration inventory: apps/auto, apps/web, open (2026-11-16)

Read from every `package.json` and `Cargo.toml` of the three trees (script: one Bun glob over the manifests). Step A of the root reorganization; no file has moved yet.

## Counts

| Tree | Crates | Bun packages | Distinct dependencies | Tracked files | State |
| --- | --- | --- | --- | --- | --- |
| `apps/auto` | 53 | 24 | 203 | 1639 | own `Cargo.lock` (3473 lines) and `bun.lock` (656 lines), absent from the root Cargo and Bun workspaces |
| `apps/open` | 10 | 8 | 71 | separate repository, ignored here | own `Cargo.toml`, `rust-toolchain.toml`, `package.json` |
| `apps/web` | 0 | 1 | 14 | 62 | Angular Material app of the showcase site |

The rest of the monorepo holds 549 manifests with a name.

## apps/auto

- Bun apps: `admin`, `api`, `cli`, `desktop` (Tauri, crate `auto-desktop`), `extension`, `plugin`, `standalone`, `web`, `worker`.
- Bun packages: `agent`, `billing`, `client`, `domain`, `i18n`, `ingest`, `mail`, `native`, `pa`, `services`, `store`, `tenancy`, `ui`, `video`.
- Own crates (7):
  - `auto-docs`: PDF quotes and invoices.
  - `auto-facturx`: Factur-X EN 16931.
  - `auto-ffi`: C ABI for `bun:ffi`.
  - `auto-fichiers`: PDF, files.
  - `auto-sheets`: xlsx, ods, csv.
  - `auto-connaissance`: document chunking.
  - `aphrody-box`: Leptos console.
- Vendored suite, `vendor/suite` (835 files, 45 crates):
  - pdfcraft: 14 crates, plus the hayro and lopdf forks;
  - gridcraft: 7 crates;
  - wordcraft: 7 crates;
  - deckcraft: 8 crates;
  - `craft-metafile`;
  - a copy of `aphrody-rag-core`.

Architecture errors:
1. It is a workspace inside the workspace, with its own locks, so its dependencies are never deduplicated with the root.
2. The office suite is vendored under an app instead of living once as crates. `aphrody-rag-core` exists twice (`apps/auto/vendor/suite` and `frameworks/rag-core`).
3. The scope is `@auto/*` and several crate names and descriptions are French (`auto-connaissance`, `auto-fichiers`), against the identity rules (`@aphrody`, English source).
4. `i18n`, `video`, `ui`, `mail` and `billing` repeat what `@aphrody/i18n`, `@aphrody/bun-video`, `aphrody-ui`, `device/mail` and the cloud plan cover.
5. `auto-ffi` is a second C ABI next to `system/core/capi`.

## open

- Crates:
  - `open`: the facade.
  - `ai-router`: multi-provider routing.
  - `browse`: CDP and extension.
  - `browser-engines`.
  - `crawl`.
  - `hub`: Hugging Face Hub compatible.
  - `tui`: OpenTUI renderer.
  - `tunnel`.
  - `c-abi`: shared C ABI primitives.
  - `aphrody-adblock-capi`: Brave adblock.
- Bun: `@aphrody/ai-router`, `@aphrody/browser-engines`, `@aphrody/crawl`, `@aphrody/open-extension`, apps `ai-router` (Angular Material), `router-agent`, `bun-m3`.

Architecture errors:
1. It is a separate repository, while `system/core/capi` already depends on its `c-abi` crate.
2. `ai-router` overlaps `frameworks/gateway` (provider-agnostic AI gateway).
3. `crawl` overlaps `@aphrody/web-crawl`, and `browse` and `browser-engines` overlap `@aphrody/agent-browser` and the unified browser.
4. It carries its own `rust-toolchain.toml`.

## apps/web

One Angular Material app (`@aphrody/site-ng`). The UI direction is gpui-os and Dioxus on shared Material 3 tokens (`aphrody-ui`); the site keeps its content and `DESIGN.md` and moves to that stack only with a before and after visual comparison.

## Name collisions

Only two names are declared twice across the whole tree: `aphrody-rag-core` (`apps/auto`, `frameworks`) and `aphrody-core` (`apps/aphrody-app`, `system`).

## Target mapping (to encode in `tools/layout.toml`)

| From | To |
| --- | --- |
| `apps/auto/vendor/suite/crates/*`, hayro and lopdf forks | `crates/<name>` (one copy; `aphrody-rag-core` deduplicated onto the existing crate) |
| `apps/auto/crates/*` | `crates/<name>`, English names |
| `apps/auto/packages/*` | `packages/<name>` under `@aphrody`, merged with the existing package where one covers it (`i18n`, `video`, `ui`) |
| `apps/auto/apps/*` | `apps/auto-<name>`, or one `apps/auto` with its surfaces as entry points |
| `open/crates/*` | `crates/<name>`; `ai-router` merged with `gateway`; `c-abi` becomes the one C ABI base |
| `open/packages/*`, `open/extension`, `open/apps/*` | `packages/<name>`, `apps/<name>` |
| `apps/web` | `apps/web` (unchanged path), stack migration tracked separately |
| every crate under `kernel/`, `hardware/`, `system/`, `frameworks/` | `crates/<name>` |
| every Bun package under `system/`, `frameworks/` | `packages/<name>` |
| C and C++ sources | LLVM layout: `include/<project>/`, `lib/<Component>/`, `tools/`, `unittests/`, CMake |

Each batch is applied by `scripts/relayout.ts` and gated by `cargo metadata`, a frozen Bun install, `checkdeps` and the targeted tests.
