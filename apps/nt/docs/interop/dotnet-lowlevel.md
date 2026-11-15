# .NET: native C-ABI interop primitives

Sources: `dotnet/runtime@42656136` (branch `release/11.0`, 2026-11-11; https://github.com/dotnet/runtime/tree/42656136) — paths relative to the root of that repository, `CoreLib/...` = `src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/...`; `src/libraries/System.Runtime/ref/System.Runtime.cs` at the same commit (noted `ref:<line>`); Microsoft Learn (MCP, consulted 2026-11-12). Read only, no compilation.

## 0. Version facts (live sources)

| Fact                                                                                                                                     | Source                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| .NET 11.0.0 GA on 2026-11-10, STS, end of support 2028-11-14, SDK 11.0.100                                                               | `dotnet/core` `release-notes/11.0/releases.json` (gh api) |
| GA tag set in the VMR: `dotnet/dotnet` release `v11.0.100` published 2026-11-10T13:50Z                                                   | gh api `repos/dotnet/dotnet/releases`                     |
| **Apparent conflict**: `dotnet/runtime` has no `v11.0.0` tag (latest: `v11.0.0-rc.3.26522.148`); the GA tags are read in `dotnet/dotnet` | gh api `git/matching-refs/tags/v11.0`                     |
| `release/11.0` = version 11.0 `rtm`; `main` = 12.0 `alpha`                                                                               | `eng/Versions.props:9-18` (two checkouts)                 |
| .NET 10.0.15 (LTS) published 2026-11-10                                                                                                  | gh api releases `dotnet/runtime` `v10.0.15`               |

## 1. NativeAOT: C exports and linking

- **Exports**: every `static` `[UnmanagedCallersOnly(EntryPoint = "...")]` method (`CoreLib/.../UnmanagedCallersOnlyAttribute.cs:31-36`) of the published assembly becomes a public C symbol; methods of references/NuGet are not exported unless explicitly added (Learn "Native code interop with Native AOT", Native exports section). MSBuild wiring: `NativeLib=Shared` by default for `OutputType=Library` (`src/coreclr/nativeaot/BuildIntegration/Microsoft.NETCore.Native.targets:20`), `IlcExportUnmanagedEntrypoints=true` if Shared (`:90`) → `--export-unmanaged-entrypoints` (`:284`), generated `.def`/`.exports` file (`:80-91`, `--exportsfile` `:280`) passed to the linker (`/DEF:` `:386`, `--version-script` `:390`). Additional assemblies: `UnmanagedEntryPointsAssembly` items → `--generateunmanagedentrypoints` (`:112`, `:324`).
- **.NET 11 (breaking change)**: NativeAOT now rejects at run time (InvalidProgramException ⇒ fail-fast) a native call to an `[UnmanagedCallersOnly]` with a non-blittable signature (`bool`, `char`) when run-time marshalling is active; remedies: `[assembly: DisableRuntimeMarshalling]` or blittable types (Learn `core/compatibility/interop/11/unmanagedcallersonly-non-blittable`, PR dotnet/runtime#130160).
- **Static**: `NativeLib=Static` produces `.lib`/`.a` (`Microsoft.NETCore.Native.targets:71-72`); the host must then also link the runtime libraries listed as `NativeLibrary` (`Microsoft.NETCore.Native.Windows.targets:42-54`: `dllmain`, bootstrapper, `Runtime.WorkstationGC` or `Runtime.ServerGC` (`:22-23`), eventpipe, vxsort, standalone GC, `aotminipal`, zlib, brotli, zstd) and the Windows SDK libs (`:71-86`). Learn ("Building native libraries"): only shared libraries are officially supported, static "not officially supported"; **unloading (`FreeLibrary`/`dlclose`) not supported**.
- **DirectPInvoke**: `DirectPInvoke` items (`module` or `module!entrypoint`) and `DirectPInvokeList` → `--directpinvoke[list]` (`Microsoft.NETCore.Native.targets:286-287`): direct call bound by the OS loader at startup, better steady state, allows static linking; ignores `DefaultDllImportSearchPaths` (Learn, Direct P/Invoke calls section). Windows pre-fills `WindowsAPIs.txt` (`Microsoft.NETCore.Native.Windows.targets:90`). Without DirectPInvoke, lazy binding at run time.
- **Reverse entry cost**: each native call → UCO goes through `RhpReversePInvoke` (`src/coreclr/nativeaot/Runtime/thread.cpp:1455-1462`); an unknown thread is attached on the fly and the runtime initialized if needed (`ReversePInvokeAttachOrTrapThread` / `EnsureRuntimeInitialized`, `:1251-1290`). Inference: any Bun thread (main JS, Worker, `napi_async_work` pool) that enters a UCO is attached to the .NET runtime on its first call; Bun runs the Node-API finalizers on the JS thread (`bun-lowlevel.md` §4), so no JSC GC thread enters .NET this way.

## 2. CoreCLR hosting: nethost + hostfxr

- `nethost`: `get_hostfxr_path(buffer, size, const get_hostfxr_parameters*)` (`src/native/corehost/nethost/nethost.h:60`, `:91-94`) — official resolution of `hostfxr` (node-api-dotnet partially reimplements it, `HostFxr.cs:56-70`).
- `hostfxr` (exports `src/native/corehost/fxr/hostfxr.cpp`): `hostfxr_initialize_for_dotnet_command_line` (`:721`), `hostfxr_initialize_for_runtime_config` (`:764`), `hostfxr_get_runtime_delegate` (`:827`), `hostfxr_get/set_runtime_property_value` (`:872`, `:920`), `hostfxr_get_runtime_properties` (`:944`), `hostfxr_run_app` (`:787`), `hostfxr_close` (`:1003`), `hostfxr_set_error_writer` (`:551`), `hostfxr_get_dotnet_environment_info` (`:378`), `hostfxr_resolve_sdk2` (`:256`). Typedefs `hostfxr.h:40-295`.
- Runtime delegates: `hostfxr_delegate_type` = `hdt_com_activation`, `hdt_load_in_memory_assembly`, `hdt_winrt_activation`, `hdt_com_register`, `hdt_com_unregister`, `hdt_load_assembly_and_get_function_pointer`, `hdt_get_function_pointer`, `hdt_load_assembly`, `hdt_load_assembly_bytes` (`hostfxr.h:27-37`). Signatures `coreclr_delegates.h:30-58`; `UNMANAGEDCALLERSONLY_METHOD ((const char_t*)-1)` (`:27`) to get a pointer directly to an `[UnmanagedCallersOnly]` method.
- Flow (design `docs/design/features/native-hosting.md:186-196`): `get_hostfxr_path` → `hostfxr_initialize_for_runtime_config` → `hostfxr_get_runtime_delegate(hdt_load_assembly_and_get_function_pointer)` → native pointer → `hostfxr_close`.
- Constraints: no side-by-side runtimes in a process (`native-hosting.md:103`); a component `runtimeconfig.json` must be framework-dependent (`:284`); every context initialized after the first is "secondary" (`:513-518`).

## 3. Source-generated P/Invoke, function pointers, conventions

- `[LibraryImport]`: `LibraryName`, `EntryPoint`, `StringMarshalling`, `StringMarshallingCustomType`, `SetLastError` (`CoreLib/.../LibraryImportAttribute.cs:31-60`); the generator emits a C# stub that calls an internal `DllImport` derived from the `LibraryImport` fields (`docs/design/libraries/LibraryImportGenerator/Pipeline.md:174-181`); provided marshallers (`CoreLib/.../Marshalling/`: `Utf8StringMarshaller`, `Utf16StringMarshaller`, `SpanMarshaller`, `ReadOnlySpanMarshaller`, `ArrayMarshaller`, `SafeHandleMarshaller`, ...); user marshallers through `[CustomMarshaller]`/`[NativeMarshalling]`/`[MarshalUsing]`.
- `DisableRuntimeMarshallingAttribute` (ref:`14761`): disables the run-time marshalling of the assembly; `bool`/`char` become 1/2 bytes without conversion (Learn, .NET 11 breaking change page cited in §1); used by LibraryImport for value types (`docs/design/libraries/LibraryImportGenerator/Compatibility.md:101`).
- Pointers `delegate* unmanaged[Cdecl|Stdcall|SuppressGCTransition|MemberFunction|Swift]<...>`; public convention types `CallConvMemberFunction`, `CallConvSuppressGCTransition`, `CallConvSwift` (ref:`14509-14521`); `[SuppressGCTransition]` (`CoreLib/.../SuppressGCTransitionAttribute.cs:66`, ref:`15763`) for very short native calls without GC transition.
- `Marshal.GetFunctionPointerForDelegate` / `GetDelegateForFunctionPointer` (`Marshal.cs:1194-1251`); `NativeLibrary.Load/TryLoad/GetExport/TryGetExport/SetDllImportResolver/GetMainProgramHandle` (`NativeLibrary.cs:40-251`).

## 4. Memory, pinning, handles

- `NativeMemory.Alloc/AllocZeroed/AlignedAlloc/AlignedFree/Realloc/Free/Clear/Copy/Fill` (`NativeMemory.cs:22-76`, `NativeMemory.Windows.cs:25-163`).
- Typed handles (public in 11.0): `GCHandle<T>` (ref:`15582`, `GCHandle.T.cs:23-85`), `PinnedGCHandle<T>` with `GetAddressOfObjectData()` (ref:`15684`, `:15692`), `WeakGCHandle<T>` (ref:`15821`); `GCHandleExtensions.GetAddressOfArrayData/GetAddressOfStringData` (`GCHandleExtensions.cs:28`, `:51`). `ToIntPtr/FromIntPtr` = opaque token passable as `void*` on the C side.
- `ExtendedLayoutAttribute(ExtendedLayoutKind.CStruct | CUnion)` public (ref:`15536-15544`): explicit C layout for shared structs.
- `MemoryMarshal`, `CollectionsMarshal`, `Span<T>`/`Memory<T>`/`MemoryManager<T>` for copy-free views.

## 5. Object projection and cross-GC

- `ComWrappers`: `GetOrCreateComInterfaceForObject` (`ComWrappers.cs:787`), `GetOrCreateObjectForComInstance` (`:922-943`), `RegisterForTrackerSupport` (`:1550-1565`, global instance for the "reference tracker", see `IReferenceTracker.cs`, `TrackerObjectManager.cs`), `RegisterForMarshalling` (`:1589`); basis of the COM generators (`docs/design/features/source-generator-com.md`).
- Generic cross-GC bridge: `JavaMarshal` (`Initialize(delegate* unmanaged<MarkCrossReferencesArgs*, void>)`, `CreateReferenceTrackingHandle`, `FinishCrossReferenceProcessing`; `CoreLib/.../Java/JavaMarshal.Unsupported.cs:20-91`) — **`[SupportedOSPlatform("android")]`**, enabled only for Android (or debug/checked) in NativeAOT (`src/coreclr/nativeaot/Directory.Build.props:74-76`, impl. `Runtime/interoplibinterface_java.cpp`). It is the only runtime mechanism that resolves .NET ↔ foreign GC cycles; no equivalent for JSC/V8.
- `ObjectiveCMarshal` (ref `System.Runtime.InteropServices.cs:2447`): same for Objective-C.
- `TypeMapping.GetOrCreateExternalTypeMapping<TGroup>()` / `GetOrCreateProxyTypeMapping<TGroup>()` (`TypeMapping.cs:13-42`): type projection tables resolved at compile time, compatible with trimming/AOT; motivation and predecessors (C#/WinRT, Android) in `docs/design/features/typemap.md:1-10`.

## 6. JS interop already present in .NET (browser only)

`System.Runtime.InteropServices.JavaScript` (`[JSImport]`/`[JSExport]`) is `[SupportedOSPlatform("browser")]` (`src/libraries/System.Runtime.InteropServices.JavaScript/src/.../JSHost.cs:14`), with Mono and CoreCLR implementations (`JSHostImplementation.Mono.cs`, `JSHostImplementation.CoreCLR.cs`, `Interop/JavaScriptExports.CoreCLR.cs`). Unusable outside WASM, but its ABI is the model to copy: `Span<JSMarshalerArgument>` argument frame with fixed **32-byte** slots (`JSMarshalerArgument.cs:24`, `[StructLayout(Explicit, Size = 32)]`), a single call per invocation (`JSFunctionBinding.cs:157-230`), per-type marshallers (`Marshaling/JSMarshalerArgument.*.cs`), `gen/` generator.

## 7. Consequences for a Bun ↔ .NET bridge without node-api-dotnet

1. The natural path is **NativeAOT `NativeLib=Shared`**: C exports `[UnmanagedCallersOnly(EntryPoint)]`, blittable signatures (mandatory in 11), consumed by `bun:ffi` `dlopen` or loaded as a Node-API addon.
2. `hostfxr` remains useful only to load arbitrary IL assemblies ("dynamic" scenario); one runtime per process.
3. The typed handles (`GCHandle<T>`, `PinnedGCHandle<T>`) and `NativeMemory` cover the lifetime on the .NET side; there is no cross-GC bridge usable with JSC (the `JavaMarshal` bridge is limited to Android).
4. A static `.lib` linked into `bun.exe` is technically possible (`NativeLib=Static`) but outside official support and incompatible with the "native exe ≤ 1 MiB" budget; keep it off the main path.
