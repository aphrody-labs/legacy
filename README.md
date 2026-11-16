<!-- catalog:begin header -->
<img alt="Aphrody" src="docs/logo/aphrody.png" width="96" height="96">
<!-- catalog:end -->

# Aphrody

`ay`: Bun built from its fork without JSC and WebKit, plus the Unix userland (bash, coreutils, binutils), one runner for TS/JS, bash and Rust, and extensions through crates.io and npm. Around it: the platform, the front ends (web, CLI, TUI, GUI, mobile) and ecosystem apps (games on our Bevy fork with Steam and Epic, the Craft Apps, media).

| Path | Content |
| :-- | :-- |
| [`kernel/`](kernel), [`hardware/`](hardware) | the C and assembly core (`kernel/Makefile`), drivers |
| [`system/`](system), [`frameworks/`](frameworks) | Rust crates and Bun packages: platform (ay, Bun fork core, userland, compat) and frameworks (AI, Google services, media, UI) |
| [`apps/`](apps) | [`web`](apps/web), `auto`, `nt`; `open` is its own repo |
| [`build/`](build), [`device/`](device), [`prebuilts/`](prebuilts) | CI and images, fleet and deploy, `ay up` pins |
| [`third_party/`](third_party) | upstream checkouts and forks pinned in `src.lock.json` |

<!-- catalog:begin types -->
## Catalog

The global types of the monorepo, listed from its manifests.

| Type | Path | Description |
| :-- | :-- | :-- |
| [Rust crate](docs/reference/catalog/crate.md) | `frameworks/`, `system/`, `hardware/` | A member of the Cargo workspace (frameworks/*, system/*, hardware/*) |
| [Bun package](docs/reference/catalog/package.md) | `frameworks/`, `system/`, `hardware/` | A Bun workspace package (@aphrody/*) |
| [App](docs/reference/catalog/app.md) | `apps/` | An application or site (apps/*) |
| [Infrastructure](docs/reference/catalog/infra.md) | `build/`, `device/`, `prebuilts/` | Fleet, deploy and CI configuration (build/*, device/*, prebuilts/*) |
| [Upstream](docs/reference/catalog/third-party.md) | `third_party/` | An upstream checkout or fork pinned in src.lock.json (third_party/*) |
| [Agent skill](docs/reference/catalog/skill.md) | `.agents/skills/` | A skill of .agents/skills |
<!-- catalog:end -->

Docs: [docs/README.md](docs/README.md) (generated index). Spec: [docs/native/ROADMAP.md](docs/native/ROADMAP.md). Contract: [AGENTS.md](AGENTS.md). Names: [tools/identity.toml](tools/identity.toml).
