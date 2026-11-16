# Native .NET from bun, without node-api-dotnet

Context: calling .NET 11 from bun without the Node-API layer of node-api-dotnet. This document describes the delivered prototype, the measurements, then the bun limits found in its source (file:line) with the fixes proposed for the `aphrody-labs/bun` fork.

## Sources (gathered on 2026-11-12)

| Source                                                                              | Revision                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bun (aphrody-labs fork, upstream oven-sh)                                           | `4b8463ee11cb` (2026-11-12), bun 1.4.4                                                                                                                                                |
| JavaScriptCore FFI (oven-sh/WebKit, pinned by bun `scripts/build/deps/webkit.ts:6`) | `6fc709c29840`, `Source/JavaScriptCore/ffi/`                                                                                                                                          |
| dotnet/runtime                                                                      | `release/11.0` @ `426561366bbf` (2026-11-11): `src/native/corehost/hostfxr.h`, `coreclr_delegates.h`, `docs/design/features/native-hosting.md`, `ComponentActivator.cs`               |
| Microsoft Learn                                                                     | "Building native libraries", "Native code interop with Native AOT", "Disabled runtime marshalling", "NativeAOT uses lib prefix… (.NET 11)", "MSBuild reference: EnableDynamicLoading" |
| Measurements                                                                        | local and CI, `docs/research/bench/dotnet-ffi-*.json` (section 2)                                                                                                                     |

Architecture point established in the source: since this version, `dlopen`, `CFunction` and `JSCallback` are compiled by JavaScriptCore (`JSC::FFI`, JIT invoke thunks, DFG intrinsic `FFIDFGCodegen.cpp:90-107`); TinyCC is only used by `cc()` (`system/runtime/ffi/ffi_body.rs:1019-1292`, `JSCFFIBridge.cpp:65-97`). Any marshalling fix therefore touches the WebKit fork first, not the bun repository.

## 1. Delivered prototype

```
C# [UnmanagedCallersOnly(EntryPoint = "nt_x")]          sdk/dotnet/Nt.Interop
   ├─ dotnet publish -r <rid>  -> NativeAOT .dll/.so  ──> bun:ffi dlopen            (openNative)
   └─ dotnet build             -> IL + .runtimeconfig ──> hostfxr (bun:ffi) ──> CFunction  (openHosted)
IL .dll ──> sdk/tools/dotnet-ffi/gen.ts (ECMA-335 in TypeScript) ──> Nt.Interop.js + .d.ts + .model.json
```

- `sdk/tools/dotnet-ffi/ecma335.ts`: pure TS ECMA-335 reader (CLI header = PE directory 14, `#~` stream, 45 tables, coded indexes, signatures §II.23.2, attribute blobs §II.23.3). No .NET at generation time. Validated on real assemblies: `System.Private.CoreLib` (47,791 methods, 30,719 attributes) read in ~20 ms, 0 attribute decoding errors on R2R CoreLib, NativeAOT CoreLib, `System.Runtime.InteropServices`, `System.Text.Json`.
- `model.ts`: `[UnmanagedCallersOnly]` methods (EntryPoint, CallConvs), blittable types, function pointers (`delegate* unmanaged<…>` -> `JSCallback`), structs (layout computed from ClassLayout/FieldLayout, `fixed` buffers via `FixedBufferAttribute`), enumerations (Constant table). Reasoned rejections (string, classes, generics, structs by value).
- Markers (attributes with no run-time effect, `sdk/dotnet/Nt.Interop/Ffi.cs`): `[Utf8] byte*` -> `cstring` (JSC transcoding), `[Utf16] char*` -> string encoded on the JS side, `[Utf8Buffer]`/`[Utf16Buffer]` + `int` capacity -> the binding returns a `string` (retry if the initial capacity of 256 is not enough).
- `gen.ts`: ESM JS importing only `bun:ffi` (functions without conversion exposed as they are: no JS wrapper on the hot path), typed `.d.ts`, export check in the PE table of the NativeAOT binary.
- `hostfxr.ts`: `hostfxr_initialize_for_runtime_config` -> `hostfxr_get_runtime_delegate(hdt_load_assembly_and_get_function_pointer)` -> `load_assembly_and_get_function_pointer(…, UNMANAGEDCALLERSONLY_METHOD)` per `CFunction`, `char_t` UTF-16 (Windows) / UTF-8 (`coreclr_delegates.h:15-27`). hostfxr lookup through `DOTNET_ROOT` then `dotnet` in PATH.
- `Nt.Interop`: real facts (Windows version + UBR + DisplayVersion from the registry, architecture, processors, memory, machine name, RID, drives by callback), `DisableRuntimeMarshalling`, no exception crosses the boundary.
- Tests (`native.test.ts`, `hosted.test.ts`, separate processes) and bench (`bench.ts`); `interop` CI job (Windows + Linux). Recipes: `just interop`, `just test-interop`, `just bench-interop`.

Results: green CI on Windows and Linux (run 43280512366: NativeAOT 6/6, hosted CoreCLR 5/5, same assertions against `node:os`) and locally. win-x64 NativeAOT binary: 1,019,904 bytes (under the 1 MiB budget of the requirements).

.NET finding (SDK 11.0.100): with an unconditional `PublishAot=true`, the `.runtimeconfig.json` of the **IL build** receives the AOT switches (`EnableConsumingManagedCodeFromNativeHosting=false`, `IsDynamicCodeSupported=false`) and hostfxr rejects the component (`HostFeatureDisabled` 0x800080a7). Fix: `PublishAot` conditioned on `RuntimeIdentifier` (`Nt.Interop.csproj`).

## 2. Measurements (ns per call, median of 7 series of 10⁶ calls)

Raw data: `docs/research/bench/dotnet-ffi-*.json` (`just bench-interop`). Columns: L = local (i7-13700F, Windows 10.0.28120.3302 26H1); W = CI `windows-2025-vs2026` (Xeon Platinum 8573C); U = CI `ubuntu-latest` (EPYC 9V45). All: bun 1.4.4+38afee6c8, .NET 11.0.0, 2026-11-12. CI runners are shared: order of magnitude only.

| case                                                                               | L AOT | L CoreCLR |  W AOT | W CoreCLR | U AOT | U CoreCLR |
| ---------------------------------------------------------------------------------- | ----: | --------: | -----: | --------: | ----: | --------: |
| C reference without system call (L/W `kernel32!GetCurrentProcessId`, U `libc!abs`) |   2.2 |           |    3.7 |           |   1.7 |           |
| JS reference `add`                                                                 |   0.3 |           |    0.6 |           |   0.2 |           |
| `noop()`                                                                           |   3.3 |       5.1 |    4.9 |       7.1 |   6.6 |       5.5 |
| `add(i32, i32)`                                                                    |   3.5 |       5.1 |    5.1 |       7.0 |   4.4 |       5.2 |
| i64 return (BigInt)                                                                |  11.2 |      12.7 |   18.6 |      17.7 |  14.0 |      15.4 |
| UTF-8 `cstring` input (non ASCII)                                                  |  21.5 |      23.1 |   32.8 |      30.6 |  19.9 |      21.7 |
| UTF-16 input (`Buffer.from(…, "utf16le")`)                                         |  51.3 |      51.1 |   72.8 |      72.6 |  49.4 |      49.5 |
| UTF-16 output `machineName()` (buffer + decoding + .NET work)                      | 303.6 |     300.2 |  460.1 |     443.2 | 507.1 |     611.8 |
| .NET -> JS callback (`JSCallback`, per callback)                                   |  59.1 |      59.1 |   87.4 |      87.5 |  62.5 |      68.3 |
| `systemInfo(struct*)` (Windows registry included)                                  | 8,944 |     8,927 | 12,173 |    12,287 |    51 |        52 |
| open, ms (dlopen / CoreCLR init + 14 pointers)                                     |  2.63 |     29.13 |   3.91 |     39.94 |  0.55 |     26.08 |

Reading: the bun -> .NET transition costs 1 to 3 ns more than a C call (GC transition stub more marked under CoreCLR); the dominant costs are on the bun side: BigInt for every 64-bit value (+8 to +14 ns), UTF-16 without a native type (×2.3 to ×2.5 compared with UTF-8 `cstring`), allocation and decoding of output strings, callbacks ~60-90 ns. `systemInfo` mostly measures .NET work (registry reads on Windows). Side finding: calling a bun:ffi function with one argument too many takes `GetCurrentProcessId` from 2.2 to 8 ns (local): the DFG intrinsic is only taken at exact arity (`jsc:FFIDFG.cpp:63`); the generated wrappers respect the arity.

## 3. bun limits for .NET interop and proposed fixes

Notation: `bun:` = bun repository @ `4b8463ee11cb`; `jsc:` = oven-sh/WebKit @ `6fc709c29840`, `Source/JavaScriptCore/ffi/`.

### L1. No aggregate type: no struct by value

- `jsc:FFIType.h:40-63`: 22 scalar tags (integers, floats, `Pointer`, `CString`, `Function`, `JSValue`, `Buffer`, `BufferLength`); `bun:system/runtime/ffi/abi_type.rs:13-49` (mirror); `bun:system/js/bun/ffi.ts:1-63` (`FFIType` table).
- Handled conventions: `jsc:FFICallingConvention.h:44-56` (`SysV64`, `AAPCS64`, `Win64`) without aggregate classification.
- .NET effect: `Guid`, `DateTime`, `Vector2`, wrapped `nint`, `HRESULT` structs, `(int, int)` returns are impossible; `model.ts` rejects them, a pointer must be used (done for `NtSystemInfo`).
- Fix (WebKit): `Type::Struct` + layout descriptor (size, alignment, field classes) in `FFISignature`, classification per convention in `FFICallingConvention.cpp` (Win64: 1/2/4/8 bytes in a register otherwise hidden pointer; SysV: INTEGER/SSE classes per 8-byte word; AAPCS64: HFA/HVA), argument accepted from a `{ ptr }` object/TypedArray, return as `Uint8Array`. bun side: `"struct"` tag in `abi_type.rs:56-101` and `ffi.ts:1-63`, `layout` field in the definition. The generator already provides the layout (`Struct.size/align/fields`).

### L2. No UTF-16 string (`char16_t`/`wchar_t`)

- Arguments: `jsc:FFIConversions.cpp:236-300` (`writeCStringSlot`) only encodes UTF-8 (UTF-8 cache per `StringImpl`, ASCII fast path 263-275) in a per-call arena (`FFICallHost.cpp:57-65`); a JS string passed to `ptr` is rejected (`FFIConversions.cpp:377-381`).
- Returns: `jsc:FFIConversions.cpp:482-487` + `75-78` (`strlen`, UTF-8 with Latin-1 fallback).
- .NET effect: .NET `string`/`char*` and the hostfxr `char_t` on Windows are UTF-16; `Buffer.from(s + "\0", "utf16le")` is needed on every call (51 ns measured against 21.5 ns as `cstring`) and a buffer + `TextDecoder` on output.
- Fix (WebKit): `Type::U16String`: argument = copy of `span16()` (or widening of `span8()`) + NUL in the same arena; return = search for the 16-bit NUL then `String(std::span<const char16_t>)`. bun side: `"u16string"`/`"wstring"` tags (`abi_type.rs`, `ffi.ts`, `packages/bun-types/ffi.d.ts`). Copy-free variant: pass `impl->span16().data()` when the string is already 16-bit and followed by a NUL (rare) — not recommended.

### L3. 64-bit integers: systematic BigInt

- `jsc:FFIConversions.cpp:461-465`: `i64`/`u64` -> `JSBigInt::createFrom`; `i64_fast`/`u64_fast` (466-476) return a `number` if |v| ≤ 2⁵³.
- Effect: +8 ns and one allocation per 64-bit return (`long`, `ulong`, `TimeSpan.Ticks`, sizes).
- Fix: none in bun; generator option `--i64 fast` to add (per-method choice through a `[Fast64]` marker).

### L4. Callbacks and .NET threads

- Not `threadsafe`: `jsc:FFICallbackThunk.cpp:436-441` takes `JSLockHolder` on the calling thread: a callback coming from a ThreadPool thread, a `Task` or a finalizer runs JS outside the event loop; if the JS thread waits for that thread in a synchronous FFI call, deadlock.
- `threadsafe: true`: `jsc:FFICallbackThunk.cpp:419-433` queues the call (`bun:system/jsc/bindings/JSCFFIBridge.cpp:99-104`, `postTaskTo`) and forces the return to 0 (432): no synchronous result; `cstring`s are copied (`JSFFICallback.cpp:144`).
- Lifetime: `bun:system/runtime/ffi/ffi_body.rs:1334` (`// TODO: WeakRefHandle that automatically frees it?`); a `JSCallback` must be closed by hand, and a pointer kept by .NET after `close()` crashes.
- Fixes: (a) WebKit: `threadsafe: "blocking"` mode (queue + condition wait, direct call if already on the JS thread, error if the loop is stopped); (b) bun: automatic closing through `FinalizationRegistry` in `system/js/bun/ffi.ts:87-111` + `ref()/unref()` for the loop; (c) nt side right now: synchronous callbacks only (the generator creates and closes the `JSCallback` around the call), asynchronous .NET events through `threadsafe: true` without a return value.

### L5. No pinning or lifetime for buffers

- `jsc:FFIConversions.cpp:316-371`: a TypedArray/ArrayBuffer passed as `ptr`/`buffer` yields `view->vector()`/`impl()->data()` without a kept reference; `bun:system/runtime/ffi/FFIObject.rs:420-470`: `ptr()` returns a bare number.
- .NET effect: safe for a synchronous call (the argument stays alive during the call); dangerous as soon as .NET keeps the pointer (asynchronous I/O, `Task`, work queue): the buffer can be collected, detached (`transfer()`) or resized.
- Fix (bun): `Bun.FFI.pin(view) -> { ptr, release() }` (strong reference + refusal to detach/resize while pinned) in `FFIObject.rs` and `FFIObject.bind.ts`. Reverse direction already available: .NET memory (`NativeMemory.Alloc`) exposed without copy by `toArrayBuffer(ptr, off, len, ctx, deallocator)` (`FFIObject.rs:590-640`), the deallocator being a .NET export.

### L6. `napi_env`/`napi_value` rejected outside `cc()`

- `bun:system/runtime/ffi/ffi_body.rs:2373-2380` rejects `napi_env`/`napi_value` for `dlopen`/`linkSymbols`/`CFunction`/`JSCallback`, while JSC handles `Type::JSValue` (`jsc:FFIType.h:60`, `FFIConversions.cpp:492-493`); only `cc()` builds a `napi_env` (`ffi_body.rs:1237`, `2748`).
- .NET effect: a .NET function can neither receive nor return a JS object; this is precisely what node-api-dotnet obtains through Node-API.
- Fix (bun, no WebKit): accept `"jsvalue"` (= `napi_value`, tag 19) in `dlopen`/`CFunction`/`JSCallback` by limiting the rejection to `napi_env`, plus `Bun.FFI.protect(value)/unprotect` for values kept by .NET; then `napi_env` per `dlopen` library by reusing `make_napi_env_if_needed`: .NET would then call the Node-API exports of bun.exe directly through function pointers, without node-api-dotnet.

### L7. Unloading incompatible with NativeAOT

- `lib.close()` -> `bun:system/runtime/ffi/ffi_body.rs:1362-1390` -> `bun:system/sys/lib.rs:6141-6150`: `dlclose` on Unix, no effect on Windows. Learn: "Unloading Native AOT libraries (via dlclose or FreeLibrary) is not supported".
- Fix (bun): option `dlopen(path, symbols, { unload: false })` (or detection of the `DotNetRuntimeContractDescriptor` export, present in the .NET 11 NativeAOT binary of Nt.Interop) that makes `close()` release the JS functions only. The generator does not expose `close()`.

### L8. Other verified constraints

- At most 32 arguments: `jsc:FFISignature.h:65`.
- DFG fast path at exact arity only: `jsc:FFIDFG.cpp:63` (extra argument: 2.2 -> 8 ns, section 2).
- JIT mandatory, x64/arm64 only: `jsc:JSFFIFunction.cpp:104-108`; bun:ffi unavailable if the `Ffi` feature is removed (`bun:system/trim/features/trim-features.def:62` `native-code`, `:128` `ffi`): a `bun build --compile` executable of nt must keep it.
- Returned pointers: `null` for 0, BigInt beyond 2⁵³ (`jsc:FFIConversions.cpp:66-73`); the generated `.d.ts` exposes it (`Pointer | bigint | null`).
- Returned booleans: normalized on 8 bits (`jsc:FFIInvokeThunk.cpp:114-141`): the .NET `bool` (1 byte, marshalling disabled) is safe.
- DLL lookup: absolute path -> `LoadLibraryExW(LOAD_WITH_ALTERED_SEARCH_PATH)` (`bun:system/sys/lib.rs:6168-6200`): native dependencies of a NativeAOT library resolved next to it.
- No WebGPU in this runtime: `bun:scripts/build/deps/webkit.ts:450` (`ENABLE_WEBGPU 0`); see `feature-graph.md`.

### L9. CoreCLR host side (hostfxr)

- A single runtime per process (`native-hosting.md:249`, `:271`); framework-dependent component mandatory (`:284`); load context isolated per assembly path, cached (`ComponentActivator.cs:24`, `284-292`).
- Ambiguous overloads: `GetMethod(name, Static | Public | NonPublic)` (`ComponentActivator.cs:337-343`); the generator marks `overloaded` and `bindPointers` excludes them.
- Switch `EnableConsumingManagedCodeFromNativeHosting` (`ComponentActivator.cs:33`): see the .NET finding of section 1.

## 4. Fix plan for aphrody-labs/bun

| Order | Fix                                                                | Repository                                                               | Size   | .NET gain                                   |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ | ------------------------------------------- |
| 1     | L6: `jsvalue` in dlopen/CFunction/JSCallback + `protect/unprotect` | bun (`ffi_body.rs`, `abi_type.rs`, `ffi.ts`, `ffi.d.ts`)                 | small  | JS objects passed to .NET without Node-API  |
| 2     | L7: `dlopen(…, { unload: false })`                                 | bun (`ffi_body.rs`, `ffi.ts`)                                            | small  | safe `close()` with NativeAOT               |
| 3     | L5: `Bun.FFI.pin()`                                                | bun (`FFIObject.rs`, `FFIObject.bind.ts`)                                | medium | asynchronous .NET I/O on JS buffers         |
| 4     | L4b: automatic closing of `JSCallback`s                            | bun (`system/js/bun/ffi.ts`)                                                | small  | end of callback leaks/crashes               |
| 5     | L2: `u16string` type                                               | WebKit (`FFIType.h`, `FFIConversions.cpp`) + bun                         | medium | .NET strings ×2.4 faster on input           |
| 6     | L4a: `threadsafe: "blocking"`                                      | WebKit (`FFICallbackThunk.cpp`, `FFIContext`) + bun (`JSCFFIBridge.cpp`) | medium | callbacks with a result from the ThreadPool |
| 7     | L1: structs by value                                               | WebKit (`FFISignature`, `FFICallingConvention`, thunks) + bun            | large  | idiomatic .NET signatures                   |
| 8     | L6b: `napi_env` for `dlopen`                                       | bun (`ffi_body.rs:2748`)                                                 | medium | bun.exe Node-API called directly by .NET    |

Fixes 5 to 7 require building WebKit: bun downloads a prebuilt oven-sh/WebKit archive by default (`scripts/build/deps/webkit.ts:93`); a local clone is supported (`webkit.ts:761`, `vendor/WebKit` or `BUN_WEBKIT_PATH`). Fixes 1 to 4 and 8 are limited to the bun repository.
