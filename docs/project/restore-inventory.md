# Restore inventory

Generated 2026-11-15 by `scripts/restore-inventory.ts` from the monorepo at `b3c5da6ab`. One row per item in `restore-inventory.json` (3422 rows); this file lists the counts, every own repository, every restore action and the blocked items. Content is compared by git blob oid (not by name): a remote tree is read without blobs (treeless clone), tarballs are hashed in memory, VPS files are hashed on the host.

## Counts by source and status

| source | present-identical | present-newer | present-older | unique-commits | missing | blocked | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| cloudflare | 22 | 0 | 0 | 0 | 0 | 0 | 22 |
| crates.io | 53 | 1 | 8 | 0 | 308 | 0 | 370 |
| github | 978 | 1 | 18 | 29 | 101 | 0 | 1127 |
| history | 17 | 208 | 0 | 0 | 182 | 0 | 407 |
| local | 18 | 0 | 0 | 1 | 0 | 0 | 19 |
| npm | 27 | 0 | 25 | 0 | 644 | 0 | 696 |
| vps | 721 | 0 | 22 | 9 | 29 | 0 | 781 |

Status meaning: present-identical (same content in the tree, or restored by this run), present-newer (tree evolved past the source), present-older (source holds content the tree lacks or older tree copy), unique-commits (commits or files not in the tree history), missing (no content in the tree).

## Restored by this run (79)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| aphrody-a2a |  | 2026-10-23 | present-identical | src/a2a | restored into src/a2a from the published crate 1.4.7 (v1.4.7; 16 files, 12 source, 0% shared) |
| aphrody-a2a-client |  | 2026-10-23 | present-identical | src/a2a-client | restored into src/a2a-client from the published crate 1.4.7 (v1.4.7; 18 files, 15 source, 0% shared) |
| aphrody-a2a-coord |  | 2026-10-23 | present-identical | src/a2a-coord | restored into src/a2a-coord from the published crate 1.4.7 (v1.4.7; 23 files, 20 source, 0% shared) |
| aphrody-a2a-grpc |  | 2026-10-23 | present-identical | src/a2a-grpc | restored into src/a2a-grpc from the published crate 1.4.7 (v1.4.7; 11 files, 8 source, 0% shared) |
| aphrody-a2a-pb |  | 2026-10-23 | present-identical | src/a2a-pb | restored into src/a2a-pb from the published crate 1.4.7 (v1.4.7; 17 files, 14 source, 0% shared) |
| aphrody-a2a-server |  | 2026-10-23 | present-identical | src/a2a-server | restored into src/a2a-server from the published crate 1.4.7 (v1.4.7; 27 files, 24 source, 0% shared) |
| aphrody-accounts |  | 2026-10-30 | present-identical | src/accounts | restored into src/accounts from the published crate 1.4.7 (v1.4.7; 17 files, 14 source, 0% shared) |
| aphrody-agent-home |  | 2026-10-23 | present-identical | src/agent-home | restored into src/agent-home from the published crate 1.4.7 (v1.4.7; 45 files, 41 source, 0% shared) |
| aphrody-agent-proto |  | 2026-10-23 | present-identical | src/agent-proto | restored into src/agent-proto from the published crate 1.4.7 (v1.4.7; 8 files, 4 source, 0% shared) |
| aphrody-agent-runtime |  | 2026-11-03 | present-identical | src/agent-runtime | restored into src/agent-runtime from the published crate 1.4.7 (v1.4.7; 15 files, 12 source, 0% shared) |
| aphrody-agent-tools |  | 2026-11-03 | present-identical | src/agent-tools | restored into src/agent-tools from the published crate 1.4.7 (v1.4.7; 15 files, 12 source, 0% shared) |
| aphrody-antigravity |  | 2026-10-23 | present-identical | src/antigravity | restored into src/antigravity from the published crate 1.4.7 (v1.4.7; 16 files, 13 source, 0% shared) |
| aphrody-boq |  | 2026-11-13 | present-identical | src/boq | restored into src/boq from the published crate 1.4.8 (v1.4.8; 6 files, 3 source, 0% shared) |
| aphrody-embed |  | 2026-10-23 | present-identical | src/embed | restored into src/embed from the published crate 1.4.7 (v1.4.7; 34 files, 29 source, 0% shared) |
| aphrody-gateway |  | 2026-10-23 | present-identical | src/gateway | restored into src/gateway from the published crate 1.4.7 (v1.4.7; 13 files, 10 source, 0% shared) |
| aphrody-gemini-runtime |  | 2026-11-03 | present-identical | src/gemini-runtime | restored into src/gemini-runtime from the published crate 1.4.7 (v1.4.7; 11 files, 8 source, 0% shared) |
| aphrody-gemini-web |  | 2026-10-23 | present-identical | src/gemini-web | restored into src/gemini-web from the published crate 1.4.7 (v1.4.7; 18 files, 15 source, 0% shared) |
| aphrody-google |  | 2026-11-03 | present-identical | src/google | restored into src/google from the published crate 1.4.7 (v1.4.7; 10 files, 7 source, 0% shared) |
| aphrody-identity |  | 2026-10-23 | present-identical | src/identity | restored into src/identity from the published crate 1.4.7 (v1.4.7; 71 files, 38 source, 0% shared) |
| aphrody-infer |  | 2026-10-23 | present-identical | src/infer | restored into src/infer from the published crate 1.4.7 (v1.4.7; 9 files, 6 source, 0% shared) |
| aphrody-jev |  | 2026-11-13 | present-identical | src/jev | restored into src/jev from the published crate 1.4.8 (v1.4.8; 23 files, 18 source, 4% shared) |
| aphrody-llama |  | 2026-10-23 | present-identical | src/llama | restored into src/llama from the published crate 1.4.7 (v1.4.7; 26 files, 23 source, 0% shared) |
| aphrody-llama-server |  | 2026-10-23 | present-identical | src/llama-server | restored into src/llama-server from the published crate 1.4.7 (v1.4.7; 30 files, 27 source, 0% shared) |
| aphrody-llama-sys |  | 2026-10-23 | present-identical | src/llama-sys | restored into src/llama-sys from the published crate 1.4.7 (v1.4.7; 16 files, 13 source, 0% shared) |
| aphrody-mcp-client |  | 2026-11-03 | present-identical | src/mcp-client | restored into src/mcp-client from the published crate 1.4.7 (v1.4.7; 23 files, 20 source, 0% shared) |
| aphrody-memory |  | 2026-10-30 | present-identical | src/memory | restored into src/memory from the published crate 1.4.7 (v1.4.7; 24 files, 21 source, 0% shared) |
| aphrody-ml-config |  | 2026-10-23 | present-identical | src/ml-config | restored into src/ml-config from the published crate 1.4.7 (v1.4.7; 5 files, 2 source, 0% shared) |
| aphrody-ml-runtime |  | 2026-10-23 | present-identical | src/ml-runtime | restored into src/ml-runtime from the published crate 1.4.7 (v1.4.7; 27 files, 24 source, 0% shared) |
| aphrody-model-antigravity |  | 2026-10-23 | present-identical | src/model-antigravity | restored into src/model-antigravity from the published crate 1.4.7 (v1.4.7; 6 files, 3 source, 0% shared) |
| aphrody-model-client |  | 2026-10-23 | present-identical | src/model-client | restored into src/model-client from the published crate 1.4.7 (v1.4.7; 19 files, 16 source, 0% shared) |
| aphrody-models |  | 2026-10-23 | present-identical | src/models | restored into src/models from the published crate 1.4.7 (v1.4.7; 19 files, 15 source, 0% shared) |
| aphrody-n2b |  | 2026-11-13 | present-identical | src/n2b | restored into src/n2b from the published crate 0.7.1 (v0.7.1; 47 files, 39 source, 0% shared) |
| aphrody-n2b-core |  | 2026-11-13 | present-identical | src/n2b-core | restored into src/n2b-core from the published crate 0.7.1 (v0.7.1; 53 files, 51 source, 0% shared) |
| aphrody-n2b-registry |  | 2026-11-13 | present-identical | src/n2b-registry | restored into src/n2b-registry from the published crate 0.7.1 (v0.7.1; 12 files, 10 source, 0% shared) |
| aphrody-n2b-types |  | 2026-11-13 | present-identical | src/n2b-types | restored into src/n2b-types from the published crate 0.7.1 (v0.7.1; 8 files, 5 source, 0% shared) |
| aphrody-labs/ai-triad | TypeScript | 2026-11-12 | present-identical | packages/ai-triad | restored into packages/ai-triad (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/aphrody-app | Rust | 2026-11-11 | present-identical | apps/aphrody-app | restored into apps/aphrody-app (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/aphrody-web-archive | TypeScript | 2026-11-12 | present-identical | apps/aphrody-web | restored into apps/aphrody-web (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/brain | TypeScript | 2026-11-12 | present-identical | packages/brain | restored into packages/brain (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/bun-parity | TypeScript | 2026-11-12 | present-identical | packages/bun-parity | restored into packages/bun-parity (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/bun-plugins | TypeScript | 2026-11-12 | present-identical | packages/bun-plugins | restored into packages/bun-plugins (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/chromium-bun | TypeScript | 2026-11-12 | present-identical | packages/chromium-bun | restored into packages/chromium-bun (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/forge | TypeScript | 2026-11-11 | present-identical | packages/forge | restored into packages/forge (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/gcloud-learn | TypeScript | 2026-11-07 | present-identical | packages/gcloud-learn | restored into packages/gcloud-learn (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/gemini-super-app | Rust | 2026-11-03 | present-identical | apps/gemini-super-app + src/flowcat-*, src/bun-video-native, src/gemini-super-tauri, audio crates | restored into apps/gemini-super-app + src/flowcat-*, src/bun-video-native, src/gemini-super-tauri, audio crates (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/google-bun | TypeScript | 2026-11-09 | present-identical | packages/google-bun | restored into packages/google-bun (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/google-design | TypeScript | 2026-11-11 | present-identical | packages/google-design | restored into packages/google-design (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/google-dream | TypeScript | 2026-11-07 | present-identical | packages/google-dream | restored into packages/google-dream (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/knowledge-engine | TypeScript | 2026-11-12 | present-identical | packages/knowledge-engine | restored into packages/knowledge-engine (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/mesh-vn | TypeScript | 2026-11-12 | present-identical | infra/mesh-vn | restored into infra/mesh-vn (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/pi-opencode | TypeScript | 2026-11-12 | present-identical | packages/pi-opencode | restored into packages/pi-opencode (restore-import: gitleaks clean, personal values scrubbed) |
| aphrody-labs/ring3-agent | Rust | 2026-11-12 | present-identical | src/ring3-agent | restored into src/ring3-agent (restore-import: gitleaks clean, personal values scrubbed) |
| @aphrody/a2a |  | 2026-10-23 | present-identical | packages/a2a | restored into packages/a2a from the published tarball 1.4.7 (v1.4.7; 14 files, 13 source, 0% shared) |
| @aphrody/ag-ui |  | 2026-10-23 | present-identical | packages/ag-ui | restored into packages/ag-ui from the published tarball 1.4.7 (v1.4.7; 8 files, 3 source, 13% shared) |
| @aphrody/ag-ui-client |  | 2026-10-03 | present-identical | packages/ag-ui-client | restored into packages/ag-ui-client from the published tarball 1.0.1-aphrody.1 (v1.0.1-aphrody.1; 84 files, 41 source, 0% shared) |
| @aphrody/agent-browser |  | 2026-10-09 | present-identical | packages/agent-browser | restored into packages/agent-browser from the published tarball 1.0.0-canary.4 (v1.0.0-canary.4; 12 files, 11 source, 0% shared) |
| @aphrody/bun-chromium |  | 2026-10-23 | present-identical | packages/bun-chromium | restored into packages/bun-chromium from the published tarball 1.4.7 (v1.4.7; 9 files, 7 source, 0% shared) |
| @aphrody/bun-google |  | 2026-10-23 | present-identical | packages/bun-google | restored into packages/bun-google from the published tarball 1.4.7 (v1.4.7; 18 files, 16 source, 0% shared) |
| @aphrody/bun-sql |  | 2026-10-23 | present-identical | packages/bun-sql | restored into packages/bun-sql from the published tarball 1.4.7 (v1.4.7; 13 files, 12 source, 0% shared) |
| @aphrody/bun-web |  | 2026-10-23 | present-identical | packages/bun-web | restored into packages/bun-web from the published tarball 1.4.7 (v1.4.7; 43 files, 40 source, 0% shared) |
| @aphrody/bun-webview-page |  | 2026-10-23 | present-identical | packages/bun-webview-page | restored into packages/bun-webview-page from the published tarball 1.4.7 (v1.4.7; 6 files, 5 source, 0% shared) |
| @aphrody/chromium |  | 2026-11-03 | present-identical | packages/chromium | restored into packages/chromium from the published tarball 1.4.7 (v1.4.7; 23 files, 21 source, 0% shared) |
| @aphrody/doc-ai |  | 2026-10-23 | present-identical | packages/doc-ai | restored into packages/doc-ai from the published tarball 1.4.7 (v1.4.7; 10 files, 9 source, 0% shared) |
| @aphrody/drive-client |  | 2026-10-23 | present-identical | packages/drive-client | restored into packages/drive-client from the published tarball 1.4.7 (v1.4.7; 30 files, 29 source, 0% shared) |
| @aphrody/gemma-web |  | 2026-10-30 | present-identical | packages/gemma-web | restored into packages/gemma-web from the published tarball 1.4.7 (v1.4.7; 14 files, 13 source, 0% shared) |
| @aphrody/google |  | 2026-10-23 | present-identical | packages/google | restored into packages/google from the published tarball 1.4.7 (v1.4.7; 15 files, 13 source, 0% shared) |
| @aphrody/identity |  | 2026-10-23 | present-identical | packages/identity | restored into packages/identity from the published tarball 1.4.7 (v1.4.7; 116 files, 31 source, 1% shared) |
| @aphrody/inference |  | 2026-10-07 | present-identical | packages/inference | restored into packages/inference from the published tarball 0.1.1 (v0.1.1; 3 files, 2 source, 0% shared) |
| @aphrody/mcp-ui |  | 2026-10-03 | present-identical | packages/mcp-ui | restored into packages/mcp-ui from the published tarball 7.1.1-aphrody.1 (v7.1.1-aphrody.1; 22 files, 10 source, 0% shared) |
| @aphrody/paths |  | 2026-10-23 | present-identical | packages/paths | restored into packages/paths from the published tarball 1.4.7 (v1.4.7; 4 files, 1 source, 25% shared) |
| @aphrody/rag-core |  | 2026-10-23 | present-identical | packages/rag-core | restored into packages/rag-core from the published tarball 1.4.7 (v1.4.7; 7 files, 6 source, 0% shared) |
| @aphrody/runtime-sdk |  | 2026-10-23 | present-identical | packages/runtime-sdk | restored into packages/runtime-sdk from the published tarball 1.4.7 (v1.4.7; 21 files, 19 source, 0% shared) |
| @aphrody/shell-web |  | 2026-10-23 | present-identical | packages/shell-web | restored into packages/shell-web from the published tarball 1.4.7 (v1.4.7; 3 files, 2 source, 0% shared) |
| @aphrody/typesafe-sdk |  | 2026-10-13 | present-identical | packages/typesafe-sdk | restored into packages/typesafe-sdk from the published tarball 0.6.2 (v0.6.2; 7 files, 1 source, 0% shared) |
| @aphrody/web |  | 2026-10-23 | present-identical | packages/web | restored into packages/web from the published tarball 1.4.7 (v1.4.7; 96 files, 81 source, 0% shared) |
| @aphrody/web-crawl |  | 2026-11-01 | present-identical | packages/web-crawl | restored into packages/web-crawl from the published tarball 1.4.7 (v1.4.7; 4 files, 3 source, 0% shared) |
| @aphrody/webos |  | 2026-10-23 | present-identical | packages/webos | restored into packages/webos from the published tarball 1.4.7 (v1.4.7; 97 files, 80 source, 1% shared) |
| @aphrody/webos-wasm |  | 2026-10-23 | present-identical | packages/webos-wasm | restored into packages/webos-wasm from the published tarball 1.4.7 (v1.4.7; 4 files, 3 source, 0% shared) |
| @aphrody/xai |  | 2026-10-05 | present-identical | packages/xai | restored into packages/xai from the published tarball 1.1.6 (v1.1.6; 8 files, 6 source, 0% shared) |

## Own repositories not restored (GitHub, non-fork) (74)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| aphrody-dev/aphrody-dev | - | 2026-11-15 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (empty repository) |
| aphrody-labs/.github | - | 2026-11-15 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (empty repository) |
| aphrody-labs/agent | TypeScript | 2026-11-12 | present-newer | packages/ai-os(14), src/agent(1) | present in the tree (moved or evolved); the tree copy is kept |
| aphrody-labs/ai-os | TypeScript | 2026-11-12 | present-older | src/rubash(6) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/antigravity-sdk-python | Python | 2026-11-14 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (5 branch tip(s) not in the monorepo history) |
| aphrody-labs/aphrody | Rust | 2026-11-15 | present-identical | src/rubash(3251), src/lore(1851), apps/auto(1637) | present in the tree (moved or evolved); the tree copy is kept |
| aphrody-labs/aphrody-m3 | TypeScript | 2026-11-12 | missing | src/rubash(5), apps/auto(2), packages/upstream(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (10 branch tip(s) not in the monorepo history) |
| aphrody-labs/auto | TypeScript | 2026-11-13 | present-older | apps/auto(1278), licenses/LICENSE-APACHE(1), src/py2bun(1) | present in the tree (moved or evolved); the tree copy is kept (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/bash | C | 2026-11-12 | missing | src/rubash(15) | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (10 branch tip(s) not in the monorepo history) |
| aphrody-labs/bench | Rust | 2026-11-12 | present-older | bench/src(6), bench/tier4_dotnet(2), bench/tier5_bun(2) | present in the tree (moved or evolved); the tree copy is kept (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/binutils-gdb | C | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (405 branch tip(s) not in the monorepo history) |
| aphrody-labs/bun-distribution | Rust | 2026-11-13 | missing | licenses/LICENSE-APACHE(1), src/re(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/bun-os | Rust | 2026-11-13 | present-older | apps/auto(83), src/re(18), src/steam(16) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/carbon | HTML | 2026-11-07 | missing |  | archived unit of the former monorepo; content only on GitHub (restore candidate) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/cours-ia | TypeScript | 2026-10-22 | present-older | src/runtime(1) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/dash | C | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/depot | Rust | 2026-11-11 | present-older | src/depot(22), src/re(5), src/core(1) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/depot_tools | Python | 2026-11-14 | missing | src/rubash(4), licenses/LICENSE-APACHE(1) | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/env-kit | TypeScript | 2026-11-11 | present-older | packages/env-kit(8) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/fairy-tail-archive | TypeScript | 2026-11-07 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/gamescope-rs | Rust | 2026-11-12 | present-older | src/wayland(12), infra/gamescope-web(4) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/gaming | TypeScript | 2026-11-15 | unique-commits | packages/gaming(17), packages/upstream(2) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/gawk | C | 2026-11-12 | missing | src/rubash(50) | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (25 branch tip(s) not in the monorepo history) |
| aphrody-labs/gnu-findutils | C | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (12 branch tip(s) not in the monorepo history) |
| aphrody-labs/gnu-sed | Shell | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/google-bun-dup-yolo-rs | TypeScript | 2026-11-08 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/grep | - | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (empty repository) |
| aphrody-labs/infra | Go | 2026-11-12 | present-older | infra/gitlab(2), infra/.gitignore(1), infra/mail(1) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/labs | - | 2026-11-12 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (empty repository) |
| aphrody-labs/make | C | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (4 branch tip(s) not in the monorepo history) |
| aphrody-labs/msys | TypeScript | 2026-11-12 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/nt | TypeScript | 2026-11-12 | present-older | apps/nt(12) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/onetrue-awk | - | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (empty repository) |
| aphrody-labs/open | TypeScript | 2026-11-15 | missing | src/rubash(282), .agents/hooks.json(88), apps/auto(20) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/r2b | TypeScript | 2026-11-13 | missing | .agents/skills(26), licenses/LICENSE-APACHE(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/readline | C | 2026-11-12 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (7 branch tip(s) not in the monorepo history) |
| aphrody-labs/rosegriffon | TypeScript | 2026-11-14 | missing | .agents/skills(24), infra/fleet(9), src/rubash(5) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (6 branch tip(s) not in the monorepo history) |
| aphrody-labs/rust-stack | Rust | 2026-11-12 | present-older | src/rust-stack(4) | present in the tree (moved or evolved); the tree copy is kept (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/scap | Rust | 2026-11-05 | missing | src/rubash(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/shenron | TypeScript | 2026-11-15 | missing | .agents/skills(24), src/re(7), apps/auto(2) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (15 branch tip(s) not in the monorepo history) |
| aphrody-labs/shenron-config | TypeScript | 2026-11-03 | missing | .agents/hooks.json(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/steam-depot | Rust | 2026-11-14 | present-older | src/steam(28), src/wayland(1) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/steam-runtime-tools | C | 2026-11-14 | missing | src/rubash(49) | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/steamos-manager | Rust | 2026-11-13 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/tao | Rust | 2026-11-05 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/tauri-action | TypeScript | 2026-11-05 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/unix | Rust | 2026-11-11 | missing | infra/os(10) | archived unit of the former monorepo; content only on GitHub (restore candidate) (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/wayland | Rust | 2026-11-12 | present-older | src/wayland(15), src/drivers(5), src/posix(2) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/wayland-c | C | 2026-11-14 | missing |  | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/wck | TypeScript | 2026-11-12 | present-older | packages/wck(8) | archived unit merged into the tree; the tree copy is newer (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/wii-os | C++ | 2026-11-07 | missing | src/rubash(159), .agents/skills(5), licenses/LICENSE-APACHE(4) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/xtask | Rust | 2026-11-11 | missing |  | archived unit of the former monorepo; content only on GitHub (restore candidate) (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo | Rust | 2026-10-06 | missing | apps/auto(30), packages/upstream(1), src/rubash(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (3 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-ai | Rust | 2026-11-08 | missing | apps/auto(21), src/ui(10), licenses/LICENSE-APACHE(2) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-backend | Rust | 2026-11-13 | missing | licenses/LICENSE-APACHE(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-backend-dup-yolo-rs | Rust | 2026-11-08 | missing | licenses/LICENSE-APACHE(1) | archived unit of the former monorepo; content only on GitHub (restore candidate) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-bun | TypeScript | 2026-11-08 | missing | src/rubash(2), licenses/LICENSE-APACHE(1), .agents/hooks.json(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-cloudflare | TypeScript | 2026-11-09 | missing | packages/omniu(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-cross | Rust | 2026-11-08 | missing | src/re(18), licenses/LICENSE-APACHE(4), src/py2bun(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-engine | Python | 2026-11-09 | missing | .agents/skills(16) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-hub | Rust | 2026-11-07 | missing | src/rubash(1) | archived unit of the former monorepo; content only on GitHub (restore candidate) (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-os | TypeScript | 2026-11-09 | missing | src/rubash(3), infra/os(2), licenses/LICENSE-APACHE(2) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-plugins | JavaScript | 2026-11-09 | missing | .agents/skills(59), src/rubash(2), licenses/LICENSE-APACHE(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-re | Rust | 2026-11-08 | missing | src/re(31), src/steam(16), .agents/skills(16) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-rs | TypeScript | 2026-11-09 | present-older | apps/auto(413), src/rubash(3), licenses/LICENSE-APACHE(2) | present in the tree (moved or evolved); the tree copy is kept (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-stack | Rust | 2026-11-09 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-standards | TypeScript | 2026-11-08 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-ui | TypeScript | 2026-11-11 | missing | apps/auto(352), .agents/skills(55), src/ui(42) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (2 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-vendor | TypeScript | 2026-11-07 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-vps | TypeScript | 2026-11-09 | missing | licenses/LICENSE-APACHE(1) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-vps-dup-labs | TypeScript | 2026-11-07 | missing | licenses/LICENSE-APACHE(1) | archived unit of the former monorepo; content only on GitHub (restore candidate) (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-web | HTML | 2026-11-08 | missing | src/rubash(17), .agents/skills(9), licenses/LICENSE-APACHE(3) | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/yolo-zig | TypeScript | 2026-11-08 | missing |  | own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it (1 branch tip(s) not in the monorepo history) |
| aphrody-labs/zig | C | 2026-11-12 | missing | src/rubash(32) | upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party) (64 branch tip(s) not in the monorepo history) |

## Forks ahead of upstream (28)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| aphrody-labs/A2A | Shell | 2026-11-13 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of a2aproject/A2A, pinned in tree) |
| aphrody-labs/agent-client-protocol | Rust | 2026-11-13 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of agentclientprotocol/agent-client-protocol, pinned in tree) |
| aphrody-labs/allocative | Rust | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of facebookexperimental/allocative) |
| aphrody-labs/base-ui | TypeScript | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 4 commit(s) ahead of mui/base-ui) |
| aphrody-labs/better-auth | TypeScript | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 7 commit(s) ahead of better-auth/better-auth) |
| aphrody-labs/bun | Rust | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 27 commit(s) ahead of oven-sh/bun, pinned in tree) |
| aphrody-labs/fluentui | TypeScript | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 7 commit(s) ahead of microsoft/fluentui, pinned in tree) |
| aphrody-labs/gamescope | C++ | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 2832 commit(s) ahead of ValveSoftware/gamescope, pinned in tree) |
| aphrody-labs/ghidra | Java | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 9 commit(s) ahead of NationalSecurityAgency/ghidra, pinned in tree) |
| aphrody-labs/gitingest | Python | 2026-11-09 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of coderamp-labs/gitingest) |
| aphrody-labs/hermes-agent | Python | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of NousResearch/hermes-agent, pinned in tree) |
| aphrody-labs/jules-action | - | 2026-11-13 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of google-labs-code/jules-action, pinned in tree) |
| aphrody-labs/lfs | XSLT | 2026-11-13 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 29 commit(s) ahead of lfs-book/lfs, pinned in tree) |
| aphrody-labs/mochi-desktop | Python | 2026-11-01 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of miflow13/mochi-desktop) |
| aphrody-labs/next.js | JavaScript | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 6 commit(s) ahead of vercel/next.js) |
| aphrody-labs/niubash | Rust | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of unixwin/niubash, pinned in tree) |
| aphrody-labs/node-api-dotnet | C# | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of microsoft/node-api-dotnet, pinned in tree) |
| aphrody-labs/openclaw | TypeScript | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 3 commit(s) ahead of openclaw/openclaw, pinned in tree) |
| aphrody-labs/rclone | Go | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of rclone/rclone) |
| aphrody-labs/rubash | Rust | 2026-11-15 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 8 commit(s) ahead of unixwin/rubash, pinned in tree) |
| aphrody-labs/russh | Rust | 2026-11-13 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 2 commit(s) ahead of Eugeny/russh, pinned in tree) |
| aphrody-labs/tailwindcss | TypeScript | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 2 commit(s) ahead of tailwindlabs/tailwindcss) |
| aphrody-labs/ui | TypeScript | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 3 commit(s) ahead of shadcn-ui/ui, pinned in tree) |
| aphrody-labs/webui | Rust | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 4 commit(s) ahead of microsoft/webui, pinned in tree) |
| aphrody-labs/windows-rs | Rust | 2026-11-12 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 29 commit(s) ahead of microsoft/windows-rs, pinned in tree) |
| aphrody-labs/yolo-ui-dup-labs | Rust | 2026-11-07 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 101 commit(s) ahead of DioxusLabs/dioxus) |
| aphrody-labs/zed | Rust | 2026-11-14 | unique-commits |  | kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy) (fork 1 commit(s) ahead of zed-industries/zed, pinned in tree) |
| EpicGames/DirectXShaderCompiler | C++ | 2026-09-18 | unique-commits |  | not ours: official Epic Games org (Unreal Engine by interop only); no copy (third-party org) |

## VPS: repositories with unpushed or uncommitted work (9)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| /<home>/ubuntu/.codex/.tmp/plugins |  | 2026-09-28 | unique-commits |  | no remote; compared with the tree: older copy, kept on the host (read-only inventory) (no remote; unpushed=1) |
| /<home>/ubuntu/.codex/.tmp/marketplaces/aphrody-user |  | 2026-10-08 | unique-commits |  | 1 uncommitted file(s) on the host; owned by the agent working there (see git status on the host) (origin=https://github.com/aphrody-labs/plugins.git,; unpushed=0 dirty=1) |
| /srv/src |  | 2026-11-15 | unique-commits |  | 3 uncommitted file(s) on the host; owned by the agent working there (see git status on the host) (origin=https://github.com/aphrody-labs/src.git,; unpushed=0 dirty=3; head in monorepo history) |
| /<home>/agent/work/ba |  | 2026-11-14 | unique-commits |  | commits older than the pushed history (superseded rebase or pre-merge history); fetch + push to a rescue branch of its remote when worth keeping (origin=https://github.com/aphrody-labs/better-auth.git,upstream=https://github.com/better-auth/better-auth.git,; unpushed=8 dirty=0) |
| /root/agents/interop/ai-os |  | 2026-11-13 | unique-commits |  | no remote; compared with the tree: older copy, kept on the host (read-only inventory) (no remote; unpushed=1 dirty=3) |
| /root/ay-build/src |  | 2026-11-13 | unique-commits |  | commits older than the pushed history (superseded rebase or pre-merge history); fetch + push to a rescue branch of its remote when worth keeping (origin=https://github.com/aphrody-dev/src,; unpushed=5 dirty=0; head in monorepo history) |
| /root/src/rg-e2e |  | 2026-11-12 | unique-commits |  | 1 uncommitted file(s) on the host; owned by the agent working there (see git status on the host) (origin=https://github.com/aphrody-labs/rosegriffon.git,; unpushed=0 dirty=1) |
| /root/src/rosegriffon |  | 2026-11-12 | unique-commits |  | 2 uncommitted file(s) on the host; owned by the agent working there (see git status on the host) (origin=https://github.com/aphrody-labs/rosegriffon.git,; unpushed=0 dirty=2) |
| /srv/src |  | 2026-11-15 | unique-commits |  | 2 uncommitted file(s) on the host; owned by the agent working there (see git status on the host) (origin=https://github.com/aphrody-labs/src.git,; unpushed=0 dirty=2; head in monorepo history) |

## VPS: source trees without .git (70)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| /srv/native-ui/.upstream |  |  | missing | src/runtime(19), apps/gemini-super-app(6) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (35/28256 source files shared (0%)) |
| /srv/native-ui/crates |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/354 source files shared (0%)) |
| /srv/native-ui/extra |  |  | missing | src/runtime(19), .agents/hooks.json(4) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (31/25124 source files shared (0%)) |
| /srv/pipe-src |  |  | present-older | bunfig.toml(1), rust-toolchain.toml(1) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (6/15 source files shared (40%)) |
| /srv/pipe-src/.agents |  |  | present-identical | .agents/skills(836), .agents/.claude-plugin(1) | content already in the tree (841/858 source files shared (98%)) |
| /srv/pipe-src/.claude |  |  | present-older | .claude/agent-memory(3), .claude/agents(2) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (6/16 source files shared (38%)) |
| /srv/pipe-src/apps |  |  | present-older | apps/auto(1026), apps/aphrody(24) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (1061/1425 source files shared (74%)) |
| /srv/pipe-src/assets |  |  | present-older | packages/design(6) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (6/7 source files shared (86%)) |
| /srv/pipe-src/bench |  |  | present-identical | bench/src(13), bench/results(1) | content already in the tree (20/20 source files shared (100%)) |
| /srv/pipe-src/docs |  |  | present-older | docs/lore(215), docs/native(71) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (451/567 source files shared (80%)) |
| /srv/pipe-src/infra |  |  | present-older | infra/fleet(30), infra/os(11) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (96/189 source files shared (51%)) |
| /srv/pipe-src/licenses |  |  | present-identical | licenses/lore(7) | content already in the tree (7/7 source files shared (100%)) |
| /srv/pipe-src/packages |  |  | present-older | packages/ai-os(177), packages/chromium-bun(51) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (482/1448 source files shared (33%)) |
| /srv/pipe-src/plugins |  |  | present-older | infra/agents(8) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (8/10 source files shared (80%)) |
| /srv/pipe-src/scripts |  |  | present-older | scripts/bench(53), scripts/android-setup.ts(1) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (66/89 source files shared (74%)) |
| /srv/pipe-src/src |  |  | present-identical | src/lore(1810), src/jsc(1431) | content already in the tree (9129/9224 source files shared (99%)) |
| /srv/pipe-src/test |  |  | present-identical | test/lore(34), test/conformance(3) | content already in the tree (39/41 source files shared (95%)) |
| /srv/pipe-src/third_party |  |  | present-identical | third_party/design-mirror(598), third_party/chromium-trackers.json(1) | content already in the tree (603/603 source files shared (100%)) |
| /srv/pipe-src/tools |  |  | present-identical | tools/lore(226), tools/gnu-index(5) | content already in the tree (238/242 source files shared (98%)) |
| /srv/research/adb |  |  | present-identical | src/lore(1810), src/jsc(1431) | content already in the tree (13610/14082 source files shared (97%)) |
| /srv/research/adb2 |  |  | present-identical | src/jsc(1431), src/lint(1295) | content already in the tree (5219/5266 source files shared (99%)) |
| /srv/research/adb3 |  |  | present-identical | src/lore(1810), src/jsc(1431) | content already in the tree (13608/14031 source files shared (97%)) |
| /srv/research/android |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/21 source files shared (0%)) |
| /srv/research/gnu |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/5 source files shared (0%)) |
| /srv/research/gsrc |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/7 source files shared (0%)) |
| /srv/research/gsrc-export |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/7 source files shared (0%)) |
| /srv/research/guix |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/44 source files shared (0%)) |
| /srv/research/mirror |  |  | missing | apps/gemini-super-app(1) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (1/779 source files shared (0%)) |
| /srv/research/site-mirror |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/67 source files shared (0%)) |
| /<home>/agent/agents/src |  |  | present-older | dist-workspace.toml(1), bunfig.toml(1) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (11/16 source files shared (69%)) |
| /<home>/agent/agents/src/.agents |  |  | present-identical | .agents/skills(876), .agents/.claude-plugin(1) | content already in the tree (882/884 source files shared (100%)) |
| /<home>/agent/agents/src/.claude |  |  | present-older | .claude/agents(6), .claude/agent-memory(3) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (10/16 source files shared (63%)) |
| /<home>/agent/agents/src/apps |  |  | present-identical | apps/auto(1365), apps/nt(72) | content already in the tree (1469/1469 source files shared (100%)) |
| /<home>/agent/agents/src/bench |  |  | present-identical | bench/src(13), bench/shell(4) | content already in the tree (25/25 source files shared (100%)) |
| /<home>/agent/agents/src/docs |  |  | present-older | docs/lore(215), docs/native(101) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (551/590 source files shared (93%)) |
| /<home>/agent/agents/src/infra |  |  | present-older | infra/fleet(62), infra/os(22) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (180/202 source files shared (89%)) |
| /<home>/agent/agents/src/licenses |  |  | present-identical | licenses/lore(7) | content already in the tree (7/7 source files shared (100%)) |
| /<home>/agent/agents/src/packages |  |  | present-identical | packages/omniu(335), packages/ai-os(241) | content already in the tree (987/1021 source files shared (97%)) |
| /<home>/agent/agents/src/plugins |  |  | present-older | infra/agents(9) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (9/10 source files shared (90%)) |
| /<home>/agent/agents/src/scripts |  |  | present-older | scripts/bench(68), scripts/android-setup.ts(1) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (95/101 source files shared (94%)) |
| /<home>/agent/agents/src/src |  |  | present-identical | src/rubash(2940), src/lore(1830) | content already in the tree (13209/13223 source files shared (100%)) |
| /<home>/agent/agents/src/test |  |  | present-identical | test/diffcorpus(41), test/lore(35) | content already in the tree (86/86 source files shared (100%)) |
| /<home>/agent/agents/src/third_party |  |  | present-identical | third_party/design-mirror(598), third_party/ECOSYSTEM.toml(1) | content already in the tree (603/603 source files shared (100%)) |
| /<home>/agent/agents/src/tools |  |  | present-identical | tools/lore(226), packages/chromium-bun(6) | content already in the tree (249/250 source files shared (100%)) |
| /<home>/agent/agents/src/var |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/376 source files shared (0%)) |
| /<home>/agent/better-auth |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/16 source files shared (0%)) |
| /<home>/agent/better-auth/.changeset |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/5 source files shared (0%)) |
| /<home>/agent/better-auth/demo |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/269 source files shared (0%)) |
| /<home>/agent/better-auth/docs |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/181 source files shared (0%)) |
| /<home>/agent/better-auth/e2e |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/233 source files shared (0%)) |
| /<home>/agent/better-auth/packages |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/1242 source files shared (0%)) |
| /<home>/agent/better-auth/test |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/9 source files shared (0%)) |
| /root/build/steam/depotdownloader |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/7 source files shared (0%)) |
| /root/build/steam/steamroom |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/637 source files shared (0%)) |
| /root/labs |  |  | missing | test/lore(1) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (1/6 source files shared (17%)) |
| /root/labs/conformance |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/9 source files shared (0%)) |
| /root/labs/crates |  |  | present-older | src/lore(1700), test/lore(29) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (1750/1880 source files shared (93%)) |
| /root/labs/licenses |  |  | present-older | licenses/lore(2) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (2/7 source files shared (29%)) |
| /root/labs/plugins |  |  | missing | .agents/skills(23) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (23/167 source files shared (14%)) |
| /root/labs/vendor |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/60 source files shared (0%)) |
| /root/mlab/labs |  |  | present-older | src/lore(1695), test/lore(30) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (1741/1945 source files shared (90%)) |
| /root/mlab/merged |  |  | present-older | src/lore(1695), tools/lore(188) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (2607/8137 source files shared (32%)) |
| /root/mlab/src |  |  | present-older | src/depot(54), packages/google-design(44) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (422/1133 source files shared (37%)) |
| /root/mlab/target-labs |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/1360 source files shared (0%)) |
| /root/mlab/target-merged |  |  | missing | apps/gemini-super-app(1) | scratch, benchmark or research tree on the host (not our product code); kept, no copy (1/3117 source files shared (0%)) |
| /root/mlab/target-src |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/1063 source files shared (0%)) |
| /root/ws/crates |  |  | present-older | src/lore(1744), src/depot(65) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (2035/2479 source files shared (82%)) |
| /root/ws/target |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/801 source files shared (0%)) |
| /root/ws/third_party |  |  | missing |  | scratch, benchmark or research tree on the host (not our product code); kept, no copy (0/60 source files shared (0%)) |
| /srv/auto/build/ctx |  |  | present-older | apps/auto(165) | partly in the tree (evolved or moved); scratch or snapshot copy kept on the host (165/421 source files shared (39%)) |

## History: restored lost features (17)

Deleting commit is the first hash in each note; the restoring commit is named in the decision.

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| apps/aphrody |  | 2026-11-14 | present-identical | apps/aphrody-web (files absent from apps/aphrody) | restored from 5d771bb74^ into apps/aphrody-web (files absent from apps/aphrody); restoring commit this commit (178 files (134 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| apps/aphrody-app |  | 2026-11-14 | present-identical | apps/aphrody-app | restored from 5d771bb74^ into apps/aphrody-app; restoring commit this commit (46 files (31 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| apps/r2-site |  | 2026-11-14 | present-identical | apps/r2-site | restored from 5d771bb74^ into apps/r2-site; restoring commit this commit (11 files (10 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| apps/yolo |  | 2026-11-14 | present-identical | apps/yolo | restored from 5d771bb74^ into apps/yolo; restoring commit this commit (15 files (14 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| crates/ring3-agent |  | 2026-11-14 | present-identical | src/ring3-agent | restored from 5d771bb74^ into src/ring3-agent; restoring commit this commit (16 files (13 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/agy |  | 2026-11-12 | present-identical | packages/agy | restored from 73bc09414^ into packages/agy; restoring commit this commit (13 files (12 code), deleted in 73bc09414 on 2026-11-12 (see git show 73bc09414)) |
| packages/ai-triad |  | 2026-11-12 | present-identical | packages/ai-triad | restored from 73bc09414^ into packages/ai-triad; restoring commit this commit (25 files (23 code), deleted in 73bc09414 on 2026-11-12 (see git show 73bc09414)) |
| packages/brain |  | 2026-11-12 | present-identical | packages/brain | restored from 73bc09414^ into packages/brain; restoring commit this commit (8 files (6 code), deleted in 73bc09414 on 2026-11-12 (see git show 73bc09414)) |
| packages/bun-parity |  | 2026-11-14 | present-identical | packages/bun-parity | restored from 5d771bb74^ into packages/bun-parity; restoring commit this commit (42 files (40 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/bun-plugins |  | 2026-11-14 | present-identical | packages/bun-plugins | restored from 5d771bb74^ into packages/bun-plugins; restoring commit this commit (16 files (14 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/chromium-bun |  | 2026-11-15 | present-identical | packages/chromium-bun | restored from 1fc5d725a^ into packages/chromium-bun; restoring commit this commit (137 files (131 code), deleted in 1fc5d725a on 2026-11-15 (see git show 1fc5d725a)) |
| packages/forge |  | 2026-11-14 | present-identical | packages/forge | restored from 5d771bb74^ into packages/forge; restoring commit this commit (25 files (23 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/google-design |  | 2026-11-14 | present-identical | packages/google-design | restored from 5d771bb74^ into packages/google-design; restoring commit this commit (254 files (144 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/knowledge-engine |  | 2026-11-12 | present-identical | packages/knowledge-engine | restored from 73bc09414^ into packages/knowledge-engine; restoring commit this commit (21 files (19 code), deleted in 73bc09414 on 2026-11-12 (see git show 73bc09414)) |
| packages/pi-opencode |  | 2026-11-12 | present-identical | packages/pi-opencode | restored from 73bc09414^ into packages/pi-opencode; restoring commit this commit (19 files (15 code), deleted in 73bc09414 on 2026-11-12 (see git show 73bc09414)) |
| packages/runtime-adapter |  | 2026-11-14 | present-identical | packages/runtime-adapter | restored from 5d771bb74^ into packages/runtime-adapter; restoring commit this commit (10 files (9 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/site |  | 2026-11-14 | present-identical | packages/site | restored from 5d771bb74^ into packages/site; restoring commit this commit (12 files (12 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |

## History: deleted directories with 8 or more files, not restored (113)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| .agents/skills |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (1041 files (909 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| .github/workflows |  | 2026-11-15 | present-newer |  | paths present again in HEAD (28 files (28 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| apps/auto |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (1607 files (1355 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| apps/l2l |  | 2026-11-14 | present-newer |  | RE/n2b absorption: own repo aphrody-labs/r2b; n2b CLI folded into depot-migrate and src/re (commit 36bb44ca2) (27 files (25 code), deleted in 36bb44ca2 on 2026-11-14 (see git show 36bb44ca2)) |
| apps/nt |  | 2026-11-15 | present-newer |  | paths present again in HEAD (97 files (75 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| apps/r2b |  | 2026-11-14 | present-newer |  | RE/n2b absorption: own repo aphrody-labs/r2b; n2b CLI folded into depot-migrate and src/re (commit 36bb44ca2) (7768 files (7429 code), deleted in 36bb44ca2 on 2026-11-14 (see git show 36bb44ca2)) |
| apps/rust-showcase |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (10 files (8 code), deleted in a4f3934d8 on 2026-11-14 (see git show a4f3934d8)) |
| assets/brand |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (715 files (20 code), deleted in 0c8ed2d71 on 2026-11-14 (see git show 0c8ed2d71)) |
| assets/generated |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (433 files (3 code), deleted in 0c8ed2d71 on 2026-11-14 (see git show 0c8ed2d71)) |
| assets/library |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (153 files (9 code), deleted in 0c8ed2d71 on 2026-11-14 (see git show 0c8ed2d71)) |
| bench/src |  | 2026-11-15 | present-newer |  | paths present again in HEAD (12 files (12 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| conformance/expected |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (11 files (0 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| crates/aphrody-design-emit |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (19 files (19 code), deleted in 2b1a28fe4 on 2026-11-13 (see git show 2b1a28fe4)) |
| crates/aphrody-design-icons |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (133 files (16 code), deleted in 3a6bf3189 on 2026-11-13 (see git show 3a6bf3189)) |
| crates/aphrody-design-identity |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (40 files (20 code), deleted in 8af39010d on 2026-11-13 (see git show 8af39010d)) |
| crates/aphrody-design-tokens |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (114 files (92 code), deleted in 3a6bf3189 on 2026-11-13 (see git show 3a6bf3189)) |
| crates/rust-showcase |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (13 files (12 code), deleted in a4f3934d8 on 2026-11-14 (see git show a4f3934d8)) |
| crates/ui |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (23 files (23 code), deleted in 3a6bf3189 on 2026-11-13 (see git show 3a6bf3189)) |
| crates/unix-uutils |  | 2026-11-14 | present-newer |  | ported to src/ (unix-omarchy, dx12-hal, ay multicall) or packages/machine/matrix (9 files (6 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| docs/base-ui |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (11 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/better-auth |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (11 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/bun |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (15 files (13 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/design |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (44 files (39 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/games |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (11 files (11 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/i18n |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (13 files (13 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/infra |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (45 files (36 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/lfs |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (27 files (0 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/lore |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (293 files (277 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/native |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (116 files (98 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/nextjs |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (12 files (10 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/proofs |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (29 files (22 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/publish |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (10 files (6 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/replica |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (58 files (7 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/research |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (24 files (24 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/reviews |  | 2026-11-14 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (296 files (167 code), deleted in f500b573e on 2026-11-14 (see git show f500b573e)) |
| docs/shadcn |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (11 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| docs/tailwindcss |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (11 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/agents |  | 2026-11-15 | present-newer |  | paths present again in HEAD (26 files (19 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/chromium-factory |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (11 files (4 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/cloudflare |  | 2026-11-15 | present-newer |  | paths present again in HEAD (42 files (30 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/cluster |  | 2026-11-15 | present-newer |  | paths present again in HEAD (22 files (7 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/fleet |  | 2026-11-15 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (264 files (64 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/gamescope-web |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (8 files (4 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/generated |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (17 files (1 code), deleted in 8763f01e0 on 2026-11-13 (see git show 8763f01e0)) |
| infra/internal |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (15 files (15 code), deleted in 8763f01e0 on 2026-11-13 (see git show 8763f01e0)) |
| infra/linux |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (23 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/upstream |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (27 files (15 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| infra/winnt-sdk |  | 2026-11-13 | present-newer |  | ported to src/ (unix-omarchy, dx12-hal, ay multicall) or packages/machine/matrix (9 files (3 code), deleted in ec5275682 on 2026-11-13 (see git show ec5275682)) |
| infra/wsl-distro |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (33 files (14 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| legacy/agy |  | 2026-11-12 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (13 files (12 code), deleted in acfc98c6b on 2026-11-12 (see git show acfc98c6b)) |
| legacy/ai-os |  | 2026-11-12 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (78 files (64 code), deleted in acfc98c6b on 2026-11-12 (see git show acfc98c6b)) |
| legacy/ai-triad |  | 2026-11-12 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (24 files (23 code), deleted in d7a5d0b92 on 2026-11-12 (see git show d7a5d0b92)) |
| legacy/knowledge-engine |  | 2026-11-12 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (19 files (18 code), deleted in acfc98c6b on 2026-11-12 (see git show acfc98c6b)) |
| legacy/pi-opencode |  | 2026-11-12 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (18 files (15 code), deleted in d7a5d0b92 on 2026-11-12 (see git show d7a5d0b92)) |
| licenses/lore |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (9 files (7 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/ai-os |  | 2026-11-15 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (366 files (337 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/assets |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (30 files (29 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/browser |  | 2026-11-15 | present-newer |  | moved to aphrody-labs/open (commit 4c2780a7c, b16ba00f7); apps/open clone holds the tree (3067 files (3009 code), deleted in 4c2780a7c on 2026-11-15 (see git show 4c2780a7c)) |
| packages/bun-types |  | 2026-11-15 | present-newer |  | vendored copy byte-identical to npm @types/bun (commit 07c58f536) (42 files (38 code), deleted in 07c58f536 on 2026-11-15 (see git show 07c58f536)) |
| packages/bunify |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (10 files (10 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/core |  | 2026-11-15 | present-newer |  | paths present again in HEAD (16 files (14 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/deploy |  | 2026-11-15 | present-newer |  | paths present again in HEAD (26 files (25 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/design |  | 2026-11-15 | present-newer |  | paths present again in HEAD (54 files (46 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/env-kit |  | 2026-11-15 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (48 files (41 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/epic-games |  | 2026-11-13 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (10 files (10 code), deleted in 2b1a28fe4 on 2026-11-13 (see git show 2b1a28fe4)) |
| packages/ffi-bridge |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (10 files (9 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/gaming |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (33 files (31 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/gnu |  | 2026-11-15 | present-newer |  | paths present again in HEAD (17 files (16 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/i18n |  | 2026-11-15 | present-newer |  | paths present again in HEAD (17 files (17 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/linux |  | 2026-11-14 | present-newer |  | ported to src/ (unix-omarchy, dx12-hal, ay multicall) or packages/machine/matrix (14 files (14 code), deleted in 44c3df6e0 on 2026-11-14 (see git show 44c3df6e0)) |
| packages/machine |  | 2026-11-15 | present-newer |  | paths present again in HEAD (62 files (46 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/native |  | 2026-11-15 | present-newer |  | vendored vercel-labs/native copy removed on purpose, bun:ffi wrapper kept (commit f4bba5315) (1256 files (1080 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/net |  | 2026-11-15 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (9 files (7 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/release |  | 2026-11-15 | present-newer |  | paths present again in HEAD (12 files (10 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/shell-matrix |  | 2026-11-14 | present-newer |  | ported to src/ (unix-omarchy, dx12-hal, ay multicall) or packages/machine/matrix (67 files (17 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| packages/upstream |  | 2026-11-15 | present-newer |  | paths present again in HEAD (23 files (21 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/vault |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (24 files (23 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| packages/wck |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (40 files (30 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| plugins/aphrody-nhitl |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (17 files (17 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| plugins/labs |  | 2026-11-14 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (21 files (20 code), deleted in 5d771bb74 on 2026-11-14 (see git show 5d771bb74)) |
| src/apm |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (20 files (19 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/archguard |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (25 files (24 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/ay |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (27 files (24 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/bun-flat |  | 2026-11-15 | missing |  | deleted code with no equivalent in HEAD and no owner decision recorded: review candidate (14 files (12 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/chromium |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (11 files (10 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/core |  | 2026-11-15 | present-newer |  | paths present again in HEAD (32 files (28 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/corelib |  | 2026-11-15 | present-newer |  | moved to aphrody-labs/open (commit 4c2780a7c, b16ba00f7); apps/open clone holds the tree (16 files (13 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/depot |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (101 files (91 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/drivers |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (12 files (11 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/ffi |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (9 files (8 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/game |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (20 files (13 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/gnu |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (40 files (32 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/include |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (11 files (11 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/lore |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (1911 files (1829 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/posix |  | 2026-11-15 | present-newer |  | paths present again in HEAD (22 files (20 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/re |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (104 files (103 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/remote |  | 2026-11-15 | present-newer |  | paths present again in HEAD (8 files (7 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/router |  | 2026-11-15 | missing |  | purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored (10 files (10 code), deleted in 2c058770b on 2026-11-15 (see git show 2c058770b)) |
| src/rust-stack |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (13 files (11 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/steam |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (32 files (28 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/sys |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (11 files (10 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/taffy |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (89 files (87 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/tv |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (33 files (13 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/ui |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (200 files (174 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/up |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (13 files (12 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/vault |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (10 files (8 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| src/wayland |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (62 files (55 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| test/lore |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (36 files (34 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| third_party/design-mirror |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (598 files (598 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| third_party/metadata |  | 2026-11-15 | present-newer |  | same blobs found elsewhere in HEAD (moved) (278 files (0 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |
| third_party/oils |  | 2026-11-13 | present-newer |  | pinned in DEPS/src.lock.json instead of vendored (commit f1df189d8) (5327 files (4405 code), deleted in f1df189d8 on 2026-11-13 (see git show f1df189d8)) |
| third_party/patches |  | 2026-11-13 | present-newer |  | pinned in DEPS/src.lock.json instead of vendored (commit f1df189d8) (66 files (60 code), deleted in f1df189d8 on 2026-11-13 (see git show f1df189d8)) |
| tools/lore |  | 2026-11-15 | present-newer |  | now src/lore (337 files (292 code), deleted in b38c8de7c on 2026-11-15 (see git show b38c8de7c)) |

## Local and Cloudflare (41)

| item | language | updated | status | monorepo path | decision |
|---|---|---|---|---|---|
| aphrody-archive |  | 2026-11-12 | present-identical |  | fleet and skills archives (encrypted tarballs, markdown index); data, not source |
| aphrody-assets |  | 2026-10-09 | present-identical |  | artifact bucket; data, not source |
| aphrody-chromium |  | 2026-11-12 | present-identical |  | artifact bucket; data, not source |
| aphrody-dist |  | 2026-10-09 | present-identical |  | artifact bucket; data, not source |
| aphrody-gnu |  | 2026-11-14 | present-identical |  | artifact bucket; data, not source |
| aphrody-lore |  | 2026-11-12 | present-identical |  | artifact bucket; data, not source |
| aphrody-skills-archive |  | 2026-11-14 | present-identical |  | fleet and skills archives (encrypted tarballs, markdown index); data, not source |
| aphrody-video |  | 2026-10-12 | present-identical |  | artifact bucket; data, not source |
| bun-lib |  | 2026-10-13 | present-identical |  | artifact bucket; data, not source |
| dbfr-backups |  | 2026-10-12 | present-identical |  | artifact bucket; data, not source |
| rosegriffon-cdn |  | 2026-11-12 | present-identical |  | artifact bucket; data, not source |
| shenron-cdn |  | 2026-10-11 | present-identical |  | artifact bucket; data, not source |
| aphrody |  | 2026-11-13 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-app |  | 2026-10-23 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-app-site |  | 2026-11-12 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-com |  | 2026-11-12 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-deploy |  | 2026-11-14 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-email-worker |  | 2026-11-07 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-github |  | 2026-11-13 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-mcp-gateway |  | 2026-11-14 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| aphrody-webos |  | 2026-11-14 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| api-aphrody-com |  | 2026-11-12 | present-identical |  | deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source |
| ~/.gemini/antigravity*/brain\|scratch\|mcp (code files) |  |  | unique-commits |  | 23 conversation folders with 193 code files (0 identical to tree files); scratch tests and probes written by agents, not packages: left in place, no copy (193 files not in the tree) |
| %USERPROFILE%/ComfyUI |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| %USERPROFILE%/lfs-git |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| %USERPROFILE%/tmp/audit/tw |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| %USERPROFILE%/tmp/hport/<home>/cache/uv/sdists-v10 |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| %USERPROFILE%/tmp/ocrel |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| %USERPROFILE%/uwwork/dc |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/fixcargo |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/niubash |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/omn |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/out |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/rubash |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/ruline |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/sb |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| %USERPROFILE%/uwwork/wc |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| C:/msys |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| C:/tmp-wbg/src |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |
| C:/tmp/headtree |  |  | present-identical |  | upstream clone or scratch; nothing to restore |
| C:/work/agent |  |  | present-identical |  | git clone of an aphrody-labs or upstream remote (pushed); nothing to restore |

## Registry packages not restored (families)

Every package is a row in the JSON. Families with the same prefix are grouped here.

| family | count |
|---|---:|
| npm missing bun-windows* | 375 |
| crates.io missing aphrody-nie* | 45 |
| npm missing bun-plugin* | 25 |
| npm missing bun-runtime* | 10 |
| npm missing bun-mdx* | 9 |
| crates.io missing aphrody-tauri* | 8 |
| crates.io missing aphrody-bun* | 4 |
| crates.io missing aphrody-ocr* | 4 |
| crates.io missing aphrody-shell* | 4 |
| npm missing m3-next* | 4 |
| npm missing menu-render* | 4 |
| crates.io missing aphrody-web* | 3 |
| crates.io missing aphrody-wii* | 3 |
| crates.io missing bun-os* | 3 |
| crates.io missing aphrody-command* | 2 |
| crates.io missing aphrody-emu* | 2 |
| crates.io present-identical aphrody-hayro* | 2 |
| crates.io missing aphrody-kernel* | 2 |
| crates.io missing aphrody-m3* | 2 |
| crates.io missing aphrody-rag* | 2 |
| crates.io missing aphrody-term* | 2 |
| crates.io missing aphrody-terminal* | 2 |
| crates.io missing aphrody-toolcall* | 2 |
| crates.io missing aphrody-translate* | 2 |
| crates.io missing bun-emu* | 2 |
| (host-named packages)* | 2 |
| crates.io missing figcraft-collab* | 2 |
| npm missing api* | 2 |
| npm missing base-ui* | 2 |
| npm missing bun-agent* | 2 |
| npm missing bun-engine* | 2 |
| npm missing bun-video* | 2 |
| npm missing canvas-linux* | 2 |
| npm missing inagle* | 2 |
| npm missing inagle-cross* | 2 |
| crates.io missing aphrody-aarch64* | 1 |
| crates.io missing aphrody-app* | 1 |
| crates.io missing aphrody-backend* | 1 |
| crates.io missing aphrody-bindgen* | 1 |
| crates.io missing aphrody-capture* | 1 |
| crates.io missing aphrody-certificates* | 1 |
| crates.io missing aphrody-code* | 1 |
| crates.io missing aphrody-config* | 1 |
| crates.io missing aphrody-ctr* | 1 |
| crates.io missing aphrody-diagnostics* | 1 |
| crates.io missing aphrody-egui* | 1 |
| crates.io missing aphrody-engine* | 1 |
| crates.io missing aphrody-firefly* | 1 |
| crates.io missing aphrody-fsindex* | 1 |
| crates.io missing aphrody-gpu* | 1 |
| crates.io missing aphrody-guard* | 1 |
| crates.io missing aphrody-homebrew* | 1 |
| crates.io missing aphrody-http* | 1 |
| crates.io missing aphrody-infra* | 1 |
| crates.io missing aphrody-jobs* | 1 |
| crates.io present-older aphrody-m3* | 1 |
| crates.io missing aphrody-nu* | 1 |
| crates.io missing aphrody-ovh* | 1 |
| crates.io missing aphrody-oxc* | 1 |
| crates.io missing aphrody-patch* | 1 |
| crates.io present-identical aphrody-pdfcraft* | 1 |
| crates.io missing aphrody-proc* | 1 |
| crates.io present-newer aphrody-rag* | 1 |
| crates.io missing aphrody-remote* | 1 |
| crates.io missing aphrody-render* | 1 |
| crates.io missing aphrody-rollout* | 1 |
| crates.io missing aphrody-rust* | 1 |
| crates.io missing aphrody-secrets* | 1 |
| crates.io missing aphrody-session* | 1 |
| crates.io missing aphrody-softraster* | 1 |
| crates.io missing aphrody-sprite* | 1 |
| crates.io missing aphrody-sql* | 1 |
| crates.io missing aphrody-ssh* | 1 |
| crates.io missing aphrody-store* | 1 |
| crates.io missing aphrody-subsystem* | 1 |
| crates.io missing aphrody-svg* | 1 |
| crates.io missing aphrody-switch* | 1 |
| crates.io missing aphrody-taffy* | 1 |
| crates.io missing aphrody-themes* | 1 |
| crates.io missing aphrody-toolchains* | 1 |

## Gates, proofs and blocked items (2026-11-15)

Gates on every restored file:
- gitleaks 8.30.1 (installed to `~/.local/bin/gitleaks.exe`) on each import and a final pass over a copy of all restored directories: 0 findings, so nothing went to the vault.
- `bun scripts/hygiene.ts --rule personal-data` on a temp git copy (the rule reads tracked files only): 154 hits at first, 0 after the scrub. Values replaced: home path to `%USERPROFILE%`, two mailboxes to `user@example.com`, three VPS public IPs to 203.0.113.x, the mesh CIDR to 10.0.0.x, two hostnames, a machine name to `webos`, a private models path to `MODELS_DIR`. Dropped: the extracted Gemini desktop `asar_extracted` bundles (vendor code, not ours), two Bun doc copies under plugins/labs, fonts over 3 MB in google-design.

Proofs (targeted, nothing run at the root):
- `bun test` pass/fail: google-dream 4/0, google-design 312/6 (needs `upstream/material-color-utilities`), gcloud-learn 13/1, ai-triad 13/1, brain 1/0, knowledge-engine 8/0, pi-opencode 8/0, bun-plugins 6/1, bun-parity 70/2, forge 14/6 (needs `depot_ffi.dll`), chromium-bun 26/6 (needs a Chromium), identity 21/2 (needs `@aphrody/paths` linked by `bun install`), web 14/12 and bun-web 33/8 (inter-package imports of packages not restored yet). New workspace names do not collide (59 package.json under `packages/*`), no unresolved `workspace:` or `catalog:` reference; nested `workspaces` fields were renamed `x-restored-workspaces`.
- `cargo check` on fr2 from a tar of the restored crates (not workspace members yet): aphrody-google and aphrody-gemini-web 0 errors; the others need their internal siblings or the workspace root (ring3-agent inherits `workspace.package`), or hit the fr2 /tmp quota. They stay out of `Cargo.toml` members until wired.

Pushes to their own remotes (VPS): prd `/root/work/ui` to aphrody-labs/ui `prd-rescue-main`; prd `/root/work/better-auth` to aphrody-labs/better-auth `prd-rescue-main` and `prd-rescue-rb`; fr1 `bun-nt` to aphrody-labs/bun `test-parent`; fr1 `forks/aquamarine` to the new fork aphrody-labs/aquamarine (the v0.16.0 branch). fr1 `yolo-stack.git` (32 commits) is already contained in aphrody-labs/yolo-stack main.

Fleet rescue on fr1: `/home/backups`, `/home/legacy`, `/home/ubuntu/.ssh`, `/srv/artifacts` and `/home/.relocated_srv_artifacts` are copied host-local with `rsync -a` into `/srv/xbuild/rescue/fr1` by `copy.sh` (log `copy.log`, last line `ALL-FINISHED` when done). the home directory of a former user, `/root/.ssh` and `/home/agent/.ssh` do not exist on fr1.

Blocked or not done:
- Antigravity Python SDK: not restored on purpose, already pinned as `third_party/antigravity-sdk-python` (upstream google-antigravity); the aphrody-labs copy is the split-out of `packages/google/antigravity-sdk-python` from before 2026-11-11.
- PyPI: no project of ours (`google-antigravity` on PyPI is Google's). crates.io: 370 crates under one account; npm: 696 packages by `yohan971`.
- prd `/root/ay-build/src` (5 unpushed commits, history of the former monorepo): `git fetch` over ssh failed with a bad pack header on the host; not retrieved.
- 644 npm packages and 308 crates are published only (mostly generated `bun-windows-*` stubs and `bun-*` forks of Bun packages); they stay downloadable with `scripts/restore-pkg.ts`, not copied for size and purity.
- fr1 repo scan is limited to depth 5 with per-repo timeouts; fr2/prd trees are hashed for source extensions up to 3 MB.
- The relay mailbox tool is not available to this agent: the fleet agent is told through the log and marker file on fr1, not through SendMessage.
- Wiring left to the owner: Cargo `members` for the restored crates, DEPS/src.lock pins for big own repositories (open, yolo-ui, yolo-web, yolo-re, yolo-engine, wii-os, r2b, aphrody-m3, msys).

## Regenerate

1. `bun scripts/restore-registries.ts --out registries.json` then `bun scripts/restore-compare-registries.ts --in registries.json --out compare.json`.
2. `bun scripts/restore-github.ts --out github.json` (needs `gh` auth; treeless clones under the temp dir).
3. `timeout 400 ssh <host> bash -s < scripts/restore-vps-scan.sh > vps-<host>.tsv` for fr1, fr2 and prd (read-only).
4. `bun scripts/restore-inventory.ts --in <dir>`.

Restore tools: `scripts/restore-import.ts` (repo or directory), `scripts/restore-pkg.ts` (npm tarball or crate). Both run gitleaks first and never overwrite.
