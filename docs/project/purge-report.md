# Purge report: reversible actions executed (2026-11-15)

Gate used everywhere: an item is acted on only when its unique content is proven present in the monorepo or in its canonical upstream (`docs/project/restore-inventory.md`, `docs/audit/legacy-forks.jsonl`), and no live product depends on it. Irreversible actions and blocked items are in [`purge-plan.md`](purge-plan.md).

## Counts

| service | keep | done | waiting (irreversible) | blocked: restore first |
|---|---:|---|---:|---:|
| GitHub (aphrody-labs, aphrody-dev) | see plan | 55 repositories archived | deletion lists G1-G4 | own repositories not restored |
| Cloudflare | 18 Workers, 12 R2, 4 zones, 5 tunnels, 9 Access apps | 2 DNS records removed | 7 items | none |
| npm (696 packages) | 669 untouched | 27 packages deprecated (all versions) | see plan | 669 |
| crates.io (370 crates) | 364 untouched | 5 crates yanked (6 versions) | see plan | 335 |

## GitHub: archived, 55
Pristine forks (0 commits ahead of upstream, not pinned, parent not named in the tree), three empty repositories (`grep`, `onetrue-awk`, `labs`), four duplicate forks of a parent already forked under the base name (`binaryen-1`, `tauri-1`, `wasm-bindgen-1`, `wasmtime-1`). Undo:
```sh
for r in aphrody-labs/typefully-eve-template aphrody-labs/developer.chrome.com aphrody-labs/web.dev aphrody-labs/wireguard-apple aphrody-labs/wgctrl-go aphrody-labs/wireguard-linux-compat aphrody-labs/mksh-cvs2git aphrody-labs/a0-repos aphrody-labs/ms aphrody-labs/agentic-commerce-skills aphrody-labs/ai-facts aphrody-labs/ai-sdk-computer-use aphrody-labs/ai-sdk-flask aphrody-labs/ai-sdk-image-generator aphrody-labs/ai-sdk-preview-array-output-mode aphrody-labs/ai-sdk-preview-multi-steps aphrody-labs/ai-sdk-preview-pdf-support aphrody-labs/ai-sdk-preview-python-streaming aphrody-labs/ai-sdk-sources aphrody-labs/ai-sdk-starter-xai aphrody-labs/ai-sdk-tool-code-execution aphrody-labs/awesome-ai aphrody-labs/areweturboyet aphrody-labs/cache-components-pages-variations aphrody-labs/cache-components-revalidation aphrody-labs/cache-components-subshell-composition aphrody-labs/capture-the-flag aphrody-labs/chat-sdk-demo aphrody-labs/cbor-x aphrody-labs/chat-sdk-deploy-bot aphrody-labs/chat-sdk-form-bot aphrody-labs/claude-managed-agents-starter aphrody-labs/MINGW-packages-dev aphrody-labs/MSYS2-packages-dev aphrody-labs/msys2-finances aphrody-labs/msys2 aphrody-labs/msys2-archive aphrody-labs/msys2-launcher aphrody-labs/msys2-pacman aphrody-labs/msys2-texlive aphrody-labs/pacdb aphrody-labs/package-grokker aphrody-labs/pactoys aphrody-labs/msys2-sourceforge-export aphrody-labs/msys2-twitter-export aphrody-labs/bevy_mikktspace aphrody-labs/web-task aphrody-labs/cratesio-dbdump-csvtab aphrody-labs/binaryen-1 aphrody-labs/tauri-1 aphrody-labs/wasm-bindgen-1 aphrody-labs/wasmtime-1 aphrody-labs/grep aphrody-labs/labs aphrody-labs/onetrue-awk; do gh api -X PATCH "repos/$r" -F archived=false; done
```

## Cloudflare: 2 DNS records removed (zone aphrody.com)
Checked with a real request before removal: `recette-auto.aphrody.com` returned HTTP 530 with the Cloudflare tunnel error page (target tunnel f8ba0d09-4ce8-4a9b-977d-b2e64acd2b2d no longer exists, listed LEGACY in `docs/infra/PROD-MAP.md`); `open-vercel.aphrody.com` returned HTTP 404 `DEPLOYMENT_NOT_FOUND` from Vercel. Neither is in `infra/cloudflare/cloudflare.toml`. Undo (recreate):
```sh
cf dns records create --zone aphrody.com --body '{"type":"CNAME","name":"recette-auto.aphrody.com","content":"f8ba0d09-4ce8-4a9b-977d-b2e64acd2b2d.cfargotunnel.com","proxied":true,"ttl":1}'
cf dns records create --zone aphrody.com --body '{"type":"CNAME","name":"open-vercel.aphrody.com","content":"72146356d7b5b8c9.vercel-dns-017.com","proxied":false,"ttl":1}'
```
Not disabled: every Worker route and custom domain answers with real content (aphrody-webos routes included, 188110 invocations since 2026-10-14 per `docs/infra/IDENTITY-CONSOLIDATION.md`), so none meets the 'nothing answers' condition.

## npm: deprecated, 27 packages (all versions)
Proven restored into `packages/<name>` and not consumed from the registry by the tree or by the live apps (`apps/open`, `rosegriffon`, `shenron`, `auto`, `nt`). Message: `Moved into the aphrody-labs/aphrody monorepo (packages/<dir>); use the workspace copy there.` Undo (empty message removes the deprecation):
```sh
npm deprecate "@aphrody/a2a" ""
npm deprecate "@aphrody/ag-ui" ""
npm deprecate "@aphrody/ag-ui-client" ""
npm deprecate "@aphrody/agent-browser" ""
npm deprecate "@aphrody/bun-chromium" ""
npm deprecate "@aphrody/bun-google" ""
npm deprecate "@aphrody/bun-sql" ""
npm deprecate "@aphrody/bun-web" ""
npm deprecate "@aphrody/bun-webview-page" ""
npm deprecate "@aphrody/chromium" ""
npm deprecate "@aphrody/doc-ai" ""
npm deprecate "@aphrody/drive-client" ""
npm deprecate "@aphrody/gemma-web" ""
npm deprecate "@aphrody/google" ""
npm deprecate "@aphrody/identity" ""
npm deprecate "@aphrody/inference" ""
npm deprecate "@aphrody/mcp-ui" ""
npm deprecate "@aphrody/paths" ""
npm deprecate "@aphrody/rag-core" ""
npm deprecate "@aphrody/runtime-sdk" ""
npm deprecate "@aphrody/shell-web" ""
npm deprecate "@aphrody/typesafe-sdk" ""
npm deprecate "@aphrody/web" ""
npm deprecate "@aphrody/web-crawl" ""
npm deprecate "@aphrody/webos" ""
npm deprecate "@aphrody/webos-wasm" ""
npm deprecate "@aphrody/xai" ""
```

## crates.io: yanked, 6 versions
Proven restored into `src/<name>` and with zero reverse dependencies on crates.io (30 other proven crates have dependents among the unrestored crates and were skipped). Undo:
```sh
cargo yank --undo --version 1.4.7 aphrody-a2a-grpc
cargo yank --undo --version 1.4.7 aphrody-accounts
cargo yank --undo --version 1.4.7 aphrody-agent-runtime
cargo yank --undo --version 1.4.7 aphrody-gateway
cargo yank --undo --version 0.7.1 aphrody-n2b
cargo yank --undo --version 0.7.0 aphrody-n2b
```

## Irreversible actions executed (owner confirmed in chat, 2026-11-15/16)

- GitHub: 93 repositories deleted (G2 empty: aphrody-labs/grep, labs, onetrue-awk; G1, G3, G4: 90), each gate re-checked (archived, no push after the plan, forks 0 commits ahead) and each proven gone by a 404 from the API.
- Cloudflare: 8 items deleted and proven gone (API 404 or tunnel deleted_at): domain yolo.aphrody.com, worker aphrody-com, worker yolo-aphrody-com, worker aphrody-email-worker, d1 aphrody-app, kv aphrody-app-cache, tunnel fr2, tunnel prod; the fr2 connector was stopped first, desktop.aphrody.app already answered a Cloudflare 502 page with no origin.
- crates.io: 5 crates deleted through the crates.io website (the API refuses crate deletion), each proven gone by a 404: aphrody-a2a-grpc, aphrody-accounts, aphrody-agent-runtime, aphrody-gateway, aphrody-n2b.
- npm: the 10 unpublishes are not done. The registry refuses granular tokens that bypass 2FA for unpublish, and the npmjs.com website asks for the owner security key. They stay deprecated.
