# //src/google — Official Google LLC Sovereign Monorepo

<!-- catalog:begin unit -->
> Official Google LLC Sovereign Monorepo (//src/google): Cloud (europe-west9, gVisor), Workspace (Drive 20TB, YouTube, Stargardt), and DevTools (google CLI, Terminal, zx, GTS)

| Type | Path |
| :-- | :-- |
| Bun package | `packages/google/google-bun` |

**Commands**

```sh
bun run --cwd packages/google/google-bun google
bun run --cwd packages/google/google-bun test
bun run --cwd packages/google/google-bun test:go
bun run --cwd packages/google/google-bun check
bun run --cwd packages/google/google-bun fmt
bun run --cwd packages/google/google-bun lint
```

Part of Aphrody: [aphrody-labs/aphrody](../../../README.md), [Catalog](../../../docs/reference/catalog/package.md).
<!-- catalog:end -->

Organized strictly according to Google internal (`google3` / `depot_tools` / Bazel `bzlmod`) engineering conventions:

## Directory Hierarchy

| Monorepo Path | Responsibility |
| :--- | :--- |
| [`//BUILD.bazel`](file:///C:/aphrody/google/BUILD.bazel) & [`//MODULE.bazel`](file:///C:/aphrody/google/MODULE.bazel) | Bazel 8 `bzlmod` build graph for C++, Rust, Go, and TypeScript targets |
| [`//OWNERS`](file:///C:/aphrody/google/OWNERS) & [`//METADATA`](file:///C:/aphrody/google/METADATA) | Google `OWNERS` gatekeeping and `devtools/metadata` protobuf descriptor |
| [`//DEPS`](file:///C:/aphrody/google/DEPS) & [`//third_party/`](file:///C:/aphrody/google/third_party) | Chromium `gclient` dependency manifest and `README.chromium` third-party packages |
| [`//cloud/`](file:///C:/aphrody/google/cloud) | Go 1.27 Cloud Run Paris (`europe-west9`) gateway (`//cloud/gateway`), typed GCP SDK (`//cloud/gcp-client`), Cloud Build, Docker & systemd manifests (`//cloud/infra`) |
| [`//workspace/`](file:///C:/aphrody/google/workspace) | Google Drive 20TB sync engine, YouTube curator, and Stargardt WCAG AAA WebGPU shader (`//workspace/google-dream`) |
| [`//devtools/`](file:///C:/aphrody/google/devtools) | Sovereign `google` CLI (`//devtools/cli`), Google Terminal (`//devtools/terminal`), `zx` shell (`//devtools/zx`), GTS 2026 linter (`//devtools/gts`), and GitHub client (`//devtools/github-client`) |
| [`//g3doc/`](file:///C:/aphrody/google/g3doc) | Engineering architecture, design system, and Google Cloud curriculum documentation |

## Cross-Pillar Federation

- **AI & Compute Layer** (`carbon`, `google_bun_wasm`, `gcloud-learn`, `ai-slop-purger`, `benchmark-ml-engine`, `hallucination-cleaner`, `google-unified-fabric`, `google-benchmark-sandbox`) -> [`C:\aphrody\yolo-ai`](file:///C:/aphrody/yolo-ai)
- **Web Crawling, Indexing & Humanizer Layer** (`google-crawler`, `google-indexer`, `modern-web-humanizer`, `cloudflare-edge-worker.ts`) -> [`C:\aphrody\yolo-web`](file:///C:/aphrody/yolo-web)
- **JS/TS Runtime & Chromium Plugins** (`yolo-bun:lighthouse`, `yolo-bun:web-vitals`, `yolo-bun:web-guidelines`, `yolo-bun:google-styleguide`, `yolo-bun:googleapis`, `yolo-bun:google-stack`) -> [`C:\aphrody\yolo-bun`](file:///C:/aphrody/yolo-bun)
