# Rust in Windows — survey (2026-11-12)

Method: proofs on the machine (Windows 11 Insider Dev, build 28120.3302, branch `br_release_flt`), Microsoft Learn docs, live GitHub API (`gh api`). No information taken from the model's memory.

## 1. Official position

- Windows Security Book (Learn, "System security › Rust for Windows"): _"We're expanding the integration of Rust into the Windows kernel to enhance the safety and reliability of Windows' codebase."_ — https://learn.microsoft.com/windows/security/book/operating-system-security-system-security
- Learn "Overview of developing on Windows with Rust": Microsoft is a founding member of the Rust Foundation.
- Learn "Direct3D 12 programming environment setup": C++ remains the only _supported_ language for D3D12 (no official Rust/C# status for D3D12).

## 2. Proofs on build 28120.3302

Detection: Rust runtime markers in the binaries (`/rustc/<commit>/`, `RUST_BACKTRACE`, `core` panic messages). **Lower bound**: a `no_std`/`panic=immediate-abort`/stripped binary leaves no such markers (e.g. `win32kbase_rs.sys` detected by its name, not by a rustc marker).

Descriptions = `FileDescription` / `ProductName` field of the binaries; all signed **CN=Microsoft Windows** (Authenticode verified).

| File                                                                    | FileDescription (version)                                                                                                                                        | Mode   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `System32\win32kbase_rs.sys` (172 KiB)                                  | Base Win32k Kernel Driver (10.0.28000.3302)                                                                                                                      | kernel |
| `drivers\wesp.sys`                                                      | Windows Endpoint Security Platform Driver (0.1.0.158348131)                                                                                                      | kernel |
| `drivers\wesp_elam.sys`                                                 | Windows Endpoint Security Platform ELAM Driver (0.1.0.158348131)                                                                                                 | kernel |
| `SenseTVM.exe` (WinSxS senseclient-service)                             | Windows Defender Advanced Threat Protection Sense TVM module (1.7.1-0)                                                                                           | user   |
| `SenseIdentity.exe` (same, + SenseAP, SenseAPToast)                     | … Sense Identity module (3.0.10-445)                                                                                                                             | user   |
| `DWriteCore.dll` (WinAppRuntime 1.1→2, CBS, WebView `undocked_copilot`) | Microsoft DirectX Typography Services (2.1.1.2605), Windows App SDK                                                                                              | user   |
| `NarratorMCAT\NarratorMCAT.dll`                                         | (empty) — rustc `a7727ddedd79…` **absent from rust-lang/rust** → toolchain outside upstream (hypothesis)                                                         | user   |
| `plutonfw_hspv2_AuthenticAMD.dll`                                       | (empty)                                                                                                                                                          | user   |
| `CloudRecoveryDownloadTool.dll`                                         | Microsoft Cloud Recovery Download Tool (0.3.28.0)                                                                                                                | user   |
| `UdiApiClient.dll`                                                      | Microsoft Universal Download and Install (0.4.74.0)                                                                                                              | user   |
| `sudo.exe`                                                              | sudo (1.0.1) — microsoft/sudo repository (Rust)                                                                                                                  | user   |
| Store apps                                                              | Paint `c2pa_c.dll`, WinDbg `symsrv.dll` + `winext\{CLR,ELFBin,MachOBin}Composition.dll`, Windows 365 `msrdc\skypert.dll`, `wcioprotection_display_presenter.dll` | user   |

Outside Microsoft: `System32\comm.exe` = **uutils coreutils** (Rust, rustc `574ff7d98bd6` = rust-lang/rust master of 2026-09-14), 11 MB, dated 2026-11-03, **signed "CN=Bun OS Test Signing"** (test certificate, not Microsoft) — local installation by the user.

Reproduce: `bun ~/.claude/skills/windows-machine/scripts/inventory.ts --rust-scan`.

## 3. Microsoft low-level Rust ecosystem (GitHub, active)

145 active non-fork Rust repositories, 106 pushed < 30 days ago. Low level:

| Domain                | Repositories                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bindings / metadata   | windows-rs (core, link, bindgen, window, reactor, canvas, composition, webview, rdl, clang), win32metadata                                                |
| Drivers               | windows-drivers-rs (`wdk` 0.5.0, `wdk-sys`, `wdk-build`, `wdk-alloc`, `wdk-panic`), Windows-rust-driver-samples, `cargo-wdk` (installed locally)          |
| Virtualization        | openvmm / OpenHCL (paravisor), hyperlight (micro-VM, `no_std` guests), **nvx** (cross-platform micro-VM), mxc (policy containers), Azure aci-edge-sandbox |
| OS / isolation        | litebox (library OS North/South), demikernel (kernel-bypass libOS), wassette (WASM components)                                                            |
| Observability         | rust_win_etw, tracelogging, tracing-etw                                                                                                                   |
| Crypto / hardware     | rustls-symcrypt (SymCrypt), ms-tcg-tpm-sys (TPM), TEE-Attestation-Verification                                                                            |
| Storage / performance | verified-storage, bf-tree, DiskANN, kimojio-rs (io_uring)                                                                                                 |
| Tools                 | edit, sudo, coreutils, tgrep, pave                                                                                                                        |
| .NET ↔ Rust           | dotnet/runtimelab `feature/ZeroGC.rs` (standalone CoreCLR GC in Rust)                                                                                     |

## 4. Consequences for nt

- Microsoft's own model = **targeted rewrite** (risk components: font/text parsing, win32k, security, firmware), not a full rewrite: nt adopts the same incremental strategy.
- Toolchain: Microsoft ships at least one binary built on a recent master rustc (September 2026) and one on a rustc outside upstream → pinning a dated nightly is consistent with the observed practice.
- Rust drivers: toolchain available locally (WDK present, `cargo-wdk` installed) → the drivers phase of the plan is feasible without any installation.
