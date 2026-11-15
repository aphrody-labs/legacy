// Android control APK; the SDKs/JDK remain explicit dependencies of the host.
import { join } from "node:path";
const sdk = Bun.env.ANDROID_HOME ?? join(Bun.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const ndk = Bun.env.NDK_HOME;
const java = Bun.env.JAVA_HOME;
if (!ndk || !java) throw Error("Set NDK_HOME and JAVA_HOME; ANDROID_HOME can customize the SDK");
const release = Bun.argv.includes("--release");
const cible = Bun.argv.slice(2).find((a) => !a.startsWith("--")) ?? "aarch64";
if (!["aarch64", "x86_64"].includes(cible)) throw Error("Android target: aarch64 or x86_64");
const racine = Bun.fileURLToPath(new URL("../", import.meta.url));
const gnu = join(
  Bun.env.USERPROFILE ?? "",
  ".rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/self-contained",
);
const environnement = Object.fromEntries(Object.entries(Bun.env).filter(([k]) => k.toLowerCase() !== "path"));
const processus = Bun.spawn(
  ["cargo", "tauri", "android", "build", ...(release ? [] : ["--debug"]), "--apk", "--target", cible],
  {
    cwd: join(racine, "apps/desktop/src-tauri"),
    env: {
      ...environnement,
      ANDROID_HOME: sdk,
      NDK_HOME: ndk,
      JAVA_HOME: java,
      CARGO_BUILD_JOBS: Bun.env.CARGO_BUILD_JOBS ?? "2",
      ...(process.platform === "win32"
        ? { RUSTUP_TOOLCHAIN: "stable-x86_64-pc-windows-gnu", Path: `${gnu};${Bun.env.PATH ?? Bun.env.Path}` }
        : { PATH: Bun.env.PATH }),
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (await processus.exited) throw Error("Android build failed");
const apk = join(
  racine,
  `apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/${release ? "release/app-universal-release-unsigned.apk" : "debug/app-universal-debug.apk"}`,
);
const destination = join(racine, `dist/mobile/android/auto-${release ? "release-unsigned" : "debug"}.apk`);
await Bun.write(destination, Bun.file(apk));
await Bun.write(
  `${destination}.sha256`,
  new Bun.CryptoHasher("sha256").update(await Bun.file(destination).bytes()).digest("hex") +
    `  auto-${release ? "release-unsigned" : "debug"}.apk\n`,
);
console.log(
  "Control APK and fingerprint: dist/mobile/android; AUTO_INSTANCE_URL chooses the instance at build time",
);
