---
name: rosegriffon-rust-standalone
description: 2026-11-16 de-aphrody of C:\rosegriffon Rust workspace: what moved where, fr1 scratch traps (disk, cargo upgrade pitfalls), pinned-by-upstream versions
metadata:
  type: project
---

- C:\rosegriffon (github aphrody-labs/rosegriffon) Rust is standalone: `aphrody-nie-*` -> `nie-*`, moved in `crates/rg-re` (from aphrody frameworks/re HEAD, no `index` feature), `crates/rg-steam` (from frameworks/steam, no emulator/bin; steamroom 0.3.0 from crates.io), `crates/nie-gpu` (wgpu 30 wrapper, only lib.rs of aphrody gpu-backend); `yolo-re-core` stays (lib `bun_re`, bin `bunre`, TS side depends on them); `iecode` cdylib name of nie-ffi stays (niepy/.NET load it).
- fr1 scratch = /srv/build/rosegriffon (needs `sudo mkdir` + chown; not writable by ubuntu otherwise). `cargo test --workspace` fills the shared 290G disk (28G debug target, others also write): use CARGO_PROFILE_{DEV,TEST}_DEBUG=0 CARGO_INCREMENTAL=0 and `rm -rf target` before; ENOSPC shows as rustc-LLVM IO failure / ld bus error, not as a clear error.
- cargo-edit installed on fr1 via `cargo binstall -y cargo-edit`; `cargo update --breaking` does not exist in the 2026-11 nightly. `cargo upgrade --incompatible allow --pinned allow --ignore-rust-version` then restore: getrandom 0.2/0.3 shims in nie-wasm (js / wasm_js features differ per major), ort `=2.0.0-rc.12` (magika 1.1.0 pins it), glam 0.33 (bevy_math 0.20 family, avoid a second glam).
- Upstream-forced duplicates left in Cargo.lock: steamroom 0.3.0 pulls zip 8.6 / tokio-tungstenite 0.29 / sha2 0.10 / base64 0.22; tokio-postgres pulls base64 0.22. taffy 0.15.1, wgpu 30.0.2, winit 0.30.13 are single copies. gpui-os repo does not exist (2026-11-16); zed pins taffy =0.15.0 and a gfx-rs/wgpu git rev.
- Another agent's `git commit -a` swept my staged `git mv` renames into HEAD (old and new dirs both present): `git add -A <paths>` then commit by path fixes it.
- `dbxv2` feature of yolo-re-core was already broken at HEAD (extract API dropped by 783edfe7): restored as `game/extract.rs`, `dbxv2` now implies `assets`.

**Why:** owner order 2026-11-16 to make the Rust side not depend on aphrody.
**How to apply:** any further Rust work in C:\rosegriffon; check fr1 disk first.
