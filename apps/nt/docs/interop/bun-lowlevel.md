# Bun: Node-API and bun:ffi at code level

Source: `aphrody-labs/bun@4b8463ee` (branch `aphrody/main`, 2026-11-12) = `bun-v1.4.4` + 105 commits, 3 commits ahead of `oven-sh/bun@ccb3611f` (`git describe`, `rev-list`). Paths relative to the repository root. Read only, nothing built or run. The JSC/WebKit engine is a pinned prebuilt binary (`scripts/build/deps/webkit.ts:4-6`): everything inside `JSC::FFI` is **outside this repository** and not audited. "Inference" = reading of the code, not a statement of the code.

## 1. Loading an addon

- The Bun core is now mostly Rust: ~100 Node-API entry points in C++ (`system/jsc/bindings/napi.cpp:413-3366`), 53 in Rust `#[no_mangle]` (`system/runtime/napi/napi_body.rs:628-3525`: strings/integers, arrays, handle scopes, async work, TSFN, promises, dates, typedarray/arraybuffer info, uv loop, `napi_fatal_error`).
- Vendored headers in `system/runtime/napi/`; two differences: env type `struct NapiEnv*`, default `NAPI_VERSION` 10 (`system/runtime/napi/README.md:12-22`, `js_native_api_types.h:15`, `system/jsc/bindings/napi.h:59`). `napi_get_version` → 10 (`napi_body.rs:1671-1678`); `NAPI_EXPERIMENTAL` ⇒ version `INT_MAX` (`js_native_api_types.h:5-8`).
- `require("x.node")` = `process.dlopen` (`system/jsc/bindings/JSCommonJSExtensions.cpp:29`, `BunProcess.cpp:500-858`); `--no-addons` (`:507-509`); flags ignored, POSIX `dlopen(RTLD_LAZY)` (`:649`), Windows `LoadLibraryExW(LOAD_WITH_ALTERED_SEARCH_PATH)` (`system/sys/windows/mod.rs:1775-1779`).
- Registration: `napi_register_module_v1` + `node_api_module_get_api_version_v1` (`BunProcess.cpp:781-783`); **without a version export, `module_version = 8`** (`:798-802`). A return value different from `exports` replaces `module.exports` (`:851-855`); `nm_filename` = `file://` URI (`:808-823`). `napi_module_register` (legacy) is queued then replayed after `dlopen` (`napi.cpp:792-806`, `BunProcess.cpp:697-773`).
- Windows exports: `napi_*`/`node_api_*` exported by `__declspec(dllexport)` (`NAPI_EXTERN`, `system/runtime/napi/js_native_api.h:11-20`), `system/symbols.def` adds libuv and Rust names; checked by `scripts/build/binary-expectations.ts:589-616`, `/DEF:` through `scripts/build/flags.ts:1604-1608`. `symbols.def` is maintained by hand and incomplete on its own (e.g. no `napi_create_function`) — harmless since the C++ exports itself.
- "node.exe" imports (Windows): `NodeExeImports::Scope` around the `LoadLibrary` (`BunProcess.cpp:624-627`) + `LdrRegisterDllNotification` hook (`system/jsc/bindings/NodeExeImportsWindows.cpp:282-294`) that rewrites the `node.exe` import table of each module loaded **during** `process.dlopen` to the `bun.exe` exports (`:156-209`, `:272-280`); delay-load: only the cached handle is set (`:211-226`); module already loaded: a posteriori redirection (`:326-338`); missing symbol ⇒ failure "imports 'X' from node.exe, which Bun does not provide" (`:344`, tests `test/napi/napi.test.ts:2180-2220`).
- Experimental / v9-v10 functions present: `node_api_create_object_with_properties` (`napi.cpp:1619`), `node_api_set_prototype` (`:1595`), SharedArrayBuffer (`:1664`, `:1677`, `:1749`), `node_api_post_finalizer` (`:1173`), `node_api_symbol_for` (`:1389`), syntax error (`:1414`, `:1424`), external strings (`:1486`, `:1506`), `node_api_create_property_key_*` (`:1525-1550`), `node_api_create_buffer_from_arraybuffer` (`:1552`), `node_api_get_module_file_name` (`:1586`).
- Trim: `bun build --compile` can remove `Ffi` ("bun:ffi and its C compiler") and `NativeAddons` ("native addons, process.dlopen and N-API") (`system/trim/features/bun.def:13`, `:115`); a compiled executable that loads a .NET addon must keep the matching feature.

## 2. Env, values, scopes, GC

- `NapiEnv` = C++ `RefCounted` struct (`napi.h:174-724`); **one env per module load** added to the global's `m_napiEnvs` (`system/jsc/bindings/ZigGlobalObject.cpp:5197-5201`, `ZigGlobalObject.h:707`); one set per Worker.
- `napi_value` = raw bits of `EncodedJSValue` (`napi.h:764-782`, `napi_body.rs:384-400`, static_assert `BunProcess.cpp:820`).
- Roots: `toNapi` adds cells (not primitives) to the current `HandleScopeImpl` **of the global** (not of the env), only if a scope is open (`napi.h:774-782`). `HandleScopeImpl` = GC cell with `Vector<WriteBarrier,16>` (`system/jsc/bindings/napi_handle_scope.h:17-84`), `append` under cell lock (`napi_handle_scope.cpp:67-71`), `close` releases and checks balance (`:102-119`, `:144-159`), no opening during the sweep (`:121-142`).
- A scope is opened around every Bun → addon call (`napi_handle_scope.h:86-95`, `NapiClass.cpp:67`, `napi.cpp:759`). Inference: a `napi_value` created outside a scope (foreign thread) is only protected by JSC's conservative stack scan.

## 3. JS → native callbacks

- `napi_create_function` creates a `NapiClass` (subclass of `JSFunction`, host function `NapiClass_ConstructorFunction<false|true>`) with a `prototype` even for a plain function (`napi.cpp:944-967`, `NapiClass.cpp:83-140`); each method/getter/setter of `napi_define_properties` is its own `NapiClass` (`napi.cpp:370-392`); `napi_define_class` (`:2145-2181`).
- Per-call path (`NapiClass.cpp:17-81`): callee downcast, (construct: `get("prototype")`), `NAPICallFrame` with sloppy `toThis` (`napi.h:1057-1067`), **`NapiHandleScope` that allocates a GC cell on every call** (`napi_handle_scope.cpp:136-141`), call, `napi_set_last_error`, `throwPendingException`. No intrinsic or DOMJIT.
- `napi_get_cb_info`: preamble without exception check (`napi.cpp:969-986`); `toNapi` per argument (cell-locked append), `undefined` padding (`:314-338`).
- `napi_call_function` through `AsyncContextFrame::call` (`napi.cpp:3220-3268`); `napi_new_instance` (`:3155-3190`).
- `napi_wrap`: inline `NapiRef` on a `NapiPrototype` instance, otherwise `NapiExternal` in a private property (`napi.cpp:817-885`); `unwrap` (`:923-942`), `remove_wrap` (`:887-921`).

## 4. Lifetime, finalizers

- `NapiRef`: `Strong` while `refCount > 0` + weak value (`napi.h:841-934`); primitives accepted only if `nm_version >= 10` (`napi.cpp:1113-1118`); `unref` at 0 → `generic_failure` (`:1192-1194`); `napi_delete_reference` safe from a GC finalizer (`:1233-1247`).
- Weak death → `callFinalizerFromGC`, queued in `m_pendingRefFinalizers` if deferred (`napi.cpp:298-312`, `NapiRef.cpp:49-60`, `napi.h:356-363`).
- **When**: `doFinalizer` defers if in GC and (`mustDeferFinalizers()` or GC thread), otherwise runs (`napi.h:455-468`); `mustDeferFinalizers()` = true for every non-`NAPI_EXPERIMENTAL` module (`:528-539`); "finalizer touched the GC" check reserved for experimental modules (`:439-453`). Deferred execution: `NapiFinalizerTask::schedule` (`napi_body.rs:5443-5490`) — off the JS thread: posted through the VM handle; at shutdown: cleanup hook or abandon; otherwise `enqueue_task`. `Finalizer::run` opens a scope (`:2529-2537`).
- `napi_add_finalizer` (`napi.cpp:1138-1171`); `node_api_post_finalizer` → `Bun__napi_enqueue_finalizer` (`:1173-1181`); `napi_create_external` → `NapiExternal` whose destructor only runs the finalizer immediately for experimental modules (`napi_external.cpp:6-10`).
- Type tags: global weak map (`napi.cpp:3270-3308`, `napi_type_tag.h:11-49`); instance data per env (`napi.cpp:3014-3066`).
- Cleanup hooks: duplicate ⇒ abort (`napi.h:372-415`), run in reverse order (`:687-723`). Env teardown (`napi.h:203-291`): hooks → TSFN abort → hooks → linked finalizers in reverse order → instance data finalizer; registered as a VM hook (`napi_body.rs:2470-2477`) and waits for async works to finish (`napi.h:244-247`, `napi_body.rs:2480-2493`).

## 5. Threads

- TSFN: struct `napi_body.rs:2579-2637`, `LinearFifo` queue, `max_queue_size == 0` = unlimited (`:2668-2687`). `napi_call_threadsafe_function` (`:3012-3044`): blocking = condvar, non-blocking = `queue_full`, closing = `closing`; no null-check of `func` (`:3449-3460`).
- Dispatch: `schedule_dispatch` posts a `ConcurrentTask` through a weak `VmHandle` (`:3048-3079`); `on_dispatch` drains **the whole** queue without a per-tick cap (Node: 1000) (`:2721-2791`); microtasks drained between calls, not before the first (`:2836-2894`); `call_js` under scope + `complete_in_context` (`:2938-2953`); abort hands the remaining items to `call_js` with a null env (`:2968-2985`).
- Ref/unref: TSFN created "ref" (keeps the loop alive, `:3425-3427`); `ref`/`unref` on the JS thread only (`:3232-3247`); TSFN registered on the env for neutralization at teardown (`:3410-3423`); after a Worker teardown → `napi_closing` (`:2603-2607`, `:3026-3038`). `napi_would_deadlock` absent (`:475`).
- Async work: struct `:1916-1934`, `WorkPool::schedule` (`:1974-1993`), cancellation if the VM stops (`:2001-2030`), `complete` on the JS thread (`:2037-2086`); pool size `UV_THREADPOOL_SIZE`/`GOMAXPROCS`/CPU, bounded 2..1024 (`system/threading/work_pool.rs:125-131`, `system/bun_core/util.rs:2697-2742`).
- Async context: `napi_async_init` returns the env pointer, `napi_async_destroy` no-op (`napi_body.rs:1275-1296`); `napi_make_callback` = plain call without microtask drain (`:1298-1349`); `napi_open/close_callback_scope` no-op without writing the result (`:1413-1432`).
- libuv: Windows = real libuv, exported through `symbols.def`; `napi_get_uv_event_loop` returns the loop of the **calling thread**, not of the env (`napi_body.rs:2395-2413`). POSIX: partial emulation (`system/runtime/napi/uv_posix.rs:1-22`), the rest crashes (`system/jsc/bindings/uv-posix-stubs.c:1337`, `:1468`).
- Loop wakeup: `ConcurrentTask` in an `UnboundedQueue` (`system/event_loop/ConcurrentTask.rs:286-335`) → `el.post` + `el.wakeup()` (`system/jsc/event_loop.rs:847-853`, `system/jsc/VmHandle.rs:180-188`) → `us_wakeup_loop` (`event_loop.rs:1315-1320`, `system/bun-usockets/src/loop.c:175-180`); Windows: `uv_async_send` (`system/bun-usockets/src/eventing/libuv.c:627-633`); at most 8 reloads of the concurrent queue per tick (`event_loop.rs:830-836`).

## 6. Strings and buffers

- latin1/utf16 creation: copy into a new `WTF::String` (`napi_body.rs:757-807`, `:850-900`); utf8 transcoded (`:841-845`); length > `INT32_MAX` → `invalid_arg` (`:772`).
- **Zero-copy external strings** (`WTF::ExternalStringImpl`, `*copied = false`) (`napi.cpp:1449-1523`).
- `node_api_create_property_key_*` = `napi_create_string_*`, no atom (TODO `jsAtomString`, `napi.cpp:1525-1550`).
- `napi_get_value_string_*` always copies; `buf == NULL` → length (utf8 bytes or units) (`napi.cpp:2614-2635`); writes at most `bufsize-1` + NUL (`:2650-2697`).
- Buffers: `napi_create_buffer` uninitialized, stable pointer (`napi.cpp:2274-2308`); `create_external_buffer` zero-copy, not transferable (`:2412-2466`); `create_external_arraybuffer` zero-copy, finalizer only once (GC or env cleanup) (`:2353-2400`, `:2468-2501`); `node_api_create_buffer_from_arraybuffer` shares the storage (`:1552-1584`); `napi_detach_arraybuffer` (`:1265-1288`). The `*_info` getters materialize the buffer for a stable pointer (`napi_body.rs:1575`, `:2226`).

## 7. Errors

- Last error per env (`napi.h:575-582`); `napi_get_last_error_info`: `engine_*` always 0 (`napi.cpp:243-296`).
- `napi_throw*` stores the exception on the env (`napi.h:470-477`, `napi.cpp:1028-1043`); following preambles → `pending_exception` (`napi.h:561-563`); rethrown when the callback returns (`NapiClass.cpp:69-72`).
- `napi_fatal_error` → `Output::panic` (`napi_body.rs:2161-2185`); `napi_fatal_exception` → `Bun__reportUnhandledError` (`napi.cpp:1367-1378`); JS not runnable: `napi_cannot_run_js` if `nm_version >= 10`, otherwise `pending_exception` (`napi.h:550-554`).

## 8. Known differences from Node

- No Node-API status page (`docs/runtime/node-api.mdx:1-19`); no "not implemented" marker; TODOs: `napi.cpp:777`, `:1158`, `:1529`, `:1538`, `:1547`, `:1823`, `:2429`, `:3013`; `napi_body.rs:1042`, `:1593`, `:2411`.
- No-op: async context, callback scopes, `make_callback` (§5).
- Node `todoIf` tests (`test/napi/node-napi-tests/test/node-api/*/do.test.ts`): `test_async`, `test_threadsafe_function`, `test_instance_data` (POSIX uv stubs), `test_uv_loop`, `test_fatal`, `test_buffer`, `test_async_context`, `test_async_cleanup_hook`, `test_make_callback[_recurse]`, `test_uv_threadpool_size`, `test_callback_scope` (Windows), `test_reference_by_node_api_version` (macOS). No `js-native-api` test is in todo.
- Windows: skips `test/napi/napi.test.ts:533`, `:2026`, `:2067`, `:2114-2116`; the Windows CI does not build node-gyp addons (`test/expectations.txt:20-24`), fast harness build disabled on win32 (`test/napi/node-napi-tests/harness.ts:91`); `cc()`+napi tests `todoIf(isWindows)` (`test/napi/napi-value-ffi.test.ts:76-97`, `:160`).

## 9. bun:ffi

- `dlopen`/`linkSymbols`/`CFunction`/`JSCallback` **do not use TinyCC**: `dlopen` (`system/js/bun/ffi.ts:200-210`) → `FFI::dlopen` (`system/runtime/ffi/ffi_body.rs:1531-1710`): `DynLib::open` (name then absolute path, `:1602-1635`), `dlsym`, `Bun__CreateJSCFFIFunction` → `JSC::FFI::Signature::tryCreate` + `JSC::JSFFIFunction::create` (`system/jsc/bindings/JSCFFIBridge.cpp:65-97`). The call code is in the prebuilt WebKit; the doc claims a direct call from DFG/FTL (`docs/runtime/ffi.mdx:52`) — not verifiable here.
- TinyCC is only used by `cc()` (`ffi_body.rs:1019-1290`): generated C wrapper (`:2186-2357`) prefixed by `FFI.h` (`:2064-2066`), arguments read from the CallFrame (`system/runtime/ffi/FFI.h:147-151`), `-std=c11 -nostdlib` (`:2104-2108`), SysV→MS trampoline on Windows x64 (`system/jsc/bindings/JSFFIFunction.cpp:72-87`, `:157-185`). `viewSource` shows this wrapper even for `dlopen` symbols, which is misleading (`ffi_body.rs:1451-1466`).
- `FFIType` (`system/runtime/ffi/abi_type.rs:15-49`, `ffi.ts:1-63`): char, i8, u8, i16, u16, i32, u32, i64, u64, f64, f32, bool, ptr, void, cstring, i64_fast, u64_fast, function, napi_env, napi_value, buffer, buffer_length. Numeric ids > 19 rejected (`abi_type.rs:169`); `napi_env`/`buffer`/`buffer_length` returns rejected (`ffi_body.rs:1925-1941`); napi types only in `cc()` (`:2373-2380`).
- Pointers: `ptr()` on a non-empty ArrayBufferView, addresses ≤ 2^56-1 (`system/runtime/ffi/FFIObject.rs:420-470`, `:731-735`); unaligned `read.*` (`:128-410`); `toArrayBuffer`/`toBuffer` zero-copy with optional deallocator (`:590-713`); `CString` copies (`:48-58`); `ptr`/`read.*` = `NoIntrinsic` host functions, no DOMJIT (`system/jsc/bindings/ZigGeneratedCode.cpp:9-28`).
- `JSCallback` (`ffi.ts:87-111`) → `FFI::callback` (`ffi_body.rs:1303-1360`) → `JSC::FFI::createCallback`; `threadsafe: true`: call from a foreign thread posted by `ScriptExecutionContext::postTaskTo` (lock of a global map then VM handle) and executed by `runThreadsafeInvocation` (`JSCFFIBridge.cpp:99-156`, `system/jsc/bindings/ScriptExecutionContext.cpp:286-304`); value returned to C unspecified in threadsafe mode (`ffi.mdx:344`); `close()` (`JSCFFIBridge.cpp:158-162`).
- Platforms: TinyCC disabled only on Android and FreeBSD (`scripts/build/config.ts:1190-1192`) hence active on Windows x64/arm64; `--ffi=off` build possible (`JSCFFIBridge.cpp:21-49`, `config.ts:244-249`). Windows: `DynLib::close` no-op, DLLs are never unloaded (`system/sys/lib.rs:6141-6149`).
- Limits: no struct type ⇒ no struct by value (`abi_type.rs:15-49`); no varargs (options read: `args`, `returns`, `threadsafe`, `ptr` — `ffi_body.rs:1844-1963`); unsupported signature ⇒ exception (`JSCFFIBridge.cpp:82-86`); i64/u64 as BigInt except `*_fast` (number if ≤ 52 bits, `FFI.h:371-393`); callback i64/u64 as BigInt (`ffi.mdx:344`).
- Benchmarks (not run): `bench/ffi/bun.js:1-46` compares bun:ffi and napi-rs on a Rust cdylib (`bench/ffi/src/src/lib.rs:1-50`); `bench/snippets/ffi-overhead.mjs:227-229` targets a macOS `.dylib`.

## 10. .NET in Bun

No trace of hostfxr, coreclr, nethost or CLR (only occurrences: "C#" in `docs/runtime/ffi.mdx:11`, npm package names, MIME `application/clr`).

## 11. Risks for a .NET NativeAOT addon

1. Without `node_api_module_get_api_version_v1`, the addon runs with version 8 semantics (`BunProcess.cpp:798-802`): no `napi_ref` on primitives, no `napi_cannot_run_js`.
2. Finalizers always deferred to the JS thread outside experimental mode (`napi.h:528-539`): `GCHandle`s released one loop turn later.
3. Per-call cost: one GC cell (scope) + one cell-locked append per object argument (`napi_handle_scope.cpp:67-71`, `:136-141`).
4. TSFN: unlimited queue by default and drain without a per-tick cap (`napi_body.rs:2721-2791`): a burst of .NET `Post` calls can monopolize a tick.
5. `node.exe` imports rewritten only during `process.dlopen` (`NodeExeImportsWindows.cpp:272-280`): an addon that resolves Node-API through `GetModuleHandle(NULL)` + `GetProcAddress` (node-api-dotnet's case) is not affected; a lazy `DllImport("node")` would be (inference).
6. `napi_get_uv_event_loop` tied to the calling thread (`napi_body.rs:2412`).
