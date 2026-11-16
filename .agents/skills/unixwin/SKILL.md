---
name: unixwin
description: The unixwin fusion in src: niu (Bash for Windows) and its Rust engine rubash, WinuxCmd applets and the one `ay applet` multicall, wpm folded into `ay up`, the oh-my-niu plugin bundle and the `ay` plugin for Bun and niu, shellbench and diffcorpus. Use to run or change any of them, to install niu for an agent, or to find where a unixwin repo went.
---

# unixwin in src

Map of the org (`docs/native/UNIXWIN.md` has one row per repo, with target, dedup decision and the per-applet matrix):

| Need | Where | Command |
| --- | --- | --- |
| Bash 5.3 engine (Rust) | `src/rubash` | `ay sh -c 'echo hi'`, `ay sh script.sh`; no bash is spawned |
| The `niu` shell, `niu skill install`, `niu doctor` | `src/niubash` (+ `src/ruline` line editor) | `cargo build -p niubash` (fleet), `niu --help` |
| Unix applets in one multicall | `src/winux/{core,regex,cmds}` + uutils | `ay applet --list`, `ay applet <name> args` |
| wpm packages | `prebuilts/up/tools.d/wpm.toml` (generated), `prebuilts/up/tools.toml` | `ay up --list`, `ay up <tool>`; regenerate with `bun scripts/wpm-import.ts --write` |
| oh-my-niu plugins, validator, packager | `packages/omniu` | `bun packages/omniu/src/cli.ts validate | package | new-pack | plugins` |
| `ay` as a plugin of Bun and niu | `ay plugin manifest`, `packages/omniu/plugins/ay` | Bun: `import { run, sh } from "ay"` after the preload; niu: `NIU_PLUGINS=(ay)` |
| Shell benchmark | `bench/shell` | `bun bench/shell/cli.ts run --shell "<cmd>" --name N` |
| Differential corpus vs GNU bash | `test/diffcorpus` | `bun test/diffcorpus/runner.ts --shell "<cmd>"` |
| Site `unixwin.dev`, GUI `wpm-gui` | `apps/open` (aphrody-labs/open) | not built in src |

Rules that bite:
- Rust builds and tests run on the fleet (fr1 or CI; fr2 for tests), never on the PC. rubash tests: `RUST_TEST_THREADS=1 cargo test -p rubash --lib` (the suite mutates the process environment). `ay` builds with `--no-default-features` where onnxruntime is absent.
- The WinuxCmd library (`src/winux`) is Win32 code: it is checked with `cargo check -Zbuild-std --target x86_64-pc-windows-msvc`, and `ay` links it on Windows only; elsewhere the `winux` applets run through uutils.
- `src/rubash`, `src/ruline`, `src/niubash`, `src/winux` carry the imported upstream commit in `UPSTREAM_REV`; the pins in `src.lock.json` (`third_party/<repo>`) stay the re-import source. Local fixes to rubash are listed.
- The niu skill bundle that `niu skill install` ships is `.agents/skills/niubash/` (the single source; `src/niubash/src/skill.rs` embeds it).

References (rendered from the `third_party/unixwin.dev` pin, and the rubash skill):
- `references/unixwin-dev-llms.txt`, `references/unixwin-dev-llms-full.txt`: the site's llms.txt endpoints.
- `references/unixwin-dev-agents.md`: switching an agent's shell to niu (four detection mechanisms, verification, rollback).
- `references/rubash.md`: the engine's own skill (invocation, compatibility ledger).
