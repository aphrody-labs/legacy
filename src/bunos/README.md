# bunos

The OS layer of the Bun based aphrody platform, one crate per concern (published as bun-os-git, bun-os-pkg, bun-os-native, bunos-win11-wallpaper, bunos-win11-chrome and bunos-nt-proto on crates.io, source of record aphrody-labs/bun-os).

| directory | role |
|---|---|
| git | native Git (gix) and GitHub (octocrab): inspection, history, ingest, search, upstream tracking |
| pkg | package metadata parsers (npm, Cargo sparse, NuGet, vcpkg, PyPI), verified blob store, bounded HTTP ingestion, store CLI |
| native | host hardware topology (CPU, RAM, CUDA) and monotonic clock probes |
| win11-wallpaper | animated wgpu wallpaper behind the Windows desktop icons (WorkerW layer) |
| win11-chrome | DWM rounded corners, Mica backdrop and dark caption for any HWND |
| nt-proto | bunos.sys IOCTL contract: control codes, event records, strict no_std parsers |

Each directory keeps its own Cargo.toml and Cargo.lock until the crates join the root workspace members. Proof: `cargo test --workspace` of the six crates on fr1 (see docs/project/restore-inventory.md).
