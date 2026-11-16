// WinuxCmd against uutils, per applet: the matrix of docs/native/UNIXWIN.md and the provider table device/os/unixwin/applets.toml.
//
//   bun scripts/unixwin-applets.ts [--winux DIR] [--coreutils DIR] [--findutils DIR] [--diffutils DIR] [--proof FILE] [--write]
//
// Inputs (checkouts of the pins; defaults under third_party/):
//   WinuxCmd:  DOCS/2.0-inventory.tsv (state, engine, oracle status), tests/differential/baseline.json (case buckets per command),
//              the niubash completion catalog src/niubash/runtime/assets/completions/winuxcmd/*.toml (options per applet)
//   uutils:    procps, util-linux, acl, bsdutils, hostname, shadow, tar (src/uu/<applet>) and grep, sed, awk (one crate each) under --uutils-dir (default third_party/<repo>);
//              coreutils src/uu/<applet>/src/*.rs (options scanned from the clap definitions), Cargo.toml (unix-only feature lists),
//              findutils (find, xargs, locate, updatedb), diffutils (cmp, diff), src/gnu/coreutils/PROOF.md (GNU suite failures)
//
// Rule (owner, 2026-11-15): WinuxCmd is the base. An applet WinuxCmd has stays WinuxCmd's. uutils fills what WinuxCmd lacks, and
// what the one multicall cannot carry (C++ applets that are not yet Rust: `ay` links Rust only).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Bun.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1]! : d);
const ROOT = join(import.meta.dir, "..");
const winux = opt("--winux", join(ROOT, "third_party/WinuxCmd"));
const coreutils = opt("--coreutils", join(ROOT, "third_party/coreutils"));
const findutils = opt("--findutils", join(ROOT, "third_party/findutils"));
const diffutils = opt("--diffutils", join(ROOT, "third_party/diffutils"));
const uutilsDir = opt("--uutils-dir", join(ROOT, "third_party"));
const proofPath = opt("--proof", join(ROOT, "src/gnu/coreutils/PROOF.md"));
const catalog = opt("--catalog", join(ROOT, "src/niubash/runtime/assets/completions/winuxcmd"));

export interface Winux {
  state: string;
  engine: string;
  oracle: string;
  pass: number;
  knownDiff: number;
  skip: number;
  longs: Set<string>;
}
export interface Uutils {
  source: string;
  longs: Set<string>;
  unixOnly: boolean;
  gnuFailures: string[];
  /** The executable that runs the applet, and whether it takes the applet name as its first argument (multicall). */
  bin: string;
  multicall: boolean;
}

/** Inventory rows of WinuxCmd (`DOCS/2.0-inventory.tsv`). */
export function parseInventory(tsv: string): Map<string, Omit<Winux, "pass" | "knownDiff" | "skip" | "longs">> {
  const [head, ...rows] = tsv.trim().split("\n");
  const cols = head!.split("\t");
  const at = (n: string) => cols.indexOf(n);
  const out = new Map();
  for (const r of rows) {
    const f = r.split("\t");
    out.set(f[at("applet")]!, { state: f[at("state")]!, engine: f[at("engine")]!, oracle: f[at("oracle_status")]! });
  }
  return out;
}

/** Long options of a niubash completion asset: `long = "--x"` lines (flags and subcommand flags). */
export function tomlLongs(text: string): Set<string> {
  return new Set([...text.matchAll(/^long = "(--[^"]+)"/gm)].map((m) => m[1]!));
}

/** Long options declared by a uutils applet: `.long(options::NAME)` / `.long("x")`, constants resolved. */
export function clapLongs(src: string, consts: Map<string, Set<string>> = strConsts(src)): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/\.long\(\s*(?:"([^"]+)"|([A-Za-z0-9_:]+))\s*\)/g)) {
    const names = m[1] ? [m[1]] : [...(consts.get(m[2]!.split("::").pop()!) ?? [])];
    for (const n of names) out.add(`--${n}`);
  }
  return out;
}

/** String constants of Rust sources (`static NAME: &str = "x"`): a name may occur in several modules, so every value is kept. */
export function strConsts(src: string, into: Map<string, Set<string>> = new Map()): Map<string, Set<string>> {
  for (const m of src.matchAll(/(?:pub\s+)?(?:static|const)\s+([A-Za-z0-9_]+)\s*:\s*&(?:'static\s+)?str\s*=\s*"([^"]+)"/g)) into.set(m[1]!, (into.get(m[1]!) ?? new Set()).add(m[2]!));
  return into;
}

/** Long options spelled as `"--name"` literals, for applets that parse their own arguments (diffutils). */
export function literalLongs(src: string): Set<string> {
  return new Set([...src.matchAll(/"(--[a-z][a-z0-9-]+)"/g)].map((m) => m[1]!));
}

/** Applets that uutils only builds on unix (Cargo.toml `feat_require_unix*` lists). */
export function unixOnly(cargoToml: string): Set<string> {
  const out = new Set<string>();
  for (const m of cargoToml.matchAll(/^feat_require_unix[A-Za-z_]*\s*=\s*\[([\s\S]*?)\]/gm)) for (const n of m[1]!.matchAll(/"([a-z0-9_\[]+)"/g)) out.add(n[1]!);
  return out;
}

/**
 * GNU suite failures per applet, from the failure line of PROOF.md: `tests/DIR/{a,b}` and `tests/{dir/a,dir/b}`.
 * Tests under tests/misc are named after their applet (printenv, stdbuf...) or an option shape (invalid-opt): kept by name.
 */
export function failureApplets(proof: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const line = proof.split("\n").find((l) => l.startsWith("Échecs") || l.startsWith("Failures"));
  if (!line) return out;
  const push = (applet: string, test: string) => out.set(applet, [...(out.get(applet) ?? []), test]);
  for (const m of line.matchAll(/tests\/(?:\{([^}]*)\}|([a-z0-9_]+)\/\{([^}]*)\})/g)) {
    if (m[1] !== undefined) for (const e of m[1].split(",")) push(e.split("/")[0]!.trim(), e.trim());
    else for (const e of m[3]!.split(",")) push(m[2] === "misc" ? e.trim() : m[2]!, `${m[2]}/${e.trim()}`);
  }
  return out;
}

function scanUutilsApplet(path: string | string[], literal = false): Set<string> {
  const files: string[] = [];
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isFile()) {
      if (p.endsWith(".rs")) files.push(p);
      return;
    }
    for (const e of readdirSync(p)) walk(join(p, e));
  };
  for (const p of Array.isArray(path) ? path : [path]) walk(p);
  const texts = files.map((p) => readFileSync(p, "utf8"));
  const consts = new Map<string, Set<string>>();
  for (const t of texts) strConsts(t, consts);
  const longs = new Set<string>();
  for (const t of texts) for (const l of literal ? literalLongs(t) : clapLongs(t, consts)) longs.add(l);
  return longs;
}

function build() {
  const inv = parseInventory(readFileSync(join(winux, "DOCS/2.0-inventory.tsv"), "utf8"));
  const baseline = JSON.parse(readFileSync(join(winux, "tests/differential/baseline.json"), "utf8")).cases as Record<string, { bucket: string; command: string }>;
  const diff = new Map<string, { pass: number; knownDiff: number; skip: number }>();
  for (const c of Object.values(baseline)) {
    const d = diff.get(c.command) ?? { pass: 0, knownDiff: 0, skip: 0 };
    if (c.bucket === "PASS") d.pass++;
    else if (c.bucket === "KNOWN_DIFF") d.knownDiff++;
    else d.skip++;
    diff.set(c.command, d);
  }
  const W = new Map<string, Winux>();
  for (const [name, i] of inv) {
    const d = diff.get(name) ?? { pass: 0, knownDiff: 0, skip: 0 };
    const t = join(catalog, `${name}.toml`);
    W.set(name, { ...i, ...d, longs: existsSync(t) ? tomlLongs(readFileSync(t, "utf8")) : new Set() });
  }
  const cargo = readFileSync(join(coreutils, "Cargo.toml"), "utf8");
  const unix = unixOnly(cargo);
  const proof = existsSync(proofPath) ? failureApplets(readFileSync(proofPath, "utf8")) : new Map<string, string[]>();
  const U = new Map<string, Uutils>();
  const add = (name: string, source: string, dir: string | string[]) => {
    const { bin, multicall } = uutilsBinary(source, name);
    U.set(name, { source, longs: scanUutilsApplet(dir, source === "diffutils"), unixOnly: unix.has(name), gnuFailures: proof.get(name) ?? [], bin, multicall });
  };
  // A crate of src/uu without src/main.rs is a library (coreutils `checksum_common`), not an applet.
  const isApplet = (dir: string) => existsSync(join(dir, "src/main.rs"));
  for (const e of existsSync(join(coreutils, "src/uu")) ? readdirSync(join(coreutils, "src/uu")) : []) if (isApplet(join(coreutils, "src/uu", e))) add(e, "coreutils", join(coreutils, "src/uu", e));
  for (const n of ["find", "xargs", "locate", "updatedb"]) if (existsSync(join(findutils, "src", n)) || existsSync(findutils)) add(n, "findutils", join(findutils, "src", n === "find" ? "find" : n));
  // The other uutils repositories: workspaces of applets (src/uu/<applet>) and single-applet crates.
  for (const repo of ["procps", "util-linux", "acl", "bsdutils", "hostname", "shadow", "tar"]) {
    const uu = join(uutilsDir, repo, "src/uu");
    for (const e of existsSync(uu) ? readdirSync(uu) : []) if (!U.has(e) && isApplet(join(uu, e))) add(e, repo, join(uu, e));
  }
  for (const repo of ["grep", "sed", "awk"]) if (existsSync(join(uutilsDir, repo, "src")) && !U.has(repo)) add(repo, repo, join(uutilsDir, repo, "src"));
  if (existsSync(diffutils)) {
    add("cmp", "diffutils", join(diffutils, "src/cmp.rs"));
    add("diff", "diffutils", [join(diffutils, "src/params.rs"), join(diffutils, "src/diff.rs")]);
  }
  return { W, U };
}

/** The executable of a uutils repository and whether it is a multicall binary (`<bin> <applet> args`). Single-applet repositories and findutils run as `<applet> args`. */
export function uutilsBinary(repo: string, applet: string): { bin: string; multicall: boolean } {
  switch (repo) {
    case "coreutils": case "procps": case "util-linux": case "acl": case "bsdutils": case "diffutils":
      return { bin: repo, multicall: true };
    case "shadow":
      return { bin: "shadow-rs", multicall: true };
    case "tar":
      return { bin: "tarapp", multicall: false };
    default: // findutils (find, xargs...), hostname, grep, sed, awk: one executable per applet
      return { bin: applet, multicall: false };
  }
}

/** Names of a `registry()` function (src/winux/extra/src/lib.rs, src/winux/cmds/src/lib.rs). */
export function portedApplets(libRs: string): Set<string> {
  const body = libRs.match(/pub fn registry\(\)[\s\S]*?\n}\n/)?.[0] ?? "";
  return new Set([...body.matchAll(/\("([^"]+)",/g)].map((m) => m[1]!));
}

export type Provider = "winux" | "winux-cxx" | "uutils";

/** The provider of one applet in the `ay` multicall (WinuxCmd is the base). */
export function decide(w: Winux | undefined, u: Uutils | undefined, native: Set<string> = new Set(), name = ""): { provider: Provider | "none"; reason: string } {
  // `winux` means "the library registers it": the inventory state label alone (wired, rust-ready) never decides.
  if (w && native.has(name)) return { provider: "winux", reason: "WinuxCmd applet in the Rust library (src/winux)" };
  if (w && u) return { provider: "uutils", reason: "WinuxCmd applet is still C++ (not linkable); uutils fills in the multicall, WinuxCmd stays the Windows applet" };
  if (w) return { provider: "winux-cxx", reason: "WinuxCmd C++ only; no uutils applet" };
  if (u) return { provider: "uutils", reason: "absent from WinuxCmd" };
  return { provider: "none", reason: "" };
}

function pct(w: Winux) {
  const n = w.pass + w.knownDiff;
  return n ? `${w.pass}/${n}` : "-";
}

function render({ W, U }: ReturnType<typeof build>, ported: Set<string>, registered: Set<string>) {
  const native = new Set([...ported, ...registered]);
  const names = [...new Set([...W.keys(), ...U.keys()])].sort();
  const rows: string[] = [];
  const toml: string[] = [
    "# Provider of each applet in the `ay` multicall. Generated by scripts/unixwin-applets.ts's matrix; do not edit.",
    "# winux = Rust applet of WinuxCmd (src/winux_cmds); uutils = uutils multicall; winux-cxx = WinuxCmd C++ applet, Windows bundle only.",
    "",
  ];
  const tally: Record<string, number> = { winux: 0, uutils: 0, "winux-cxx": 0 };
  rows.push("| applet | WinuxCmd state | differential pass | options W | uutils | options U | W only | U only | uutils on Windows | GNU suite failures (uutils) | provider |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const n of names) {
    const w = W.get(n);
    const u = U.get(n);
    const d = decide(w, u, native, n);
    if (d.provider === "none") continue;
    tally[d.provider]!++;
    const wl = w?.longs ?? new Set<string>();
    const ul = u?.longs ?? new Set<string>();
    const wOnly = [...wl].filter((x) => !ul.has(x)).length;
    const uOnly = [...ul].filter((x) => !wl.has(x)).length;
    rows.push(`| ${n} | ${w ? `${ported.has(n) ? "ported (portable Rust)" : w.state}${w.engine && w.engine !== w.state ? ` (${w.engine})` : ""}` : "-"} | ${w ? pct(w) : "-"} | ${w ? wl.size : "-"} | ${u ? u.source : "-"} | ${u ? ul.size : "-"} | ${w && u ? wOnly : "-"} | ${w && u ? uOnly : "-"} | ${u ? (u.unixOnly ? "no" : "yes") : "-"} | ${u ? u.gnuFailures.length || "0" : "-"} | ${d.provider} |`);
    toml.push(`[${JSON.stringify(n)}]`, `provider = "${d.provider}"`);
    if ((d.provider === "uutils" || d.provider === "winux") && u) toml.push(`bin = ${JSON.stringify(u.bin)}`, `multicall = ${u.multicall}`);
    toml.push("");
  }
  return { table: rows.join("\n"), toml: toml.join("\n"), tally, total: tally.winux! + tally.uutils! + tally["winux-cxx"]!, winuxOnly: [...W.keys()].filter((n) => !U.has(n)).length, uutilsOnly: [...U.keys()].filter((n) => !W.has(n)).length, both: [...W.keys()].filter((n) => U.has(n)).length };
}

if (import.meta.main) {
  const data = build();
  const extraLib = join(ROOT, "src/winux/extra/src/lib.rs");
  const ported = existsSync(extraLib) ? portedApplets(readFileSync(extraLib, "utf8")) : new Set<string>();
  const cmdsLib = join(ROOT, "src/winux/cmds/src/lib.rs");
  const registered = existsSync(cmdsLib) ? portedApplets(readFileSync(cmdsLib, "utf8")) : new Set<string>();
  const r = render(data, ported, registered);
  const summary = `Applets: ${r.total} (WinuxCmd ${data.W.size}, uutils ${data.U.size}; in both ${r.both}, WinuxCmd only ${r.winuxOnly}, uutils only ${r.uutilsOnly}). Providers in the multicall: winux ${r.tally.winux}, uutils ${r.tally.uutils}, winux-cxx ${r.tally["winux-cxx"]}.`;
  if (args.includes("--write")) {
    const doc = join(ROOT, "docs/native/UNIXWIN.md");
    const begin = "<!-- applets:begin -->";
    const end = "<!-- applets:end -->";
    let text = readFileSync(doc, "utf8");
    const block = `${begin}\n${summary}\n\n${r.table}\n${end}`;
    text = text.includes(begin) ? text.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), () => block) : `${text.trimEnd()}\n\n${block}\n`;
    writeFileSync(doc, text);
    writeFileSync(join(ROOT, "device/os/unixwin/applets.toml"), r.toml);
  }
  console.log(summary);
}
