// Android x86_64 proof: setup SDK, build libaysys.so + native smoke test + a Rust test binary with the NDK, boot a headless
// KVM emulator, push, run, collect output. CI-ready: exit code 0 only if every device-side run passes.
// On Windows it delegates to fr1 over ssh (builds never run on the PC). On Linux it runs in place.
// Env: AY_ANDROID_HOST (default "vps"), AY_ANDROID_RUST_CRATE (default aphrody-env), AY_ANDROID_BOOT_TIMEOUT_S (default 420).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

if (platform() === "win32") {
  const host = process.env.AY_ANDROID_HOST ?? "vps";
  const remote = `git -C /srv/src fetch -q --no-recurse-submodules origin main && git -C /srv/src merge -q --ff-only FETCH_HEAD && bun /srv/src/scripts/android-x64.ts`;
  const p = Bun.spawn(["ssh", host, `timeout 2400 sh -c '${remote}'`], { stdout: "inherit", stderr: "inherit" });
  process.exit(await p.exited);
}

const sh = async (script: string, quiet = false) => {
  const p = Bun.spawn(["bash", "-lc", script], { cwd: ROOT, stdout: quiet ? "pipe" : "inherit", stderr: quiet ? "pipe" : "inherit" });
  const out = quiet ? (await new Response(p.stdout as ReadableStream).text()) + (await new Response(p.stderr as ReadableStream).text()) : "";
  return { code: await p.exited, out };
};
const ENV = `. ${homedir()}/.local/share/ay/android/android.env.sh`;
const OUT = join(ROOT, "target/android-x64");
const log: string[] = [];
const say = (s: string) => {
  console.log(s);
  log.push(s);
};
const must = async (title: string, script: string) => {
  say(`== ${title}`);
  const r = await sh(`${ENV} 2>/dev/null; ${script}`);
  if (r.code !== 0) {
    say(`FAIL ${title} (exit ${r.code})`);
    process.exit(1);
  }
};
mkdirSync(OUT, { recursive: true });

await must("setup", `bun scripts/android-setup.ts install --profile ci && bun scripts/android-setup.ts check --profile ci`);
await must("versions", `echo "NDK=$ANDROID_NDK_HOME"; clang --version | head -1; $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/clang --version | head -1; java -version 2>&1 | head -1; adb version | head -1; emulator -version 2>/dev/null | head -2`);
await must("libaysys.so + ay_smoke (NDK clang, x86_64-linux-android)", `make -C src android-x64 && file target/sys/android-x86_64/libaysys.so target/sys/android-x86_64/ay_smoke 2>/dev/null; true`);
const crate = process.env.AY_ANDROID_RUST_CRATE ?? "aphrody-env";
await must(
  `rust tests ${crate} (x86_64-linux-android, -Zbuild-std)`,
  `cargo +chromium-157 test -p ${crate} --target x86_64-linux-android -Zbuild-std=std,panic_abort --no-run --message-format=json 2>target/android-x64/cargo.err | jaq -r 'select(.executable != null) | .executable' > target/android-x64/rust-tests.txt && cat target/android-x64/rust-tests.txt`,
);

await must("compose shell app (gradle assembleDebug, AGP 9.5.1 / Kotlin 2.4.21 / Compose BOM 2026.09.00)", `cd apps/android-shell && gradle --no-daemon --console=plain -q :app:assembleDebug 2>&1 | tail -30; test -f app/build/outputs/apk/debug/app-debug.apk && ls -l app/build/outputs/apk/debug/app-debug.apk`);

say("== emulator");
const avd = "ay-x64";
await sh(`${ENV}; adb kill-server >/dev/null 2>&1; pkill -f 'qemu-system-x86_64.*${avd}' ; true`);
const emu = Bun.spawn(
  ["bash", "-lc", `${ENV}; exec emulator -avd ${avd} -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on -no-metrics -read-only > ${OUT}/emulator.log 2>&1`],
  { stdout: "ignore", stderr: "ignore" },
);
const deadline = Date.now() + Number(process.env.AY_ANDROID_BOOT_TIMEOUT_S ?? 420) * 1000;
let booted = false;
while (Date.now() < deadline) {
  const r = await sh(`${ENV}; timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r'`, true);
  if (r.out.trim() === "1") {
    booted = true;
    break;
  }
  await Bun.sleep(5000);
}
if (!booted) {
  say("FAIL emulator did not boot; tail of emulator.log:");
  say((await sh(`tail -20 ${OUT}/emulator.log`, true)).out);
  emu.kill();
  process.exit(1);
}
say("booted");
const dev = (await sh(`${ENV}; for p in ro.build.version.release ro.build.version.sdk ro.build.version.codename ro.product.cpu.abi ro.product.model ro.build.fingerprint; do echo "$p=$(adb shell getprop $p | tr -d '\\r')"; done; adb shell uname -a | tr -d '\\r'; adb shell getconf PAGE_SIZE | tr -d '\\r'`, true)).out.trim();
say(dev);

let failed = false;
const run = async (title: string, script: string) => {
  say(`== ${title}`);
  const r = await sh(`${ENV}; ${script}`, true);
  say(r.out.trim());
  say(`exit=${r.code}`);
  if (r.code !== 0) failed = true;
};
const D = "/data/local/tmp/ay";
const adbRun = (c: string) => `out=$(adb shell "${c}; echo rc=\\$?" | tr -d '\\r'); echo "$out"; echo "$out" | rg -q '^rc=0$'`;
await run("push + run ay_smoke (links libaysys.so)", `adb shell mkdir -p ${D} && adb push target/sys/android-x86_64/libaysys.so target/sys/android-x86_64/ay_smoke ${D}/ >/dev/null && ${adbRun(`cd ${D} && LD_LIBRARY_PATH=${D} ./ay_smoke`)}`);
const tests = existsSync(`${OUT}/rust-tests.txt`) ? (await Bun.file(`${OUT}/rust-tests.txt`).text()).trim().split("\n").filter(Boolean) : [];
for (const t of tests) {
  const name = t.split("/").pop()!;
  await run(`push + run rust test ${name}`, `adb push ${t} ${D}/${name} >/dev/null && ${adbRun(`cd ${D} && chmod +x ./${name} && ./${name}`)}`);
}
await run(
  "install + launch Compose shell app, screenshot and layout",
  `adb install -r apps/android-shell/app/build/outputs/apk/debug/app-debug.apk && adb shell am start -W -n dev.aphrody.shell/.MainActivity && sleep 6 && adb exec-out screencap -p > ${OUT}/shell.png && (command -v android >/dev/null && android layout --pretty > ${OUT}/layout.json 2>${OUT}/layout.err || adb exec-out uiautomator dump /dev/tty > ${OUT}/layout.xml) ; ls -l ${OUT}/shell.png; (rg -o 'FNV-1a64[^"]*|ABI v[0-9]+|cpu: [^"]*' ${OUT}/layout.json ${OUT}/layout.xml 2>/dev/null | sort -u); adb logcat -d -s AndroidRuntime:E | tail -5; rg -q 'FNV-1a64' ${OUT}/layout.json ${OUT}/layout.xml`,
);
await sh(`${ENV}; adb exec-out screencap -p > ${OUT}/screen.png; adb shell dumpsys window | rg -m3 'mCurrentFocus|mFocusedApp' > ${OUT}/focus.txt; true`, true);
await sh(`${ENV}; adb emu kill >/dev/null 2>&1; true`, true);
emu.kill();
writeFileSync(`${OUT}/proof.txt`, log.join("\n") + "\n");
say(failed ? "RESULT FAIL" : "RESULT OK");
process.exit(failed ? 1 : 0);
