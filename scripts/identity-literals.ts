#!/usr/bin/env bun
// identity-literals: finds the literal identity names that tools/identity.toml owns, in tracked first-party files.
//
//   bun scripts/identity-literals.ts count [--root DIR] [--json]       hits per class and per kind of file
//   bun scripts/identity-literals.ts top <class> [N] [--root DIR]      files holding most hits of a class
//   bun scripts/identity-literals.ts check [--root DIR]                fail when a file holds more hits than tools/identity-baseline.json
//   bun scripts/identity-literals.ts baseline [--root DIR]             rewrite tools/identity-baseline.json from the current tree
//   bun scripts/identity-literals.ts residual --old <identity.toml> [--root DIR]
//                                                                      fail on any literal of the OLD identity left in the tree
//   bun scripts/identity-literals.ts rewrite --old <identity.toml> [--root DIR]
//                                                                      rename every literal of the OLD identity to the current one
//                                                                      (called by `identity.ts apply`; checkout paths are not rewritten, they are removed at the source)
//   bun scripts/identity-literals.ts upstream [--root DIR]             print the upstream-namespace token counts (must not move on a rename)
//
// Classes (each is derived from tools/identity.toml, never from a constant here):
//   checkout-path   C:\<repo>, C:/<repo>, /c/<repo>, /srv/<repo>, ~/<repo> (the checkout folder name must not matter)
//   product-name    the bare product name
//   npm-scope       @<product>/...
//   crate-prefix    <product>-<word>
//   c-prefix        <product>_<word> (C symbols)
//   env-prefix      <PRODUCT>_<WORD>
//   binary-call     `<binary> <subcommand>` at the start of a command
// Legitimate data, never counted: the domains and orgs of tools/identity.toml ([domains], [orgs], [contact]) and the
// upstream namespaces below. Upstream namespaces are untouchable: a rename must not change them (`upstream`).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { findRoot, loadIdentity, type Identity } from "./identity.ts";

/** Upstream and system namespaces: Windows API, ffmpeg, Linux, POSIX, GNU, Chromium and V8, upstream symbols. */
export const UPSTREAM_NAMESPACES: Record<string, RegExp> = {
  win32: /\b(win32|Win32|windows-sys|windows-rs|windows-bindgen|WinUI|Win32_[A-Za-z_]+)\b/g,
  ffmpeg: /\b(ffmpeg|ffprobe|libav(?:codec|format|util|filter|device)|libsw(?:scale|resample)|AV_[A-Z_]+|av_[a-z_]+)\b/g,
  linux: /\b(linux|Linux|POSIX|posix|wayland|systemd|musl|glibc|GNU|gnu|__NR_[a-z_0-9]+)\b/g,
  chromium: /\b(chromium|Chromium|v8|V8|blink|skia|dawn|depot_tools|gn|ninja)\b/g,
  upstream_env: /\b(RUST_[A-Z_]+|CARGO_[A-Z_]+|BUN_[A-Z_]+|CLAUDE_[A-Z_]+|GITHUB_[A-Z_]+|NODE_[A-Z_]+)\b/g,
};

const SKIP_DIRS =
  /^(third_party|apps\/(open|rosegriffon|shenron)|src\/lore|tools\/lore|docs\/(reviews|lore|bun)|var)\//;
const BINARY_FILE =
  /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|wasm|bin|gz|zst|zip|lock|pdf|mp4|node|dll|exe|der|icns|snap)$/i;
// The identity sources themselves and this tool hold the names on purpose.
const OWN_FILES = new Set([
  "tools/identity.toml",
  "tools/identity-baseline.json",
  "scripts/identity.ts",
  "scripts/identity-literals.ts",
  "scripts/identity-rename-test.ts",
]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Names = {
  name: string;
  repo: string;
  binary: string;
  scope: string;
  prefix: string;
  cPrefix: string; // C symbols: [naming] c_prefix, default <name>_
  envPrefix: string; // environment: [naming] env_prefix, default <NAME>_
  data: string[]; // domains, orgs, contact values: legitimate data
};

export function namesOf(id: Identity & { contact?: Record<string, unknown> }): Names {
  const data = [
    ...Object.values(id.domains ?? {}),
    ...Object.values(id.orgs ?? {}),
    ...Object.values(id.contact ?? {}).flat(),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.replace(/^https?:\/\//, ""));
  return {
    name: id.product.name,
    repo: id.product.repo,
    binary: id.cli.binary,
    scope: id.naming.npm_scope,
    prefix: id.naming.crate_prefix,
    cPrefix: (id.naming as any).c_prefix ?? `${id.product.name}_`,
    envPrefix: (id.naming as any).env_prefix ?? `${id.product.name.toUpperCase()}_`,
    data,
  };
}

/** Our own domains, orgs and contact values: legitimate data, blanked before matching. */
export const dataPattern = (n: Names) =>
  n.data.length ? new RegExp(n.data.map(esc).join("|"), "gi") : undefined;

export type Classes = Record<string, RegExp>;

/** `folders`: names a checkout folder can carry (the identity repo name and the folder of the working tree). */
export function classes(n: Names, folders: string[] = []): Classes {
  const name = esc(n.name);
  const repo = [...new Set([n.repo, ...folders])].map(esc).join("|");
  const rp = `(?:${repo})`;
  const bin = esc(n.binary);
  return {
    "checkout-path": new RegExp(
      `(?:[A-Za-z]:\\\\{1,2}${rp}(?![\\w.-])|[A-Za-z]:/${rp}(?![\\w.-])|/[a-z]/${rp}(?![\\w.-])|/srv/${rp}(?![\\w.-])|~/${rp}(?![\\w.-]))`,
      "g",
    ),
    "product-name": new RegExp(`(?<![@\\w/.-])${name}(?![-_\\w.])`, "g"),
    "npm-scope": new RegExp(`${esc(n.scope)}(?![\\w])`, "g"),
    "crate-prefix": new RegExp(`(?<![\\w/@.])${esc(n.prefix)}[a-z]`, "g"),
    "c-prefix": new RegExp(`(?<![\\w])${esc(n.cPrefix)}[a-z]`, "g"),
    "env-prefix": new RegExp(`(?<![\\w])${esc(n.envPrefix)}[A-Z]`, "g"),
    "binary-call": new RegExp(
      `(?:^|[\`$>|]\\s*|&&\\s*|just\\s+|\\bthen\\s+|\\bdo\\s+)${bin} [a-z][a-z-]*`,
      "gm",
    ),
  };
}

/** git ls-files, or the folder walk of an export without .git (rename test). */
/** True for a path the identity tools never scan (upstream trees, binaries, the identity sources themselves). */
export const trackedSkip = (f: string) => SKIP_DIRS.test(f) || BINARY_FILE.test(f) || OWN_FILES.has(f);

export function trackedFiles(root: string): string[] {
  const r = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
  const listed = existsSync(join(root, ".git")) ? r.stdout.toString().split("\0").filter(Boolean) : [];
  const all = listed.length
    ? listed
    : [...new Bun.Glob("**/*").scanSync({ cwd: root, dot: true, onlyFiles: true })]
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => !/(^|\/)(\.git|node_modules|target)\//.test(f));
  return all
    .filter((f) => !SKIP_DIRS.test(f) && !BINARY_FILE.test(f) && !OWN_FILES.has(f));
}

export const kindOf = (f: string) =>
  /^(docs|\.agents\/skills|\.claude)\//.test(f) || /\.mdx?$/.test(f)
    ? "doc"
    : /(^|\/)justfile$|\.just$|^\.github\//.test(f)
      ? "just-ci"
      : /\.(rs|ts|tsx|js|mjs|c|h|cpp|py|sh|ps1|cmd|S|asm|zig|cs)$/.test(f)
        ? "code"
        : "config";

/** Hits per file and class; legitimate data (domains, orgs) is blanked before matching. */
export function scan(root: string, cls: Classes, n: Names, files = trackedFiles(root)) {
  const data = n.data.length ? new RegExp(n.data.map(esc).join("|"), "gi") : undefined;
  const perFile: Record<string, Record<string, number>> = {};
  for (const f of files) {
    let s: string;
    try {
      s = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    if (data) s = s.replace(data, " ");
    for (const [c, re] of Object.entries(cls)) {
      const k = (s.match(re) ?? []).length;
      if (k) (perFile[f] ??= {})[c] = k;
    }
  }
  return perFile;
}

export function upstreamCounts(root: string, files = trackedFiles(root)) {
  const out: Record<string, number> = Object.fromEntries(
    Object.keys(UPSTREAM_NAMESPACES).map((k) => [k, 0]),
  );
  for (const f of files) {
    let s: string;
    try {
      s = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    for (const [k, re] of Object.entries(UPSTREAM_NAMESPACES))
      out[k]! += (s.match(re) ?? []).length;
  }
  return out;
}

/** Old to new text for every class but checkout-path; data (domains, orgs) is left alone. */
export function rewriteText(s: string, o: Names, n: Names): string {
  const data = o.data.length ? new RegExp(`(${o.data.map(esc).join("|")})`, "gi") : undefined;
  const rw = (t: string) =>
    t
      .replace(new RegExp(`${esc(o.scope)}(?![\\w])`, "g"), n.scope)
      .replace(new RegExp(`(?<![\\w/@.])${esc(o.prefix)}(?=[a-z])`, "g"), n.prefix)
      .replace(new RegExp(`(?<![\\w])${esc(o.cPrefix)}(?=[a-z])`, "g"), n.cPrefix)
      .replace(new RegExp(`(?<![\\w])${esc(o.envPrefix)}(?=[A-Z])`, "g"), n.envPrefix)
      .replace(new RegExp(`(?<![@\\w/.-])${esc(o.name)}(?![-_\\w.])`, "g"), n.name)
      .replace(
        new RegExp(`((?:^|[\`$>|]\\s*|&&\\s*|just\\s+|\\bthen\\s+|\\bdo\\s+))${esc(o.binary)}(?= [a-z][a-z-]*)`, "gm"),
        `$1${n.binary}`,
      );
  return data ? s.split(data).map((t, i) => (i % 2 ? t : rw(t))).join("") : rw(s);
}

function tally(perFile: ReturnType<typeof scan>) {
  const byClass: Record<string, Record<string, number>> = {};
  for (const [f, cs] of Object.entries(perFile))
    for (const [c, k] of Object.entries(cs)) {
      const row = (byClass[c] ??= { total: 0 });
      row[kindOf(f)] = (row[kindOf(f)] ?? 0) + k;
      row.total! += k;
    }
  return byClass;
}

const BASELINE = "tools/identity-baseline.json";

function main(argv: string[]): number {
  const ri = argv.indexOf("--root");
  const root = ri >= 0 ? resolve(argv[ri + 1]!) : findRoot();
  const flagVals = new Set(
    ["--root", "--old", "--old-folder"].flatMap((f) => (argv.includes(f) ? [argv[argv.indexOf(f) + 1]!] : [])),
  );
  const pos = argv.filter((a) => !a.startsWith("--") && !flagVals.has(a));
  const cmd = pos[0] ?? "count";
  const id = loadIdentity(root);
  const names = namesOf(id);
  const cls = classes(names, [basename(root)]);

  if (cmd === "upstream") {
    console.log(JSON.stringify(upstreamCounts(root)));
    return 0;
  }
  if (cmd === "count") {
    const t = tally(scan(root, cls, names));
    if (argv.includes("--json")) console.log(JSON.stringify(t));
    else
      for (const [c, row] of Object.entries(t))
        console.log(
          `${c.padEnd(14)} ${String(row.total).padStart(6)}  ` +
            Object.entries(row)
              .filter(([k]) => k !== "total")
              .map(([k, v]) => `${k}=${v}`)
              .join(" "),
        );
    return 0;
  }
  if (cmd === "top") {
    const c = pos[1] ?? "";
    const rows = Object.entries(scan(root, cls, names))
      .map(([f, cs]) => [f, cs[c] ?? 0] as const)
      .filter(([, k]) => k)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Number(pos[2] ?? 25));
    for (const [f, k] of rows) console.log(k, f);
    return 0;
  }
  if (cmd === "baseline") {
    const perFile = scan(root, cls, names);
    writeFileSync(join(root, BASELINE), `${JSON.stringify(perFile, null, 1)}\n`);
    console.log(`identity-literals: ${Object.keys(perFile).length} files in ${BASELINE}`);
    return 0;
  }
  if (cmd === "check") {
    const base: ReturnType<typeof scan> = existsSync(join(root, BASELINE))
      ? JSON.parse(readFileSync(join(root, BASELINE), "utf8"))
      : {};
    let bad = 0;
    for (const [f, cs] of Object.entries(scan(root, cls, names)))
      for (const [c, k] of Object.entries(cs)) {
        const have = base[f]?.[c] ?? 0;
        if (k > have) {
          console.error(`literal-identity: ${f}: ${c} ${k} > ${have}; derive it from tools/identity.toml`);
          bad++;
        }
      }
    if (!bad) console.log("identity-literals: no new literal identity name");
    return bad ? 1 : 0;
  }
  if (cmd === "rewrite") {
    const old = argv[argv.indexOf("--old") + 1];
    if (!old) {
      console.error("identity-literals: rewrite needs --old <identity.toml>");
      return 2;
    }
    const o = namesOf(Bun.TOML.parse(readFileSync(resolve(old), "utf8")) as Identity);
    let changed = 0;
    for (const f of trackedFiles(root)) {
      let t: string;
      try {
        t = readFileSync(join(root, f), "utf8");
      } catch {
        continue;
      }
      const u = rewriteText(t, o, names);
      if (u !== t) {
        writeFileSync(join(root, f), u);
        changed++;
      }
    }
    console.log(`identity-literals: ${changed} files rewritten`);
    return 0;
  }
  if (cmd === "residual") {
    const old = argv[argv.indexOf("--old") + 1];
    if (!old) {
      console.error("identity-literals: residual needs --old <identity.toml>");
      return 2;
    }
    const oldId = Bun.TOML.parse(readFileSync(resolve(old), "utf8")) as Identity;
    const on = namesOf(oldId);
    const perFile = scan(root, classes(on, [argv[argv.indexOf("--old-folder") + 1] ?? ""].filter(Boolean)), on);
    const t = tally(perFile);
    for (const [c, row] of Object.entries(t)) console.log(`residual ${c}: ${row.total}`);
    const total = Object.values(t).reduce((a, r) => a + r.total!, 0);
    return total ? 1 : 0;
  }
  console.error("usage: identity-literals.ts count|top|check|baseline|rewrite|residual|upstream");
  return 2;
}

if (import.meta.main) process.exit(main(Bun.argv.slice(2)));
