# Hardcode and slop purge, 2026-11-15

Scanner: `scripts/hygiene.ts` (`just hygiene`, relay hub tool `hygiene__hygiene_scan`, skill `.agents/skills/hygiene`). Criteria, fetched live: Google eng-practices "What to look for in a code review" (no speculative code, comments explain why) and the developer documentation style guide "Timeless documentation". Allowances live in `scripts/hygiene.allow.json`.

## Scan results

First run (tracked tree minus third_party, lockfiles, upstream copies and areas owned by other sessions), hits: magic-date 163, absolute-path 486, sovereign 204, ai-filler 41, dated-snapshot 41, hardcoded-list 41, stub 47, dated-filename 20, home-scraper 4, pinned-version 2. Several rules were over-broad (Antigravity is a real product, `elevated` is a Material term, absorbed upstream code keeps its own TODOs, API version constants are contracts); they were narrowed before fixing, not allow-listed.

## Fixed

| Commit | Change |
| --- | --- |
| f3b9ac8ebb | deleted dated hand-kept reports (CLEANUP-2026-11-12, INCIDENT-2026-11-12-prd-aphrody, VPS-PURGE-2026-11-13, gemini-windows-desktop-2026-11-14, ai-os SESSION-2026-11-13) and an nginx `.bak`; links fixed in FLEET.md |
| e3b21dd9c8 | "Sovereign" adjective removed from 38 files (chromium-bun, env-kit, wck, docs, infra READMEs); chromium-bun, upstream, env-kit, wck tests green |
| b1af762561 | unpinned `wrangler@x` and `@gltf-transform/cli@x` in docs; seamless/pinnacle filler; `C:\src` paths in comments; dead `C:\src-merge` pointer in FLEET.md |

## Remaining, with reason

| Rule | Where | Reason |
| --- | --- | --- |
| dated-snapshot (41) | docs with "state as of / verified on <date>" | provenance stamps on measured facts; removing them loses the date of the measurement. Not rewritten in bulk |
| magic-date (56) | `tools/gnu-index/{build,curated,merge}.ts`, `packages/machine/src/toolchains-lock.ts`, `infra/fleet/bin/build-all.sh`, `infra/docker/*`, apps/auto fixtures and scripts | GNU index: GNU agent area. Rust nightly pins (`nightly-2026-11-12`) in CI and docker need a fr2 build to change safely. apps/auto: invoice fixtures |
| dated-filename (14) | docs/infra/resilience/*.txt, AUDIT-2026-11-13, OS-BENCH-2026-11, DEDUP-2026-11-12, research/*, CLI-LIBS-2026-11 | resilience files are run outputs; the others have inbound links (global CLAUDE.md names CLI-LIBS-2026-11.md) or uncommitted edits by other sessions |
| hardcoded-list (9) | packages/machine/src/forks.ts (121), chromium-bun engines registry, bunify rust.ts, upstream-recon, toolchains-lock, gnu-packages, skills-adopt, microsoft facts | curated registries; fork parents could come from `gh api repos/<fork> --jq .parent`, but the non-parent remotes cannot. Candidate for a later refactor |
| home-scraper (3) | scripts/gnu-proof.sh, tools/gnu-index/merge.ts, infra/gnu/install.sh | mirrors.kernel.org fetches inside the GNU tooling: GNU agent area |
| sovereign (4) | docs/research/dragon-ball.md (uncommitted edits by another session), `justfile:43`, `src/rust-stack/src/main.rs:249` | justfile and src/ are not edited by this purge |
| absolute-path (26) | docs, PC bootstrap and loaders, app docs | host layout documentation and PC bootstrap defaults; allowed per `hygiene.allow.json` for shell, compat, env-kit and machine shells |
| dead-ref (opt-in, 1795) | 602 files | targets move with src-b0's crates/* to src/* rewrite; rerun after it lands |

Not done: Rust dependency removal (see purge-2026-11-15.md); `packages/machine/shells/pwsh/profile.ps1` carries another session's uncommitted hunks, so my comment fix there stays uncommitted.
