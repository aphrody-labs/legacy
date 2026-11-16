# Purge report: actions executed (2026-11-15)

Gate used everywhere: an item is acted on only when its unique content is proven present in the monorepo or in its canonical upstream (`docs/project/restore-inventory.json`, `docs/audit/legacy-forks.jsonl`), and no live product depends on it.

## Counts

| service | keep | done | blocked: restore first |
|---|---:|---|---:|
| GitHub (aphrody-labs, aphrody-dev) | see inventory | 55 repositories deleted | own repositories not restored |
| Cloudflare | 18 Workers, 12 R2, 4 zones, 5 tunnels, 9 Access apps | 2 DNS records removed | none |
| npm (696 packages) | 669 untouched | 27 packages deprecated (all versions) | 669 |
| crates.io (370 crates) | 364 untouched | 5 crates deleted | 335 |

## GitHub: deleted, 55

Pristine forks (0 commits ahead of upstream, not pinned, parent not named in the tree), three empty repositories (`grep`, `onetrue-awk`, `labs`), four duplicate forks of a parent already forked under the base name (`binaryen-1`, `tauri-1`, `wasm-bindgen-1`, `wasmtime-1`). Deletion is irreversible: there is no undo. Repositories:

- aphrody-labs/typefully-eve-template
- aphrody-labs/developer.chrome.com
- aphrody-labs/web.dev
- aphrody-labs/wireguard-apple
- aphrody-labs/wgctrl-go
- aphrody-labs/wireguard-linux-compat
- aphrody-labs/mksh-cvs2git
- aphrody-labs/a0-repos
- aphrody-labs/ms
- aphrody-labs/agentic-commerce-skills
- aphrody-labs/ai-facts
- aphrody-labs/ai-sdk-computer-use
- aphrody-labs/ai-sdk-flask
- aphrody-labs/ai-sdk-image-generator
- aphrody-labs/ai-sdk-preview-array-output-mode
- aphrody-labs/ai-sdk-preview-multi-steps
- aphrody-labs/ai-sdk-preview-pdf-support
- aphrody-labs/ai-sdk-preview-python-streaming
- aphrody-labs/ai-sdk-sources
- aphrody-labs/ai-sdk-starter-xai
- aphrody-labs/ai-sdk-tool-code-execution
- aphrody-labs/awesome-ai
- aphrody-labs/areweturboyet
- aphrody-labs/cache-components-pages-variations
- aphrody-labs/cache-components-revalidation
- aphrody-labs/cache-components-subshell-composition
- aphrody-labs/capture-the-flag
- aphrody-labs/chat-sdk-demo
- aphrody-labs/cbor-x
- aphrody-labs/chat-sdk-deploy-bot
- aphrody-labs/chat-sdk-form-bot
- aphrody-labs/claude-managed-agents-starter
- aphrody-labs/MINGW-packages-dev
- aphrody-labs/MSYS2-packages-dev
- aphrody-labs/msys2-finances
- aphrody-labs/msys2
- aphrody-labs/msys2-archive
- aphrody-labs/msys2-launcher
- aphrody-labs/msys2-pacman
- aphrody-labs/msys2-texlive
- aphrody-labs/pacdb
- aphrody-labs/package-grokker
- aphrody-labs/pactoys
- aphrody-labs/msys2-sourceforge-export
- aphrody-labs/msys2-twitter-export
- aphrody-labs/bevy_mikktspace
- aphrody-labs/web-task
- aphrody-labs/cratesio-dbdump-csvtab
- aphrody-labs/binaryen-1
- aphrody-labs/tauri-1
- aphrody-labs/wasm-bindgen-1
- aphrody-labs/wasmtime-1
- aphrody-labs/grep
- aphrody-labs/labs
- aphrody-labs/onetrue-awk

## Cloudflare: 2 DNS records removed (zone aphrody.com)

Checked with a real request before removal: `recette-auto.aphrody.com` returned HTTP 530 with the Cloudflare tunnel error page (the target tunnel no longer exists); `open-vercel.aphrody.com` returned HTTP 404 `DEPLOYMENT_NOT_FOUND` from Vercel. Neither is in `device/cloudflare/cloudflare.toml`. Recreate a record with `cf dns records create --zone aphrody.com --body <json>` if needed.

Not disabled: every Worker route and custom domain answers with real content (aphrody-webos routes included), so none meets the "nothing answers" condition.

## npm: deprecated, 27 packages (all versions)

Proven restored into the monorepo (the unit directories of `frameworks/` and `system/`) and not consumed from the registry by the tree or by the live apps (`apps/open`, `rosegriffon`, `shenron`, `auto`, `nt`). The deprecation message published at the time points at the old `packages/<dir>` path, which no longer exists: `Moved into the aphrody-labs/aphrody monorepo (packages/<dir>); use the workspace copy there.` Re-publish it with the current path: `npm deprecate "<package>" "Moved into the aphrody-labs/aphrody monorepo (frameworks/ or system/, find the unit with git ls-files | rg <name>); use the workspace copy there."`. An empty message removes the deprecation. Packages:

- `@aphrody/a2a`
- `@aphrody/ag-ui`
- `@aphrody/ag-ui-client`
- `@aphrody/agent-browser`
- `@aphrody/bun-chromium`
- `@aphrody/bun-google`
- `@aphrody/bun-sql`
- `@aphrody/bun-web`
- `@aphrody/bun-webview-page`
- `@aphrody/chromium`
- `@aphrody/doc-ai`
- `@aphrody/drive-client`
- `@aphrody/gemma-web`
- `@aphrody/google`
- `@aphrody/identity`
- `@aphrody/inference`
- `@aphrody/mcp-ui`
- `@aphrody/paths`
- `@aphrody/rag-core`
- `@aphrody/runtime-sdk`
- `@aphrody/shell-web`
- `@aphrody/typesafe-sdk`
- `@aphrody/web`
- `@aphrody/web-crawl`
- `@aphrody/webos`
- `@aphrody/webos-wasm`
- `@aphrody/xai`

## crates.io: deleted, 5 crates

`aphrody-a2a-grpc`, `aphrody-accounts`, `aphrody-agent-runtime`, `aphrody-gateway` and `aphrody-n2b` (6 versions). Proven restored into the monorepo (`frameworks/` and `system/`) and with zero reverse dependencies on crates.io (30 other proven crates have dependents among the unrestored crates and were skipped). Deletion is irreversible: there is no undo.
