---
name: electron-migrate-facts
description: Verified facts behind system/electron-migrate (ay electron): Tauri v3 fork pin, gpui fork rev, bun flags, fr1 build traps
metadata:
  type: project
---

- aphrody-labs/tauri branch `v3` rev 271c15e1eaebb8e12aac8c4e63eead1ff17fd93a = tauri 3.0.0-alpha.6; runtime is explicit (`Builder::default().runtime(tauri_runtime_wry::Wry::default())`). v3 plugins: tauri-apps/plugins-workspace branch `v3` (no aphrody-labs fork). npm `@tauri-apps/api` dist-tag next = 3.0.0-alpha.3 (checked 2026-11-15).
- aphrody-labs/zed `main` (head 2de90a45a393db5f5e7dc64eceaaaa2fbdd5dfb4 on 2026-11-15, re-check): gpui 0.2.2, entry `gpui_platform::application().run`, menus `cx.set_menus([Menu::new(..).items([MenuItem::action(..)])])`.
- Bun 1.4.5 `bun build --help` on fr1 lists --compile, --minify, --bytecode, --format=iife, --aot, --trim.
- Cargo rejects `branch` together with `rev`: generated manifests pin the rev only.
- fr1 build: scratch dir needs `env -C <dir> cargo ...` (nightly toolchain from rust-toolchain, not manifest-path); load average is often high, cargo waits on /srv/src/target lock.

**Why:** these pins and traps cost time to rediscover. **How to apply:** reuse when touching system/electron-migrate or verifying on fr1; re-check pins before trusting them.
