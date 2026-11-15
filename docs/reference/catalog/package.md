<img src="../../icons/package.svg" alt="" width="48" height="48">

# Bun package

A Bun workspace package (@aphrody/*)

| Name | Description |
| :-- | :-- |
| [@aphrody/site-ng](../../../apps/aphrody/web) | Angular Material app of aphrody.com (M3 studio page): standalone, zoneless, tokens from @aphrody/design, built by Angular's esbuild application builder (AOT). |
| [@aphrody/nt](../../../apps/nt) | - |
| [@aphrody/web](../../../apps/nt/modules/web) | - |
| [@aphrody/github-app](../../../infra/cloudflare/workers/github-app) | - |
| [@aphrody/ai-os](../../../packages/ai-os) | Aphrody AI OS: Unix/GNU-like agent OS distribution unifying LLM, RAG, World Model, and System 1 decision under one C ABI (aphrody_core_capi) |
| [@aphrody/assets](../../../packages/assets) | Redistribution-safe asset library: manifest with SPDX license, sha256 and attribution; fetch, verify, list |
| [@aphrody/bunify](../../../packages/bunify) | legacy Node/TS/JS -> Bun -> Rust migrator |
| [@aphrody/core](../../../packages/core) | bun:ffi bridge to src/core/capi: tree-sitter parse/query, BLAKE3, recursive index (sqlite + JSON) |
| [@aphrody/deploy](../../../packages/deploy) | aphrody.app: first-party deployment platform of the monorepo (previews per commit, production pointer, rollback, logs) on Cloudflare Workers and R2 |
| [@aphrody/design](../../../packages/design) | Systeme de design unique du monorepo : tokens Material 3 (Material Color Utilities) depuis packages/design/brand/brand.toml, sorties CSS, Rust (GPUI), Zig, ANSI, Figma, DESIGN.m... |
| [@aphrody/env-kit](../../../packages/env-kit) | Zero-dependency cross-language environment sharing, secret redaction, and editor/agent sync toolkit (Google Cloud IAM and billing live in @aphrody/gcp) for C:/src |
| [@aphrody/ffi-bridge](../../../packages/ffi-bridge) | bun:ffi bindings and tests of the Rust cdylibs (dx12-hal, unix-distro probes) |
| [@aphrody/gaming](../../../packages/gaming) | Gaming stack of the monorepo: Steam (web API, SteamID, local paths over `ay steam`), Proton, Vulkan layers, DirectX, steamcmd and Proton wrappers; `ay gaming` |
| [@aphrody/gcp](../../../packages/gcp) | Google Cloud for src: 3-principal gcloud configurations, IAM bindings plan, agent-managed billing (split from env-kit) |
| [@aphrody/ghidra](../../../packages/ghidra) | Ghidra API for Bun (pyghidra parity), Bun plugin and native onBeforeParse plugin |
| [@aphrody/gnu](../../../packages/gnu) | GNU upstream tracker and distributor: ftp.gnu.org, info-gnu, Savannah, GSRC, Guix and the Rust equivalents, as a JSON feed, an Atom feed, a static site and MCP tools |
| [@aphrody/i18n](../../../packages/i18n) | Shared i18n layer: catalogs discovered from locales/, Unicode MessageFormat 2 (messageformat) behind a format-adapter interface, Intl-based locale negotiation, check/extract/tra... |
| [@aphrody/machine](../../../packages/machine) | Reproducible Windows workstation: WinGet DSC v3 (niubash, Coreutils), Claude Code shell/MCP setup, aphrody-labs forks, flat third_party |
| [@aphrody/native](../../../packages/native) | bun:ffi bindings for the Zig native desktop SDK (third_party/native, vercel-labs/native) |
| [@aphrody/omniu](../../../packages/omniu) | oh-my-niu for Bun: plugin bundle as data, validator, packager and scaffolder, and the host that loads the ay plugin into both Bun and niu |
| [@aphrody/py2bun](../../../packages/py2bun) | Python 3 to Bun TypeScript transpiler: runtime and CLI wrapper (Rust crate at src/py2bun) |
| [@aphrody/release](../../../packages/release) | ay release: tags, GitHub releases, crates.io, npm, PyPI and vcpkg/CMake from fr1, dry-run first |
| [@aphrody/upstream](../../../packages/upstream) | Patch stacks of the bun and Chromium forks: status, rebase on upstream, ephemeral PR heads, contribution checks |
| [@aphrody/vault](../../../packages/vault) | Async secret vault for src: DPAPI / Windows Hello (NCrypt Passport KSP) / systemd-creds locally, age envelopes per host for sync, sealed json/xml/csv/toml documents, row-encrypt... |
| [@aphrody/wck](../../../packages/wck) | Compile-Time Web Validator (Google SEO + AI Mode SEO + Modern Web Guidelines + Core Web Vitals + Lighthouse 100 + WASM + WebGPU Chromium Spec) |
