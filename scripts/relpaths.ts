// relpaths: relative references that still point into a directory moved by tools/layout.toml ([[move]] from -> to).
//   bun scripts/relpaths.ts           list the stale references, exit 1 when any is left
//   bun scripts/relpaths.ts --write   rewrite each one to the same target at its new place
// A reference is a run of `../` followed by a moved path; it is stale when it does not resolve from its file and
// the mapped path does. relayout.ts rewrites root-relative paths; this covers the relative ones it cannot see.
import { existsSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";

const root = join(import.meta.dir, "..").replaceAll("\\", "/");
const write = Bun.argv.includes("--write");
const cfg = Bun.TOML.parse(await Bun.file(join(root, "tools/layout.toml")).text()) as {
  move?: { from: string; to: string }[];
  group?: { from: string; to: string; names: string[]; rename?: Record<string, string> }[];
};
const moves = [...(cfg.move ?? [])];
for (const g of cfg.group ?? []) for (const n of g.names) moves.push({ from: `${g.from}/${n}`, to: `${g.to}/${g.rename?.[n] ?? n}` });
moves.sort((a, b) => b.from.length - a.from.length);
const tops = [...new Set(moves.map((m) => m.from.split("/")[0]))];
const re = new RegExp(`((?:\\.\\./)+)((?:${tops.join("|")})/[A-Za-z0-9_./@+-]+)`, "g");
const map = (p: string) => {
  for (const m of moves) if (p === m.from || p.startsWith(m.from + "/")) return m.to + p.slice(m.from.length);
  return null;
};
const resolves = (p: string) => ["", ".ts", ".tsx", ".js", ".rs", "/index.ts", "/mod.rs"].some((e) => existsSync(`${root}/${p}${e}`));
const skip = /^(third_party\/|docs\/|apps\/(auto|open)\/|node_modules\/)|\.(lock|png|jpg|webp|ico|woff2?|ttf|wasm|pdf|zip|gz)$|(^|\/)node_modules\//;
const files = Bun.spawnSync(["git", "-C", root, "ls-files"]).stdout.toString().split("\n").filter((f) => f && !skip.test(f));
let stale = 0;
for (const f of files) {
  const abs = `${root}/${f}`;
  const file = Bun.file(abs);
  if (!(await file.exists()) || file.size > 2_000_000) continue;
  const text = await file.text();
  if (!text.includes("../")) continue;
  const here = dirname(f);
  const out = text.replace(re, (all, ups: string, tail: string) => {
    const target = posix.normalize(posix.join(here, ups, tail));
    if (target.startsWith("..") || resolves(target)) return all;
    // The reference was written when its own file sat elsewhere: the moved path is what the tail names.
    const trimmed = tail.replace(/[.,;:)]+$/, "");
    const mapped = map(trimmed);
    if (!mapped || !existsSync(`${root}/${mapped}`)) return all;
    stale++;
    // Same number of ../ when that resolves (the base did not move); else the path from this file; a command that
    // runs from another directory (a workflow step) keeps its base.
    let rel = relative(`${root}/${here}`, `${root}/${mapped}`).replaceAll("\\", "/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    const same = `${ups}${mapped}`;
    if (resolves(posix.normalize(posix.join(here, same))) || /\.ya?ml$/.test(f)) rel = same;
    if (!write) console.log(`${f}: ${ups}${trimmed} -> ${rel}`);
    return rel + tail.slice(trimmed.length);
  });
  if (write && out !== text) await Bun.write(abs, out);
}
console.log(`relpaths: ${stale} stale relative reference(s)${write ? " rewritten" : ""}`);
process.exit(stale && !write ? 1 : 0);
