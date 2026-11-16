# Build science

Measured build-speed claims for the root Cargo workspace. Only wins that are statistically clear are adopted.
Scripts and raw method: `scripts/bench/` (hyperfine JSON, one target dir and one source copy per variant).
Earlier PC (Windows) measurements: [BUILD_SPEED.md](BUILD_SPEED.md).

## Method and limits

- Node: fr2 (6 vCPU, QEMU Haswell, 2026-11-15), toolchain stable 1.99.1 with `RUSTC_BOOTSTRAP=1` for `-Z` flags, `RUSTC_WRAPPER=` unless stated.
  fr1 was invalid for timing (load 30 to 60 on 12 cores from other jobs); my fr1 chains were killed and discarded.
- Workload: trimmed copy of the workspace (`system/depot/{core,forge,graph,ingest,migrate,cli}`, `system/core`, `frameworks/taffy`;
  gix, blake3, regex, serde as dependencies), dev profile of the root `Cargo.toml`. `depot-cli` is a lib: no link step in the dev scenarios.
- hyperfine, N=5 unless noted (N=3 for clean builds, N=1 where marked). Values are mean +- sd of wall time.
- fr2 load average was 5 to 9 during the matrix (another agent's benchmarks): differences under about 1 s between
  equivalent configs are drift, not effect (the `wsclean` column varies 5.4 to 6.8 s between flag sets that cannot affect it).
  Adopt only when the effect exceeds that drift and a Welch t-test is clear.
- Caveat: the trimmed set is far smaller than the full workspace (about 200 members); gains that depend on size are not extrapolated.

## Table

| Claim | Source | Measured (mean +- sd, change) | Adopted |
| --- | --- | --- | --- |
| sccache warm cache after clean build (local disk) | mozilla/sccache v0.19.0 | clean `depot-core`: no wrapper 77.1 +- 10.7 s (N=3) vs warm cache 14.13 +- 0.85 s (N=5): -82%; cold fill 90.6 s (N=1, +17%). 83% hit rate | Yes, as `just cargo-cached` for fresh target dirs (fr1/fr2/agents). Not in `.cargo/config.toml`: breaks the PC (os error 206, incremental 2x slower, BUILD_SPEED.md) |
| sccache with R2 backend (ticket taskgraph-001) | sccache docs (S3/R2 backends); repo: `device/fleet/reinstall/50-mesh-caches.sh` already points fleet clients to a mesh S3 (`SCCACHE_BUCKET=sccache` at <fr1-mesh-ip>:9000) | not measured: needs bucket credentials (owner), no secret read or printed | No (owner action) |
| LTO off vs thin vs fat, release, edit core then rebuild a bin | rustc codegen docs | off (cgu16) 8.45 +- 0.67 s; thin 37.84 +- 0.90 s (4.5x); fat (cgu1) 105.98 +- 0.72 s (12.5x). Clean release: off 74 s, thin 90 s, fat 175 s (N=1 each). Binary 21.08 MB off, 21.22 MB thin | No change: `[profile.iteration]` (lto off, cgu16) already gives the fast path; release stays fat |
| -Zthreads=16 (repo default) vs none vs 4 | rustc parallel frontend | edit core 2.21 +- 0.18 (16) vs 2.19 +- 0.17 (none) vs 2.00 +- 0.15 (4): no wall gain; CPU user+sys +17% (16 vs none). On 6 cores 16 threads oversubscribe | No change (fr2 6 cores; 12-core fr1 not measured) |
| -Zshare-generics=n vs default | rustc | edit core 2.00 +- 0.03 vs 2.19 +- 0.17: within drift | No (already the dev default, BUILD_SPEED.md) |
| Linker: GNU ld default vs lld vs mold | mold README (Aug 2026): mold 4.9x faster than lld median on large C++ (Chromium, Clang); not Rust dev loops | test-binary relink after core edit: default 3.16 +- 2.26 s, lld 2.94 +- 2.05, mold 2.92 +- 1.95 (first-run outliers, sd > 60% of mean: inconclusive). Lib-only scenarios show no linker effect | No (inconclusive on this set; retest on a crate with a large binary) |
| wild linker | wild README | not installed on fr1/fr2 | No |
| Cranelift dev vs LLVM | rustc_codegen_cranelift | not measured: pinned Chromium toolchain ships no Cranelift component. BUILD_SPEED.md (PC): clean +5%, no gain | No |
| rustc red-green incremental | rustc-dev-guide, incremental compilation | edit core, incremental dev build 2.2 s vs clean workspace-crate rebuild 6.5 s (same dir), leaf edit 1.7 s | Already on (`incremental = true` in `[profile.dev]`) |
| cargo-hakari workspace-hack | cargo-hakari docs: up to 1.7x, 1.1x to 100x per command, on several hundred deps | not measured: `[resolver] feature-unification = "workspace"` in `.cargo/config.toml` gives the same unification without an extra crate (BUILD_SPEED.md: 120 -> 0 recompiled units for `-p`) | No (superseded) |
| Content-addressed builds (Bazel/Buck2 CAS + RE; Mokhov, Mitchell, Peyton Jones, "Build Systems a la Carte", ICFP 2018, doi 10.1145/3236774) | paper: early cutoff and constructive traces | not measured: cargo fingerprints by mtime; sccache provides content-addressed rustc caching (row 1) which captures the practical gain | No (sccache row covers it) |
| PGO + BOLT for the `ay` binary | rustc PGO docs; BOLT (Panchenko et al., CGO 2019) | feasibility only: `llvm-bolt-21` installed on fr1, absent on fr2; `llvm-profdata` max LLVM 23 vs rustc `chromium-160` LLVM 24 (profile format mismatch risk); `profiler_builtins` present; no LBR in the VMs (`perf` cannot open events), so BOLT would use instrumentation and AutoFDO/Propeller (need LBR) are not possible. No speed claim | No |
| `-O3` + `target-cpu=x86-64-v3` | rustc codegen options | fr1 and fr2 CPUs expose avx2, bmi1, bmi2, fma, movbe, f16c, abm (v3 supported per ld.so). Not benchmarked. Portability risk: binaries shipped to users or older VMs crash with SIGILL | No (owner decision on target baseline) |
| Thin vs fat LTO | see LTO row | see LTO row | No |
| nextest vs cargo test, partitioning | nexte.st partitioning docs (no performance claims) | 14 tests: cargo test 1.60 +- 0.17 s, nextest 2.25 +- 0.10 s (+40%), `slice:1/2` 2.05 and `slice:2/2` 2.20 s (sum 4.25 s, no gain on one host) | No (suite too small; slices are for multi-machine CI) |
| Affected-target selection | `scripts/checkdeps.ts --affected` (git diff + reverse-dep closure) | not timed. Bug found and fixed: `just test-affected` kept only cargo units under `crates/`, a directory that no longer exists, so no cargo test ever ran. The filter now excludes only `third_party/` | Yes (correctness fix, `scripts/scripts.just`) |
| bun install/test cache | bun docs | not measured (time budget) | No |

## Host tuning (CachyOS settings), fr2 only

Changes applied by script, originals recorded and restored afterwards (swappiness 150, dirty_bytes 256 MiB, background 64 MiB, mq-deadline, THP defrag madvise);
verified after the run. fr1 untouched (busy, shared); prd never touched.

| Setting set | git status warm | git status cold cache | cargo incremental (edit core) | clean `depot-core` (N=3) |
| --- | --- | --- | --- | --- |
| current fr2 | 0.054 +- 0.004 s | 0.42 to 0.46 s | 1.18 to 1.32 s | 72.15 +- 1.07 s |
| CachyOS: swappiness 100, dirty_ratio 10, background 3, kyber, THP defer+madvise | 0.055 to 0.080 s | 0.41 to 0.49 s | 1.16 to 1.20 s | 80.20 +- 0.69 s (+11%) |

Already set on both nodes before this work: zram zstd (fr1 12 GiB, fr2 5.7 GiB), `vm.page-cluster=0`, `kernel.nmi_watchdog=0`, swappiness 100 (fr1) or 150 (fr2), THP defer+madvise (fr1).
Result: no benefit, clean build worse: nothing persisted in `device/fleet`, no rollback needed. Scheduler kernels (bore, eevdf, sched-ext): not evaluated, no kernel switched.

## Owner actions

1. R2/S3 remote sccache (taskgraph-001): needs bucket credentials in the fleet env, then measure remote hit time.
2. Decide the CPU baseline for release (`x86-64-v3`) given shipped-binary portability.
3. Retest linkers (mold, lld) on a large binary on a quiet fr1 (load < 4).
