# Aphrody roadmap and specification

Single plan for src. Versions are never written here: they come from `src.lock.json`, `Cargo.lock`, `bun.lock`, `tools.toml` and the upstream trackers. `just hygiene` fails on any version, date or path pinned in this file.

## Definition of done (every item)

An item ships only when all of these hold, in one pass, before it is reported:

1. **Latest upstream**: canary, nightly or rc of every dependency, resolved live (see `deps-always-latest`). No downgrade. When a newer release breaks the build, the breakage is fixed, not avoided by pinning back.
2. **Built and tested**: built on fr2 (fr1 when the build needs its cache), with targeted tests green. The tests fail when the code breaks.
3. **Running**: deployed on its target (fr1, fr2 or prd), and the proof is a real interaction, not an HTTP status (`proof-not-http-200`).
4. **Delivered**: a skill in `.agents/skills/<name>/SKILL.md`, an MCP tool behind the relay hub, and a `just` recipe or `ay` subcommand.
5. **Clean**: `just hygiene` is green, with no hardcoded value and no slop. A Gemini review is archived in `docs/reviews`, and every confirmed defect is fixed.

A report never says "not verified" or "not run". If a step cannot complete, the cause is fixed in the same pass, or the item stays open on this page.

## Workstreams

| # | Workstream | Ship target | State |
| --- | --- | --- | --- |
| 1 | GNU in Rust (`src/gnu`, uutils) | every GNU program passes the GNU test suite, as `ay gnu` | which, time 100 %; bc, m4, ed partial |
| 2 | GNU distribution (`packages/gnu`) | live feed of GNU, Rust and kernel upstream at gnu.aphrody.com, MCP `gnu__*` | running on fr2 |
| 3 | Android/AOSP toolchain (`infra/android`) | reproducible SDK, NDK, JDK and Kotlin setup and `libaysys.so` for Android; the Compose shell moved to aphrody-labs/open | running |
| 4 | Ghidra fork, bun-ghidra, py2bun | converted Ghidra scripts run under bun-ghidra, with an LLVM LTO and AOT build | parity proven; Java exports open |
| 5 | Gemini web MCP gateway (mcp.aphrody.com) | Gemini web uses the relay tools through OAuth | needs owner consent |
| 6 | Index pipeline (`ay index`) | shared SQLite and Valkey index across hosts | skill `ay-index`, magika on; open: `cargo check --workspace` red on a clean checkout (src/bun_core/build.rs needs `build_options.rs` from a Bun configure step the repo does not provide), Windows `ay.exe` from CI `deps.yml` then `infra/pipeline/pc-install.ts` |
| 7 | Electron migrator (`ay electron`) | an Electron app migrated to Tauri or GPUI and benchmarked | skill `electron-migrate` |
| 8 | Build science (`docs/native/BUILD-SCIENCE.md`) | each measured gain is adopted in `just` | sccache adopted |
| 9 | Fleet offload | fr1 PSI below saturation, no yolo legacy, clean file systems | slices and `fleet-run` live |
| 10 | Hygiene purge | `just hygiene` green on the whole tree | running |
| 11 | unixwin fusion | every unixwin repo absorbed or pinned once; `src/{rubash,ruline,niubash}` workspace members; `ay` is a plugin of Bun and of niu | steps 1-8 done on fr2 (crates, `ay sh`, plugin surface, Bun ports, WinuxCmd-based applet multicall, wpm in `ay up`, skills and MCP); open: WinuxCmd C++ applets to Rust, winuxcmd-i18n and profiles, linux/unix/posix/nt merge |

## Order

Items 10 and 9 come first, because they unblock everything else. Next come 4, 1 and 2, which are the closest to shipping. Then 6, 7, 3 and 5. Each item ships under the definition of done before the next one starts.
