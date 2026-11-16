#!/usr/bin/env bun
// The Chromium pin is one variable: the `third_party/chromium/src` entry of src.lock.json (commit, version,
// gclient solution). `use` moves src to another version and rewrites everything derived from it.
//   bun scripts/chromium.ts version                  pinned version (read by the factory deploy, CI, just)
//   bun scripts/chromium.ts use <spec> [flags]       spec = x.y.z.w | milestone | stable|beta|dev|canary | newest | pin
//        --no-sync       skip `ay gclient sync` and the hooks (checkout and derived files only)
//        --no-toolchain  skip `bun scripts/toolchain.ts install`
//   bun scripts/chromium.ts state                    rewrite the derived files from the checkout (no checkout move)
//   bun scripts/chromium.ts check                    every reader agrees with the pin
//   bun scripts/chromium.ts gn <gn args>             the checkout's gn with the Windows host environment
// Derived from the pin: .gclient, .gclient_entries, DEPS (chromium_revision), rust-toolchain.toml (chromium-<milestone>),
// third_party/toolchain-<milestone>.toml (from the checkout's clang and rust revisions). Builds run on fr1.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const root = join(import.meta.dir, "..");
const wrapper = join(root, "third_party/chromium");
const src = join(wrapper, "src");
const KEY = "third_party/chromium/src";
const URL = "https://chromium.googlesource.com/chromium/src.git";
const lockPath = join(root, "src.lock.json");
const exe = process.platform === "win32" ? ".exe" : "";
const VER = /^\d+\.\d+\.\d+\.\d+$/;

type Pin = { commit: string; version: string; gclient: { name: string; url: string; custom_deps: object; custom_vars: object } };
const pin = (): Pin => JSON.parse(readFileSync(lockPath, "utf8")).repositories[KEY];
const read = (p: string) => readFileSync(p, "utf8");
const milestone = (v: string) => v.split(".")[0];
const git = (...a: string[]) => $`git -C ${src} ${a}`.quiet();

const cmp = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

async function remoteTags(glob: string): Promise<string[]> {
  const out = await $`git ls-remote --tags --refs ${URL} ${`refs/tags/${glob}`}`.text();
  return out.split("\n").map((l) => l.split("refs/tags/")[1]).filter((t) => t && VER.test(t));
}

/** x.y.z.w, milestone (newest tag of it), channel (chromiumdash), newest (all milestones) or pin. */
async function resolve(spec: string): Promise<string> {
  if (spec === "pin") return pin().version;
  if (VER.test(spec)) return spec;
  if (/^\d+$/.test(spec)) return (await remoteTags(`${spec}.*`)).sort(cmp).at(-1) ?? fail(`no tag of milestone ${spec}`);
  if (spec === "newest") return (await remoteTags("[0-9]*")).sort(cmp).at(-1) ?? fail("no tags");
  if (/^(stable|beta|dev|canary)$/.test(spec)) {
    const ch = spec[0].toUpperCase() + spec.slice(1);
    const r = await fetch(`https://chromiumdash.appspot.com/fetch_releases?channel=${ch}&platform=Windows&num=1`);
    const v = ((await r.json()) as { version: string }[])[0]?.version;
    return v ?? fail(`chromiumdash has no ${ch} release`);
  }
  return fail(`spec "${spec}": expected x.y.z.w, a milestone, stable|beta|dev|canary, newest or pin`);
}
function fail(m: string): never {
  console.error(`chromium: ${m}`);
  process.exit(1);
}

const py = (v: unknown, ind = 0): string => {
  const pad = "  ".repeat(ind);
  if (v === true) return "True";
  if (v === false) return "False";
  if (v === null) return "None";
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${pad}  ${py(x, ind + 1)},`).join("\n")}\n${pad}]` : "[]";
  if (v && typeof v === "object") {
    const e = Object.entries(v);
    return e.length ? `{\n${e.map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${py(x, ind + 1)},`).join("\n")}\n${pad}}` : "{}";
  }
  return JSON.stringify(v);
};

/** .gclient from the lock's solution. No cache_dir: depot_tools and `ay gclient` read $GIT_CACHE_PATH. */
function writeGclient(p: Pin) {
  writeFileSync(join(wrapper, ".gclient"), `solutions = ${py([p.gclient ?? { name: "src", url: URL, custom_deps: {}, custom_vars: {} }])}\n`);
}

/** .gclient_entries as gclient writes it, from `ay gclient revinfo`; the other state files are gclient's own cache. */
async function writeEntries() {
  const lines = (await $`ay gclient revinfo`.cwd(wrapper).text()).split("\n").filter((l) => l.includes(": "));
  const body = lines.map((l) => {
    const i = l.indexOf(": ");
    return `  '${l.slice(0, i)}': '${l.slice(i + 2)}',`;
  });
  writeFileSync(join(wrapper, ".gclient_entries"), `entries = {\n${body.join("\n")}\n}\n`);
  rmSync(join(wrapper, ".gclient_previous_sync_commits"), { force: true });
}

const pyConst = (file: string, name: string) => new RegExp(`^${name} = '?([^'\\s#]+)`, "m").exec(read(join(src, file)))?.[1] ?? fail(`${name} not found in ${file}`);

/** toolchain-<milestone>.toml from the checkout's update.py revisions, hashed from Chromium's public bucket. */
async function genToolchain(version: string, path: string) {
  const clang = pyConst("tools/clang/scripts/update.py", "CLANG_REVISION");
  const csub = pyConst("tools/clang/scripts/update.py", "CLANG_SUB_REVISION");
  const rust = pyConst("tools/rust/update_rust.py", "RUST_REVISION");
  const rsub = pyConst("tools/rust/update_rust.py", "RUST_SUB_REVISION");
  const [m, llvm] = [milestone(version), /^llvmorg-(\d+)-/.exec(clang)?.[1] ?? "0"];
  const hash = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) fail(`${url}: HTTP ${r.status}`);
    const h = new Bun.CryptoHasher("sha256");
    let size = 0;
    for await (const c of r.body!) (h.update(c), (size += c.length));
    return { sha: h.digest("hex"), size };
  };
  const sfx = `${clang}-${csub}`;
  const pk = [
    ["linux-x64", "Linux_x64", [`clang-${sfx}`, `llvm-code-coverage-${sfx}`, `llvmobjdump-${sfx}`, `clang-tidy-${sfx}`, `rust-toolchain-${rust}-${rsub}-${clang}`]],
    ["windows-x64", "Win", [`clang-${sfx}`, `llvm-code-coverage-${sfx}`, `llvmobjdump-${sfx}`, `clang-tidy-${sfx}`, `rust-toolchain-${rust}-${rsub}-${clang}`]],
  ] as const;
  const files = await Promise.all(
    pk.flatMap(([platform, dir, names]) =>
      names.map(async (package_) => {
        const source_url = `https://commondatastorage.googleapis.com/chromium-browser-clang/${dir}/${package_}.tar.xz`;
        const { sha, size } = await hash(source_url);
        return { platform, package_, source_url, size, sha };
      }),
    ),
  );
  const t = [
    `# Toolchain Chromium ${m} (${version}). Generated by \`bun scripts/chromium.ts\` from tools/clang/scripts/update.py and`,
    `# tools/rust/update_rust.py of the checkout; sha256 of the public bucket's .tar.xz (no R2 repack: add r2_key/blake3 when published).`,
    `# \`bun scripts/toolchain.ts\` picks the toolchain-<milestone>.toml that rust-toolchain.toml names.`,
    ``,
    `[toolchain]`,
    `chromium = "${version}"`,
    `clang_revision = "${clang}"`,
    `clang_sub_revision = ${csub}`,
    `rust_revision = "${rust}"`,
    `rust_sub_revision = ${rsub}`,
    `clang_version = "clang version ${llvm}.0.0git (https://chromium.googlesource.com/a/external/github.com/llvm/llvm-project ${/-g([0-9a-f]+)$/.exec(clang)?.[1]})"`,
    `rustc_version = "rustc ${rust.slice(0, 9)}"`,
    `llvm_version = "${llvm}.0.0"`,
    ``,
    ...files.flatMap((f) => [`[[file]]`, `platform = "${f.platform}"`, `package = "${f.package_}"`, `size = ${f.size}`, `source_url = "${f.source_url}"`, `source_size = ${f.size}`, `source_sha256 = "${f.sha}"`, ``]),
  ];
  writeFileSync(path, t.join("\n"));
  console.log(`toolchain-${m}.toml generated (${files.length} packages)`);
}

/** Rewrite everything derived from the checkout: lock entry, DEPS, rust-toolchain.toml, toolchain manifest, gclient files. */
async function state() {
  const vf = read(join(src, "chrome/VERSION"));
  const v = ["MAJOR", "MINOR", "BUILD", "PATCH"].map((k) => new RegExp(`^${k}=(\\d+)`, "m").exec(vf)![1]).join(".");
  const commit = (await git("rev-parse", "HEAD").text()).trim();
  const p = pin();
  const g = { name: p.gclient?.name ?? "src", url: p.gclient?.url ?? URL, custom_deps: p.gclient?.custom_deps ?? {}, custom_vars: p.gclient?.custom_vars ?? {} };
  // src.lock.json: text edit of the one entry, the rest of the file stays as the formatter wrote it.
  const lock = read(lockPath);
  const block = new RegExp(`    "${KEY}": \\{[\\s\\S]*?\\n    \\},\\n`);
  const entry = [
    `    "${KEY}": {`,
    `      "path": "${KEY}",`,
    `      "url": "${URL}",`,
    `      "commit": "${commit}",`,
    `      "branch": "detached",`,
    `      "engine": "git",`,
    `      "pillar": "chromium",`,
    `      "remotes": {`,
    `        "origin": "${URL}"`,
    `      },`,
    `      "sparse_paths": null,`,
    `      "version": "${v}",`,
    `      "gclient": ${JSON.stringify(g, null, 2).replace(/\n/g, "\n      ").replace(/\{\n\s+\}/g, "{}")}`,
    `    },\n`,
  ].join("\n");
  if (!block.test(lock)) fail(`no ${KEY} entry in src.lock.json`);
  writeFileSync(lockPath, lock.replace(block, entry));
  const deps = join(root, "DEPS");
  writeFileSync(deps, read(deps).replace(/('chromium_revision': ')[0-9a-fA-F]+'/, `$1${commit}'`).replace(new RegExp(`('${KEY}': '[^@']+@)[0-9a-f]+'`), `$1${commit}'`));
  const rt = join(root, "rust-toolchain.toml");
  writeFileSync(rt, read(rt).replace(/^channel = "chromium-\d+"/m, `channel = "chromium-${milestone(v)}"`));
  const tm = join(root, "third_party", `toolchain-${milestone(v)}.toml`);
  const clang = pyConst("tools/clang/scripts/update.py", "CLANG_REVISION");
  const rust = pyConst("tools/rust/update_rust.py", "RUST_REVISION");
  const manifest = existsSync(tm) ? read(tm) : "";
  if (!manifest.includes(`clang_revision = "${clang}"`) || !manifest.includes(`rust_revision = "${rust}"`)) await genToolchain(v, tm);
  writeGclient({ ...p, gclient: g });
  await writeEntries();
  console.log(`pin ${v} ${commit.slice(0, 12)}; rust-toolchain chromium-${milestone(v)}; ${tm.split(/[\\/]/).pop()}`);
}

async function use(spec: string, flags: Set<string>) {
  const v = await resolve(spec);
  if ((await git("status", "--porcelain").text()).trim()) fail("src has local changes; commit or clean them first");
  const have = await git("rev-parse", "-q", "--verify", `refs/tags/${v}^{commit}`).nothrow().quiet();
  if (have.exitCode) {
    console.log(`fetch tag ${v}`);
    await $`git -C ${src} fetch --no-tags origin ${`refs/tags/${v}:refs/tags/${v}`}`;
  }
  await $`git -C ${src} -c advice.detachedHead=false checkout --detach ${`refs/tags/${v}`}`;
  writeGclient(pin());
  if (!flags.has("--no-sync")) {
    await $`ay gclient sync --apply --cipd -j 8`.cwd(wrapper);
    const cpy = join(src, "third_party/cpython3/host/bin");
    await $`ay gclient runhooks`.cwd(wrapper).env({ ...process.env, PATH: `${cpy};${join(src, "third_party/depot_tools")};${process.env.PATH}`, DEPOT_TOOLS_WIN_TOOLCHAIN: "0" });
  }
  await state();
  if (!flags.has("--no-toolchain")) await $`bun ${join(root, "scripts/toolchain.ts")} install`;
}

/** Every reader of the version against the pin. */
async function check() {
  const p = pin();
  const m = milestone(p.version);
  const vf = read(join(src, "chrome/VERSION"));
  const cur = ["MAJOR", "MINOR", "BUILD", "PATCH"].map((k) => new RegExp(`^${k}=(\\d+)`, "m").exec(vf)![1]).join(".");
  const head = (await git("rev-parse", "HEAD").text()).trim();
  const rows: [string, boolean, string][] = [
    ["checkout VERSION", cur === p.version, cur],
    ["checkout HEAD", head === p.commit, head.slice(0, 12)],
    ["DEPS chromium_revision", read(join(root, "DEPS")).includes(`'chromium_revision': '${p.commit}'`), p.commit.slice(0, 12)],
    ["rust-toolchain.toml", read(join(root, "rust-toolchain.toml")).includes(`channel = "chromium-${m}"`), `chromium-${m}`],
    ["toolchain manifest", existsSync(join(root, "third_party", `toolchain-${m}.toml`)), `toolchain-${m}.toml`],
    [".gclient url", read(join(wrapper, ".gclient")).includes(p.gclient.url), p.gclient.url],
    [".gclient no hardcoded cache", !/cache_dir/.test(read(join(wrapper, ".gclient"))), "GIT_CACHE_PATH"],
  ];
  const tmf = rows[4][1] ? read(join(root, "third_party", `toolchain-${m}.toml`)) : "";
  const clang = pyConst("tools/clang/scripts/update.py", "CLANG_REVISION");
  const rust = pyConst("tools/rust/update_rust.py", "RUST_REVISION");
  rows.push(["manifest clang/rust = checkout", tmf.includes(`"${clang}"`) && tmf.includes(`"${rust}"`), `${clang} ${rust.slice(0, 9)}`]);
  let bad = 0;
  for (const [n, ok, d] of rows) (console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${d}`), ok || bad++);
  return bad ? 1 : 0;
}

/** The checkout's gn with the host environment Chromium wants without Google's hermetic Windows toolchain. */
async function gn(args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, DEPOT_TOOLS_WIN_TOOLCHAIN: "0" };
  if (process.platform === "win32" && !env.vs2026_install) {
    const vw = join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft Visual Studio/Installer/vswhere.exe");
    const p = (await $`${vw} -latest -products * -property installationPath`.nothrow().text()).trim();
    if (p) env.vs2026_install = p;
  }
  const r = await $`${join(src, "buildtools", process.platform === "win32" ? "win" : "linux64", `gn${exe}`)} ${args}`.cwd(src).env(env).nothrow();
  return r.exitCode;
}

const [cmd = "version", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const pos = rest.filter((a) => !a.startsWith("--"));
if (cmd === "version") console.log(pin().version);
else if (cmd === "use") await use(pos[0] ?? fail("use <spec>"), flags);
else if (cmd === "state") await state();
else if (cmd === "check") process.exit(await check());
else if (cmd === "gn") process.exit(await gn(rest));
else fail(`unknown command ${cmd}`);
