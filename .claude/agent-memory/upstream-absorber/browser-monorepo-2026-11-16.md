---
name: browser-monorepo-2026-11-16
description: aphrody-labs/browser = one flat Cargo workspace of Bun + Servo org + Obscura + agent-browser crates; how it was built, the workflow to re-run it, and the traps hit
metadata:
  type: project
---

Owner order 2026-11-16 (replaced the two-repo servo-monorepo/obscura-monorepo plan, both deleted): ONE repo
`aphrody-labs/browser` (C:\browser, work tree on fr1 at /srv/xbuild/scratch/browser). The old Lightpanda fork that
held that name was renamed `aphrody-labs/lightpanda` (src.lock.json updated).

Workflow (all in the repo, `tools/`): `import.py` (git-filter-repo, crates -> src/<package>, rest -> upstream/<name>/,
merge --allow-unrelated-histories; deterministic so re-sync merges only new commits) -> `gitlinks.sh` -> `flatten.py`
(root = Bun's Cargo.toml, inlines workspace inheritance, local crates become path deps, [patch.crates-io]) ->
`fixups.sh` (idempotent integration fixes) -> `unify.py` (+ `unify.skip`) -> `dedup-report.py`. Re-flatten starts from the
import commit state (`git checkout -- src upstream`), flatten is not idempotent on its own output.

**Why:** owner wants one crate per function, newest of everything, engines from our own Chromium checkout (no rusty_v8).
**How to apply:** do not re-create servo-monorepo/obscura-monorepo; extend tools/upstreams.toml instead.

Traps:
- Obscura "org" is the user account h4ckf0r0day (only `obscura` matters); deno_core/rusty_v8 cannot resolve next to
  mozjs_sys (icu_capi =2.1.2 vs temporal_capi ^2.2) so the 6 V8-bound obscura crates are out of the workspace until src/v8-sys exists.
- `gh api -F` forces POST: use `-X GET -F per_page=100 --paginate --slurp`.
- `ssh fr1 'pkill -f pattern'` kills its own shell (exit 255): use `pkill -x name`. scp is broken: `ssh fr1 'cat > f' < file`.
- fr1 disk is shared and hit 100% (servo import 3 GB + clone + cargo target); one push of 3 GB gets HTTP 500: push first-parent chunks (tools push script pattern, servo history 4000 commits at a time).
- Submodules arrive as gitlinks: harfbuzz must be vendored (tools/gitlinks.sh), html5lib-tests dropped.
- GN: `gn gen --root-target=//browser:engines` (root-pattern fails); libc++ targets are visibility-restricted; need `v8_monolithic = true`; fr1 has gn at /srv/chromium/src/buildtools/linux64, no depot_tools; fr1 checkout is 157, PC checkout 160.
- serde >= 1.0.229: feature `serde_derive` no longer re-exports derive, use `derive`; getrandom 0.4 renamed `getrandom()` to `fill()`; time 0.3 has no precise_time_ns.
