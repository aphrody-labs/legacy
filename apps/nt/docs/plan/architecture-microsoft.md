# nt on the Microsoft stack — decisions of 2026-11-12

Sources: five read-only surveys (aphrody-labs forks in `third_party/`, `gh api`, NuGet, npm), all dated 2026-11-12.

## Facts gathered

**windows-rs** (8ca69fd, identical to upstream master)

- Layout: `crates/{libs,tools,samples,tests}`.
- Metadata generated from the SDK and WDK 10.0.28000 headers; win32metadata is no longer used.
- Bindings: each crate generates its own, private, through `windows-bindgen --flat --minimal|--sys` and a `.txt` filter file. The generated `bindings.rs` is committed; the `gen` CI checks that it has not drifted.
- Linking: `windows-link` (`raw-dylib`).
- `windows-sys` and `windows-link` are `no_std` without allocation. `windows-core`, `-result` and `-strings` need `alloc`.
- Kernel (ntoskrnl) exports: not published. Custom RDL files or `--sys --extern` are required.
- No wasm CI.

**webui** (v3.1.1, fork identical to upstream)

- HTML templates compiled to `protocol.bin`, rendered server side in Rust (axum, hyper) or in JS (Bun.serve documented), then activated by islands on the client.
- No WebSocket or WebGPU: the GPU scene and the kernel stream stay in an `<nt-scene>` component.
- Fluent UI web components 3.2.1 has no `.template-webui.html`: no server rendering as it stands.

**node-api-dotnet** (0.9.36)

- NativeAOT addon exposing `[JSExport]` as `.node`. `bun.exe` 1.4.4 exports the 140 Node-API functions used, but nothing is tested under Bun.
- Maximum target: net10.0. It would need patching for net11.

**LiberNT** (ReactOS fork, NT 10 target)

- Tree: `boot/`, `bootloader/`, `hal/`, `ntos/{ke,mm,ob,ps,io,se,config,po,ex,alpc,cc,fsrtl,rtl,tm,wmi,kd…}`, `drivers/`, `dll/{ntdll,win32}`, `subsystems/{csr,win/win32k,linux}`, `base/{system,services,shell}`, `sdk/`.
- 407 system services. Sources of truth, in order: SDK/WDK headers, Windows 11 symbols, Microsoft documentation.

**Microsoft OS ecosystem in Rust** (ten priority projects)

- openvmm: `minimal_rt`, `openhcl_boot`, `whp`, `tmk`.
- litebox: its Platform traits serve as a HAL model.
- windows-drivers-rs; win32metadata and wdkmetadata; DirectX-Headers; terminal (condrv, Atlas); ebpf-for-windows and ntosebpfext; DXC; WindowsAppSDK and WinUI 2.6.5; mxc (FFI to the .NET and Node SDKs).

**This machine**

- `System32\win32kbase_rs.sys` exists on this build (Rust in the kernel graphics subsystem).

## Decisions

1. The nt core is a flat monorepo based on the aphrody-labs/windows-rs fork (master branch; all nt work is on the default branch of the forks).
    - The nt crates join `crates/libs/nt-*`.
    - Microsoft's Rust OS projects are imported as squashed subtrees, with their provenance in a manifest.
    - What resolves together is unified in the workspace; the rest is excluded, with its blockers listed.
2. windows-rs moves to wasm32 (fork master, docs/wasm.md): a Win32 or NT function becomes a wasm import (module = DLL, name = symbol), provided by the "NT in the browser" host.
3. The webui JS tooling moves entirely to bun (fork main): bun workspaces and catalogs, Bun.build, bun test.
4. Fluent UI web components is converted to the webui template format (fluentui fork master), and Fluent UI React v9 moves to bun (scripts/bun).
5. Shells:
    - WinUI 3 (Windows App SDK 2.6.5) for the native shell;
    - webui + Fluent for the web shell;
    - the kernel scene is pure GPU rendering (native Direct3D 12, WebGPU in the browser);
    - the .NET ↔ bun bridge is direct: bun:ffi over NativeAOT or CoreCLR hosted through hostfxr, without node-api-dotnet (docs/bun/dotnet-native.md).
6. No compilation on the machine: building happens on GitHub Actions (aphrody-labs forks) or on prd.

## Native toolchain — decisions of 2026-11-12

Sources consulted the same day: Kitware/CMake `v4.5.0` (Help/release/4.5.rst, cmake-cxxmodules(7)), Learn (vcpkg binary caching,
single-project MSIX, Windows App SDK 1.6/2.x, Native AOT, WinGet Configuration v3, MSVC 14.52 / VS 18.12), microsoft/vcpkg@177e8175,
nuget.org, PowerShell/DSC, PSGallery, `winget show`, actions/runner-images (windows-2025-vs2026 20261103: VS 18.11, CMake 4.4.5).

7. C++23 `import std;` through CMake 4.5 (stable, tag of 2026-11-12) with Ninja and MSVC; the Visual Studio generators do not
   support it (no BMI for imported targets). CMake 4.5.0 and Ninja 1.13.2 are pinned by
   `sdk/tools/fetch-tools.ts` (SHA-256), the VS environment is loaded by `sdk/tools/vsdev.ts` (vswhere + VsDevCmd).
   MSVC 19.52.37029+ gets `-std:c++23` (stable), earlier versions `-std:c++latest`.
8. vcpkg in manifest mode: default registry microsoft/vcpkg pinned by commit, aphrody-labs ports as overlay
   (`sdk/vcpkg/ports`: directx-headers 1.620.2 = Agility SDK 1.620.2, absent from the registry; wil abb1bd35). CI binary cache:
   NuGet provider on GitHub Packages (recommended by Learn; `x-gha` is removed from vcpkg).
9. Shell: NativeAOT (3.5 MB exe measured); two outputs, unpackaged self-contained and single-project MSIX, Windows App SDK 2.6.5
   embedded in both cases; test certificate generated by the CI, never versioned.
10. WinUI from Rust: windows-reactor (windows-rs) as a pinned git dependency, sample `sdk/rust/winui-hello`.
11. Machine: `.config/configuration.winget` (WinGet Configuration v3, dscv3 processor); PSGallery module
    Microsoft.VisualStudio.DSC for the Visual Studio Build Tools 2026 C++ components.
12. .NET: net11.0 applications; libraries consumed by other .NET hosts as net10.0;net11.0
    (`$(NtLibraryTargetFrameworks)`), IsAotCompatible by default.
