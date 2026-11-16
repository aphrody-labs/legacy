# Bun package

A Bun workspace package (@aphrody/*)

| Name | Description |
| :-- | :-- |
| [@aphrody/nt](../../../apps/nt) | - |
| [@aphrody/nt-web](../../../apps/nt/modules/web) | - |
| [@aphrody/site-ng](../../../apps/web/web) | Angular Material app of aphrody.com (M3 studio page): standalone, zoneless, tokens from @aphrody/design, built by Angular's esbuild application builder (AOT). |
| [@aphrody/github-app](../../../device/cloudflare/workers/github-app) | - |
| [@aphrody/ai-os](../../../frameworks/ai-os) | Aphrody AI OS: Unix/GNU-like agent OS distribution unifying LLM, RAG, World Model, and System 1 decision under one C ABI (aphrody_core_capi) |
| [@aphrody/api](../../../frameworks/api) | Tauri API definitions |
| [@aphrody/assets](../../../frameworks/assets) | Redistribution-safe asset library: manifest with SPDX license, sha256 and attribution; fetch, verify, list |
| [@aphrody/automate](../../../frameworks/automate) | Workflow automation engine: definitions (zod schema), node catalog, expression language, executor with injected services, templates, n8n import/export. |
| [@aphrody/bun-video](../../../frameworks/bun-video) | Bun video protocols, native capture adapters, and official Remotion and HyperFrames integrations |
| [@aphrody/canvas](../../../frameworks/canvas) | Aphrody native Skia canvas facade over the pinned upstream @napi-rs/canvas runtime |
| [@aphrody/chromium](../../../frameworks/chromium-ts) | Chromium CDP client and launcher, Obscura alias, Brave adblock-rust and privacy cryptography for upstream Bun: the owner of the aphrody-labs/bun fork's bun:chromium, bun:chrome,... |
| [@aphrody/design](../../../frameworks/design) | Systeme de design unique du monorepo : tokens Material 3 (Material Color Utilities) depuis frameworks/design/design.toml, sorties CSS, Rust (GPUI), Zig, ANSI, Figma, DESIGN.md ;... |
| [@aphrody/discord-kit](../../../frameworks/discord-kit) | Unified Discord bot core kit: pre-flight intent negotiation, memory-bounded caching, resilient interaction dispatching, lifecycle management and guards for Bun. |
| [@aphrody/gaming](../../../frameworks/gaming) | Gaming stack of the monorepo: Steam (web API, SteamID, local paths over `ay steam`), Proton, Vulkan layers, DirectX, steamcmd and Proton wrappers; `ay gaming` |
| [@aphrody/google](../../../frameworks/google-ts) | Aphrody Google: Cloud, Gemini, Drive, Docs, REST services (src/rest), gcloud principals and billing (src/gcp), document translation (src/doc-ai), Drive client (src/drive-client). |
| [@aphrody/i18n](../../../frameworks/i18n-ts) | Shared i18n layer: catalogs discovered from locales/, Unicode MessageFormat 2 (messageformat) behind a format-adapter interface, Intl-based locale negotiation, check/extract/tra... |
| [@aphrody/m3-ai](../../../frameworks/m3-ai) | Material Design 3 agent-interaction components (tool calls, markdown, chat composer, workers, tasks): the SpaceUI (@spacedrive/ai) set rebuilt on @aphrody/m3-primitives. |
| [@aphrody/m3-os-themes](../../../frameworks/m3-os-themes) | Material 3 OS theme generators and installers (Windows 11, GNOME Shell, COSMIC, Chromium browsers) derived from @aphrody/m3-tokens dynamic colour roles. |
| [@aphrody/m3-primitives](../../../frameworks/m3-primitives) | Material Design 3 React primitives: the SpaceUI (@spacedrive/primitives) component set rebuilt on the M3 roles, shape, typescale, state layers and motion of the aphrody design s... |
| [@aphrody/m3-reader](../../../frameworks/m3-reader) | Material 3 manga and illustrated book readers for React |
| [@aphrody/m3-theme](../../../frameworks/m3-theme) | Canonical Material 3 fusion sheets: tokens.css (M3 + shadcn/ui + Tailwind v4 aliases), tailwind.css (every M3 system token as a Tailwind v4 utility) and spaceui.css (the SpaceUI... |
| [@aphrody/m3-tokens](../../../frameworks/m3-tokens) | Material 3 design tokens (--md-sys-*) for the @aphrody/material-web fork: MUI-theme → M3 token CSS generation and runtime Material You dynamic colour via material-color-utilities. |
| [@aphrody/messaging](../../../frameworks/messaging) | Aphrody messaging channel contracts and Discord REST adapter. |
| [@aphrody/plugin-opener](../../../frameworks/plugin-opener) | Open files and URLs using their default application. |
| [@aphrody/ghidra](../../../frameworks/re-ts/ghidra) | Ghidra API for Bun (pyghidra parity), Bun plugin and native onBeforeParse plugin |
| [@aphrody/web](../../../frameworks/web) | - |
| [@aphrody/web-crawl](../../../frameworks/web-crawl) | Typed Bun client for the Aphrody Web crawler CLI |
| [@aphrody/bun-parity](../../../system/bun-parity) | Automated Chromium Upstream vs Bun Full-Stack Parity Recon & Auto-Patcher |
| [@aphrody/bun-plugin-tailwind](../../../system/bun-plugin-tailwind) | Tailwind CSS v4 for Bun: Bun.build, the HTML dev server and Bun.serve, a PostCSS plugin on the same engine, and a Material 3 preset |
| [@aphrody/bun-plugins](../../../system/bun-plugins) | Sovereign Bun Plugins: Just Recipes, Turbo Blake3 Cache, and VCS Metadata |
| [@aphrody/bun-runtime-sdk](../../../system/bun-runtime-sdk) | SDK of the buv native runtime: versioned buv C ABI with compatible yolo exports and Bun, .NET and Python bindings |
| [@aphrody/bun-sql](../../../system/bun-sql) | Native Bun.SQL provider connections and official Neon and Supabase SDKs |
| [@aphrody/bun-steam](../../../system/bun-steam) | Bun OS Steam owner (Bun half): VDF text/binary/appinfo parser and writer, Steam client configuration, steamcmd with a cached session, libraries, Proton management and launch tun... |
| [@aphrody/bun-test-dom](../../../system/bun-test-dom) | - |
| [@aphrody/bunify](../../../system/bunify) | legacy Node/TS/JS -> Bun -> Rust migrator |
| [@aphrody/core](../../../system/core-ts) | bun:ffi bridge to system/core/capi: tree-sitter parse/query, BLAKE3, recursive index (sqlite + JSON) |
| [@aphrody/deploy](../../../system/deploy) | aphrody.app: first-party deployment platform of the monorepo (previews per commit, production pointer, rollback, logs) on Cloudflare Workers and R2 |
| [@aphrody/env-kit](../../../system/env-kit) | Zero-dependency cross-language environment sharing, secret redaction, and editor/agent sync toolkit (Google Cloud IAM and billing live in @aphrody/google/gcp) for C:/aphrody |
| [@aphrody/ffi-bridge](../../../system/ffi-bridge) | bun:ffi bindings and tests of the Rust cdylibs (dx12-hal, unix-distro probes) |
| [@aphrody/forge](../../../system/forge) | Sovereign Rust + TypeScript Tri-Forge (GitHub + GitLab + Google Git + Arch Upstreams) CLI (frg) |
| [@aphrody/gnu](../../../system/gnu-ts) | GNU upstream tracker and distributor: ftp.gnu.org, info-gnu, Savannah, GSRC, Guix and the Rust equivalents, as a JSON feed, an Atom feed, a static site and MCP tools |
| [@aphrody/http](../../../system/http-ts) | Portable in-process JSON transport shared by Aphrody service clients |
| [@aphrody/machine](../../../system/machine-ts) | Reproducible Windows workstation: WinGet DSC v3 (niubash, Coreutils), Claude Code shell/MCP setup, aphrody-labs forks, flat third_party |
| [@aphrody/native](../../../system/native) | bun:ffi bindings for the Zig native desktop SDK (third_party/native, vercel-labs/native) |
| [@aphrody/next-bun](../../../system/next-bun) | Next.js on Bun: run next with no Node.js (Turbopack workers included), build the Pages Router with Bun.build (experimental), Next 16 / Tailwind 4 codemods, instant navigation te... |
| [@aphrody/omniu](../../../system/omniu) | oh-my-niu for Bun: plugin bundle as data, validator, packager and scaffolder, and the host that loads the ay plugin into both Bun and niu |
| [@aphrody/py2bun](../../../system/py2bun-ts) | Python 3 to Bun TypeScript transpiler: runtime and CLI wrapper (Rust crate at system/py2bun) |
| [@aphrody/release](../../../system/release) | ay release: tags, GitHub releases, crates.io, npm, PyPI and vcpkg/CMake from fr1, dry-run first |
| [@aphrody/sql](../../../system/sql-ts) | Shared Bun database mechanics for Aphrody: env/URL resolution, Bun.SQL and Redis factories, bun:sqlite open policy with optional sqlite-vec |
| [@aphrody/upstream](../../../system/upstream) | Patch stacks of the bun and Chromium forks: status, rebase on upstream, ephemeral PR heads, contribution checks |
| [@aphrody/wck](../../../system/wck) | Compile-Time Web Validator (Google SEO + AI Mode SEO + Modern Web Guidelines + Core Web Vitals + Lighthouse 100 + WASM + WebGPU Chromium Spec) |
| [@aphrody/x](../../../system/x) | Headless X (Twitter) client for Bun: a thin import over the Rust crate aphrody-x (aphrody-ffi), with batch jobs for mass scripting. |
