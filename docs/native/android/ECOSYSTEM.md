# Android ecosystem dossier

All rows read on 2026-11-14. Pins live in `infra/android/android.toml`; this file records what exists upstream and where it was read. "XML" = `https://dl.google.com/android/repository/repository2-3.xml` and the `sys-img/{google_apis,android,google_atd}/sys-img2-3.xml` lists.

## Android 17 and 18

| Item | Status | Source |
|---|---|---|
| Android 17 | API 37: platforms `android-37.0` (rev 2), `android-37.1` (rev 1), `android-37.2` (rev 2; betas 1-3 also listed); build-tools 37.0.0; tag `android-17.0.0_r1`; branches `android17-release`, `android17-security-release` | XML; `android.googlesource.com/platform/manifest/+refs` |
| Android 17 system images (x86_64) | `android-37.0` google_apis rev 8, google_apis_ps16k rev 8, default (AOSP) rev 6, google_atd rev 7; `android-37.1` ps16k rev 9; `android-37.2` ps16k rev 7 | sys-img XML |
| Compose floor | Compose 1.12.0 requires `compileSdk 37` and AGP 9 | Context7 `/websites/developer_android_develop_ui_compose` (developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler) |
| Android 18 | Not published as an API level. Only a canary platform: `platforms;android-canary-20261104` (rev 18, api-level 37.2, codename CANARY, extension 24), older `canary-20261007` (rev 17), `canary-20260909` (rev 16), rolling `android-CANARY` (rev 15). No `android-38` platform. No `android18-*` branch in platform/manifest (`android-latest-release` and `main` exist) | XML; platform/manifest refs |
| Android 18 system image (x86_64) | `system-images;android-canary-20261104;google_apis_ps16k;x86_64` rev 18 (2.4 GB); no AOSP `default` or ATD image for canary | sys-img XML |
| Page size | 16 KB images (`ps16k`) are the only 37.1/37.2/canary x86_64 images; the pinned NDK link flag is `-Wl,-z,max-page-size=16384` (src/Makefile `android-x64`) | sys-img XML |

## SDK, NDK, JDK, build stack

| Component | Pinned (stable) | Also available | Source |
|---|---|---|---|
| cmdline-tools | 23.0 (`commandlinetools-*-16111833_latest.zip`) | 19.0 to 22.0, 14.0-alpha01 | XML |
| platform-tools | 37.0.1 (stable channel) | 37.0.3 (channel-2) | XML |
| emulator | 37.2.13 (stable) | 37.3.9 (channel-1) | XML |
| build-tools | 37.0.0 | 36.1.0, 36.0.0, 35.0.1; 37.0.0-rc2 | XML |
| NDK | 30.0.16248370 (stable) | 29.0.14206865, 28.2.13676358, 27.3.13750724; no newer preview or canary in the XML | XML |
| CMake (SDK) | 4.1.2 | 4.1.1, 3.31.6, 3.22.1 | XML |
| JDK LTS | Temurin 25.0.5+8 (2026-10-22) | OpenJDK 25.0.5 on fr1 | `api.adoptium.net/v3/info/available_releases` (LTS 8/11/17/21/25); GitHub `adoptium/temurin25-binaries` |
| JDK latest | Temurin 27.0.1.0.2+1 (feature release 27; tip is 28) | | adoptium API |
| Gradle | 9.9.1 | no release candidate published | `services.gradle.org/versions/current`, `/release-candidate` |
| AGP | 9.5.1 | 9.6.0-alpha03 (newest) | `dl.google.com/android/maven2/com/android/tools/build/gradle/maven-metadata.xml` |
| Kotlin | 2.4.21 (2026-10-08) | 2.5.0-RC (2026-11-11), 2.5.0-Beta2 | GitHub `JetBrains/kotlin` releases |
| Dart | 3.14.0 (2026-11-04) | bundled in Flutter 3.50.0 | `storage.googleapis.com/dart-archive/channels/stable/release/latest/VERSION` |
| Flutter | 3.50.0 stable (2026-11-11, Dart 3.14.0) | beta 3.51.0-0.1.pre | `storage.googleapis.com/flutter_infra_release/releases/releases_{windows,linux}.json` |
| Android Studio stable | Rabbit 2 2026.2.2 Patch 1 (build 2026.2.2.9, 2026-11-05) | Rabbit 2 2026.2.2 (2026-10-28) | `jb.gg/android-studio-releases-list.json` |
| Android Studio canary | Rabbit 3 2026.2.3 Canary 3 (2026.2.3.3, 2026-11-05) | Canary 1 and 2 | same |
| Studio install | Windows `.zip` and Linux `.tar.gz` unpack without installer: unattended; `.exe` also published | | same |

## Jetpack and AndroidX (Google Maven, `dl.google.com/android/maven2/.../maven-metadata.xml`)

| Library | Stable | Newest pre-release |
|---|---|---|
| Compose BOM `androidx.compose:compose-bom` | 2026.09.00 (confirmed by Context7, developer.android.com/develop/ui/compose/bom) | |
| Compose UI `androidx.compose.ui:ui` | 1.12.1 | 1.13.0-rc01 |
| Material 3 `androidx.compose.material3:material3` | 1.4.0 | 1.5.0-rc01 |
| `androidx.core:core` | 1.19.1 | |
| `androidx.activity:activity-compose` | 1.13.0 | 1.14.0-alpha03 |
| `androidx.lifecycle:lifecycle-runtime` | 2.11.0 | 2.12.0-alpha05 |
| `androidx.navigation:navigation-compose` | 2.10.2 | |
| `androidx.room:room-runtime` | 2.8.5 | |
| `androidx.games:games-activity` (native activity glue for C/C++) | 4.4.2 | |

## AOSP, kernel, platform tooling

| Item | Detail | Source |
|---|---|---|
| platform/manifest branches | `android17-release` (head 29ace668ae), `android17-security-release`, `android16-release`, `android16-qpr1-release`, `android16-qpr2-release`, `android16-s1/s2-release`, `android-latest-release` (ad156f32ca), `main`, `main-16k`, `main-plus-rust`, `main-cuttlefish-vendor-dev`, `master*` (legacy names) | `android.googlesource.com/platform/manifest/+refs/heads?format=JSON` |
| AOSP tags | `android-17.0.0_r1`, `android-16.0.0_r1` to `_r4` | `+refs/tags` |
| GKI kernels | `docs/research/android18-7.3.md` (fr2 tracker, every 30 minutes) | in repo |
| Cuttlefish | branches `main-cuttlefish-vendor-dev`, `master-cuttlefish-testing(-release)` | platform/manifest refs |
| Kleaf (Bazel kernel build) | built from the kernel manifests tracked in `docs/research/android18-7.3.md`; not set up here | in repo |
| repo | Google `repo` launcher fetches the manifest above; not installed here (no AOSP checkout is built) | |
| `android` CLI | single binary from `dl.google.com/android/cli/latest/<os>/android[.exe]`, no published checksum (observed sha256 is written to `android.lock.json`); commands per its SKILL.md: `sdk`, `docs`, `skills`, `install`; installed on fr2 (sha256 2aabb936...b84cf in the run log), 404 from fr1's IP, PC install pending | `.claude/skills/android-cli/SKILL.md`; `dl.google.com/android/cli/latest/*/install.{cmd,sh}` |
| Skills | 37 `android-*` skills mirrored in `.agents/skills` from `android/skills`; see "Skills" below | repo |

## Not covered

AOSP source checkout and build, Kleaf kernel builds, Cuttlefish boot, arm64 emulation, Play Store images, an Android 18 emulator run (image 2.4 GB, installed on the PC profile only).
