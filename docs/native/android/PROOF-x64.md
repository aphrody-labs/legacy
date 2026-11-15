# Proof: monorepo on Android x86_64 (x86_64-linux-android)

Run 2026-11-15 on fr1 (`ssh vps`, 12 cores, /dev/kvm) with `bun scripts/android-x64.ts` (recipe `just android-x64`); full log in `target/android-x64/proof.txt` on fr1. Nothing was compiled on the PC.

## Toolchain (fr1, profile ci, from `infra/android/android.toml`)

- NDK 30.0.16248370 (r30), clang 21.0.0 Android build 16134705; JDK Temurin 25.0.5+8 (system openjdk 25.0.5.0.3); adb 1.0.41; emulator 37.2.13.0 (build 16740729); platform-tools 37.0.1; system image `android-37.2;google_apis_ps16k;x86_64` rev 7.
- dl.google.com answered 404 from fr1: the installer used the `edgedl.me.gvt1.com` mirror and its manual unpack path for NDK r30 and CMake 4.1.2 (sha1 checked). The android CLI download is skipped on fr1 for the same reason (non-fatal).

## Builds (`make -C src android-x64`)

```
clang --target=x86_64-linux-android29 -std=gnu11 -O3 ... -fPIC -flto=thin -fuse-ld=lld -shared -Wl,-z,max-page-size=16384 <C_SRCS> arch/x86/entry_64.S -o target/sys/android-x86_64/libaysys.so
libaysys.so: ELF 64-bit LSB shared object, x86-64, for Android 29, built by NDK r30 (16248370)
ay_smoke:    ELF 64-bit LSB pie executable, x86-64, interpreter /system/bin/linker64, for Android 29
```

Rust: `cargo +chromium-157 test -p aphrody-env --target x86_64-linux-android -Zbuild-std=std,panic_abort --no-run` (linker `x86_64-linux-android29-clang` from `.cargo/config.toml`, resolved on PATH) produced a 2.4 MB test executable.

## Emulator

`emulator -avd ay-x64 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on -read-only`, headless on KVM, booted (`sys.boot_completed=1`):

```
ro.build.version.release=17
ro.build.version.sdk=37
ro.build.version.codename=REL
ro.product.cpu.abi=x86_64
ro.product.model=sdk_gphone16k_x86_64
ro.build.fingerprint=google/sdk_gphone16k_x86_64/emu64xa16k:17/CP41.260831.015/16516427:userdebug/dev-keys
Linux localhost 6.12.81-android16-6-g4f69fc7b210c-ab16167562 #1 SMP PREEMPT Tue Aug 25 07:36:40 UTC 2026 x86_64 Toybox
PAGE_SIZE 16384
```

## Device-side runs (`adb push` to /data/local/tmp/ay, `adb shell`)

```
ay_sys_abi_version=1
ay_cpu_probe=0
caps arch=1 sse42=1 avx2=0 avx512f=0 tsc=582888441602
ay_fnv1a64("aphrody-android")=0b7d5d872392c916
wl_fixed_to_int(wl_fixed_from_int(42))=42
nt_status_to_errno(nt_errno_to_ntstatus(-2))=-2
rc=0

running 3 tests (aphrody_env)
test tests::sovereign_env_debug_never_leaks_secrets ... ok
test tests::parses_quotes_comments_and_escapes ... ok
test tests::redacts_secret_string_in_debug_and_display ... ok
test result: ok. 3 passed; 0 failed
rc=0
RESULT OK
```

## Update 2026-11-15: bionic clash fixed, Compose shell app, Android Studio

- `src/include/uapi/ay/types.h` now has an `__ANDROID__` branch that takes `__s8..__u64` from `<linux/types.h>` (bionic's `__u64` is `unsigned long long`, the old `uint64_t` was `unsigned long`) and defines `__usize` as `size_t`. `src/android/smoke.c` includes `<stdio.h>`, `<string.h>` and `<ay/sys.h>` with no hand-declared libc. Same run: `make -C src linux` and `make -C src wasm` (OUT_DIR=/tmp/ayout) exit 0 on fr1 and produced `libaysys.so` and `aysys.wasm`; `wasm-validate` is not installed on fr1, so the wasm module was not validated there (`make verify` needs it).
- `apps/android-shell`: Compose app, AGP 9.5.1, Kotlin 2.4.21 (compose plugin), Compose BOM 2026.09.00, compileSdk/targetSdk 37, minSdk 29, built on fr1 with Gradle 9.9.1 (`gradle --no-daemon :app:assembleDebug`, 29.5 MB debug APK). It loads `libayjni.so` (`src/android/jni.c`, links `libaysys.so`, staged by `make android-x64` into `target/sys/android-x86_64/jniLibs/x86_64`) and shows the ABI version, `ay_fnv1a64("aphrody-android")` and the CPU caps.
- Run on the API 37 emulator: `adb install` Success, `am start -W` Status ok (cold start 5914 ms). `android layout` (CLI 1.1.16717390, copied from fr2 because dl.google.com is blocked from fr1; sha256 2aabb936...) captured the UI tree: `libaysys.so ABI v1`, `FNV-1a64("aphrody-android") = 0b7d5d872392c916` (identical to the native `ay_smoke` value), `cpu: ok sse4.2 - -`, `Android 17 (API 37) x86_64`. Files: `proof/layout-api37.json`, `proof/shell-api37.png`.
- Android Studio 2026.2.2.9 (Rabbit 2 Patch 1) installed on the PC from the pinned-sha256 Windows zip into `~/.local/share/ay/android/android-studio-2026.2.2.9`; `product-info.json` reports build 262.10968.63.2622.16840690. Not launched.

## Not done

- fr2 was not used for the emulator: 8.9 GB free, the 37.2 system image install failed with "No space left on device" (profile `emu` exists for it once disk is freed).
- No Android 18 canary emulator run (the canary image is installed on the PC profile only, not on fr1).
- Flutter is installed on the PC but no Flutter app was built.
- `wasm-validate` check of `aysys.wasm` not run on fr1 (tool absent).
