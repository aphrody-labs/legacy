# Repository layout

The root follows [`oven-sh/bun`](https://github.com/oven-sh/bun) for manifests (`Cargo.toml`, `package.json`, `bunfig.toml`; the Bun crates keep their upstream names under `system/`) and AOSP and Chromium for the directories: `apps`, `build`, `device`, `frameworks`, `hardware`, `kernel`, `prebuilts`, `system`, `third_party`, `tools`. A root entry stays only when Bun, AOSP or Chromium has it or a tool requires the path; everything else moves under the directory that owns it. Check with `fd -d 1 -H`.

## Root

| Entry | Why it is at the root |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE.md` | read by agent CLIs, GitHub and Gemini CLI (`.gemini/settings.json` `context.fileName`); `LICENSE.md` states both texts |
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `deny.toml`, `.cargo/` | cargo, rustup and cargo-deny read the workspace root |
| `dist-workspace.toml` | cargo-dist: "Your workspace dist config in dist-workspace.toml or dist.toml" |
| `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json` | bun |
| `pyproject.toml`, `uv.lock` | uv workspace root (Lore, `frameworks/ai-os/python`, `system/core-py`); `scripts/checkdeps.ts` and CI read both |
| `justfile` | just; recipes are imported from `*/*.just` |
| `DEPS`, `DEPS.rules`, `OWNERS`, `src.lock.json` | `scripts/checkdeps.ts`, `ay upstream`; `src.lock.json` is also the repository-root marker for `ay` |
| `.github/`, `.claude/`, `.agents/`, `.claude-plugin/` | GitHub and the agent CLIs; the plugin marketplace root is the checkout |
| `.gitattributes`, `.gitignore`, `.gitmodules`, `.env.example`, `.graphifyignore` | git, env tooling and graphify |
| `apps/`, `build/`, `device/`, `frameworks/`, `hardware/`, `kernel/`, `prebuilts/`, `system/`, `third_party/`, `docs/`, `bench/`, `test/`, `scripts/`, `tools/`, `completions/` | the trees; table below, generated from `tools/layout.toml` |

## Top-level directories

Generated: `bun scripts/relayout.ts table --write` from the `[[area]]` rows of `tools/layout.toml`. The `[[move]]` rows of the same file are the rename map applied by `bun scripts/relayout.ts apply`; `check` fails while an old path exists or is referenced.

<!-- layout:begin -->
| Directory | Content | Why |
| --- | --- | --- |
| `apps/` | end-user applications (web, auto, nt, craft, game, ...) | AOSP packages/apps and Chromium chrome/: products stay apart from the platform |
| `build/` | CI, container images, package recipes, SDK pins, Chromium factory | AOSP build/ and Chromium build/: how the tree is built |
| `device/` | targets and fleet: hosts, cluster, OS images, cloud, secrets, deploy | AOSP device/: per-target configuration |
| `docs/` | documentation, generated index | Chromium docs/ |
| `frameworks/` | AI OS frameworks: ai-os, Google services, a2a, inference, media, UI backends, games (Rust crates and Bun packages) | AOSP frameworks/: the services applications are built on |
| `hardware/` | drivers: DRM/KMS and Mesa glue in C, the DX12 HAL crate | AOSP hardware/: what talks to devices |
| `kernel/` | C and assembly core (libaysys, wasm, uapi headers), built by kernel/Makefile | AOSP kernel/ and Linux: the lowest layer, freestanding |
| `prebuilts/` | binary pins installed by ay up | AOSP prebuilts/: binaries are pinned, not built here |
| `scripts/` | gates and generators run by CI and just | Bun and Chromium both keep scripts/ and tools/ at the root |
| `system/` | ay, the Bun fork core (oven-sh/bun crate names), shell, userland, init, compat (nt, wine, posix, winux) (Rust crates and Bun packages) | AOSP system/: the core userland |
| `test/` | workspace tests and conformance | Bun test/ |
| `third_party/` | upstream checkouts (linux, chromium) and pins | Chromium third_party/; AOSP external/ |
| `tools/` | agent tooling, upstream machinery, identity, generators | AOSP tools/ and Chromium tools/ |
<!-- layout:end -->

## Moved to follow Bun

| Was | Now | Reader |
| --- | --- | --- |
| `tools.toml` | `prebuilts/up/tools.toml` | `ay up` (`system/up`), `ay bun bump`, `xtask deps`, `system/machine-ts`, fleet bootstraps |
| `identity.toml` | `tools/identity.toml` | `scripts/identity.ts`, `system/xtask` |
| `VERSION` | `system/release/VERSION` | `ay release freeze` |
| `plugins/` | `tools/agents/plugins/` | `.claude-plugin/marketplace.json`, `tools/agents/runner.ts` |
| `conformance/` | `test/conformance/` | the crate `test/conformance` |
| `LICENSE-MIT`, `LICENSE-APACHE` | `LICENSE.md` | vcpkg port, package recipes |
| `labs.just`, `tools/labs-scripts/chrome-channels.sh` | `build/chromium-factory/` | `justfile`, chromium skill |

## Purged

`device/fleet/fr1-orig` and `fr2-orig` (nginx captures), stale generated files in `infra/generated`, the frozen upstream tracking snapshots of six forks (now ignored and rewritten by `system/upstream/src/upstream-scan.ts`), and the legacy and frozen documents of `docs/` (git is the history). Left in place with their owner: `tools/labs-scripts/{vendor.sh,absorb-lore.*}` and `tools/monorepo-merge/` (untracked work of another session).

## Outside the tree

`rosegriffon` and `shenron` (community sites) live in sibling folders next to the checkout, outside the tree.

## Documentation

- GitHub issue and pull request templates in `.github/` follow `oven-sh/bun/.github`.
- [`docs/README.md`](../README.md) is generated: `bun scripts/docs-index.ts` (CI runs `--check`). Generated docs (`reference/catalog`, `ai/PROVIDERS.md`, `native/gnu`, `project/languages.md`, `project/naming.md`) are never edited by hand.
- `docs/compiler/` is Bun's documentation layout (`system/aot` includes `explain.mdx`); `docs/lore/` is Lore's own tree.
- Documents stay at about 60 lines and hold no version, count or date written by hand.

## Long scripts

| Script | Verdict |
| --- | --- |
| `tools/agents/runner.ts` (1288 lines) | candidate: fold into `frameworks/ai-os` orchestration |
| `device/cloudflare/{proof,cf,aop}.ts` | candidate: OpenTofu Cloudflare provider or the `cf` CLI |
| `device/fleet/bin/fleet-{resilience,tune}.sh`, `bootstrap/common.sh` | candidate: systemd and `sysctl.d` drop-ins, `ay up --bootstrap` |
| `scripts/android-setup.ts` | candidate: `sdkmanager` driven by `build/android/android.toml` |
| `device/fleet/prd/orphans/bin/backup-shenron-container.py` | candidate: `restic` or `rclone` |
| `scripts/{hygiene,checkdeps,topology,identity,catalog,cli-skills,skills-adopt,docs-index}.ts`, `tools/{gnu-index,trackers}`, `device/cluster/gen.ts` | stay: gates and generators with no upstream equivalent |

## Target of the 2026-11-16 consolidation

Merges keep every capability; `git log -- <path>` is the history of the absorbed package. Status is read from `fd -d 1 packages`, not from this table.

| Area | Target | Evidence for the choice |
| --- | --- | --- |
| Pins | `src.lock.json` is the source; `DEPS` stays the generated gclient view (`ay manifests`) | `DEPS` is generated from `src.lock.json`, which also holds toolchains and hardware that `DEPS` cannot |
| Owners | done: `MAINTAINERS` renamed `OWNERS` (kernel section format kept: `ay git maintainer` and `system/forge` parse `M:`/`S:`/`T:`/`F:`); readers rewritten in `system/xtask`, `system/depot`, `system/forge`; `system/ay` still names the old file in two comments | `rg -l MAINTAINERS` |
| `GEMINI.md` | done: merged into `AGENTS.md`; `.gemini/settings.json` `context.fileName` = `["AGENTS.md"]` | Gemini CLI configuration reference: `context.fileName` is a string or an array |
| `completions/` | generated by `ay`, not tracked | |
| `frameworks/google-ts` | done: `bun-google` (`src/rest`), `gcp` (`src/gcp`), `doc-ai` (`src/doc-ai`), `drive-client` (`src/drive-client`), `google-dream` (`dream/`), `google-bun` and `gcloud-learn` (own subtrees, relocated as they are); `google-design` into `design` | `google-bun` and `gcloud-learn` carry their own manifests, tests and (for `gcloud-learn`) a cargo workspace: relocated whole, capability merge left |
| `frameworks/ai-os` | `ai-triad`, `brain`, `knowledge-engine`, `rag-core`, `inference`, `xai`, `gemma-web`, `agy`, `pi-opencode`; protocols `a2a`, `ag-ui`, `ag-ui-client`, `mcp-ui`, `agent-browser` as submodules | |
| `frameworks/chromium-ts` | `bun-chromium`, `chromium-bun` | |
| `frameworks/web` | `bun-web`, `webos`, `webos-wasm`, `shell-web`, `site`, `bun-webview-page` | |
| Bun fork | `bun-parity`, `bun-plugins`, `bun-sql`, `bun-usockets` | `third_party/bun` is a clone: the merge happens in the fork, not here |
| Others | `core` takes `native` and `ffi-bridge`; `env-kit` takes `vault`, `identity`, `paths`; `release` takes `deploy`, `upstream`, `runtime-adapter`, `runtime-sdk`, `typesafe-sdk`; `machine` takes `omniu`; `re` takes `ghidra`; `gaming` goes to the games app; `py2bun` goes to the migration feature | |
| `src/` (now `system/` and `frameworks/`) | one crate per family behind features: `a2a-*`, `agent-*`, `gemini-*`/`google`/`antigravity`/`model-*`, `llama*`/`ml-*`/`models`/`infer`/`embed`, `flowcat-*`, voice and audio | |
| `infra/` | removed 2026-11-16: split into `build/` (ci, chromium-factory, docker, pkg, android, ay), `device/` (fleet, cluster, os, cloudflare, gcloud, gnu, vault, mail, db, gaming, gamescope-web, deploy.toml), `prebuilts/up`, `tools/` (agents, ai, upstream); `system/ay`, `system/xtask`, `justfile` and `.github/workflows` read the new paths | `bun scripts/relayout.ts check` |
