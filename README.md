<!-- catalog:begin header -->
<img alt="Aphrody" src="docs/logo/aphrody.png" width="96" height="96">
<!-- catalog:end -->

# src

Monorepo of Aphrody. Contract: [AGENTS.md](AGENTS.md) and [GEMINI.md](GEMINI.md). Master plan: [docs/PLAN.mdx](docs/PLAN.mdx). Design tokens: [packages/design](packages/design/DESIGN.md). Logo: [docs/logo/aphrody.png](docs/logo/aphrody.png).

## Stack Overview

- **Pure C23 LLVM ABI Core**: [src/core/capi](src/core/capi) (`aphrody_core.h` exporting `core_*` and unified `ai_os_*`, `aphrody_zig.h`, `aphrody_mwg.h`) compiled with `clang` ThinLTO and `-Wall -Wextra -Wpedantic -Werror`. See [docs/native/llvm/PURE-C-LLVM.mdx](docs/native/llvm/PURE-C-LLVM.mdx).
- **Agent OS (`@aphrody/ai-os`)**: cross-platform sandboxed Unix/GNU-like OS distribution for agents unifying FHS VFS (`/etc/ai-os`, `/var/lib/ai-os`, `/proc/agent`, `/dev/{llm,rag,world,sys1}`), LLM, RAG, World Model, and System 1 decision under one C ABI (`aphrody_core_capi`).
- **Bun Runtime**: pure Bun TypeScript packages with zero third-party npm dependencies (`bun:ffi`, `bun:sqlite`, `Bun.Glob`, `Bun.serve`).
- **Rust Workspace**: first-party crates and crates absorbed from Bun in `src/*`, members listed in [`Cargo.toml`](Cargo.toml).
- **Zig Native Cores**: `third_party/native` (vercel-labs/native, bound by `packages/native`) and browser cores exporting stable C ABI symbols via `aphrody_zig.h`.
- **Modern Web Guidance (`@aphrody/wck`)**: pure Bun + `mwg_capi` (`packages/wck/native`) hybrid RAG search, Baseline gates, and MCP tools. See [docs/web/MODERN-WEB-GUIDANCE.mdx](docs/web/MODERN-WEB-GUIDANCE.mdx).
- **`ay` Multicall CLI**: unified repository interface (`ay arch check --strict`, `ay manifests`, `ay gaming`, `ay steam`).

<!-- catalog:begin types -->
## Catalog

The global types of the monorepo, listed from its manifests.

| Type | Path | Description |
| :-- | :-- | :-- |
| [Rust crate](docs/reference/catalog/crate.md) | `src/` | A member of the Cargo workspace (src/*) |
| [Bun package](docs/reference/catalog/package.md) | `packages/` | A Bun workspace package (@aphrody/*) |
| [App](docs/reference/catalog/app.md) | `apps/` | An application or site (apps/*) |
| [Infrastructure](docs/reference/catalog/infra.md) | `infra/` | Fleet, deploy and CI configuration (infra/*) |
| [Upstream](docs/reference/catalog/third-party.md) | `third_party/` | An upstream checkout or fork pinned in src.lock.json (third_party/*) |
| [Agent skill](docs/reference/catalog/skill.md) | `.agents/skills/` | A skill of .agents/skills |
<!-- catalog:end -->

## Commands

Rust compiles in CI or on the build host (`fr1`), never on the workstation.

```sh
just doctor                            # toolchain doctor
just arch-check                        # architecture gate (ay arch check --strict)
bun scripts/checkdeps.ts               # Chromium-style DEPS.rules layer gate
bun scripts/catalog.ts                 # regenerate the READMEs, docs/reference/catalog and the site catalog from the manifests
bun scripts/catalog.ts --check         # the same as a CI gate
bun packages/core/src/cli.ts gen-docs  # regenerate the MDX plans and docs/reference/*.md
bun packages/core/src/cli.ts search <q> # fuzzy symbol and doc search
bun test packages/wck                  # @aphrody/wck Modern Web Guidance suite
```

## Key Documents

| Topic | Document |
| :--- | :--- |
| Master Architectural Plan | [docs/PLAN.mdx](docs/PLAN.mdx) |
| Pure C23 LLVM Core & C ABI | [docs/native/llvm/PURE-C-LLVM.mdx](docs/native/llvm/PURE-C-LLVM.mdx) |
| Modern Web Guidance & RAG | [docs/web/MODERN-WEB-GUIDANCE.mdx](docs/web/MODERN-WEB-GUIDANCE.mdx) |
| Reference Pillars | [docs/reference/tree-sitter.md](docs/reference/tree-sitter.md), [docs/reference/llvm-toolchain.md](docs/reference/llvm-toolchain.md), [docs/reference/bun-ffi.md](docs/reference/bun-ffi.md) |
| Games & Creative Suite Plan | [docs/games/PLAN.md](docs/games/PLAN.md) |
| Repository layout | [docs/project/layout.md](docs/project/layout.md) |
