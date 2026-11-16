// Applies the [[move]] and [[group]] rows of tools/layout.toml: renames each path, then rewrites every reference to it
// (relative paths recomputed against the old tree, root-relative paths by prefix, join("a","b") sequences).
// usage: bun scripts/relayout.ts apply|check [--batch N | --upto N] | table [--write]
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
type Move = { from: string; to: string; batch?: number };
const cfg = Bun.TOML.parse(readFileSync(join(root, "tools/layout.toml"), "utf8")) as {
  area: { dir: string; role: string; why: string }[];
  move?: Move[];
  group?: { batch?: number; from: string; to: string; names: string[]; rename?: Record<string, string> }[];
};
const mode = Bun.argv[2] ?? "check";
const bi = Bun.argv.indexOf("--batch");
const batch = bi > 0 ? Number(Bun.argv[bi + 1]) : undefined;
const ui = Bun.argv.indexOf("--upto");
const upto = ui > 0 ? Number(Bun.argv[ui + 1]) : undefined;

const all: Move[] = [...(cfg.move ?? [])];
for (const g of cfg.group ?? [])
  for (const n of g.names) all.push({ from: `${g.from}/${n}`, to: `${g.to}/${g.rename?.[n] ?? n}`, batch: g.batch });
const moves = all.filter((m) => batch === undefined || (m.batch ?? 1) === batch).sort((a, b) => b.from.length - a.from.length);
const map = new Map(moves.map((m) => [m.from, m.to]));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = moves.map((m) => esc(m.from)).join("|");

// root-relative reference: starts after a non-path char, the checkout folder, a variable or a just/ts root helper
const re = new RegExp(
  `(?<=^|[^\\w./\\-}\\])]|(?:aphrody|SRC|ROOT|root|repo|checkout|srv/src|agents/src|\\{\\{root\\}\\}|\\{root\\}|\\$\\{?\\w+\\}?|[})\\]])/)(${alt})(?=$|[^\\w\\-.]|\\.(?!\\w))`,
  "gm",
);
const mapPath = (p: string): string => {
  for (const m of moves) if (p === m.from || p.startsWith(m.from + "/")) return m.to + p.slice(m.from.length);
  return p;
};

const git = (args: string[]) => Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", maxBuffer: 1 << 28 }).stdout.toString();
const SKIP = [/^scripts\/restore-inventory\.ts$/, /^third_party\//, /^Cargo\.lock$/, /^bun\.lock$/, /^uv\.lock$/, /restore-inventory\.json$/, /^docs\/proofs\//, /^tools\/layout\.toml$/, /^scripts\/relayout\.ts$/];
const listing = () =>
  git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter((f) => f && existsSync(join(root, f)));
const isText = (buf: Buffer) => !buf.subarray(0, 8192).includes(0);

if (mode === "table") {
  const rows = ["| Directory | Content | Why |", "| --- | --- | --- |"];
  for (const a of [...cfg.area].sort((x, y) => x.dir.localeCompare(y.dir))) rows.push(`| \`${a.dir}/\` | ${a.role} | ${a.why} |`);
  const table = rows.join("\n");
  if (Bun.argv.includes("--write")) {
    const p = join(root, "docs/project/layout.md");
    const doc = readFileSync(p, "utf8");
    if (!doc.includes("<!-- layout:begin -->")) throw new Error("markers layout:begin/end not found in docs/project/layout.md");
    writeFileSync(p, doc.replace(/(<!-- layout:begin -->\r?\n)[\s\S]*?(\r?\n<!-- layout:end -->)/, `$1${table}$2`));
  } else console.log(table);
} else if (mode === "apply") {
  const files = listing();
  const fileSet = new Set(files);
  const dirSet = new Set<string>();
  const noExt = new Set<string>();
  for (const f of files) {
    for (let d = posix.dirname(f); d !== "." && !dirSet.has(d); d = posix.dirname(d)) dirSet.add(d);
    noExt.add(f.replace(/\.[^./]+$/, ""));
  }
  const exists = (p: string) => fileSet.has(p) || dirSet.has(p) || noExt.has(p) || fileSet.has(p + "/index.ts") || fileSet.has(p + "/mod.rs");
  const relRe = /(?<![\w./@\-])(\/?\.{1,2}\/(?:[\w@+.\-]+\/)*[\w@+.\-]*)/g;
  const joinRe = /(["'])(packages|src)\1(\s*,\s*)(["'])([\w.\-]+)\4/g;
  const rustJoinRe = /\.join\("(packages|src)"\)(\s*\.join\()"([\w.\-]+)"/g;
  const seqMoves = new Map<string, string>(); // "packages/name" -> "top/newname"
  for (const m of moves) if (/^(packages|src)\/[^/]+$/.test(m.from)) seqMoves.set(m.from, m.to);

  const writes: { path: string; content: string }[] = [];
  let changed = 0;
  for (const f of files) {
    if (SKIP.some((s) => s.test(f))) continue;
    const buf = readFileSync(join(root, f));
    if (buf.length > 8_000_000 || !isText(buf)) continue;
    const src = buf.toString("utf8");
    const nf = mapPath(f);
    const dirOld = posix.dirname(f);
    const dirNew = posix.dirname(nf);
    // a reference to src/<name> or packages/<name> from inside a unit that has its own src/<name> is local
    const local = (name: string) => {
      for (let d = dirOld; d !== "." && d !== ""; d = posix.dirname(d)) if (dirSet.has(`${d}/src/${name}`) || dirSet.has(`${d}/packages/${name}`)) return true;
      return false;
    };
    let out = src.replace(relRe, (full) => {
      const lead = full.startsWith("/") ? "/" : "";
      const tok = lead ? full.slice(1) : full;
      const resolved = posix.join(dirOld, tok);
      if (resolved.startsWith("..") || !exists(resolved.replace(/\/$/, ""))) return full;
      const target = mapPath(resolved.replace(/\/$/, ""));
      let rel = posix.relative(dirNew, target) || ".";
      if (tok.startsWith("./") && !rel.startsWith(".")) rel = "./" + rel;
      if (tok.endsWith("/") && rel !== "." && !rel.endsWith("/")) rel += "/";
      const same = posix.normalize(tok).replace(/\/$/, "") === rel.replace(/\/$/, "");
      return lead + (same ? tok : rel);
    });
    out = out.replace(re, (x, _a, offset: number) => (/^(src|packages)\//.test(x) && local(x.split("/")[1]!) ? x : map.get(x) ?? x));
    out = out.replace(joinRe, (all, q, top, sep, q2, name) => {
      const to = seqMoves.get(`${top}/${name}`);
      if (!to) return all;
      const [ntop, nname] = to.split("/");
      return `${q}${ntop}${q}${sep}${q2}${nname}${q2}`;
    });
    out = out.replace(rustJoinRe, (all, top, mid, name) => {
      const to = seqMoves.get(`${top}/${name}`);
      if (!to) return all;
      const [ntop, nname] = to.split("/");
      return `.join("${ntop}")${mid}"${nname}"`;
    });
    if (out !== src) writes.push({ path: nf, content: out });
    if (out !== src) changed++;
  }
  // layer inherited from the old top-level DEPS.rules, kept as a per-unit file
  const layerOf = (top: string) => readFileSync(join(root, top, "DEPS.rules"), "utf8").match(/^layer\s*=\s*(\d+)/m)?.[1];
  const layers = new Map<string, string | undefined>();
  const newRules: string[] = [];
  let renamed = 0;
  for (const m of moves) {
    const from = join(root, m.from);
    if (!existsSync(from)) continue;
    const top = m.from.split("/")[0]!;
    if (!layers.has(top) && existsSync(join(root, top, "DEPS.rules"))) layers.set(top, layerOf(top));
    mkdirSync(dirname(join(root, m.to)), { recursive: true });
    renameSync(from, join(root, m.to));
    renamed++;
    const layer = layers.get(top);
    if (layer !== undefined && statSync(join(root, m.to)).isDirectory() && !existsSync(join(root, m.to, "DEPS.rules"))) {
      writeFileSync(join(root, m.to, "DEPS.rules"), `# checkdeps layer rules. Inherited by subdirectories.\nlayer = ${layer}\n`);
      newRules.push(m.to + "/DEPS.rules");
    }
  }
  for (const w of writes) {
    mkdirSync(dirname(join(root, w.path)), { recursive: true });
    writeFileSync(join(root, w.path), w.content);
  }
  console.log(`renamed ${renamed} paths, rewrote ${changed} files, ${newRules.length} DEPS.rules written`);
} else {
  let bad = 0;
  for (const m of moves) if (existsSync(join(root, m.from))) (console.log(`exists: ${m.from}`), bad++);
  for (const f of listing()) {
    if (SKIP.some((s) => s.test(f)) || /^apps\/(rosegriffon|shenron)\//.test(f)) continue;
    const buf = readFileSync(join(root, f));
    if (buf.length > 8_000_000 || !isText(buf)) continue;
    for (const [i, line] of buf.toString("utf8").split("\n").entries()) {
      re.lastIndex = 0;
      if (re.test(line)) (console.log(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`), bad++);
    }
  }
  console.log(bad ? `${bad} stale` : "layout ok");
  process.exit(bad ? 1 : 0);
}
