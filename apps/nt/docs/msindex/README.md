# msindex: Microsoft stack indexed and proven on this machine

Generated on 2026-11-12 by `sdk/tools/msindex` (`just msindex <src>`), verifiable with `just msindex-verify <src>`.
Machine: Windows 26H1 build 28120 (28000.7.amd64fre.br_release_flt.260716-1702). Index: `target/index/msindex.sqlite` (tables node, edge, proof, fts).

Graph fingerprint: `1b9767a8e6b276d7c3766b9379880d9e815ab34b8112e7b7e5f66ec5db7976a1`; proofs: `8ce53b64fdda6ca36d74a0ab68705c1d85f1595776993e868f3c706c582bde95`.

## Sources

- Win32 + WDK + WinRT: Windows.Win32.winmd and Windows.winmd of windows-rs (2196dbbc27), Windows.Wdk.winmd (NuGet microsoft.windows.wdk.win32metadata 0.13.25-experimental, SHA-512 verified).
- Windows App SDK 2.6.5: 11 NuGet packages; WindowsAppSDK and microsoft-ui-xaml sources (1723 IDL types, 17 features).
- .NET: .NET 10.0.15, .NET 11.0.0 (reference packs and shared runtime).
- windows-rs: 326 crates of the nt monorepo.
- C/C++: UCRT 10.0.26100.0 (1529 declarations, 1257 exported by ucrtbase.dll), 11 CRT/STL DLLs, MSVC `import std` 14.52.37025 (894 names).
- API Sets: system schema v6, 989 contracts.

## Proofs

| check                  | passed | total | method                                                                                   |
| ---------------------- | ------ | ----- | ---------------------------------------------------------------------------------------- |
| RoGetActivationFactory | 1820   | 1848  | factory obtained (IID_IActivationFactory), in-process classes                            |
| activation-export      | 1847   | 1848  | DllPath exports DllGetActivationFactory                                                  |
| apiset-host            | 857    | 989   | PEB->ApiSetMap: the contract has a host DLL                                              |
| dotnet-impl            | 8262   | 8262  | reference type defined (TypeDef) by the shared runtime, ExportedType forwarders followed |
| loader                 | 16697  | 16806 | LoadLibraryExW(DONT_RESOLVE_DLL_REFERENCES) + GetProcAddress (child process)             |
| pe-export              | 18409  | 18520 | API Set contract resolved, name present in the PE export table of the host               |
| ucrtbase-export        | 1257   | 1529  | _ACRTIMP declaration exported by ucrtbase.dll                                            |
| wasdk-activation       | 1665   | 1665  | appxfragment of the package -> DLL of the package exporting DllGetActivationFactory      |
| winrt-registered       | 1864   | 1891  | HKLM\SOFTWARE\Microsoft\WindowsRuntime\ActivatableClassId                                |

## Nodes by kind

- constant: 155908
- method: 107924
- field: 103326
- property: 48674
- struct: 32493
- function: 18520
- interface: 15749
- constructor: 10319
- class: 10195
- enum: 8463
- export: 4735
- delegate: 3780
- event: 2575
- cargo-feature: 1694
- c-function: 1529
- idl-runtimeclass: 1180
- apiset: 989
- namespace: 936
- std-export: 894
- header: 849
- attribute: 825
- assembly: 343
- idl-enum: 328
- crate: 326
- idl-interface: 171
- idl: 170
- component: 95
- idl-delegate: 65
- idl-gated: 49
- winmd: 40
- idl-apicontract: 25
- idl-struct: 24
- scope: 18
- feature: 17
- package: 11
- dll: 11
- source: 6
- repo: 2
- runtime: 2
- rdl-area: 2
- index: 1
- rdl: 1
- headers: 1
- module: 1
