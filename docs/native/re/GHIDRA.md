# Ghidra fork (aphrody-labs/ghidra)

Fork of NationalSecurityAgency/ghidra, level with upstream master when forked (compare "identical" on 2026-11-14; latest release Ghidra_12.2_build). Work clone on fr1: `/srv/ghidra`. Pinned in `third_party/forks.txt`.

## LLVM native build

- Decompiler and sleigh C++ (`Ghidra/Features/Decompiler/src/decompile/cpp`): `make LLVM=1 ghidra_opt sleigh_opt` = `clang++ -O3 -flto=full -fuse-ld=lld` (full LTO, not thin). Toolchain measured: Ubuntu clang 23.1.6 on fr1; no Chromium clang tree found under `/srv/chromium`.
- `buildNatives.gradle` Clang branch moved to the same flags. Known limit: with Gradle 9.8.2 the Gcc toolchain is still selected first on Linux even when only `clang(Clang)` is registered, so the Gradle path stays on g++; use the Makefile for LLVM builds.
- Measured on fr2 (hyperfine, 5 runs, x86-64.slaspec compile): gcc -O2 992 ms, clang -O3 full LTO 913 ms (1.09x); output `.sla` byte-identical.

## AOT (JDK 25)

JEP 483 (JDK 24), 514 and 515 (JDK 25) confirmed on openjdk.org; `-XX:AOTCache/AOTMode/AOTCacheOutput` present in openjdk 25.0.5. The stock launcher cannot use it: `-Djava.system.class.loader=ghidra.GhidraClassLoader` makes app classes "Unsupported location". `support/buildAotCache.sh` builds the single `ghidra.jar` (`ghidra.JarRun`) plus an AOT cache.

analyzeHeadless import `-noanalysis` of /bin/true on fr2 (hyperfine, 6 runs):

| mode | mean |
|---|---|
| shipped launcher | 13.2 s |
| ghidra.jar, no AOT | 9.16 s |
| ghidra.jar + AOT cache | 5.86 s |

GraalVM native-image: not attempted.

## Scripts

All 30 `.bat` replaced by `.ps1` (pwsh 7) with existing bash siblings kept; see fork commits 2405b77c76, 29e044f116, 040bce968a, 43700ecc25.

## Rust feature

Legacy demangler hardening, `RustTypes`, `RustPanicAnalyzer` (fork commits 783fb802e4, 6deedb63d3, 07fcbfef3b, aa800ba953).

## bun ghidra

`packages/ghidra`, `src/ghidra-bun`, parity in `packages/ghidra/PARITY.md`; python-to-bun in `packages/py2bun`.
