# android18-7.3 (ACK/GKI), deep research 2026-11-14

Branch `android18-7.3` of `android.googlesource.com/kernel/common`, cloned blobless on fr2 at `/srv/research/android/common-android18-7.3`.
- Tracker: `scripts/android-kernel-track.ts`, run by `android-kernel-track@android18-7.3.timer` on fr2 every 30 min (units in `infra/fleet/fr2/systemd/`).
- State history: `/srv/research/android/state/android18-7.3/`. Snapshot of this run: `android18-7.3-state-2026-11-14.json`.

## Measured state (tracker, 2026-11-14 22:30 UTC)

| Item | Value | Source |
| --- | --- | --- |
| Head | `8cb307d9ca5e` 2026-11-13, "ANDROID: sched/proxy_exec: Never move a running exec context..." | git log |
| Kernel | 7.3.0, "Baby Opossum Posse"; no 7.3.y stable merged yet (SUBLEVEL 0); kernel.org stable is 7.3.4 | Makefile, releases.json |
| Upstream base | `v7.3`, via "Merge tag 'v7.3' into android-mainline" (d9ee36f9bbc0, 2026-10-22): the branch was cut from android-mainline | git log --merges |
| Commits since v7.3 | 4799 non-merge: ANDROID 3104, Revert 722, UPSTREAM 355, FROMLIST 326, FROMGIT 170, BACKPORT 20, CHROMIUM 1, other 101 | subject prefixes |
| Areas with the most ANDROID patches | arch/arm64 816, arch/x86 680, tools/testing 365, fs/incfs 351, kernel/sched 304, BUILD.bazel 291, include/trace 287, drivers/android 233, fs/fuse 109 | `--name-only` |
| KMI | development phase: `kmi_enforced` and `abi_definition_stg` are commented out in BUILD.bazel, a single `gki/aarch64/symbols/base` list (3 symbols), no protected_exports, KMI_GENERATION 0 | BUILD.bazel, gki/ |
| Toolchain | CLANG_VERSION r596125, RUSTC_VERSION 1.96.0; Kleaf only (no build.config.*) | tree grep |
| gki_defconfig (arm64) | 838 lines; RUST=y, ANDROID_BINDER_IPC_RUST=y, ASHMEM_RUST=y, SHADOW_CALL_STACK=y, BPF_JIT=y, FUSE_BPF=y | arch/arm64/configs/gki_defconfig |
| Rust in tree | 501 `.rs`: rust/kernel 163, rust/zerocopy 92, drivers/gpu 76 (nova/tyr), rust/syn 55, drivers/android 20 | ls-tree |
| Recent work | fuse-bpf port with selftests (2026-11-12), DPM watchdog in gki_defconfig, fsverity fix | gitiles log |
| Kleaf manifest | `kernel/manifest` branch `common-android18-7.3`: 60 projects, default revision `main-kernel`; prebuilts clang, rust-toolchain linux-musl-x86, rules_rust, avb, stg, dwarves, u-boot, arm-trusted-firmware | default.xml |
| Release builds | none: source.android.com lists GKI release builds up to android17-6.18 | android-common page |

Build (Kleaf, per source.android.com building-kernels):
```sh
repo init -u https://android.googlesource.com/kernel/manifest -b common-android18-7.3 && repo sync
tools/bazel run //common:kernel_aarch64_dist -- --destdir=out/dist
```
It runs on fr1, never on the PC.

## Fact-check of the Android/GNU summary the owner pasted (2026-11-14)

Verified in this session:
- Linux v7.4-rc2 `drivers/android/` holds only Rust Binder (`rust_binder_main.rs`, `rust_binderfs.c`; Kconfig `ANDROID_BINDER_IPC_RUST`); the C driver is gone (gh api torvalds/linux).
- android18-7.3 already enables Rust Binder and Rust ashmem in gki_defconfig.
- `platform/manifest` has `android-latest-release`, `android17-release` and `android16-qpr2-release` (gitiles refs).
- source.android.com lists android17-6.18 release builds; the GKI KMI lifecycle is development, then KMI tracking, then frozen, with a KMI generation counter.
- kernel.org: 6.18 is longterm (6.18.63), mainline 7.4-rc2.

Not verified here [NV]:
- The 2009 staging removal and the 3.3 return of the Android drivers.
- The Q2/Q4 publishing cadence of AOSP.
- `boot_16k-6.18.img`.
- Aluminium OS / ChromeOS convergence.
- pKVM details.
- Toybox licence.

Correction: Rust Binder is the only in-tree Binder at 7.4-rc2. It is not shipped as a stable release yet, since 7.4 is still at rc.

## GNU vs Android (for docs/native/gnu/OS.md)

Android is Linux without GNU: Bionic instead of glibc, Toybox instead of coreutils, init and Zygote, Binder, SurfaceFlinger. Aphrody targets the opposite: a GNU system on the same upstream kernel, where `src/gnu/*` replaces the GNU packages with Rust equivalents.
