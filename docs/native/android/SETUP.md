# Android setup (reproducible)

Manifest `build/android/android.toml` (pins, sources, dates), lock `build/android/android.lock.json` (repository sha1 per SDK archive, android CLI sha256), installer `scripts/android-setup.ts`, proof script `scripts/android-x64.ts`. Recipes: `build/android/android.just`.

## One host

```sh
bun scripts/android-setup.ts install            # PC: profile pc, Linux (fr1, fr2): profile ci; idempotent
bun scripts/android-setup.ts check              # installed revision == pinned revision, repository sha1 == lock
bun scripts/android-setup.ts env                # writes <tools_dir>/android.env.sh (.ps1 on Windows) and prints it
```

- SDK root: `$ANDROID_HOME`, else `~/Android/Sdk` (Linux) or `%LOCALAPPDATA%\Android\Sdk` (Windows). Tools (JDK, Gradle, Kotlin, Dart, Flutter, Android Studio): `~/.local/share/ay/android/<name>-<version>`. android CLI: `~/.local/bin/android(.exe)`.
- Profiles: `pc` (all SDK packages incl. Android 18 canary, JDK 25 + 27, Flutter), `ci` (fr1/fr2: emulator, NDK, API 36/37, one system image, JDK 25, Gradle, Kotlin, Dart), `studio` and `studio-canary` (Android Studio zips, no installer: `--profile pc,studio`).
- SDK packages go through `sdkmanager` (run through `java` directly, `cmd /c` splits package paths on `;`). If `dl.google.com` answers 404 (seen from fr1 on 2026-11-14), the installer switches to the `edgedl.me.gvt1.com/edgedl/android/repository/` mirror and unpacks archives itself (sha1 checked). `ANDROID_MIRROR=1|0` forces it.
- Bump procedure: edit `android.toml`, `bun scripts/android-setup.ts lock` (fails when a pinned revision is no longer the repository's stable one), `install`, `check`.

## AVD (no manual state)

`install` recreates AVD `ay-x64` (system image `emulator_api_image` in the manifest, pixel_6, 3 GB RAM, 4 cores) on every run; nothing else survives or is needed across reboot. The emulator is started on demand by `scripts/android-x64.ts`:

```sh
emulator -avd ay-x64 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on -read-only
```

Requires `/dev/kvm` (present on fr1 and fr2).

## Monorepo on x86_64-linux-android

```sh
. ~/.local/share/ay/android/android.env.sh                       # ANDROID_NDK_HOME, PATH to NDK clang, CC_/AR_/CARGO_TARGET_*_LINKER
make -C src android-x64                                          # libaysys.so + ay_smoke, NDK clang --target=x86_64-linux-android29
cargo test -p aphrody-env --target x86_64-linux-android -Zbuild-std=std,panic_abort --no-run
just android-x64                                                 # all of the above on fr1 + emulator boot + adb run (proof in target/android-x64/proof.txt)
```

`.cargo/config.toml` sets `[target.x86_64-linux-android] linker = "x86_64-linux-android29-clang"`, found on `PATH` (or `CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER`); no user path is hard-coded. The Chromium toolchain ships no std for the target, hence `-Zbuild-std`. Compiles run on fr1, never on the PC. See `PROOF-x64.md` for the last run.

## Skills

Official skills come from `android/skills` through `bun packages/ai-os/src/google/absorb.ts skills --write` into `.agents/skills/android-*` (single source); `android skills list` and `android skills find` show what the CLI itself offers.
