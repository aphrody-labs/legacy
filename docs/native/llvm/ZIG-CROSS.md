# Zig Ecosystem & Cross-Compilation (`zig` + `cargo-zigbuild`)

Forks enregistrés dans [`third_party/forks.txt`](../../../third_party/forks.txt) :

- `aphrody-labs/zig` (miroir de `https://codeberg.org/ziglang/zig` / `ziglang/zig`)
- `aphrody-labs/cargo-zigbuild` (fork de `rust-cross/cargo-zigbuild`)

## Interface C unifiée (Zig / C / C++ / Rust / Bun)

- [`aphrody_core.h`](../../../src/core/capi/include/aphrody_core.h) : ABI Rust `aphrody_core_capi` (`core_*`).
- [`aphrody_zig.h`](../../../src/core/capi/include/aphrody_zig.h) : ABI Zig `native` (`native_sdk_app_*`), consommé par :
  - Bun (`bun:ffi`) : [`packages/native/src/index.ts`](../../../packages/native/src/index.ts)

## Commandes de build et cross-compilation

```sh
# Cross-compilation Rust via cargo-zigbuild (glibc épinglé / Windows / macOS / WASM)
cargo zigbuild --release --target x86_64-unknown-linux-gnu.2.28
cargo zigbuild --release --target aarch64-unknown-linux-gnu.2.28
cargo zigbuild --release --target x86_64-pc-windows-gnu
```
