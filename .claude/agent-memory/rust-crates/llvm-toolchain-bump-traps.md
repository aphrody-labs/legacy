---
name: llvm-toolchain-bump-traps
description: Traps of the 2026-11-15/16 Chromium toolchain bump (157 to 160): rust-toolchain.toml clobbering, gitignore of manifests, fr1 reboot and dead runners, sd and $ in replacements
metadata:
  type: feedback
---

- A regex pass over "files naming the generation" must never include `rust-toolchain.toml` itself: it is the one place that names it (a rule `channel = "chromium-160"` -> `<milestone>` broke it twice). `scripts/toolchain.ts` reads the channel from it and takes `third_party/toolchain-<N>.toml`.
- `.gitignore` ignores `/third_party/*`: a new `third_party/toolchain-<N>.toml` needs the `!/third_party/toolchain-*.toml` exception, else `commit.ts` silently skips it.
- `sd` treats `$X` in the replacement as a capture group (`${TC:?..}` became empty): use `bun -e` with `String.replace` of literal strings, or `sd -s` for single-line literals.
- Dirty shared files: rewrite HEAD content with the same rules and pass `--content path=file`; also edit the working copy so nobody reverts the change. `commit.ts` does not push without `--push`.
- Chromium's rust package has no rust-lld and no gcc-ld (Linux and Windows): link through `cc` or lld-link/clang of the clang package. llvm-profdata, llvm-cov, llvm-objdump are in the clang packages; llvm-bolt, llvm-size and clang-format are not (clang-tidy is its own package `clang-tidy-<rev>-1`).
- Chromium bucket names: `clang-<rev>-<sub>`, `rust-toolchain-<rust_rev>-<rust_sub>-<clang_rev>` under `Linux_x64` and `Win`; revisions from `tools/clang/scripts/update.py` and `tools/rust/update_rust.py` at the Chromium tag (raw.githubusercontent.com/chromium/chromium/<tag>/...).
- fr1 reboots wipe running builds and may remove `~/.local/share/aphrody/toolchain/157` and the GitHub runners (`/home/ubuntu/actions-runner` gone on 2026-11-16, jobs on `[self-hosted, fr1]` stay queued): run light jobs on `ubuntu-latest`.
- `ay` size depends on the checkout: `system/core/build.rs` compiled every `third_party/tree-sitter-*` clone present (127 clones on fr1: 204 MB, CI checkout with none: 42 MB). Now opt-in through feature `grammars` or `APHRODY_GRAMMARS=1`.
- ssh fr1 -> fr2: `ubuntu@fr2.mesh` with `-o StrictHostKeyChecking=accept-new`.

**Why:** each cost minutes during the bump; the first two broke builds for other sessions.
**How to apply:** before any toolchain bump or mass reference rewrite in this repo.
