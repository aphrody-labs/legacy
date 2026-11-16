# Bun package

A Bun workspace package (@aphrody/*)

| Name | Description |
| :-- | :-- |
| [@aphrody/nt](../../../apps/nt) | - |
| [@aphrody/web](../../../apps/nt/modules/web) | - |
| [@aphrody/site-ng](../../../apps/web/web) | Angular Material app of aphrody.com (M3 studio page): standalone, zoneless, tokens from @aphrody/design, built by Angular's esbuild application builder (AOT). |
| [@aphrody/github-app](../../../infra/cloudflare/workers/github-app) | - |
| [@aphrody/ai-os](../../../packages/ai-os) | Aphrody AI OS: Unix/GNU-like agent OS distribution unifying LLM, RAG, World Model, and System 1 decision under one C ABI (aphrody_core_capi) |
| [@aphrody/api](../../../packages/api) | Tauri API definitions |
| [@aphrody/assets](../../../packages/assets) | Redistribution-safe asset library: manifest with SPDX license, sha256 and attribution; fetch, verify, list |
| [@aphrody/automate](../../../packages/automate) | Workflow automation engine: definitions (zod schema), node catalog, expression language, executor with injected services, templates, n8n import/export. |
| [@aphrody/bun-parity](../../../packages/bun-parity) | Automated Chromium Upstream vs Bun Full-Stack Parity Recon & Auto-Patcher |
| [@aphrody/bun-plugin-tailwind](../../../packages/bun-plugin-tailwind) | Tailwind CSS v4 for Bun: Bun.build, the HTML dev server and Bun.serve, a PostCSS plugin on the same engine, and a Material 3 preset |
| [@aphrody/bun-plugins](../../../packages/bun-plugins) | Sovereign Bun Plugins: Just Recipes, Turbo Blake3 Cache, and VCS Metadata |
| [@aphrody/bun-runtime-sdk](../../../packages/bun-runtime-sdk) | SDK of the buv native runtime: versioned buv C ABI with compatible yolo exports and Bun, .NET and Python bindings |
| [@aphrody/bun-sql](../../../packages/bun-sql) | Native Bun.SQL provider connections and official Neon and Supabase SDKs |
| [@aphrody/bun-steam](../../../packages/bun-steam) | Bun OS Steam owner (Bun half): VDF text/binary/appinfo parser and writer, Steam client configuration, steamcmd with a cached session, libraries, Proton management and launch tun... |
| [@aphrody/bun-test-dom](../../../packages/bun-test-dom) | - |
| [@aphrody/bun-video](../../../packages/bun-video) | Bun video protocols, native capture adapters, and official Remotion and HyperFrames integrations |
| [@aphrody/bunify](../../../packages/bunify) | legacy Node/TS/JS -> Bun -> Rust migrator |
| [@aphrody/canvas](../../../packages/canvas) | Aphrody native Skia canvas facade over the pinned upstream @napi-rs/canvas runtime |
| [@aphrody/chromium](../../../packages/chromium) | Chromium CDP client and launcher, Obscura alias, Brave adblock-rust and privacy cryptography for upstream Bun: the owner of the aphrody-labs/bun fork's bun:chromium, bun:chrome,... |
| [@aphrody/core](../../../packages/core) | bun:ffi bridge to src/core/capi: tree-sitter parse/query, BLAKE3, recursive index (sqlite + JSON) |
| [@aphrody/deploy](../../../packages/deploy) | aphrody.app: first-party deployment platform of the monorepo (previews per commit, production pointer, rollback, logs) on Cloudflare Workers and R2 |
| [@aphrody/design](../../../packages/design) | Systeme de design unique du monorepo : tokens Material 3 (Material Color Utilities) depuis packages/design/design.toml, sorties CSS, Rust (GPUI), Zig, ANSI, Figma, DESIGN.md ; c... |
| [@aphrody/discord-kit](../../../packages/discord-kit) | Unified Discord bot core kit: pre-flight intent negotiation, memory-bounded caching, resilient interaction dispatching, lifecycle management and guards for Bun. |
| [@aphrody/env-kit](../../../packages/env-kit) | Zero-dependency cross-language environment sharing, secret redaction, and editor/agent sync toolkit (Google Cloud IAM and billing live in @aphrody/google/gcp) for C:/aphrody |
| [@aphrody/ffi-bridge](../../../packages/ffi-bridge) | bun:ffi bindings and tests of the Rust cdylibs (dx12-hal, unix-distro probes) |
| [@aphrody/forge](../../../packages/forge) | Sovereign Rust + TypeScript Tri-Forge (GitHub + GitLab + Google Git + Arch Upstreams) CLI (frg) |
| [@aphrody/gaming](../../../packages/gaming) | Gaming stack of the monorepo: Steam (web API, SteamID, local paths over `ay steam`), Proton, Vulkan layers, DirectX, steamcmd and Proton wrappers; `ay gaming` |
| [@aphrody/gnu](../../../packages/gnu) | GNU upstream tracker and distributor: ftp.gnu.org, info-gnu, Savannah, GSRC, Guix and the Rust equivalents, as a JSON feed, an Atom feed, a static site and MCP tools |
| [@aphrody/google](../../../packages/google) | Aphrody Google: Cloud, Gemini, Drive, Docs, REST services (src/rest), gcloud principals and billing (src/gcp), document translation (src/doc-ai), Drive client (src/drive-client). |
| [@aphrody/http](../../../packages/http) | Portable in-process JSON transport shared by Aphrody service clients |
| [@aphrody/i18n](../../../packages/i18n) | Shared i18n layer: catalogs discovered from locales/, Unicode MessageFormat 2 (messageformat) behind a format-adapter interface, Intl-based locale negotiation, check/extract/tra... |
| [@aphrody/m3-ai](../../../packages/m3-ai) | Material Design 3 agent-interaction components (tool calls, markdown, chat composer, workers, tasks): the SpaceUI (@spacedrive/ai) set rebuilt on @aphrody/m3-primitives. |
| [@aphrody/m3-os-themes](../../../packages/m3-os-themes) | Material 3 OS theme generators and installers (Windows 11, GNOME Shell, COSMIC, Chromium browsers) derived from @aphrody/m3-tokens dynamic colour roles. |
| [@aphrody/m3-primitives](../../../packages/m3-primitives) | Material Design 3 React primitives: the SpaceUI (@spacedrive/primitives) component set rebuilt on the M3 roles, shape, typescale, state layers and motion of the aphrody design s... |
| [@aphrody/m3-reader](../../../packages/m3-reader) | Material 3 manga and illustrated book readers for React |
| [@aphrody/m3-theme](../../../packages/m3-theme) | Canonical Material 3 fusion sheets: tokens.css (M3 + shadcn/ui + Tailwind v4 aliases), tailwind.css (every M3 system token as a Tailwind v4 utility) and spaceui.css (the SpaceUI... |
| [@aphrody/m3-tokens](../../../packages/m3-tokens) | Material 3 design tokens (--md-sys-*) for the @aphrody/material-web fork: MUI-theme → M3 token CSS generation and runtime Material You dynamic colour via material-color-utilities. |
| [@aphrody/machine](../../../packages/machine) | Reproducible Windows workstation: WinGet DSC v3 (niubash, Coreutils), Claude Code shell/MCP setup, aphrody-labs forks, flat third_party |
| [@aphrody/messaging](../../../packages/messaging) | Aphrody messaging channel contracts and Discord REST adapter. |
| [@aphrody/native](../../../packages/native) | bun:ffi bindings for the Zig native desktop SDK (third_party/native, vercel-labs/native) |
| [@aphrody/next-bun](../../../packages/next-bun) | Next.js on Bun: run next with no Node.js (Turbopack workers included), build the Pages Router with Bun.build (experimental), Next 16 / Tailwind 4 codemods, instant navigation te... |
| [@aphrody/omniu](../../../packages/omniu) | oh-my-niu for Bun: plugin bundle as data, validator, packager and scaffolder, and the host that loads the ay plugin into both Bun and niu |
| [@aphrody/plugin-opener](../../../packages/plugin-opener) | Open files and URLs using their default application. |
| [@aphrody/py2bun](../../../packages/py2bun) | Python 3 to Bun TypeScript transpiler: runtime and CLI wrapper (Rust crate at src/py2bun) |
| [@aphrody/release](../../../packages/release) | ay release: tags, GitHub releases, crates.io, npm, PyPI and vcpkg/CMake from fr1, dry-run first |
| [@aphrody/sql](../../../packages/sql) | Shared Bun database mechanics for Aphrody: env/URL resolution, Bun.SQL and Redis factories, bun:sqlite open policy with optional sqlite-vec |
| [@aphrody/upstream](../../../packages/upstream) | Patch stacks of the bun and Chromium forks: status, rebase on upstream, ephemeral PR heads, contribution checks |
| [@aphrody/wck](../../../packages/wck) | Compile-Time Web Validator (Google SEO + AI Mode SEO + Modern Web Guidelines + Core Web Vitals + Lighthouse 100 + WASM + WebGPU Chromium Spec) |
| [@aphrody/web](../../../packages/web) | - |
| [@aphrody/web-crawl](../../../packages/web-crawl) | Typed Bun client for the Aphrody Web crawler CLI |
| [@aphrody/x](../../../packages/x) | Headless X (Twitter) client for Bun: a thin import over the Rust crate aphrody-x (aphrody-ffi), with batch jobs for mass scripting. |
