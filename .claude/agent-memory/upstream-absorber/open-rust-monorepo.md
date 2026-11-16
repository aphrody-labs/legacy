---
name: open-rust-monorepo
description: apps/open (aphrody-labs/open) was restructured on 2026-11-16 into one Cargo workspace on git/crates.io pins; where things live, how to build and prove it on fr1, traps hit
metadata:
  type: project
---

apps/open is its own repo (commit with plain git there, not scripts/commit.ts). Since 2026-11-16: `crates/*` workspace (open, browse, crawl, browser-engines, tunnel, tui, ai-router, c-abi, hub, adblock-capi), `extension/` (MV3, built with `bun extension/build.ts`), `packages/{ai-router,browser-engines,crawl}` kept as Bun bindings because aphrody reads `apps/open/packages/browser-engines/src/engines/cli.ts` and the `@aphrody/ai-router` release tarball. Everything else (100 upstream imports) was purged; ledger and live pins in `docs/upstream.md` (`bun scripts/upstream.ts --check`).

**Why:** owner order 2026-11-16, no vendored upstream, one framework crate.

**How to apply:**
- Upstream anomalyco/browse already has Rust crates (`rust/crates/browse-*`), opentunnel is on crates.io, rune and opentui are git pins; rune's winit/wgpu-hal/parley_engine/accesskit forks are `[patch.crates-io]` git entries on the same rune rev.
- OpenTUI needs its native lib: `bun scripts/opentui-native.ts` pulls the npm platform package of the pinned rev's version into `target/opentui-native` (`OPENTUI_LIB_DIR` in `.cargo/config.toml`); binaries get an rpath from their own build.rs.
- Build/proof on fr1 in /srv/xbuild/open: sync with `tar cf - ... | ssh fr1 'tar xf -'` (scp is broken on the PC shell, xh prints nothing: use `bun -e fetch`), run cargo detached with `setsid nohup`, never `pkill -f` with a pattern that appears in the ssh command line (kills your own shell), fr1 load can be 70+ so a fat-LTO `open` link takes ~15 min. Chrome for Testing canary lives in /srv/xbuild/cache/cft; browse's screenshot tool refuses a group-writable file root (chmod 700 the out dir).
- C:\browser is only a skeleton (2026-11-16); the registry entry `aphrody-browser` reads `APHRODY_BROWSER_OUT` + `headless_shell`, rename when its output is known.
