#!/usr/bin/env bun
// Resync the absorbed EpicGames/lore tree from the aphrody-labs/lore fork (rebased on upstream main).
// One entry point: tools/labs-scripts/absorb-lore.sh (wrapper of this file).
//
//   upstream lore            -> src/lore            (root crate: src/, tests/, examples/, Cargo.toml)
//   upstream lore-<name>     -> src/lore/<name>
//   lore-integration-tests   -> test/lore
//   upstream docs            -> docs/lore
//   upstream tooling (scripts, contrib, notices, mkdocs, pyproject, ...) -> tools/lore
//
// These paths are upstream mirrors: never edit them by hand. Everything the monorepo needs on top of
// upstream is a rule in this file (manifest rewrite, layout paths, newer root dependencies), so the
// next resync re-applies it. Each mirrored root gets an UPSTREAM file (read by scripts/topology.ts and
// the first-party audit) and src/lore/DEPS.rules carries the same pin in its header.
//
// Usage: bun tools/labs-scripts/absorb-lore.ts [--ref <sha>] [--from <extracted dir>] [--no-sync] [--keep-tmp]
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..").replaceAll("\\", "/");
const args = Bun.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const FORK = "aphrody-labs/lore";
const UPSTREAM = "EpicGames/lore";

const sh = (cmd: string[], cwd?: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
};
const ghJson = (path: string) => JSON.parse(sh(["gh", "api", path]));

// --- Resolve and fetch the tree.
let sha = opt("--ref") ?? "";
let date = "";
let src = opt("--from") ?? "";
let tmp = "";
if (!src) {
  if (!args.includes("--no-sync")) {
    try {
      sh(["gh", "repo", "sync", FORK, "--branch", "main"]);
    } catch (e) {
      console.warn(`warn: fork sync failed (${(e as Error).message}); using the fork as it stands`);
    }
  }
  const head = ghJson(`repos/${FORK}/commits/${sha || "main"}`);
  sha = head.sha;
  date = head.commit.committer.date;
  const up = ghJson(`repos/${UPSTREAM}/commits/main`);
  if (up.sha !== sha) console.warn(`warn: fork ${sha.slice(0, 8)} is not upstream main ${up.sha.slice(0, 8)} (${up.commit.committer.date})`);
  tmp = mkdtempSync(join(tmpdir(), "absorb-lore-"));
  const tgz = join(tmp, "src.tgz");
  const dl = Bun.spawnSync(["gh", "api", `repos/${FORK}/tarball/${sha}`], { stdout: Bun.file(tgz), stderr: "pipe" });
  if (dl.exitCode !== 0) throw new Error(`tarball: ${dl.stderr.toString()}`);
  src = join(tmp, "x");
  mkdirSync(src);
  sh(["tar", "-xzf", tgz, "-C", src, "--strip-components=1"]);
}
src = src.replaceAll("\\", "/");
if (!sha) sha = "unknown";

// --- Layout.
const SUBCRATES = readdirSync(src)
  .filter((d) => d.startsWith("lore-") && existsSync(join(src, d, "Cargo.toml")))
  .map((d) => d.slice("lore-".length));
const dirOf = (name: string) => (name === "lore" ? "src/lore" : name === "integration-tests" ? "test/lore" : `src/lore/${name}`);
const crateName = (n: string) => (n === "lore" ? "lore" : `lore-${n}`);
const allCrates = ["lore", ...SUBCRATES];

// --- Root dependency table (the workspace pins newer versions than upstream; members inherit them).
const rootToml = Bun.TOML.parse(readFileSync(join(root, "Cargo.toml"), "utf8")) as any;
const rootDeps = rootToml.workspace.dependencies as Record<string, unknown>;
const upRoot = readFileSync(join(src, "Cargo.toml"), "utf8");
const upToml = Bun.TOML.parse(upRoot) as any;
const upVersion = upToml.workspace.package.version as string;
const lintsText = (() => {
  const a = upRoot.indexOf("[workspace.lints.rust]");
  const b = upRoot.indexOf("[workspace.dependencies]");
  return upRoot.slice(a, b).replaceAll("[workspace.lints.", "[lints.").replaceAll("\r\n", "\n").trimEnd() + "\n";
})();
const missingRoot = Object.keys(upToml.workspace.dependencies).filter((k) => !(k in rootDeps) && !k.startsWith("lore"));
if (missingRoot.length) console.warn(`warn: workspace.dependencies missing in the root Cargo.toml: ${missingRoot.join(", ")}`);

// --- Manifest rewrite (line based: upstream comments and layout survive).
function rewriteManifest(name: string, text: string): string {
  const pkgName = name === "lore" ? "aphrody-lore" : `aphrody-lore-${name === "integration-tests" ? "integration-tests" : name}`;
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const out: string[] = [];
  let section = "";
  let sawLib = false;
  let libNamed = false;
  const libName = (name === "lore" ? "lore" : `lore_${name.replaceAll("-", "_")}`);
  const inDeps = () => /^(target\..*\.)?(dev-|build-)?dependencies$/.test(section);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]!;
    const hdr = l.match(/^\[(.+?)\]\s*$/);
    if (hdr) {
      if (section === "lib" && !libNamed) out.splice(out.length - 0, 0, `name = "${libName}"`);
      section = hdr[1]!;
      if (section === "lib") sawLib = true;
      libNamed = false;
      if (section === "lints") {
        // [lints] workspace = true -> upstream's workspace lint tables, inline.
        i++;
        while (i < lines.length && !/^\[/.test(lines[i]!)) i++;
        i--;
        out.push(lintsText.trimEnd());
        section = "lints";
        continue;
      }
    }
    if (section === "package") {
      if (/^name\s*=/.test(l)) {
        out.push(`repository.workspace = true`, `description = "Lore version control: ${crateName(name)} (absorbed from Epic Games Lore, MIT)"`, `license = "MIT"`, `name = "${pkgName}"`);
        continue;
      }
      if (/^publish\s*=\s*false/.test(l)) continue;
      if (/^version\.workspace\s*=\s*true/.test(l)) l = `version = "${upVersion}"`;
      if (/^description\s*=/.test(l)) {
        // keep upstream's own description over ours
        const k = out.findIndex((x) => x.startsWith("description = \"Lore version control:"));
        if (k >= 0) out.splice(k, 1);
      }
    }
    if (section === "lib" && /^name\s*=/.test(l)) libNamed = true;
    if (inDeps()) {
      l = rewriteDep(l);
    } else if (/^\[(dependencies|dev-dependencies|build-dependencies)\./.test("[" + section + "]")) {
      // table-form dependency headers are not used upstream
    }
    out.push(l);
  }
  let res = out.join("\n");
  if (!sawLib) {
    // Package renamed: pin the library name the sources import.
    const bin = /\n\[\[?(bin|example|test|features|dependencies)\]?/.exec(res);
    const at = res.search(/\n\[features\]|\n\[dependencies\]/);
    if (name !== "integration-tests" && at >= 0) res = res.slice(0, at) + `\n[lib]\nname = "${libName}"\n` + res.slice(at);
    void bin;
  }
  return res;
}

// A dependency line: lore-* path deps get the new path and package; versioned deps the root pin.
function rewriteDep(l: string): string {
  const m = l.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
  if (!m) return l;
  const [, key, rest] = m as unknown as [string, string, string];
  const pathM = rest.match(/path\s*=\s*"([^"]+)"/);
  if (/^lore(-[a-z-]+)?$/.test(key) || (pathM && /lore/.test(pathM[1]!))) {
    if (!pathM) return l;
    const p = pathM[1]!;
    const target = p === "." ? "." : p.replace(/^\.\.\/lore-/, "../").replace(/^\.\.\/lore$/, "..");
    const pk = p === "." ? pkgOfSelf : "aphrody-" + (p.endsWith("/lore") || p === "../lore" ? "lore" : "lore-" + p.split("/").pop()!.replace(/^lore-/, ""));
    let r = rest.replace(/path\s*=\s*"[^"]+"/, `path = "${target}"`);
    if (!/package\s*=/.test(r)) r = r.replace(/\s*\}\s*$/, `, package = "${pk}" }`);
    else r = r.replace(/package\s*=\s*"[^"]+"/, `package = "${pk}"`);
    return `${key} = ${r}`;
  }
  if (/workspace\s*=\s*true/.test(rest) || /path\s*=/.test(rest) || /git\s*=/.test(rest)) return l;
  const inlineVersion = /^"[^"]*"\s*(#.*)?$/.test(rest) || /version\s*=\s*"/.test(rest);
  if (!inlineVersion) return l;
  const depName = (rest.match(/package\s*=\s*"([^"]+)"/)?.[1]) ?? key;
  if (!(depName in rootDeps)) {
    console.warn(`warn: ${key} stays on the upstream inline version (not in the root workspace.dependencies)`);
    return l;
  }
  // Keep every key except version; `default-features = false` is the root entry's business.
  const extra: string[] = [];
  if (rest.startsWith("{")) {
    const inner = rest.replace(/^\{\s*/, "").replace(/\s*\}\s*(#.*)?$/, "");
    for (const part of splitTop(inner)) {
      if (/^version\s*=/.test(part) || /^default-features\s*=/.test(part)) continue;
      extra.push(part);
    }
  }
  return `${key} = { workspace = true${extra.length ? ", " + extra.join(", ") : ""} }`;
}
let pkgOfSelf = "";

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "", q = false;
  for (const c of s) {
    if (c === '"') q = !q;
    if (!q && (c === "[" || c === "{")) depth++;
    if (!q && (c === "]" || c === "}")) depth--;
    if (!q && depth === 0 && c === ",") (parts.push(cur.trim()), (cur = ""));
    else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// --- Layout rewrites inside sources (upstream paths assume lore-<name> siblings at the repository root).
const TEXT_EXT = /\.(rs|toml|proto|md)$/;
function layoutRewrite(name: string, rel: string, text: string): string {
  let t = text;
  if (name !== "lore" && name !== "integration-tests") t = t.replaceAll('include!("../build-helper.rs")', 'include!("../../build-helper.rs")');
  if (name === "capi") {
    t = t.replace(/"\.\.\/lore\/src\/\*\*\/\*\.rs"/g, '"../src/**/*.rs"').replace(/"\.\.\/lore-([a-z-]+)\/src\/\*\*\/\*\.rs"/g, '"../$1/src/**/*.rs"');
    t = t.replace('format!("{crate_dir}{path_sep}..{path_sep}lore")', 'format!("{crate_dir}{path_sep}..")');
  }
  if (name === "server" && rel === "build.rs") t = t.replaceAll("../lore-proto/proto", "../proto/proto");
  if (name === "lore" && rel.startsWith("tests/state_scenarios")) t = t.replaceAll("../../../lore-revision/", "../../revision/");
  return t;
}

// --- Compat rules: newer root dependencies than the ones upstream builds against.
type Rule = { file: RegExp; from: string | RegExp; to: string; why: string };
const COMPAT: Rule[] = [
  { file: /\.rs$/, from: /^(\s*)use rand::Rng;$/gm, to: "$1use rand::RngExt;", why: "rand 0.10: the extension trait is RngExt" },
  { file: /\.rs$/, from: "#[ctor::ctor]", to: "#[ctor::ctor(unsafe)]", why: "ctor 1.0 requires the unsafe marker" },
  { file: /\.rs$/, from: "#[ctor::dtor]", to: "#[dtor::dtor(unsafe)]", why: "ctor 1.0: dtor moved to the dtor crate" },
  { file: /^io\/src\/uring\.rs$/, from: "iovecs.0.as_ptr(),", to: "iovecs.0.as_ptr().cast(),", why: "io-uring 0.7.16 pointer types" },
  { file: /^fuse\/src\/transport\/device\.rs$/, from: /\n(\s*)FUSE_DEV_IOC_CLONE,/, to: "\n$1// glibc takes `c_ulong`, musl `c_int` (images build static musl).\n$1FUSE_DEV_IOC_CLONE as _,", why: "musl ioctl request type" },
];

// --- Copy one crate.
const KEEP = ["DEPS.rules"]; // monorepo layer file, survives a resync
const wipe = (dir: string, keepDirs: string[]) => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs)) {
    if (KEEP.includes(e) || keepDirs.includes(e)) continue;
    rmSync(join(abs, e), { recursive: true, force: true });
  }
};
const upstreamClippy = existsSync(join(src, "clippy.toml")) ? readFileSync(join(src, "clippy.toml"), "utf8") : "";
const license = readFileSync(join(src, "LICENSE"), "utf8");
const rustfmt = readFileSync(join(src, ".rustfmt.toml"), "utf8");

function walkFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replaceAll("\\", "/")]));
}

for (const n of allCrates) {
  const upDir = join(src, crateName(n));
  if (!existsSync(upDir)) continue;
  const dest = dirOf(n);
  pkgOfSelf = n === "lore" ? "aphrody-lore" : `aphrody-lore-${n}`;
  // The root crate shares its directory with the sub-crates.
  wipe(dest, n === "lore" ? [...SUBCRATES.filter((s) => s !== "integration-tests"), "DEPS.rules"] : []);
  mkdirSync(join(root, dest), { recursive: true });
  for (const rel of walkFiles(upDir)) {
    let text: Buffer | string = readFileSync(join(upDir, rel));
    const abs = join(root, dest, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    if (TEXT_EXT.test(rel)) {
      let s = (text as Buffer).toString("utf8");
      if (rel === "Cargo.toml") s = rewriteManifest(n, s);
      else s = layoutRewrite(n, rel, s);
      for (const r of COMPAT) if (r.file.test(n === "lore" ? rel : rel.startsWith("..") ? rel : `${n}/${rel}`) || r.file.test(rel)) s = typeof r.from === "string" ? s.replaceAll(r.from, r.to) : s.replace(r.from, r.to);
      text = s;
    }
    writeFileSync(abs, text);
  }
  const clippy = existsSync(join(upDir, "clippy.toml")) ? readFileSync(join(upDir, "clippy.toml"), "utf8") : upstreamClippy;
  writeFileSync(join(root, dest, "clippy.toml"), clippy);
  writeFileSync(join(root, dest, ".rustfmt.toml"), rustfmt);
  writeFileSync(join(root, dest, "LICENSE"), license);
}

// --- docs and tooling.
const replaceTree = (dst: string, from: string, keep: string[] = []) => {
  const abs = join(root, dst);
  mkdirSync(abs, { recursive: true });
  for (const e of readdirSync(abs)) if (!keep.includes(e)) rmSync(join(abs, e), { recursive: true, force: true });
  cpSync(from, abs, { recursive: true });
};
replaceTree("docs/lore", join(src, "docs"));
const TOOLS = ["scripts", "contrib", "notices", "mkdocs.yml", "pyproject.toml", "pyrightconfig.json", "about.toml", ".pre-commit-clippy.py", ".vale.ini", ".markdownlint-cli2.jsonc"];
const toolsAbs = join(root, "tools/lore");
mkdirSync(toolsAbs, { recursive: true });
for (const e of readdirSync(toolsAbs)) rmSync(join(toolsAbs, e), { recursive: true, force: true });
for (const t of TOOLS) if (existsSync(join(src, t))) cpSync(join(src, t), join(toolsAbs, t), { recursive: true });
// Nested Rust workspaces with their own Cargo.lock (not members, not built here) and uv.lock (the root uv.lock owns Python).
for (const d of ["contrib/aws-migrate-0.9.0", "contrib/bazel"]) rmSync(join(toolsAbs, d), { recursive: true, force: true });
{
  const f = join(toolsAbs, "pyproject.toml");
  let s = readFileSync(f, "utf8");
  s = s.replace(/"pyright>=[^"]*"/, '"ty>=0.0.102"').replace(/^(\s*)dev = \[/m, "$1# ty (Astral, Rust) instead of pyright: the pyright wheel downloads Node through nodeenv.\n$1dev = [");
  writeFileSync(f, s);
}

// --- Single-copy side files shared with the root: build helper (src/build-helper.rs) and rustup/cargo config pieces.
writeFileSync(join(root, "src/build-helper.rs"), readFileSync(join(src, "build-helper.rs")));
if (existsSync(join(src, ".cargo/neoverse-512tvb.toml"))) writeFileSync(join(root, ".cargo/neoverse-512tvb.toml"), readFileSync(join(src, ".cargo/neoverse-512tvb.toml")));

// --- Provenance: UPSTREAM files (topology and audit read them) and the DEPS.rules header.
const pin = `repo: ${UPSTREAM}\nsha: ${sha}\ndate: ${date || "unknown"}\nvia: ${FORK}\nversion: ${upVersion}\nsync: tools/labs-scripts/absorb-lore.sh\nrole: asset and version-control layer for Unreal Engine and Bevy projects (docs/games/PLAN.md)\nedit: never by hand; add a rule to the sync script instead\n`;
for (const d of ["src/lore", "test/lore", "tools/lore", "docs/lore"]) writeFileSync(join(root, d, "UPSTREAM"), pin);
{
  const f = join(root, "src/lore/DEPS.rules");
  const body = readFileSync(f, "utf8").split("\n").filter((l) => !l.startsWith("# upstream:"));
  body.unshift(`# upstream: ${UPSTREAM}@${sha} ${date || ""} via ${FORK} (mirror, written by tools/labs-scripts/absorb-lore.sh; edit the script, not these files)`);
  writeFileSync(f, body.join("\n"));
}
if (tmp && !args.includes("--keep-tmp")) rmSync(tmp, { recursive: true, force: true });
console.log(`absorbed ${UPSTREAM}@${sha} ${date} (version ${upVersion}) into src/lore, test/lore, tools/lore, docs/lore`);
