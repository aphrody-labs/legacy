---
name: fr2-scratch-build-fast
description: Fastest way to get a scratch copy of main on fr2 for cargo test (git archive on fr2 itself), perms under /srv/xbuild, and package names (ay = aphrody)
metadata:
  type: feedback
---

- Never pipe `git archive HEAD` from the PC over ssh: it ran 15+ min and stalled at 70 MB. On fr2 run `cd /srv/src && git fetch -q --no-recurse-submodules origin main && git archive FETCH_HEAD | tar -x -C <dir>` (5 s, 470 MB), then overlay only your files with `tar -cf - <files> | ssh fr2 'tar -x -C <dir>'`.
- `/srv/xbuild` is root-owned: `sudo mkdir -p /srv/xbuild/<name> && sudo chown ubuntu:ubuntu` it, and `sudo touch` + chown any log or script file there before `tee`/redirects.
- Package names differ from dirs: `src/ay` is package `aphrody` (bin `ay`); `src/core` is `aphrody-core`; `src/core/capi` is `aphrody-core-capi`. `cargo test -p ay` fails with "did not match any packages".
- The scratch tree is origin/main, not the local HEAD: overlay HEAD-based copies of files that other sessions have uncommitted edits in (build them from `git show HEAD:path`), never the working-tree copy.
- A full `cargo build -p aphrody` in dev profile compiles ~all bun_* crates: expect 30+ min on 6 cores; do core and capi tests first (a minute).
- Tool tests that need node_modules (hygiene imports `eld`): `bun add eld@<ver>` in a scratch dir and symlink it into `<tree>/node_modules/eld` instead of a full workspace `bun install`. `git init && git add -A && git commit` the archive so `git ls-files` works.
- `QueryMatch.captures` is a method in tree-sitter 0.27 streaming iterators: `m.captures()`.

**Why:** each cost minutes in the 2026-11-15 tree-sitter facts session.
**How to apply:** before the next fr2 scratch build.

Update 2026-11-16:
- fr2 root disk is ~97% full (3 GB free): a core-only `cargo test` fits, anything bigger dies with "No space left on device" (and `rm -rf` of dirs created by root fails). Build on fr1 (20+ GB free) and ship the small release binary to fr2 with `ssh fr1 'cat bin' | ssh fr2 'cat > bin'` for hyperfine runs there.
- fr1 rebooted once mid-session and lost background jobs: `rust-toolchain.toml` names a toolchain that may not be installed (`chromium-157` gone); export `RUSTUP_TOOLCHAIN=<installed nightly>` and `PATH=/home/ubuntu/.cargo/bin:$PATH` in scripts run through `sudo -u ubuntu -H`.
- `a && b & echo` backgrounds the whole && chain: a poll loop started right after reads the stale log. Start jobs as `(nohup bash x.sh >/dev/null 2>&1 </dev/null &)` in their own ssh call, truncate the log first.
- Fast optimized bench binary: `CARGO_PROFILE_RELEASE_LTO=thin CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 cargo build --release -p aphrody-core --features cli --bin aphrody-code` (1-2 min; the repo release profile is fat LTO).
