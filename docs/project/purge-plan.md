# Purge plan: irreversible actions waiting for the owner (2026-11-15)

Nothing below was executed. Reversible actions already done (archive, deprecate, yank, DNS) are in [`purge-report.md`](purge-report.md) with their undo commands. Every item has its restore proof from [`restore-inventory.md`](restore-inventory.md) (content compared by blob oid) or from the upstream comparison in `docs/audit/legacy-forks.jsonl` (fork 0 commits ahead of its parent).

Platform limits (sources read 2026-11-15):
- npm unpublish: allowed within 72 h of publishing when no other public package depends on it; after 72 h only with no dependents, under 300 downloads in the last week and a single owner or maintainer (https://docs.npmjs.com/policies/unpublish/). The version number of an unpublished version is never reusable.
- crates.io delete: owner only (team owners cannot), allowed within 72 h of publishing, or after that with a single owner and fewer than 1000 downloads per month of age; the crate must have no dependents (`rust-lang/crates.io` `src/controllers/krate/delete.rs`). A published version can never be overwritten; yank is the only reversible tool.
- GitHub: `gh repo delete` needs the `delete_repo` scope (`gh auth refresh -s delete_repo`); a deleted repository can be restored by GitHub support for 90 days only if it is not a fork of a deleted network, so treat it as permanent.

## GitHub

### G1. Pristine forks archived in this run (52)
Reason: fork of a public upstream, no commit ahead of its parent, not pinned in `third_party/forks.txt`, `src.lock.json` or `apps/open/open.lock.json`, parent not named in the tree. Restore proof: inventory status present-identical (pristine fork); content lives in the upstream. Undo of the archive: `gh api -X PATCH repos/<repo> -F archived=false`.
```sh
for r in aphrody-labs/a0-repos aphrody-labs/agentic-commerce-skills aphrody-labs/ai-facts aphrody-labs/ai-sdk-computer-use aphrody-labs/ai-sdk-flask aphrody-labs/ai-sdk-image-generator aphrody-labs/ai-sdk-preview-array-output-mode aphrody-labs/ai-sdk-preview-multi-steps aphrody-labs/ai-sdk-preview-pdf-support aphrody-labs/ai-sdk-preview-python-streaming aphrody-labs/ai-sdk-sources aphrody-labs/ai-sdk-starter-xai aphrody-labs/ai-sdk-tool-code-execution aphrody-labs/areweturboyet aphrody-labs/awesome-ai aphrody-labs/bevy_mikktspace aphrody-labs/binaryen-1 aphrody-labs/cache-components-pages-variations aphrody-labs/cache-components-revalidation aphrody-labs/cache-components-subshell-composition aphrody-labs/capture-the-flag aphrody-labs/cbor-x aphrody-labs/chat-sdk-demo aphrody-labs/chat-sdk-deploy-bot aphrody-labs/chat-sdk-form-bot aphrody-labs/claude-managed-agents-starter aphrody-labs/cratesio-dbdump-csvtab aphrody-labs/developer.chrome.com aphrody-labs/MINGW-packages-dev aphrody-labs/mksh-cvs2git aphrody-labs/ms aphrody-labs/msys2 aphrody-labs/msys2-archive aphrody-labs/msys2-finances aphrody-labs/msys2-launcher aphrody-labs/MSYS2-packages-dev aphrody-labs/msys2-pacman aphrody-labs/msys2-sourceforge-export aphrody-labs/msys2-texlive aphrody-labs/msys2-twitter-export aphrody-labs/pacdb aphrody-labs/package-grokker aphrody-labs/pactoys aphrody-labs/tauri-1 aphrody-labs/typefully-eve-template aphrody-labs/wasm-bindgen-1 aphrody-labs/wasmtime-1 aphrody-labs/web-task aphrody-labs/web.dev aphrody-labs/wgctrl-go aphrody-labs/wireguard-apple aphrody-labs/wireguard-linux-compat; do gh repo delete "$r" --yes; done
```

### G2. Empty repositories archived in this run (3)
Reason: size 0, no commit. Proof: GitHub API `size` = 0 (nothing to restore).
```sh
for r in aphrody-labs/grep aphrody-labs/labs aphrody-labs/onetrue-awk; do gh repo delete "$r" --yes; done
```

### G3. Pristine forks archived before this run (24)
Reason: archived by earlier sessions, fork with 0 commits ahead, parent not pinned. Proof: inventory present-identical (pristine fork).
```sh
for r in aphrody-dev/taffy aphrody-dev/wasmtime aphrody-labs/accesskit aphrody-labs/agent-skills-dup-yolo-rs aphrody-labs/cursor-icon aphrody-labs/d3d12-rs aphrody-labs/extensions aphrody-labs/fx-1 aphrody-labs/gfx aphrody-labs/glutin aphrody-labs/helix aphrody-labs/keyboard-types aphrody-labs/metal-rs aphrody-labs/naga aphrody-labs/naga_oil aphrody-labs/nucleo aphrody-labs/raw-window-handle aphrody-labs/rspirv aphrody-labs/skills-2 aphrody-labs/skills-3 aphrody-labs/skills-dup-yolo-rs aphrody-labs/softbuffer aphrody-labs/tree-house aphrody-labs/wgpu-native; do gh repo delete "$r" --yes; done
```

### G4. Own repositories restored into the monorepo, archived (14)
Reason: content imported (restore-import, gitleaks clean). Proof: inventory present-identical, monorepo path in parentheses; check that the path still exists before running.
```sh
# aphrody-labs/ai-triad (packages/ai-triad)
# aphrody-labs/aphrody-app (apps/aphrody-app)
# aphrody-labs/aphrody-web-archive (apps/aphrody-web)
# aphrody-labs/brain (packages/brain)
# aphrody-labs/bun-parity (packages/bun-parity)
# aphrody-labs/bun-plugins (packages/bun-plugins)
# aphrody-labs/chromium-bun (packages/chromium-bun)
# aphrody-labs/forge (packages/forge)
# aphrody-labs/gcloud-learn (packages/gcloud-learn)
# aphrody-labs/google-design (packages/google-design)
# aphrody-labs/google-dream (packages/google-dream)
# aphrody-labs/knowledge-engine (packages/knowledge-engine)
# aphrody-labs/mesh-vn (infra/mesh-vn)
# aphrody-labs/pi-opencode (packages/pi-opencode)
for r in aphrody-labs/ai-triad aphrody-labs/aphrody-app aphrody-labs/aphrody-web-archive aphrody-labs/brain aphrody-labs/bun-parity aphrody-labs/bun-plugins aphrody-labs/chromium-bun aphrody-labs/forge aphrody-labs/gcloud-learn aphrody-labs/google-design aphrody-labs/google-dream aphrody-labs/knowledge-engine aphrody-labs/mesh-vn aphrody-labs/pi-opencode; do gh repo delete "$r" --yes; done
```

### Blocked: restore first, GitHub archived but not deletable (18)
Content or branch tips not proven present in the monorepo or a canonical fork: aphrody-labs/agent [present-newer], aphrody-labs/ai-os [present-older], aphrody-labs/carbon [missing], aphrody-labs/depot [present-older], aphrody-labs/env-kit [present-older], aphrody-labs/gamescope-rs [present-older], aphrody-labs/gitingest [unique-commits], aphrody-labs/google-bun-dup-yolo-rs [missing], aphrody-labs/infra [present-older], aphrody-labs/unix [missing], aphrody-labs/wayland [present-older], aphrody-labs/wck [present-older], aphrody-labs/xtask [missing], aphrody-labs/yolo-backend-dup-yolo-rs [missing], aphrody-labs/yolo-bun [missing], aphrody-labs/yolo-hub [missing], aphrody-labs/yolo-ui-dup-labs [unique-commits], aphrody-labs/yolo-vps-dup-labs [missing].

### Blocked: restore first, live own repositories not archived (51)
Not archived because their unique content is not (fully) in the monorepo: aphrody-dev [missing], antigravity-sdk-python [missing], aphrody-m3 [missing], bash [missing], bench [present-older], binutils-gdb [missing], bun-distribution [missing], bun-os [present-older], cours-ia [present-older], dash [missing], depot_tools [missing], fairy-tail-archive [missing], gaming [unique-commits], gawk [missing], gemini-super-app [present-identical], gnu-findutils [missing], gnu-sed [missing], google-bun [present-identical], make [missing], msys [missing], nt [present-older], r2b [missing], readline [missing], ring3-agent [present-identical], rust-stack [present-older], scap [missing], steam-depot [present-older], steam-runtime-tools [missing], steamos-manager [missing], tao [missing], tauri-action [missing], wayland-c [missing], wii-os [missing], yolo [missing], yolo-ai [missing], yolo-backend [missing], yolo-cloudflare [missing], yolo-cross [missing], yolo-engine [missing], yolo-os [missing], yolo-plugins [missing], yolo-re [missing], yolo-rs [present-older], yolo-stack [missing], yolo-standards [missing], yolo-ui [missing], yolo-vendor [missing], yolo-vps [missing], yolo-web [missing], yolo-zig [missing], zig [missing]. Kept as live products or canonical sources: aphrody, open, shenron, rosegriffon, auto, .github, shenron-config.

### Held, unreferenced storytold forks (Craft Apps family) and pinned archived forks
Not touched: pristine forks of `storytold/*` with no mention in the tree (Craft Apps and ArtCraft are a stated direction, `docs/games/PLAN.md`), and 44 archived forks whose parent is pinned (aphrody-dev/agent-browser, aphrody-dev/agent-desktop, aphrody-dev/blitz, aphrody-dev/boringtun, aphrody-dev/bun, aphrody-dev/claude-code, aphrody-dev/codex, aphrody-dev/coreutils, aphrody-dev/edit, aphrody-dev/gemini-cli, aphrody-dev/gitoxide, aphrody-dev/gpui-kit, aphrody-dev/hyperlight, aphrody-dev/jj, aphrody-dev/litebox, aphrody-dev/llvm-project, aphrody-dev/lore, aphrody-dev/opentunnel, aphrody-dev/openvmm, aphrody-dev/russh, aphrody-dev/russh-sftp, aphrody-dev/sudo, aphrody-dev/tui-test, aphrody-dev/UnrealEngine, aphrody-dev/wild, aphrody-dev/windows-drivers-rs, aphrody-dev/Windows-rust-driver-samples, aphrody-labs/ai-1, aphrody-labs/coreutils-2, aphrody-labs/coreutils-3, aphrody-labs/create-gpui-app, aphrody-labs/findutils-1, aphrody-labs/mcp-rust-sdk-dup-yolo-rs, aphrody-labs/mcp-typescript-sdk-dup-yolo-rs, aphrody-labs/sed-1, aphrody-labs/tree-sitter, aphrody-labs/tree-sitter-cpp, aphrody-labs/tree-sitter-rust, aphrody-labs/tree-sitter-typescript, aphrody-labs/vcpkg-1, aphrody-labs/wgpu-dup-yolo-rs, aphrody-labs/winit, aphrody-labs/wterm-1, aphrody-labs/zed-dup-yolo-rs).

## Cloudflare

Account state read through `cf` and `infra/cloudflare/recon.ts` (GET only): 18 Workers, 12 R2 buckets, 1 KV, 1 D1, 5 tunnels, 2 queues, 9 Access apps, 4 zones, 0 Pages projects. Every other item is in use (routes, custom domains or tunnels answer with real content, see `docs/infra/PROD-MAP.md` and `docs/infra/IDENTITY-CONSOLIDATION.md`) and is kept.

| item | reason | restore proof | command |
|---|---|---|---|
| Worker `aphrody-com` | duplicate of Worker `aphrody` (aphrody.com/*, www): no route, no custom domain, only its workers.dev preview answers (280 requests since 2026-10-14) | source deployed from the tree (`infra/cloudflare/workers`, inventory present-identical) | `cf workers delete aphrody-com --dry-run` then without `--dry-run` |
| Worker `yolo-aphrody-com` | assets-only Worker for the legacy name yolo.aphrody.com, 0 invocations; still answers 200 (static assets), so first remove the custom domain `yolo.aphrody.com` then the Worker | empty script, content = `apps/yolo` (restored from history, inventory present-identical) | `cf workers delete yolo-aphrody-com --dry-run` |
| Worker `aphrody-email-worker` | 0 invocations since 2026-10-14; Email Routing rules unreadable by the token, so usage unverified. Held until Email Routing is read | present-identical (tree) | `cf workers delete aphrody-email-worker --dry-run` |
| D1 `aphrody-app` (6875cbdc-449d-45fc-a01e-1c0c98e2c4df) | 0 tables, 176 KB; bound to `aphrody-email-worker`, remove the binding first | no data (num_tables 0) | `cf d1 delete 6875cbdc-449d-45fc-a01e-1c0c98e2c4df` |
| KV `aphrody-app-cache` (ab11db38b3ea4ea190fac14bf2ee6739) | cache namespace bound to `aphrody-email-worker`; remove the binding first | cache, no source | `cf kv namespaces delete ab11db38b3ea4ea190fac14bf2ee6739` |
| Tunnel `fr2` (88aa6a53-0a9a-4a5b-a9b6-3d3394dd978d) | retired 2026-11-15 (`infra/cloudflare/cloudflare.toml`), its hostnames are served by mig-prd; no DNS record targets it. The API still reports connections: confirm `cloudflared-fr2` is stopped on fr2 first | config in `cloudflare.toml` | `cf tunnels delete 88aa6a53-0a9a-4a5b-a9b6-3d3394dd978d` |
| Tunnel `prod` (7a6e3e3d-de15-45f8-9b50-73bdbbc283ae) | merged into mig-prd (desktop.aphrody.app now routed by mig-prd); no DNS record targets it. desktop is a live product: delete only after `desktop.aphrody.app` is re-checked | ingress in `cloudflare.toml` | `cf tunnels delete 7a6e3e3d-de15-45f8-9b50-73bdbbc283ae` |

Not planned: R2 buckets (all 12 present-identical data buckets, none proven unused), tunnel `shenron-dbfr` and `auto-usa` (live products), `mig-prd` (prd, never touched), Access apps, queues (`github-events` feeds `aphrody-github`).

## npm

Proven present in the monorepo (restored from the published tarballs, `packages/<name>`): 27 packages, all deprecated in this run. Deleting a version is only possible when the rules above hold; eligible now (no dependent among our 696 packages, under 300 weekly downloads, single maintainer): 10.
```sh
npm unpublish @aphrody/ag-ui-client --force   # 2 versions, 30 downloads last week
npm unpublish @aphrody/google --force   # 7 versions, 74 downloads last week
npm unpublish @aphrody/bun-chromium --force   # 4 versions, 30 downloads last week
npm unpublish @aphrody/doc-ai --force   # 10 versions, 34 downloads last week
npm unpublish @aphrody/rag-core --force   # 6 versions, 38 downloads last week
npm unpublish @aphrody/webos --force   # 2 versions, 12 downloads last week
npm unpublish @aphrody/gemma-web --force   # 2 versions, 31 downloads last week
npm unpublish @aphrody/shell-web --force   # 6 versions, 18 downloads last week
npm unpublish @aphrody/chromium --force   # 2 versions, 27 downloads last week
npm unpublish @aphrody/web-crawl --force   # 2 versions, 31 downloads last week
```
Not eligible (dependents or traffic): @aphrody/typesafe-sdk (3 dependents, 26 dl/wk), @aphrody/paths (15 dependents, 191 dl/wk), @aphrody/runtime-sdk (12 dependents, 337 dl/wk), @aphrody/bun-webview-page (4 dependents, 38 dl/wk), @aphrody/agent-browser (4 dependents, 172 dl/wk), @aphrody/identity (3 dependents, 48 dl/wk), @aphrody/drive-client (1 dependents, 22 dl/wk), @aphrody/mcp-ui (1 dependents, 26 dl/wk), @aphrody/bun-google (1 dependents, 42 dl/wk), @aphrody/web (2 dependents, 11 dl/wk), @aphrody/bun-web (1 dependents, 16 dl/wk), @aphrody/webos-wasm (2 dependents, 17 dl/wk), @aphrody/bun-sql (1 dependents, 19 dl/wk), @aphrody/a2a (2 dependents, 19 dl/wk), @aphrody/ag-ui (1 dependents, 15 dl/wk), @aphrody/xai (1 dependents, 31 dl/wk), @aphrody/inference (1 dependents, null dl/wk).

Blocked: restore first: 669 packages are not proven present (644 published-only mostly generated `bun-windows-*` stubs and `bun-*` forks, plus present-older). Neither deprecated nor unpublished; tarballs stay downloadable and restorable with `scripts/restore-pkg.ts`.

## crates.io

370 crates under the account (user id 440521). Proven present (restored into `src/<name>`): 35; yanked in this run: 6 (see report). Delete-eligible among the proven (no reverse dependency and young or single owner with few downloads): 5.
```sh
xh DELETE https://crates.io/api/v1/crates/aphrody-a2a-grpc "Authorization:$CARGO_REGISTRY_TOKEN" User-Agent:purge   # 1 versions, 11 downloads, owners aphrody-dev
xh DELETE https://crates.io/api/v1/crates/aphrody-accounts "Authorization:$CARGO_REGISTRY_TOKEN" User-Agent:purge   # 1 versions, 11 downloads, owners aphrody-dev
xh DELETE https://crates.io/api/v1/crates/aphrody-agent-runtime "Authorization:$CARGO_REGISTRY_TOKEN" User-Agent:purge   # 1 versions, 12 downloads, owners aphrody-dev
xh DELETE https://crates.io/api/v1/crates/aphrody-gateway "Authorization:$CARGO_REGISTRY_TOKEN" User-Agent:purge   # 1 versions, 11 downloads, owners aphrody-dev
xh DELETE https://crates.io/api/v1/crates/aphrody-n2b "Authorization:$CARGO_REGISTRY_TOKEN" User-Agent:purge   # 2 versions, 151 downloads, owners aphrody-dev
```
Deletion is `DELETE /api/v1/crates/<name>` (operation `delete_crate`, `rust-lang/crates.io` `packages/crates-io-api-client/schema.ts`) or the page `/crates/<name>/delete`; there is no cargo subcommand.

Blocked: restore first: the other 335 crates (299 missing, present-older) stay published and unyanked.
