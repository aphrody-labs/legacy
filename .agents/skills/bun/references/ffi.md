# bun:ffi in src

TS <-> native bridge: `dlopen` + typed symbols, `CString` + `core_free`, `JSCallback` for streaming.

- Implementation and round-trip test: `system/core-ts/src/ffi.ts`, `system/core-ts/test/ffi.test.ts` (`bun test system/core-ts`). The C ABI it loads is `src/core/capi`.
- Reindex and find users: `bun system/core-ts/src/cli.ts index <root> --all`, then `bun system/core-ts/src/cli.ts users bun:ffi`.
- Pass `FFIType.u64` (with `BigInt(byteLength)`) for Rust `usize` parameters so `bun check` and the 64-bit Windows ABI agree.
- Upstream reference: `ay docs bun ffi`, or https://bun.com/reference/bun/ffi
