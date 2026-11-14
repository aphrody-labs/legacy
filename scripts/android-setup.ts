// Reproducible Android toolchain installer. Manifest: infra/android/android.toml, lock: infra/android/android.lock.json.
// Usage: bun scripts/android-setup.ts [install|check|lock|env|avd] [--profile pc|ci|studio|studio-canary,...] [--only <substr>]
// Idempotent; Windows (PC) and Linux (fr1, fr2). Downloads and SDK installs only, nothing is compiled.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync, rmSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const MANIFEST = join(ROOT, "infra/android/android.toml");
const LOCK = join(ROOT, "infra/android/android.lock.json");
const WIN = platform() === "win32";
const HOST = WIN ? "windows" : "linux";
const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith("--")) ?? "install";
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const profiles = (opt("profile") ?? (WIN ? "pc" : "ci")).split(",");
const only = opt("only");
const want = (p?: string[]) => !p || p.some((x) => profiles.includes(x));
const sel = (n: string) => !only || n.includes(only);

const man: any = Bun.TOML.parse(readFileSync(MANIFEST, "utf8"));
const home = (p: string) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p).replaceAll("\\", "/");
const SDK = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || home(WIN ? man.meta.sdk_root_windows : man.meta.sdk_root_linux)).replaceAll("\\", "/");
const TOOLS = home(man.meta.tools_dir);
const CACHE = join(TOOLS, "cache").replaceAll("\\", "/");
const log = (...a: unknown[]) => console.log("[android-setup]", ...a);
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.error("[android-setup] FAIL", m);
};

async function run(argvv: string[], o: { env?: Record<string, string>; stdin?: string; quiet?: boolean; cwd?: string } = {}) {
  const p = Bun.spawn(argvv, {
    env: { ...process.env, ...o.env } as Record<string, string>,
    stdin: o.stdin !== undefined ? new Blob([o.stdin]) : "ignore",
    stdout: o.quiet ? "pipe" : "inherit",
    stderr: o.quiet ? "pipe" : "inherit",
    cwd: o.cwd,
  });
  const out = o.quiet ? await new Response(p.stdout as ReadableStream).text() : "";
  const code = await p.exited;
  return { code, out };
}

async function sha(path: string, algo: "sha256" | "sha1") {
  const h = new Bun.CryptoHasher(algo);
  for await (const c of Bun.file(path).stream()) h.update(c);
  return h.digest("hex");
}

async function fetchTo(url: string, dest: string, sum?: string, algo: "sha256" | "sha1" = "sha256") {
  if (existsSync(dest) && sum && (await sha(dest, algo)) === sum) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  log("download", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  await Bun.write(dest, r);
  if (sum) {
    const got = await sha(dest, algo);
    if (got !== sum) {
      rmSync(dest);
      throw new Error(`${url}: ${algo} ${got} != pinned ${sum}`);
    }
  }
  return dest;
}

async function extract(archive: string, dir: string) {
  mkdirSync(dir, { recursive: true });
  const zip = archive.endsWith(".zip");
  const argvv = WIN || !zip ? ["tar", "-xf", archive, "-C", dir] : ["unzip", "-q", "-o", archive, "-d", dir];
  const r = await run(argvv);
  if (r.code !== 0) throw new Error(`extract ${archive} failed (${r.code})`);
}

const norm = (v: string) => v.replace(/(\.0)+$/, "");
const pkgDir = (path: string) => join(SDK, ...path.split(";")).replaceAll("\\", "/");
function installedRev(path: string): string | null {
  const f = join(pkgDir(path), "source.properties");
  if (!existsSync(f)) {
    const x = join(pkgDir(path), "package.xml");
    if (!existsSync(x)) return null;
    const rv = readFileSync(x, "utf8").match(/<revision>([\s\S]*?)<\/revision>/)?.[1];
    return rv ? [...rv.matchAll(/<(?:major|minor|micro)>(\d+)</g)].map((m) => m[1]).join(".") : null;
  }
  return readFileSync(f, "utf8").match(/^Pkg\.Revision=(.+)$/m)?.[1].trim() ?? null;
}

// ---- JDK ----
function jdkHome(j: any): string {
  return join(TOOLS, `jdk-${j.name}-${j.version.replace("+", "_")}`).replaceAll("\\", "/");
}
function findJavaHome(base: string): string | null {
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    const h = join(base, d);
    if (existsSync(join(h, "bin", WIN ? "java.exe" : "java"))) return h.replaceAll("\\", "/");
  }
  return null;
}
async function ensureJdk() {
  for (const j of man.jdk as any[]) {
    if (!want(j.profiles) || !sel(j.name)) continue;
    const base = jdkHome(j);
    if (findJavaHome(base)) {
      log("jdk ok", j.name, j.version);
      continue;
    }
    const a = j[HOST];
    const file = join(CACHE, a.url.split("/").pop()!).replaceAll("\\", "/");
    await fetchTo(a.url, file, a.sha256);
    await extract(file, base);
    log("jdk installed", j.name, j.version);
  }
}
function primaryJava(): string {
  const j = (man.jdk as any[]).find((x) => want(x.profiles));
  const h = j && findJavaHome(jdkHome(j));
  if (!h) throw new Error("no JDK installed for profile; run install");
  return h;
}

// ---- SDK ----
// cmdline-tools are run through java directly: cmd /c splits package paths on ';'.
const cltool = (main: string, args: string[], o: { stdin?: string; quiet?: boolean } = {}) => {
  const home = join(SDK, "cmdline-tools/latest").replaceAll("\\", "/");
  const java = join(primaryJava(), "bin", WIN ? "java.exe" : "java").replaceAll("\\", "/");
  return run([java, `-Dcom.android.sdkmanager.toolsdir=${home}`, "-classpath", `${home}/lib/*`, main, ...args], {
    env: { JAVA_HOME: primaryJava(), ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK },
    ...o,
  });
};
const sdkRun = (args: string[], stdin?: string, quiet = false) =>
  cltool("com.android.sdklib.tool.sdkmanager.SdkManagerCli", [`--sdk_root=${SDK}`, ...args], { stdin, quiet });

// dl.google.com answers 404 for some datacenter IPs (fr1); the same files are served by edgedl.me.gvt1.com.
const DL = "https://dl.google.com/android/repository/";
const EDGE = "https://edgedl.me.gvt1.com/edgedl/android/repository/";
let mirror = false;
async function probeMirror() {
  if (process.env.ANDROID_MIRROR === "1") mirror = true;
  else if (process.env.ANDROID_MIRROR === "0") mirror = false;
  else mirror = (await fetch(man.meta.sdk_xml, { method: "HEAD" }).catch(() => null))?.status !== 200;
  if (mirror) log("dl.google.com unreachable here, using", EDGE);
}
async function xmlPackages() {
  const urls: string[] = [man.meta.sdk_xml, ...man.meta.sysimg_xml].map((u) => (mirror ? u.replace(DL, EDGE) : u));
  const res: Record<string, any> = {};
  for (const u of urls) {
    const t = await (await fetch(u)).text();
    const ns = t.match(/<(?:sdk|sys-img):sdk[a-z-]*\s([^>]*)>/)?.[1] ?? "";
    const base = u.slice(0, u.lastIndexOf("/") + 1);
    for (const m of t.matchAll(/<remotePackage path="([^"]+)"[^>]*>([\s\S]*?)<\/remotePackage>/g)) {
      if (res[m[1]] || m[2].match(/<channelRef ref="([^"]+)"/)?.[1] !== "channel-0") continue;
      const archives = [...m[2].matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map((a) => a[1]);
      const pick = archives.find((a) => new RegExp(`<host-os>${HOST}</host-os>`).test(a)) ?? archives.find((a) => !/<host-os>/.test(a));
      if (!pick) continue;
      const rev = [...m[2].match(/<revision>([\s\S]*?)<\/revision>/)![1].matchAll(/<(major|minor|micro)>(\d+)</g)].map((x) => x[2]).join(".");
      res[m[1]] = {
        sha1: pick.match(/<checksum type="sha1">(\w+)</)![1],
        size: Number(pick.match(/<size>(\d+)</)![1]),
        url: base + pick.match(/<url>([^<]+)</)![1],
        rev,
        ns,
        td: m[2].match(/<type-details[\s\S]*?<\/type-details>|<type-details[^>]*\/>/)?.[0] ?? "",
        revXml: m[2].match(/<revision>[\s\S]*?<\/revision>/)![0],
        dn: m[2].match(/<display-name>[\s\S]*?<\/display-name>/)?.[0] ?? "",
      };
    }
  }
  return res;
}

async function cmdLock() {
  await probeMirror();
  const pk = await xmlPackages();
  const lock: Record<string, unknown> = { generated: new Date().toISOString().slice(0, 10), host: HOST, sdk: {} };
  for (const s of man.sdk as any[]) {
    const p = pk[s.path];
    if (!p) {
      fail(`lock: ${s.path} not in repository XML`);
      continue;
    }
    if (norm(p.rev) !== norm(s.rev)) fail(`lock: ${s.path} repository rev ${p.rev} != manifest ${s.rev}`);
    (lock.sdk as any)[s.path] = { rev: p.rev, sha1: p.sha1, size: p.size, url: p.url.replace(EDGE, DL) };
  }
  const prev = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : {};
  if (prev.cli) lock.cli = prev.cli;
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
  log("lock written", LOCK);
}

const viaMirror = (u: string) => (mirror ? u.replace(DL, EDGE) : u);

// Manual install (mirror mode): unzip, strip a single top-level directory like sdkmanager, write a package.xml.
async function manualInstall(path: string, e: any) {
  const file = join(CACHE, e.url.split("/").pop()).replaceAll("\\", "/");
  await fetchTo(viaMirror(e.url), file, e.sha1, "sha1");
  const tmp = join(CACHE, "x-" + path.replace(/[^\w.-]/g, "_")).replaceAll("\\", "/");
  rmSync(tmp, { recursive: true, force: true });
  await extract(file, tmp);
  const top = readdirSync(tmp);
  const src = top.length === 1 && statSync(join(tmp, top[0])).isDirectory() ? join(tmp, top[0]) : tmp;
  const dest = pkgDir(path);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  const r = await run(WIN ? ["cmd", "/c", "move", src.replaceAll("/", "\\"), dest.replaceAll("/", "\\")] : ["mv", src, dest]);
  if (r.code !== 0) throw new Error(`move ${path} failed`);
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><common:repository xmlns:common="http://schemas.android.com/repository/android/common/02" xmlns:generic="http://schemas.android.com/repository/android/generic/02" xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${e.ns.replace(/xmlns:xsi="[^"]*"/, "")}><localPackage path="${path}" obsolete="false">${e.td}${e.revXml}${e.dn}</localPackage></common:repository>`;
  writeFileSync(join(dest, "package.xml"), xml);
  rmSync(tmp, { recursive: true, force: true });
  log("manual install", path, e.rev);
}

async function ensureCmdlineTools() {
  if (installedRev("cmdline-tools;latest")) return;
  const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null;
  const pk = lock?.host === HOST ? lock.sdk : null;
  const e = pk?.["cmdline-tools;latest"] ?? (await xmlPackages())["cmdline-tools;latest"];
  const file = join(CACHE, e.url.split("/").pop()).replaceAll("\\", "/");
  await fetchTo(viaMirror(e.url), file, e.sha1, "sha1");
  const tmp = join(CACHE, "cmdline-extract").replaceAll("\\", "/");
  rmSync(tmp, { recursive: true, force: true });
  await extract(file, tmp);
  mkdirSync(join(SDK, "cmdline-tools"), { recursive: true });
  rmSync(join(SDK, "cmdline-tools/latest"), { recursive: true, force: true });
  const r = await run(WIN ? ["cmd", "/c", "move", join(tmp, "cmdline-tools").replaceAll("/", "\\"), join(SDK, "cmdline-tools/latest").replaceAll("/", "\\")] : ["mv", join(tmp, "cmdline-tools"), join(SDK, "cmdline-tools/latest")]);
  if (r.code !== 0) throw new Error("cmdline-tools move failed");
  log("cmdline-tools bootstrapped");
}

async function ensureSdk() {
  mkdirSync(SDK, { recursive: true });
  await probeMirror();
  await ensureCmdlineTools();
  if (!mirror) await sdkRun(["--licenses"], "y\n".repeat(60), true);
  const todo = (man.sdk as any[]).filter((s) => want(s.profiles) && sel(s.path) && (() => {
    const r = installedRev(s.path);
    return !r || norm(r) !== norm(s.rev);
  })());
  if (todo.length && mirror) {
    const pk = await xmlPackages();
    for (const t of todo) {
      if (!pk[t.path]) fail(`${t.path}: not in repository XML`);
      else if (norm(pk[t.path].rev) !== norm(t.rev)) fail(`${t.path}: repository rev ${pk[t.path].rev} != pinned ${t.rev}`);
      else await manualInstall(t.path, pk[t.path]);
    }
  } else if (todo.length) {
    log("sdkmanager install", todo.map((t) => t.path).join(" "));
    const r = await sdkRun(todo.map((t) => t.path), "y\n".repeat(20));
    if (r.code !== 0) fail(`sdkmanager exit ${r.code}`);
  } else log("sdk packages already at pinned revisions");
}

function verifySdk() {
  for (const s of man.sdk as any[]) {
    if (!want(s.profiles) || !sel(s.path)) continue;
    const r = installedRev(s.path);
    if (r && norm(r) === norm(s.rev)) console.log(`ok   ${s.path} ${r}`);
    else fail(`${s.path}: installed ${r ?? "missing"}, pinned ${s.rev}`);
  }
}

// ---- standalone tools ----
async function ensureTools() {
  for (const t of man.tool as any[]) {
    if (!want(t.profiles) || !sel(t.name)) continue;
    const a = t[HOST] ?? t.all;
    if (!a) continue;
    const dir = join(TOOLS, `${t.name}-${t.version}`).replaceAll("\\", "/");
    const bin = join(dir, a.bin).replaceAll("\\", "/");
    if (existsSync(bin)) {
      log("tool ok", t.name, t.version);
      continue;
    }
    const file = join(CACHE, a.url.split("/").pop()).replaceAll("\\", "/");
    await fetchTo(a.url, file, a.sha256);
    await extract(file, dir);
    if (!existsSync(bin)) fail(`${t.name}: ${a.bin} missing after extract`);
    else log("tool installed", t.name, t.version);
  }
}

async function ensureCli() {
  if (!sel("android-cli")) return;
  const dest = join(homedir(), ".local/bin", WIN ? "android.exe" : "android").replaceAll("\\", "/");
  if (existsSync(dest)) return log("android cli present", dest);
  await fetchTo(man.cli[HOST], dest);
  if (!WIN) chmodSync(dest, 0o755);
  const sum = await sha(dest, "sha256");
  const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : {};
  lock.cli = { ...(lock.cli ?? {}), [HOST]: { sha256: sum, date: new Date().toISOString().slice(0, 10) } };
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
  log("android cli installed", dest, sum);
}

// ---- env + avd ----
function ndkHome() {
  const n = (man.sdk as any[]).find((s) => s.path.startsWith("ndk;") && want(s.profiles));
  return n ? pkgDir(n.path) : "";
}
function envMap(): Record<string, string> {
  const ndk = ndkHome();
  const llvm = join(ndk, "toolchains/llvm/prebuilt", WIN ? "windows-x86_64" : "linux-x86_64", "bin").replaceAll("\\", "/");
  const api = man.meta.ndk_api;
  const sfx = WIN ? ".cmd" : "";
  const t = (n: string) => (man.tool as any[]).find((x) => x.name === n);
  const bins = ["gradle", "kotlin", "dart", "flutter"]
    .map((n) => (t(n) && want(t(n).profiles) ? dirname(join(TOOLS, `${n}-${t(n).version}`, (t(n)[HOST] ?? t(n).all).bin)).replaceAll("\\", "/") : ""))
    .filter(Boolean);
  return {
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    ANDROID_NDK_HOME: ndk,
    ANDROID_API: String(api),
    JAVA_HOME: primaryJava(),
    CC_x86_64_linux_android: `${llvm}/x86_64-linux-android${api}-clang${sfx}`,
    AR_x86_64_linux_android: `${llvm}/llvm-ar${WIN ? ".exe" : ""}`,
    CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER: `${llvm}/x86_64-linux-android${api}-clang${sfx}`,
    PATH_ADD: [join(SDK, "cmdline-tools/latest/bin"), join(SDK, "platform-tools"), join(SDK, "emulator"), llvm, ...bins].map((p) => p.replaceAll("\\", "/")).join(WIN ? ";" : ":"),
  };
}
function writeEnv() {
  const e = envMap();
  const { PATH_ADD, ...rest } = e;
  const f = join(TOOLS, WIN ? "android.env.ps1" : "android.env.sh");
  const body = WIN
    ? Object.entries(rest).map(([k, v]) => `$env:${k}='${v}'`).join("\n") + `\n$env:PATH='${PATH_ADD}'+';'+$env:PATH\n`
    : Object.entries(rest).map(([k, v]) => `export ${k}='${v}'`).join("\n") + `\nexport PATH='${PATH_ADD}':"$PATH"\n`;
  mkdirSync(TOOLS, { recursive: true });
  writeFileSync(f, body);
  log("env file", f);
  return f;
}

async function ensureAvd() {
  if (!want(["pc", "ci"]) || !sel("avd")) return;
  const img = man.meta.emulator_api_image as string;
  if (!installedRev(img)) return log("avd skipped, image not installed", img);
  const name = man.meta.avd_name;
  const args = ["create", "avd", "-n", name, "-k", img, "-d", "pixel_6", "--force"];
  const r = await cltool("com.android.sdklib.tool.AvdManagerCli", args, { stdin: "no\n", quiet: true });
  if (r.code !== 0) return fail(`avdmanager: ${r.out}`);
  const cfg = join(process.env.ANDROID_AVD_HOME || join(homedir(), ".android/avd"), `${name}.avd`, "config.ini").replaceAll("\\", "/");
  if (existsSync(cfg)) {
    let c = readFileSync(cfg, "utf8");
    for (const [k, v] of Object.entries({ "hw.ramSize": "3072", "hw.cpu.ncore": "4", "disk.dataPartition.size": "8G", "hw.keyboard": "yes" })) {
      c = new RegExp(`^${k}=`, "m").test(c) ? c.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : c + `\n${k}=${v}`;
    }
    writeFileSync(cfg, c);
  }
  log("avd", name, "->", img);
}

async function cmdLockCheck() {
  await probeMirror();
  if (!existsSync(LOCK)) return fail("no lock; run lock");
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  const pk = await xmlPackages();
  for (const [p, e] of Object.entries<any>(lock.sdk)) {
    const x = pk[p];
    if (!x) fail(`${p}: gone from repository XML`);
    else if (x.sha1 !== e.sha1 && lock.host === HOST) fail(`${p}: repository sha1 ${x.sha1} != locked ${e.sha1} (upstream changed)`);
  }
}

if (cmd === "lock") await cmdLock();
else if (cmd === "env") {
  console.log(readFileSync(writeEnv(), "utf8"));
} else if (cmd === "avd") await ensureAvd();
else if (cmd === "check") {
  verifySdk();
  await cmdLockCheck();
  for (const j of man.jdk as any[]) if (want(j.profiles) && sel(j.name)) (findJavaHome(jdkHome(j)) ? console.log(`ok   jdk ${j.name} ${j.version}`) : fail(`jdk ${j.name} missing`));
  for (const t of man.tool as any[]) {
    if (!want(t.profiles) || !sel(t.name)) continue;
    const a = t[HOST] ?? t.all;
    existsSync(join(TOOLS, `${t.name}-${t.version}`, a.bin)) ? console.log(`ok   ${t.name} ${t.version}`) : fail(`${t.name} ${t.version} missing`);
  }
} else {
  await ensureJdk();
  await ensureSdk();
  await ensureTools();
  await ensureCli();
  verifySdk();
  writeEnv();
  await ensureAvd();
}
if (failures) {
  console.error(`[android-setup] ${failures} failure(s)`);
  process.exit(1);
}
log("done", cmd, "profiles", profiles.join(","), "sdk", SDK);
