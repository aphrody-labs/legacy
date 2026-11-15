# unixwin fusion

Owner order (2026-11-15): fuse every repository of github.com/orgs/unixwin into the core of this monorepo, refactored for Bun and Rust crates and aligned on Bun's layout (`docs/ARCHITECTURE.md` section 9). `ay` becomes a plugin of Bun and of niu.

Rules: one copy per project; the pin lives in `src.lock.json` (versions are never written here, read the lock); a fork is `aphrody-labs/<name>` rebased on the upstream default branch; Rust leaf crates that are absorbed keep their upstream names under `src/` (the Bun precedent, section 9.5); UI, site and desktop GUI belong to `aphrody-labs/open` (`apps/open`).

Fork state (resolved with `gh api repos/<o>/<r>/commits/<branch>` on 2026-11-15):

| Fork | Upstream head | Action |
| --- | --- | --- |
| rubash | `e527da13` (2026-11-15T06:13Z) | the 20 fork commits were CI noise plus 7 code commits; the code commits are cherry-picked on upstream master (one upstream already carries the same test-binary fix and is dropped); CI-only commits dropped |
| niubash | `0c8d81e4` (2026-11-15T05:16Z) | `NIU_ROOT_FALLBACK` commit kept on upstream master; the llvm-rc commit is already upstream; CI commits dropped |
| WinuxCmd | `47fcf454` (2026-11-15T05:04Z) | fast-forwarded |
| winuxcmd-i18n | `f88bec1b` (2026-11-15T01:53Z) | fast-forwarded |
| codex | openai/codex `b016cd18` (2026-11-15T03:17Z) | fast-forwarded (was 158 behind); the 9 `unixwin/codex` commits are Windows CI workflows only, not carried |
| ruline, oh-my-niu, shellbench, diffcorpus, wpm-*, winuxsh-profiles, niu-git, unixwin.dev | equal to the fork | none |

## Repositories

| Repo | What it is | Target | Dedup decision | Status |
| --- | --- | --- | --- | --- |
| codex | Rust, fork of openai/codex | `third_party/codex` (pin only, `aphrody-labs/codex`) | `unixwin/codex` is a stale duplicate of `openai/codex`; the only delta is Windows CI | done |
| rubash | Rust, Bash 5.3 engine (one crate) | `src/rubash` (workspace member, crate `rubash`) | the shell engine of the repo; `ay sh` links it (Session API), no bash is spawned; `third_party/rubash` stays as pin and re-import source (`src/rubash/UPSTREAM_REV` records the imported commit); local fixes: two `FileFd` initializers missing `closed` (upstream head does not compile on Linux), `Session::set_command_string_mode` | done: `cargo check/build -p rubash` on fr2; diffcorpus 304/306 (the two others depend on the oracle build) |
| ruline | Rust, GNU readline compatible editor (package `reedline`) plus `readline-abi` | `src/ruline`, `src/ruline/readline-abi` | one line editor; no other readline crate is added (`reedline` 0.1.0 and `readline-abi` are workspace members) | done: builds on fr2 |
| niubash | Rust, `niu` shell, skill installer, `niu doctor`, `wpm` | `src/niubash`, `src/niubash/runtime` | `niu` replaces the shell-matrix entry `niubash` installed by `just unixwin-install`; `ay` links the engine, no second copy; `niu` and `bash` binaries build with `cargo build -p niubash` | done: builds on fr2; the Python generators of `scripts/` stay at the pin |
| oh-my-niu | plugin bundle (22 packs of `.niu` scripts, Python tooling) | `packages/omniu` (packs as data, tools in Bun) | its plugin API `niubash:plugin@0.1.0` is the niu side of the `ay` plugin surface (step 3) | step 3, 4 |
| shellbench | Python benchmark harness and case corpus | `bench/shell` | one shell benchmark; `bench/` is the Bun layout slot | step 4 |
| diffcorpus | Python differential corpus (306 cases against GNU bash) | `test/diffcorpus` | one differential corpus; replaces the ad hoc shell matrix comparisons | step 4 |
| WinuxCmd | C++, 176+ Linux commands for Windows | `third_party/WinuxCmd` pin; winners per applet go to the Windows bundle | WinuxCmd is the base (owner, 2026-11-15); per-applet matrix below; its Rust library (`rust2`: winux-core, winux-regex, winux-cmds) is absorbed as `src/winux/{core,regex,cmds}`; the C++ applets and the FFI/driver glue stay at the pin until their Rust port lands | done: matrix, `ay applet`, crates check on the Windows target; C++ applets pending |
| winuxcmd-i18n | locale catalogs for WinuxCmd (`catalog.json` per locale) | `packages/i18n` catalogs (locales are the catalogs present) | one i18n stack; catalogs merged, no second loader | pending |
| wpm-source | WPM package index (`index.json`) | `tools.toml` entries read by `ay up` (`src/up`) | wpm and `ay up` both install single-binary tools: one resolver, `ay up`. `scripts/wpm-import.ts` turns the index into `infra/up/tools.d/wpm.toml` (231 of 289 packages; 38 already in tools.toml, 14 install a directory tree, 6 are alias, bundle or without artifact); `ay up` merges `infra/up/tools.d/*.toml` (embedded copy elsewhere) and never lets a generated row replace a hand-written one; `pick."<cmd>@<platform>"` names the archive file when it differs | done: `cargo test -p aphrody-up` on fr2; the rows are Windows artifacts, so on Linux `ay up --list` reports them without an asset |
| wpm-artifacts | self-hosted artifacts with SHA-256, one release per package | `third_party/wpm-artifacts` pin; `infra/up/tools.d/wpm.toml` `assets`/`sha256` fields | artifacts stay on GitHub Releases, referenced by URL and sha256 from the generated rows | done (through the catalog) |
| winuxsh-profiles | shell and package profiles (`modern-cli`) | `packages/machine/shells` profiles over `tools.toml` groups | one profile format (`tools.toml` group plus rc fragment) | pending |
| niu-git | Python build of Git for Windows with MSVC | `third_party/niu-git` pin only | no copy; `build.py` is a build recipe, tracked by pin | pin only |
| unixwin.dev | Astro site, `/llms.txt`, `/agents.md`, agent switch scripts | `apps/unixwin/upstream/unixwin.dev` pin; site routed to `apps/open` | `llms.txt`, `llms-full.txt` and `agents.md` are Astro routes whose `GET()` renders under Bun without Astro: captured from the pin into `.agents/skills/unixwin/references/`; the site is not built in src | done (skill); site handed to open |
| wpm-gui | Svelte desktop GUI for wpm | `apps/unixwin/upstream/wpm-gui` pin; routed to `apps/open` | UI belongs to `apps/open`; handoff note `docs/ideas/unixwin-site-and-gui.md` in aphrody-labs/open (pushed); `session_send` to apps-3f not sent: the relay MCP was disconnected during this run | handed off |
| apt | signed Debian archive of niubash packages (generated by the niubash release workflow) | not forked | build output, not source; replaced by `ay` dist releases | excluded |
| .github | org profile and issue templates | not forked | community health files of the org, not code | excluded |

## Existing overlaps

| Overlap | Decision |
| --- | --- |
| `src/gnu`, uutils against WinuxCmd | one multicall, `ay applet`: WinuxCmd Rust applets in process (Windows), uutils for what WinuxCmd lacks or still has in C++ and on non-Windows hosts; `src/gnu` keeps the GNU packages WinuxCmd does not have (bc, ed, gawk, m4, tar, time, which...) |
| `packages/machine` shell matrix (`shells/bash`, `ay machine`) against niubash and oh-my-niu config | machine keeps provisioning; the engine and the rc packs come from `src/niubash` and `packages/omniu` |
| `tools.toml` and `ay up` against wpm | `ay up` is the resolver, wpm index entries become `tools.toml` rows (step 6) |
| `.agents/skills`, relay hub | skill `unixwin` (map of the fusion, rules) and skill `niubash` (the bundle `niu skill install` ships, moved from `src/niubash/skills`, embedded from `.agents/skills/niubash` by `src/niubash/src/skill.rs`); MCP server `packages/ai-os/src/relay/unixwin-mcp.ts` registered as `[[hub.mcp]] unixwin` (tools `unixwin_applets`, `unixwin_plugin_manifest`, `unixwin_validate_bundle`, `unixwin_sh`) |
| Bun crates in `src/` against rubash and niubash embedding | no overlap in code: Bun has no bash engine; `src/rubash` stays a leaf crate and `ay` depends on it |
| `packages/i18n` against winuxcmd-i18n | catalogs merged, step 5 |
| `infra/unixwin` (`just unixwin-*`) | builds `niu` from the pins today; step 2 moves it to `cargo build -p niubash` |

## Step 2 measurements (fr2, 2026-11-15)

- `cargo check -p rubash -p reedline -p readline-abi -p niubash-runtime -p niubash` and `cargo build -p aphrody -p niubash --no-default-features` pass (the default `magika` feature needs a native onnxruntime that fr2 lacks; unrelated to this fusion).
- diffcorpus (306 cases against the distro GNU bash 5.3.9 as oracle): `rubash` 304 pass; `ay` (through the multicall symlink) 302 pass. Failures outside the oracle build: none after `BASH_EXECUTION_STRING` and argv0 handling (302/306, run through a symlink to ay; ms10 is the known-stable one). en02 (compiled-in default PATH), en04 (BASH_VERSINFO patch level) and ps06 (`wait -n` race) depend on the oracle.
- `ay -c BODY` (the engine's respawn of itself for process substitution, coprocs and background jobs) routes to `ay sh -c BODY`.

## Step 5: WinuxCmd base, one multicall

- Source of the matrix: `scripts/unixwin-applets.ts` (WinuxCmd `DOCS/2.0-inventory.tsv`, differential `baseline.json`, the niubash completion catalog; uutils clap definitions scanned from the coreutils, findutils and diffutils checkouts; `src/gnu/coreutils/PROOF.md` for the GNU suite failures). It writes the table below and `infra/unixwin/applets.toml`, the provider table that `ay applet` embeds.
- Decision rule: an applet WinuxCmd has stays WinuxCmd's. uutils fills what WinuxCmd lacks and what the multicall cannot carry (C++ applets: `ay` links Rust only). The WinuxCmd library is Win32-only (console, handles, ACLs): `ay` links it on Windows; elsewhere a `winux` applet runs through the uutils multicall. No second coreutils is linked or built.
- Evidence is per side, not a shared run: the WinuxCmd differential corpus (GNU oracle, pass/total) and the GNU test suite on uutils (fr1 run, `src/gnu/coreutils/PROOF.md`: 598 of 637 executed tests). Option columns count long options (W: completion catalog, U: clap scan); they are a coverage signal, not a parity proof. Running the WinuxCmd corpus against uutils on one oracle is not done.
- Built: `src/winux/{core,regex,cmds}` pass `cargo check -Zbuild-std --target x86_64-pc-windows-msvc` on fr2; `ay applet` unit tests pass on fr2 (Linux, provider table); the in-process dispatch is checked on the Windows target only (compiles, not executed).

## Linux, unix, posix and nt in the core: inventory (not merged yet)

Owner update (2026-11-15): merge third-party and first-party linux, unix, posix and nt code into the core, deduplicate, flatten into `src/` in Bun's layout, remove the leftovers. What exists, from the tree and `src.lock.json`:

| Area | In the core now | Pins (`third_party/`) | Overlap found | Next |
| --- | --- | --- | --- | --- |
| Unix tools | `src/gnu` (first-party GNU ports), `src/winux/*`, `ay applet` | coreutils, findutils, diffutils, sed (uutils forks) | `src/gnu` against uutils against WinuxCmd: resolved per applet above | fold `src/gnu` packages that WinuxCmd and uutils both cover into the provider table |
| Shell | `src/rubash`, `src/ruline`, `src/niubash` | rubash, ruline, niubash (re-import source), fish-shell, tree-sitter-bash | `packages/machine/shells` and the shell matrix entry for niubash | point the matrix at `cargo build -p niubash` and drop the pin-based `just unixwin-*` build |
| C core and kernel | `src/arch`, `src/kernel`, `src/drivers`, `src/include` | linux, linux-cachyos, kernel-patches, glibc | `infra/linux/{kernels,patchsets}.toml` carry kernel config next to the pins | none: sources stay pins, config stays data |
| POSIX personality | `src/posix/{omarchy,wslg}` | archlinux-docker, archlinux-wsl, cachyos-*, cachy-chroot, pkg-linux | `infra/wsl-distro`, `infra/linux/images`, `packages/machine/wsl` | move to `infra/os/*` as `docs/ARCHITECTURE.md` 9.3 plans |
| NT personality | `src/nt/status.c`, `src/wine/server_proto.c`, `apps/nt` | wine, vkd3d-proton | `infra/linux/cross-windows` | none yet |

The moves in the last column touch many references (justfile, workflows, archguard rules) and are not done in this pass; only the unixwin crates were flattened into `src/`.

<!-- applets:begin -->
Applets: 178 (WinuxCmd 176, uutils 115; in both 113, WinuxCmd only 63, uutils only 2). Providers in the multicall: winux 83, uutils 35, winux-cxx 60.

| applet | WinuxCmd state | differential pass | options W | uutils | options U | W only | U only | uutils on Windows | GNU suite failures (uutils) | provider |
|---|---|---|---|---|---|---|---|---|---|---|
| [ | wired (rust2) | - | 2 | - | - | - | - | - | - | winux |
| arch | rust-ready (rust2-ready) | 1/1 | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| b2sum | wired (rust2) | 5/5 | 13 | coreutils | 0 | 13 | 0 | yes | 0 | winux |
| base32 | wired (rust2) | 2/2 | 5 | coreutils | 3 | 2 | 0 | yes | 0 | winux |
| base64 | wired (rust2) | 5/5 | 5 | coreutils | 0 | 5 | 0 | yes | 0 | winux |
| basename | wired (rust2) | 4/4 | 8 | coreutils | 3 | 5 | 0 | yes | 0 | winux |
| basenc | c++-only (c++-1.x) | 5/5 | 14 | coreutils | 0 | 14 | 0 | yes | 0 | uutils |
| cal | c++-only (c++-1.x) | 0/10 | 3 | - | - | - | - | - | - | winux-cxx |
| cat | c++-only (c++-1.x) | 12/12 | 9 | coreutils | 7 | 2 | 0 | yes | 0 | uutils |
| chattr | c++-only (c++-1.x) | - | 5 | - | - | - | - | - | - | winux-cxx |
| chcon | rust-ready (rust2-ready) | - | 13 | coreutils | 12 | 1 | 0 | yes | 0 | winux |
| checksum_common | - | - | - | coreutils | 16 | - | - | yes | 0 | uutils |
| chgrp | rust-ready (rust2-ready) | - | 13 | coreutils | 0 | 13 | 0 | no | 0 | winux |
| chmod | rust-ready (rust2-ready) | 3/3 | 12 | coreutils | 8 | 4 | 0 | no | 0 | winux |
| chown | rust-ready (rust2-ready) | - | 13 | coreutils | 0 | 13 | 0 | no | 0 | winux |
| chroot | c++-only (c++-1.x) | - | 5 | coreutils | 3 | 2 | 0 | no | 0 | uutils |
| cksum | rust-ready (rust2-ready) | 3/3 | 18 | coreutils | 0 | 18 | 0 | yes | 1 | winux |
| clear | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| cmp | c++-only (c++-1.x) | 5/5 | 7 | diffutils | 5 | 3 | 1 | yes | 0 | uutils |
| col | c++-only (c++-1.x) | 15/15 | 2 | - | - | - | - | - | - | winux-cxx |
| column | c++-only (c++-1.x) | 18/18 | 28 | - | - | - | - | - | - | winux-cxx |
| comm | c++-only (c++-1.x) | 4/4 | 7 | coreutils | 5 | 2 | 0 | yes | 1 | uutils |
| cp | wired (rust2) | 6/7 | 33 | coreutils | 26 | 9 | 2 | yes | 0 | winux |
| cpio | c++-only (c++-1.x) | - | 11 | - | - | - | - | - | - | winux-cxx |
| csplit | rust-ready (rust2-ready) | 1/1 | 10 | coreutils | 7 | 3 | 0 | yes | 0 | winux |
| cut | wired (rust2) | 6/6 | 12 | coreutils | 10 | 2 | 0 | yes | 0 | winux |
| cygpath | c++-only (c++-1.x) | - | 25 | - | - | - | - | - | - | winux-cxx |
| d2u | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| date | rust-ready (rust2-ready) | 35/35 | 14 | coreutils | 10 | 4 | 0 | yes | 1 | winux |
| dd | c++-only (c++-1.x) | 3/3 | 2 | coreutils | 0 | 2 | 0 | yes | 2 | uutils |
| df | rust-ready (rust2-ready) | 3/3 | 16 | coreutils | 15 | 1 | 0 | yes | 0 | winux |
| diff | c++-only (c++-1.x) | 6/6 | 58 | diffutils | 25 | 37 | 4 | yes | 0 | uutils |
| diff3 | c++-only (c++-1.x) | 27/27 | 2 | - | - | - | - | - | - | winux-cxx |
| dir | c++-only (c++-1.x) | - | 47 | coreutils | 0 | 47 | 0 | yes | 0 | uutils |
| dircolors | c++-only (c++-1.x) | 3/3 | 8 | coreutils | 4 | 4 | 0 | yes | 0 | uutils |
| dirname | wired (rust2) | 5/5 | 3 | coreutils | 1 | 2 | 0 | yes | 0 | winux |
| dos2unix | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| du | wired (rust2) | 7/7 | 25 | coreutils | 25 | 1 | 1 | yes | 0 | winux |
| echo | wired (rust2) | 4/4 | 4 | coreutils | 0 | 4 | 0 | yes | 0 | winux |
| env | c++-only (c++-1.x) | 5/6 | 14 | coreutils | 11 | 3 | 0 | yes | 4 | uutils |
| envsubst | c++-only (c++-1.x) | 0/1 | 3 | - | - | - | - | - | - | winux-cxx |
| expand | wired (rust2) | 2/2 | 4 | coreutils | 3 | 2 | 1 | yes | 0 | winux |
| expr | c++-only (c++-1.x) | 5/5 | 2 | coreutils | 2 | 0 | 0 | yes | 0 | uutils |
| factor | rust-ready (rust2-ready) | 1/1 | 3 | coreutils | 2 | 1 | 0 | yes | 1 | winux |
| false | wired (rust2) | 2/2 | 2 | coreutils | 2 | 0 | 0 | yes | 0 | winux |
| file | c++-only (c++-1.x) | 2/2 | 13 | - | - | - | - | - | - | winux-cxx |
| find | c++-only (rust2-inflight) | 7/8 | 3 | findutils | 0 | 3 | 0 | yes | 0 | uutils |
| fmt | wired (rust2) | 3/3 | 14 | coreutils | 13 | 2 | 1 | yes | 0 | winux |
| fold | wired (rust2) | 4/4 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| free | c++-only (c++-1.x) | - | 22 | - | - | - | - | - | - | winux-cxx |
| getconf | wired (rust2) | 1/1 | 3 | - | - | - | - | - | - | winux |
| getfacl | c++-only (c++-1.x) | - | 10 | - | - | - | - | - | - | winux-cxx |
| getopt | c++-only (c++-1.x) | 2/2 | 11 | - | - | - | - | - | - | winux-cxx |
| grep | c++-only (rust2-inflight) | 16/16 | 49 | - | - | - | - | - | - | winux-cxx |
| groups | rust-ready (rust2-ready) | - | 2 | coreutils | 0 | 2 | 0 | no | 0 | winux |
| head | rust-ready (rust2-ready) | 9/9 | 8 | coreutils | 6 | 3 | 1 | yes | 0 | winux |
| hexdump | c++-only (c++-1.x) | 12/12 | 3 | - | - | - | - | - | - | winux-cxx |
| hmac256 | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| hostid | wired (rust2) | - | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| hostname | wired (rust2) | - | 13 | coreutils | 4 | 9 | 0 | yes | 0 | winux |
| id | wired (rust2) | 0/1 | 9 | coreutils | 8 | 2 | 1 | no | 0 | winux |
| infocmp | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| install | c++-only (c++-1.x) | 6/6 | 18 | coreutils | 14 | 5 | 1 | no | 0 | uutils |
| join | wired (rust2) | 5/5 | 10 | coreutils | 6 | 5 | 1 | yes | 0 | winux |
| kill | c++-only (c++-1.x) | 12/12 | 8 | coreutils | 3 | 5 | 0 | yes | 0 | uutils |
| killall | c++-only (c++-1.x) | - | 6 | - | - | - | - | - | - | winux-cxx |
| ldd | c++-only (c++-1.x) | - | 7 | - | - | - | - | - | - | winux-cxx |
| less | c++-only (c++-1.x) | - | 17 | - | - | - | - | - | - | winux-cxx |
| link | - | - | - | coreutils | 0 | - | - | yes | 0 | uutils |
| ln | wired (rust2) | 4/7 | 16 | coreutils | 11 | 5 | 0 | yes | 0 | winux |
| locale | c++-only (c++-1.x) | 0/1 | 7 | - | - | - | - | - | - | winux-cxx |
| locate | c++-only (c++-1.x) | 2/2 | 19 | findutils | 17 | 4 | 2 | yes | 0 | uutils |
| logger | c++-only (c++-1.x) | - | 17 | - | - | - | - | - | - | winux-cxx |
| logname | c++-only (c++-1.x) | - | 2 | coreutils | 0 | 2 | 0 | no | 0 | uutils |
| look | c++-only (c++-1.x) | 4/4 | 6 | - | - | - | - | - | - | winux-cxx |
| ls | c++-only (c++-1.x) | 7/8 | 47 | coreutils | 44 | 4 | 1 | yes | 0 | uutils |
| lsattr | c++-only (c++-1.x) | - | 6 | - | - | - | - | - | - | winux-cxx |
| lsof | c++-only (c++-1.x) | - | 12 | - | - | - | - | - | - | winux-cxx |
| man | c++-only (c++-1.x) | - | 8 | - | - | - | - | - | - | winux-cxx |
| md5sum | wired (rust2) | 2/2 | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| mkdir | wired (rust2) | 4/4 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| mkfifo | wired (rust2) | 3/3 | 5 | coreutils | 2 | 3 | 0 | no | 0 | winux |
| mkgroup | c++-only (c++-1.x) | - | 4 | - | - | - | - | - | - | winux-cxx |
| mknod | wired (rust2) | 2/2 | 4 | coreutils | 2 | 2 | 0 | no | 0 | winux |
| mkpasswd | c++-only (c++-1.x) | - | 8 | - | - | - | - | - | - | winux-cxx |
| mktemp | wired (rust2) | 6/8 | 7 | coreutils | 5 | 2 | 0 | yes | 0 | winux |
| more | c++-only (c++-1.x) | 7/7 | 11 | coreutils | 12 | 2 | 3 | yes | 0 | uutils |
| mpicalc | c++-only (c++-1.x) | - | 0 | - | - | - | - | - | - | winux-cxx |
| mv | c++-only (c++-1.x) | 13/13 | 16 | coreutils | 11 | 6 | 1 | yes | 2 | uutils |
| namei | c++-only (c++-1.x) | 0/2 | 5 | - | - | - | - | - | - | winux-cxx |
| nice | wired (rust2) | 5/5 | 3 | coreutils | 1 | 2 | 0 | yes | 0 | winux |
| nl | c++-only (c++-1.x) | 3/3 | 13 | coreutils | 12 | 1 | 0 | yes | 0 | uutils |
| nohup | rust-ready (rust2-ready) | - | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| nproc | wired (rust2) | - | 4 | coreutils | 2 | 2 | 0 | yes | 0 | winux |
| numfmt | wired (rust2) | 6/6 | 19 | coreutils | 16 | 3 | 0 | yes | 1 | winux |
| od | wired (rust2) | 4/5 | 11 | coreutils | 10 | 1 | 0 | yes | 1 | winux |
| paste | wired (rust2) | 4/4 | 5 | coreutils | 3 | 2 | 0 | yes | 0 | winux |
| patch | c++-only (c++-1.x) | - | 29 | - | - | - | - | - | - | winux-cxx |
| pathchk | rust-ready (rust2-ready) | 9/9 | 3 | coreutils | 1 | 2 | 0 | yes | 0 | winux |
| pgrep | c++-only (c++-1.x) | - | 8 | - | - | - | - | - | - | winux-cxx |
| pidof | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| pinky | rust-ready (rust2-ready) | - | 3 | coreutils | 2 | 1 | 0 | no | 0 | winux |
| pkill | c++-only (c++-1.x) | - | 6 | - | - | - | - | - | - | winux-cxx |
| pldd | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| pr | c++-only (c++-1.x) | 2/2 | 28 | coreutils | 22 | 6 | 0 | yes | 2 | uutils |
| printenv | wired (rust2) | 4/4 | 3 | coreutils | 1 | 2 | 0 | yes | 1 | winux |
| printf | c++-only (c++-1.x) | 17/17 | 2 | coreutils | 2 | 0 | 0 | yes | 0 | uutils |
| ps | c++-only (c++-1.x) | - | 7 | - | - | - | - | - | - | winux-cxx |
| ptx | rust-ready (rust2-ready) | 3/3 | 19 | coreutils | 16 | 3 | 0 | yes | 0 | winux |
| pwd | wired (rust2) | 1/1 | 4 | coreutils | 2 | 2 | 0 | yes | 1 | winux |
| readlink | wired (rust2) | 2/6 | 10 | coreutils | 8 | 2 | 0 | yes | 0 | winux |
| realpath | wired (rust2) | 1/3 | 13 | coreutils | 10 | 3 | 0 | yes | 0 | winux |
| regtool | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| renice | c++-only (c++-1.x) | 2/2 | 6 | - | - | - | - | - | - | winux-cxx |
| reset | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| rev | wired (rust2) | 5/5 | 3 | - | - | - | - | - | - | winux |
| rm | c++-only (c++-1.x) | 3/3 | 10 | coreutils | 10 | 2 | 2 | yes | 0 | uutils |
| rmdir | wired (rust2) | 3/3 | 5 | coreutils | 3 | 2 | 0 | yes | 0 | winux |
| runcon | rust-ready (rust2-ready) | - | 7 | coreutils | 5 | 2 | 0 | yes | 0 | winux |
| sdiff | c++-only (c++-1.x) | 30/30 | 3 | - | - | - | - | - | - | winux-cxx |
| sed | c++-only (rust2-inflight) | 5/8 | 18 | - | - | - | - | - | - | winux-cxx |
| seq | wired (rust2) | 10/10 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| sha1sum | wired (rust2) | 1/1 | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| sha224sum | wired (rust2) | - | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| sha256sum | wired (rust2) | 3/3 | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| sha384sum | wired (rust2) | - | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| sha512sum | wired (rust2) | 1/1 | 12 | coreutils | 0 | 12 | 0 | yes | 0 | winux |
| shred | c++-only (c++-1.x) | 6/6 | 10 | coreutils | 8 | 2 | 0 | yes | 0 | uutils |
| shuf | rust-ready (rust2-ready) | 1/1 | 10 | coreutils | 8 | 2 | 0 | yes | 0 | winux |
| sleep | wired (rust2) | 4/4 | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| sort | rust-ready (rust2-ready) | 12/12 | 31 | coreutils | 26 | 5 | 0 | yes | 2 | winux |
| split | c++-only (c++-1.x) | 4/4 | 15 | coreutils | 13 | 3 | 1 | yes | 0 | uutils |
| stat | wired (rust2) | 11/11 | 8 | coreutils | 5 | 3 | 0 | no | 0 | winux |
| stdbuf | c++-only (c++-1.x) | 6/6 | 5 | coreutils | 3 | 2 | 0 | no | 1 | uutils |
| strings | c++-only (c++-1.x) | - | 12 | - | - | - | - | - | - | winux-cxx |
| stty | c++-only (c++-1.x) | 6/6 | 5 | coreutils | 3 | 2 | 0 | no | 0 | uutils |
| sum | wired (rust2) | 1/1 | 4 | coreutils | 1 | 3 | 0 | yes | 0 | winux |
| sync | wired (rust2) | 1/1 | 4 | coreutils | 2 | 2 | 0 | yes | 0 | winux |
| tac | wired (rust2) | 6/6 | 5 | coreutils | 3 | 2 | 0 | yes | 0 | winux |
| tail | rust-ready (rust2-ready) | 8/8 | 15 | coreutils | 13 | 3 | 1 | yes | 5 | winux |
| tee | wired (rust2) | 7/7 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| test | wired (rust2) | 15/15 | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| tic | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| time | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| timeout | wired (rust2) | 6/6 | 7 | coreutils | 5 | 2 | 0 | yes | 0 | winux |
| toe | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| top | c++-only (c++-1.x) | - | 14 | - | - | - | - | - | - | winux-cxx |
| touch | wired (rust2) | 8/8 | 7 | coreutils | 6 | 1 | 0 | yes | 0 | winux |
| tput | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| tr | wired (rust2) | 7/7 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| tree | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| true | wired (rust2) | 2/2 | 2 | coreutils | 2 | 0 | 0 | yes | 0 | winux |
| truncate | wired (rust2) | 2/2 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| tsort | wired (rust2) | 5/5 | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| tty | rust-ready (rust2-ready) | - | 4 | coreutils | 1 | 3 | 0 | yes | 0 | winux |
| tzset | c++-only (c++-1.x) | - | 2 | - | - | - | - | - | - | winux-cxx |
| u2d | c++-only (c++-1.x) | - | 3 | - | - | - | - | - | - | winux-cxx |
| uname | wired (rust2) | - | 11 | coreutils | 10 | 2 | 1 | yes | 0 | winux |
| unexpand | wired (rust2) | 2/2 | 6 | coreutils | 4 | 2 | 0 | yes | 0 | winux |
| uniq | c++-only (c++-1.x) | 7/7 | 12 | coreutils | 10 | 2 | 0 | yes | 1 | uutils |
| unix2dos | c++-only (c++-1.x) | 1/1 | 3 | - | - | - | - | - | - | winux-cxx |
| unlink | wired (rust2) | 1/1 | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| updatedb | c++-only (c++-1.x) | 0/1 | 9 | findutils | 9 | 6 | 6 | yes | 0 | uutils |
| uptime | c++-only (c++-1.x) | - | 4 | coreutils | 2 | 2 | 0 | yes | 0 | uutils |
| users | wired (rust2) | - | 2 | coreutils | 0 | 2 | 0 | no | 0 | winux |
| vdir | c++-only (c++-1.x) | - | 47 | coreutils | 0 | 47 | 0 | yes | 0 | uutils |
| vmstat | c++-only (c++-1.x) | - | 10 | - | - | - | - | - | - | winux-cxx |
| w | c++-only (c++-1.x) | - | 7 | - | - | - | - | - | - | winux-cxx |
| watch | c++-only (c++-1.x) | - | 7 | - | - | - | - | - | - | winux-cxx |
| wc | c++-only (c++-1.x) | 11/11 | 10 | coreutils | 8 | 2 | 0 | yes | 1 | uutils |
| whereis | c++-only (c++-1.x) | 1/3 | 2 | - | - | - | - | - | - | winux-cxx |
| which | c++-only (c++-1.x) | 0/1 | 14 | - | - | - | - | - | - | winux-cxx |
| who | rust-ready (rust2-ready) | - | 17 | coreutils | 13 | 4 | 0 | no | 0 | winux |
| whoami | wired (rust2) | - | 2 | coreutils | 0 | 2 | 0 | yes | 0 | winux |
| wpm | c++-only (c++-1.x) | - | 14 | - | - | - | - | - | - | winux-cxx |
| xargs | rust-ready (rust2-ready) | 1/1 | 18 | findutils | 12 | 6 | 0 | yes | 0 | winux |
| xxd | c++-only (c++-1.x) | 3/3 | 12 | - | - | - | - | - | - | winux-cxx |
| yes | c++-only (c++-1.x) | - | 2 | coreutils | 0 | 2 | 0 | yes | 0 | uutils |
<!-- applets:end -->
