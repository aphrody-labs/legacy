# Android toolchain and x86_64 proof. Manifest: build/android/android.toml. Docs: docs/native/android/.

# Install/verify the pinned Android toolchain on this host (downloads only; profile pc on Windows, ci on Linux)
[group('android')]
android-setup *args:
    bun scripts/android-setup.ts install {{args}}

# Verify installed revisions against the manifest and the repository lock
[group('android')]
android-check *args:
    bun scripts/android-setup.ts check {{args}}

# Rewrite build/android/android.lock.json from the repository XML (after bumping android.toml)
[group('android')]
android-lock:
    bun scripts/android-setup.ts lock

# Build for x86_64-linux-android on fr1, boot a headless KVM emulator, run the binaries (proof in target/android-x64/proof.txt)
[group('android')]
android-x64:
    bun scripts/android-x64.ts
