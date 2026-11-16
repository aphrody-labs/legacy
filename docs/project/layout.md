# Repository layout

The root follows [`oven-sh/bun`](https://github.com/oven-sh/bun): manifests plus `bench`, `completions`, `docs`, `packages`, `scripts`, `src`, `test`, `tools`. A root entry stays only when Bun has it or a tool requires the path; everything else moves under the directory that owns it. Check with `fd -d 1 -H`.

## Root

| Entry | Why it is at the root |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE.md` | read by agent CLIs, GitHub and Gemini CLI (`.gemini/settings.json` `context.fileName`); `LICENSE.md` states both texts |
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `deny.toml`, `.cargo/` | cargo, rustup and cargo-deny read the workspace root |
| `dist-workspace.toml` | cargo-dist: "Your workspace dist config in dist-workspace.toml or dist.toml" |
| `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json` | bun |
| `pyproject.toml`, `uv.lock` | uv workspace root (Lore, `packages/ai-os/python`, `packages/core-py`); `scripts/checkdeps.ts` and CI read both |
| `justfile` | just; recipes are imported from `*/*.just` |
| `DEPS`, `DEPS.rules`, `OWNERS`, `src.lock.json` | `scripts/checkdeps.ts`, `ay upstream`; `src.lock.json` is also the repository-root marker for `ay` |
| `.github/`, `.claude/`, `.agents/`, `.claude-plugin/` | GitHub and the agent CLIs; the plugin marketplace root is the checkout |
| `.gitattributes`, `.gitignore`, `.gitmodules`, `.env.example`, `.graphifyignore` | git, env tooling and graphify |
| `apps/`, `packages/`, `src/`, `infra/`, `third_party/`, `docs/`, `bench/`, `test/`, `scripts/`, `tools/`, `completions/` | the trees; layout in [AGENTS.md](../../AGENTS.md) |

## Moved to follow Bun

| Was | Now | Reader |
| --- | --- | --- |
| `tools.toml` | `infra/up/tools.toml` | `ay up` (`src/up`), `ay bun bump`, `xtask deps`, `packages/machine`, fleet bootstraps |
| `identity.toml` | `tools/identity.toml` | `scripts/identity.ts`, `src/xtask` |
| `VERSION` | `packages/release/VERSION` | `ay release freeze` |
| `plugins/` | `infra/agents/plugins/` | `.claude-plugin/marketplace.json`, `infra/agents/runner.ts` |
| `conformance/` | `test/conformance/` | the crate `test/conformance` |
| `LICENSE-MIT`, `LICENSE-APACHE` | `LICENSE.md` | vcpkg port, package recipes |
| `labs.just`, `tools/labs-scripts/chrome-channels.sh` | `infra/chromium-factory/` | `justfile`, chromium skill |

## Purged

`infra/fleet/fr1-orig` and `fr2-orig` (nginx captures), stale generated files in `infra/generated`, the frozen upstream tracking snapshots of six forks (now ignored and rewritten by `packages/upstream/src/upstream-scan.ts`), and the legacy and frozen documents of `docs/` (git is the history). Left in place with their owner: `tools/labs-scripts/{vendor.sh,absorb-lore.*}` and `tools/monorepo-merge/` (untracked work of another session).

## Submodules

`apps/rosegriffon` and `apps/shenron` are community-site repositories with their own roots. The same rules apply inside them, committed and pushed in their repositories, then the pointer is bumped here.

## Documentation

- GitHub issue and pull request templates in `.github/` follow `oven-sh/bun/.github`.
- [`docs/README.md`](../README.md) is generated: `bun scripts/docs-index.ts` (CI runs `--check`). Generated docs (`reference/catalog`, `ai/PROVIDERS.md`, `native/gnu`, `project/languages.md`, `project/naming.md`) are never edited by hand.
- `docs/compiler/` is Bun's documentation layout (`src/aot` includes `explain.mdx`); `docs/lore/` is Lore's own tree.
- Documents stay at about 60 lines and hold no version, count or date written by hand.

## Long scripts

| Script | Verdict |
| --- | --- |
| `infra/agents/runner.ts` (1288 lines) | candidate: fold into `packages/ai-os` orchestration |
| `infra/cloudflare/{proof,cf,aop}.ts` | candidate: OpenTofu Cloudflare provider or the `cf` CLI |
| `infra/fleet/bin/fleet-{resilience,tune}.sh`, `bootstrap/common.sh` | candidate: systemd and `sysctl.d` drop-ins, `ay up --bootstrap` |
| `scripts/android-setup.ts` | candidate: `sdkmanager` driven by `infra/android/android.toml` |
| `infra/fleet/prd/orphans/bin/backup-shenron-container.py` | candidate: `restic` or `rclone` |
| `scripts/{hygiene,checkdeps,topology,identity,catalog,cli-skills,skills-adopt,docs-index}.ts`, `tools/{gnu-index,trackers}`, `infra/cluster/gen.ts` | stay: gates and generators with no upstream equivalent |

## Target of the 2026-11-16 consolidation

Merges keep every capability; `git log -- <path>` is the history of the absorbed package. Status is read from `fd -d 1 packages`, not from this table.

| Area | Target | Evidence for the choice |
| --- | --- | --- |
| Pins | `src.lock.json` is the source; `DEPS` stays the generated gclient view (`ay manifests`) | `DEPS` is generated from `src.lock.json`, which also holds toolchains and hardware that `DEPS` cannot |
| Owners | done: `MAINTAINERS` renamed `OWNERS` (kernel section format kept: `ay git maintainer` and `packages/forge` parse `M:`/`S:`/`T:`/`F:`); readers rewritten in `src/xtask`, `src/depot`, `packages/forge`; `src/ay` still names the old file in two comments | `rg -l MAINTAINERS` |
| `GEMINI.md` | done: merged into `AGENTS.md`; `.gemini/settings.json` `context.fileName` = `["AGENTS.md"]` | Gemini CLI configuration reference: `context.fileName` is a string or an array |
| `completions/` | generated by `ay`, not tracked | |
| `packages/google` | done: `bun-google` (`src/rest`), `gcp` (`src/gcp`), `doc-ai` (`src/doc-ai`), `drive-client` (`src/drive-client`), `google-dream` (`dream/`), `google-bun` and `gcloud-learn` (own subtrees, relocated as they are); `google-design` into `design` | `google-bun` and `gcloud-learn` carry their own manifests, tests and (for `gcloud-learn`) a cargo workspace: relocated whole, capability merge left |
| `packages/ai-os` | `ai-triad`, `brain`, `knowledge-engine`, `rag-core`, `inference`, `xai`, `gemma-web`, `agy`, `pi-opencode`; protocols `a2a`, `ag-ui`, `ag-ui-client`, `mcp-ui`, `agent-browser` as submodules | |
| `packages/chromium` | `bun-chromium`, `chromium-bun` | |
| `packages/web` | `bun-web`, `webos`, `webos-wasm`, `shell-web`, `site`, `bun-webview-page` | |
| Bun fork | `bun-parity`, `bun-plugins`, `bun-sql`, `bun-usockets` | `third_party/bun` is a clone: the merge happens in the fork, not here |
| Others | `core` takes `native` and `ffi-bridge`; `env-kit` takes `vault`, `identity`, `paths`; `release` takes `deploy`, `upstream`, `runtime-adapter`, `runtime-sdk`, `typesafe-sdk`; `machine` takes `omniu`; `re` takes `ghidra`; `gaming` goes to the games app; `py2bun` goes to the migration feature | |
| `src/` | one crate per family behind features: `a2a-*`, `agent-*`, `gemini-*`/`google`/`antigravity`/`model-*`, `llama*`/`ml-*`/`models`/`infer`/`embed`, `flowcat-*`, voice and audio | |
| `infra/` | done: `ci/` (pipeline, bench, gitlab), `gcloud/billing-agent` (was `gcp`), `fleet/vcpkg`, `up/systemd` (was `generated/`, hand-written units, not generated); left: `cloud` grouping, `fleet` grouping of cluster, os, nix, up, pkg, lfs and docker, `upstream`, `vault`, `ay`, `gaming`, `gamescope-web` (referenced by `justfile`, `.github/workflows`, `src/ay` or runtime path constants) | |
