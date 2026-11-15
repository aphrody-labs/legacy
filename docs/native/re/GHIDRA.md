# Ghidra fork (aphrody-labs/ghidra)

Fork of NationalSecurityAgency/ghidra, level with upstream master when forked (compare "identical" on 2026-11-14; latest release Ghidra_12.2_build). Work clone on fr1: `/srv/ghidra`. Pinned in `third_party/forks.txt`.

## LLVM native build

- Decompiler and sleigh C++ (`Ghidra/Features/Decompiler/src/decompile/cpp`): `make LLVM=1 ghidra_opt sleigh_opt` = `clang++ -O3 -flto=full -fuse-ld=lld` (full LTO, not thin). Toolchain measured: Ubuntu clang 23.1.6 (`/usr/local/bin/clang++`). A Chromium clang (24.0.0git, 2026-11-12) exists at `/srv/chromium/src/third_party/llvm-build/Release+Asserts/bin/clang++` on fr1 and was not used for the numbers below (commit 1c3e0c59c0).
- `buildNatives.gradle` Clang branch moved to the same flags. Known limit: with Gradle 9.8.2 the Gcc toolchain is still selected first on Linux even when only `clang(Clang)` is registered, so the Gradle path stays on g++; use the Makefile for LLVM builds.
- Measured on fr2 (hyperfine, 5 runs, x86-64.slaspec compile): gcc -O2 992 ms, clang -O3 full LTO 913 ms (1.09x); output `.sla` byte-identical.

## AOT (JDK 25)

JEP 483 (JDK 24) and 514 (JDK 25) are used; 515 (JDK 25, method profiling) is background only. All three confirmed on openjdk.org; `-XX:AOTCache/AOTMode/AOTCacheOutput` present in openjdk 25.0.5. The stock launcher cannot use it: `-Djava.system.class.loader=ghidra.GhidraClassLoader` makes app classes "Unsupported location". `Ghidra/RuntimeScripts/support/buildAotCache.sh` (installed as `support/buildAotCache.sh`; commit 1c3e0c59c0) builds the single `ghidra.jar` (`ghidra.JarRun`) plus an AOT cache.

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

`packages/ghidra` (`@aphrody/ghidra`), `src/ghidra-bun`, parity in `packages/ghidra/PARITY.md`; python-to-bun in `packages/py2bun`. API, plugin and script surface: `packages/ghidra/README.md`.

### Backends and why

| backend | use | choice |
|---|---|---|
| (a) `aphrody-re` / `ghidra-decompiler` 2.1.0 (Rust; only with `--features decompile`, not enabled in the default build nor in `src/ffi`; the default `src/ghidra-bun` build has no decompiler, `src/ghidra-bun` NAPI addon, same engine as the relay tool `core_ghidra_decompile` and `aphrody_ghidra_decompile_json`) | fast path: sections, imports, CFG, P-Code, pseudo-C in milliseconds, no JVM; native `onBeforeParse` plugin | kept for triage and bundling |
| (b) headless Ghidra JVM, full API | everything pyghidra exposes (program DB, analysis, decompiler, listing, xrefs, data types, scripts, projects) | `bridge/Bridge.java`, reflection JSON-RPC over the JVM's stdio |

Bridge transport decision (measured/verified in this tree):

- JNI (`src/core/jni`): rejected for the full API. It exposes a fixed Rust-side surface; Ghidra needs the arbitrary class/method graph, and embedding a JVM in the Bun process means `JNI_CreateJavaVM` inside Bun with its own signal handling (JVM and JSC both install SIGSEGV handlers) and no way to restart a wedged JVM without losing Bun.
- Local socket server: equivalent to stdio but needs port/permission management and a launcher handshake; stdio of the child gives lifecycle coupling for free (the JVM dies with Bun) and works unchanged on Windows and Linux.
- jpype-equivalent in-process: not possible from Bun (no JNI bridge in JavaScriptCore).
- Chosen: a pure-JDK reflection bridge (`Bridge.java`, no dependency, own JSON reader) started through `ghidra.Ghidra GhidraBridge` so the Ghidra class loader (`-Djava.system.class.loader=ghidra.GhidraClassLoader`, VM args from `LaunchSupport -vmargs`) is exactly the one the stock launcher uses. Protocol: line-delimited JSON; ops `ping/layout/new/call/static/field/setfield/list/str/class/instanceof/release/batch`; objects are handles (same Java object, same id, ref-counted on the Bun side through FinalizationRegistry); longs with abs(v) >= 2^53 and BigInteger are `{"$long"}` (BigInt in Bun), `byte[]` is `{"$bytes"}` (Uint8Array); overloads are resolved by argument cost like jpype. No callbacks from Java into Bun (pyghidra only needs one: `analyze()` listener, replaced by reading `AutoAnalysisManager.getMessageLog()`).
- Measured: Ghidra 12.2 PUBLIC (release 20261016, `/srv/ghidra-release` on fr2, JDK 25.0.5) opens and analyses /bin/ls (12573 functions) in 561 s through the bridge; a 4-function static ELF opens, analyses and decompiles in about 2 s of JVM time. Ghidra 12.2 requires JDK 25 (`application.java.min=25`).
