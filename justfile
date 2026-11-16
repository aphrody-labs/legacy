# Master Workspace Justfile for the monorepo root: settings, shared variables and imports only.
# Recipes live in `.just` files next to the code they drive (`import`, so every recipe name stays global: `just <recipe>`).
# Cross-platform: POSIX sh on Linux/macOS/WSL2/containers, niubash (native Rust bash, no MSYS) on Windows.
# Paths use forward slashes, which every supported shell and toolchain accepts.
# Every value below can be overridden from the environment or `just var=value <recipe>`.
# Windows shell: niubash 1.5.0 (configuration/shell.dsc.winget); `just doctor` output identical to pwsh (2026-11-12).

set shell := ["sh", "-cu"]
set windows-shell := ["niu", "-cu"]
set dotenv-load := false

root := env("SRC_ROOT", justfile_directory())
image := env("SRC_IMAGE", "aphrody/monorepo-dev:local")

import "system/ay/ay.just"
import "system/gnu/gnu.just"
import "scripts/scripts.just"
import "build/android/android.just"
import "frameworks/ai-os/ai-os.just"
import "system/core-ts/core.just"
import "build/browser-engines.just"
import "system/env-kit/env-kit.just"
import "system/gnu-ts/gnu.just"
import "system/machine-ts/machine.just"
import "system/release/release.just"
import "system/upstream/upstream.just"
import "tools/agents/agents.just"
import "build/chromium-factory/chromium-factory.just"
import "device/cloudflare/cloudflare.just"
import "device/cluster/cluster.just"
import "build/docker/docker.just"
import "device/fleet/fleet.just"
import "device/fleet/lfs/lfs.just"
import "device/fleet/nix/devshell/nix.just"
# unixwin chain (niubash, rubash, WinuxCmd): unixwin-* recipes
import "device/os/unixwin/unixwin.just"

# Default recipe: list available commands
default:
    just --list

# Verify the compiler, VCS, cloud, architecture, and AI CLI toolchains
[group('dev')]
doctor:
    ay doctor

# E2E desktop on the PC: Gemini app (agent-desktop), rea, ghidra, agent-browser, gnu; report in var/ and docs/reviews/
[group('dev')]
e2e-desktop:
    bun scripts/e2e-desktop.ts

# Format entire Bun workspace
[group('dev')]
fmt:
    bun fmt

# Run toolchain doctor and Bun + Cargo suites
[group('dev')]
verify-all:
    ay doctor
    bun test "{{root}}/system/env-kit"
    bun --cwd "{{root}}/frameworks/ai-os" test
    # Rust compiles in CI only (never on the workstation): run ci.yml on this commit and wait for it.
    gh workflow run ci.yml --ref main && sleep 5 && gh run watch "$(gh run list --workflow ci.yml -L 1 --json databaseId --jq '.[0].databaseId')" --exit-status

# Pre-push gate: format, layered deps
[group('dev')]
check:
    bun fmt --check
    cargo fmt --all --check
    bun check -b
    just checkdeps
    just js-deps
    just deny
    just identity check

# Lint: Bun typecheck + clippy (compiles: run on fr1, never on the PC nor prd)
[group('dev')]
lint:
    bun check -b
    cargo clippy --workspace --quiet

# Tests of the units changed since ref (alias of test-affected)
[group('dev')]
test ref="origin/main":
    just test-affected {{ref}}

# Ghidra fork: LLVM full-LTO decompiler/sleigh on fr1 (clone /srv/ghidra)
[group('re')]
ghidra-build:
    ssh fr1 "make -C /srv/ghidra/Ghidra/Features/Decompiler/src/decompile/cpp -j12 LLVM=1 ghidra_opt sleigh_opt"
