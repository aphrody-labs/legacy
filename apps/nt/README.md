# nt

<!-- catalog:begin unit -->
<!-- prettier-ignore-start -->
| Type | Path |
| :-- | :-- |
| App | `apps/nt` |

Part of Aphrody: [aphrody-labs/ay](../../README.md), [Catalog](../../docs/reference/catalog/app.md).
<!-- prettier-ignore-end -->
<!-- catalog:end -->

Model of the **real** Windows NT of this machine, live and rendered entirely by the GPU, on the Microsoft stack.
Architecture and decisions: [docs/plan/architecture-microsoft.md](docs/plan/architecture-microsoft.md).

```
base/shell/explorer/  native WinUI 3 shell (replaces explorer.exe) (Windows App SDK 2.6.5: Fluent, Mica, NavigationView, WebView2)
modules/web/        browser port: GPU kernel scene: WebGPU 3840x2160 MSAA 4x, instanced boxes + glyph/icon atlas, no DOM text
                    UI strings: locales/<tag>.json (MF2, English source), i18n.ts
sdk/tools/host/     reading of the real Windows via bun:ffi
                    ntsys.ts        ntdll: processors, counters, processes/threads, drivers, pool, object types and namespace
                    winindex.ts     NTFS index of %SystemRoot% (FindFirstFileExW + SQLite FTS5 + PE headers)
                    pe.ts           PE/COFF reader (exports, imports, resources)
                    pe-icon.ts      real PE icons, process paths, NTFS volume and $MFT
                    desktop-svg.ts  whole desktop vectorized as SVG (UI Automation)
                    server.ts       Bun.serve: WebSocket /kernel, /api/icon, /api/index, /desktop.svg
sdk/tools/msindex/  recursive index of the Microsoft stack (ECMA-335, API Sets, loader, WinRT registry, RoGetActivationFactory), locked
sdk/tools/gpuprobe/ Direct3D 12 capability probe (C++23 `import std`, CMake 4.5 + Ninja, vcpkg: WIL, DirectX-Headers)
sdk/tools/          fetch-tools.ts: DXC 1.9.2609, Agility SDK 1.620.2, niubash 1.5.0, CMake 4.5.0, Ninja 1.13.2; vsdev.ts: VS environment
sdk/vcpkg/ports/    aphrody-labs vcpkg ports (overlay): directx-headers 1.620.2, wil
sdk/rust/           WinUI 3 from Rust (windows-reactor, pinned windows-rs fork)
.config/            configuration.winget: development machine (WinGet Configuration v3, DSC v3)
docs/               plan/ (architecture), research/ (facts gathered on the machine), bun/, interop/,
                    msindex/ (Microsoft stack indexed and proven on the machine: just msindex <src>)
```

The Rust core of nt is the flat monorepo based on windows-rs: fork `aphrody-labs/windows-rs` (master).

```
just serve        # http://localhost:8787/  (?report=1: real display measurement)
just index        # index of C:\Windows
just setup        # Windows machine (winget configure)
just app          # unpackaged NativeAOT WinUI 3 shell (just msix: MSIX)
just probe        # D3D12 probe, C++23 import std
just winui-rs     # WinUI 3 from Rust
```

No compilation on the owner's machine: `.github/workflows/ci.yml` builds the shell, the probe and the scene.
