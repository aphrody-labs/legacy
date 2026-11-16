---
name: identity-rename-tooling
description: scripts/identity-literals.ts, identity-rename-test.ts and the literal-identity hygiene rule: what they do, traps met building them
metadata:
  type: project
---

Identity literals (product name, scope, prefixes, binary calls, checkout folder) are measured and ratcheted by `bun scripts/identity-literals.ts count|check|baseline|rewrite|residual|upstream`; baseline in `tools/identity-baseline.json`; rename proof `bun scripts/identity-rename-test.ts [--no-cargo]` (exports the working tree to another folder, applies another identity, fr2 cargo check).

**Why:** owner order 2026-11-15, names are variables; upstream namespaces (win32, ffmpeg, Linux, Chromium) stay untouched.

**How to apply:**
- coherence-fixer may not edit justfile, CI, src/, Cargo.toml: the `just identity rename-test` recipe and the CI job go to the coordinator as snippets.
- Traps: `sd` replacement strings interpret `$` (breaks `${x}`); JS `String.replace` with `$&` in a replacement; export copies have no .git so file lists fall back to a folder walk; apps/nt is first-party (tracked), only rosegriffon and shenron are submodules.
- Pre-existing, not rename-caused: `identity.ts check` workspace name collisions (apps/nt/modules/web vs apps/web/web), checkdeps `system/core-py -> src/ffi`, scripts/identity.test.ts fixture uses `crates/...`, system/core-ts sys.test needs target/sys/aysys.wasm.
