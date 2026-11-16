---
name: gnu
description: GNU upstream tracker and distributor (system/gnu-ts): real-time releases of every GNU package and the Linux kernel, their Rust equivalents, JSON and Atom feeds, the gnu.aphrody.com site, the aphrody-gnu service on fr2 and the R2 mirror. Use to check a GNU or kernel version, find the Rust replacement of a GNU package, read or operate the feeds, or change the tracker.
---

# GNU upstream tracker

Site: https://gnu.aphrody.com (feed.json, feed.atom, events.json). Doc: `docs/native/gnu/DISTRIBUTION.md`. Package: `system/gnu-ts` (bun, zero dependency).

## CLI

`ay gnu <cmd>` (routes to `bun system/gnu-ts/src/cli.ts`; `just gnu <cmd>` works before `ay` is rebuilt). The feed comes from `GNU_FEED`, else `GNU_HOME/feed.json`, else the public site, so the PC needs no local state.

- `status` feed age, counts, latest releases. `search [words] [--filter rust|drop-in|norust|drift|verified|proven|mirrored]`.
- `package <id>` full entry (id = GSRC id: `coreutils`, `gcc16`). `feed [--since 24h|7d] [--atom]`. `diff [--since 7d]` detected changes.
- `kernel` mainline, stable, longterm, linux-next, trees, Android GKI, ChromeOS, Rust for Linux.
- `sync [--mirror]` one poll cycle (fr2 only for real runs). `site` rebuilds the static site. `daemon` loops (the service).

## MCP (relay hub, server `gnu`)

`hub_call` with `gnu__gnu_status`, `gnu__gnu_search` (query, filter, limit), `gnu__gnu_package` (id), `gnu__gnu_feed` (since, limit, format, changes), `gnu__gnu_kernel`. Server: `frameworks/ai-os/src/relay/gnu-mcp.ts`, declared by `[[hub.mcp]] gnu` in `tools/agents/toolchain.toml` (hub.json is re-read at every listing; no relay restart).

## Feed semantics

- One entry per package: GSRC ids, the inventory, plus ftp directories that have tarballs. `upstream` = newest stable tarball on ftp.gnu.org (ls-lrRt.txt.gz, UTC minutes); `gsrc` is a pin; `drift.gsrc` = ftp newer than GSRC.
- `signature`: `verified` (sqv, GSRC `gpg-keyring`; a "legacy policy" note means SHA-1 key bindings), `unverified`, `invalid` (only on a clear mismatch), `missing` (no `.sig`). `sha256` comes from GSRC when the file matches, else from the mirror download.
- `rust`: equivalents from `system/gnu-ts/src/rust.ts` (RUST_MAP, GitHub releases with ETag, crates.io). `rust_status` = best of `drop-in`, `partial`, `alt`, `lib`. `proof` reads `system/gnu/<id>/PROOF.md`.
- `kernel`: kernel.org releases.json, sha256sums.asc, tree heads (git smart HTTP), gitiles GKI and ChromeOS branches, Rust in tree per series, google/kernel-research; `android` = per-branch analysis of every GKI branch (`pollAndroid` in `system/gnu-ts/src/kernel.ts`, gitiles reads of Makefile, `bazel/constants.scl`, `BUILD.bazel`, `gki_defconfig` at the branch head, redone only when the head moves: kernel, base, KMI phase, clang and rustc pins, Rust Binder). No per-branch timer, no clone.

## Service (fr2)

- `aphrody-gnu.service` (system, Restart=always) runs `cli.ts daemon` every `GNU_INTERVAL` (600 s): feed, Atom, site in `/srv/gnu`, mirror of up to 8 tarballs per cycle, downloaded through ftpmirror.gnu.org (ftp.gnu.org rate-limits and blocked fr2 on 2026-11-14), signature checked against the GSRC keyring plus gnu-keyring.gpg, then `rclone copyto` to `r2:aphrody-gnu/gnu/<dir>/`), stable and longterm kernels to `kernel/v<N>.x/`, Rust release binaries to `rust/<repo>/<tag>/`.
- `aphrody-gnu-watch.timer` (15 min): fast-forwards `/srv/src`, restarts the service when `feed.json` is older than 45 min.
- Ops: `just gnu-service` (status, journal), `just gnu-deploy` (pull and `device/gnu/install.sh`). Units and nginx vhost live in `device/gnu/`. Public path: Cloudflare tunnel `fr2` ingress `gnu.aphrody.com` -> `http://127.0.0.1:80`, proxied CNAME.
- Kernel signatures need `/srv/gnu/kernel-keyring.pgp` (WKD export of the kernel.org developer keys, trust on first fetch).

## Sources

ftp.gnu.org ls-lrRt.txt.gz; lists.gnu.org info-gnu monthly index; git.savannah.gnu.org smart HTTP (cgit pages time out); bzr.savannah.gnu.org gsrc last-revision; Guix git head; api.github.com releases; crates.io API; kernel.org releases.json and cdn sha256sums.asc; android.googlesource.com and chromium.googlesource.com `+refs/heads?format=JSON`. www.gnu.org recent-releases.html times out from every host: never rely on it. Requests use a generic User-Agent, never an email.

## Change checklist

`bun test system/gnu-ts`, `bun check system/gnu-ts/src/cli.ts`, `bun fmt system/gnu-ts`, `bun scripts/checkdeps.ts`; then push, `just gnu-deploy`.
