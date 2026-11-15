import { join } from "node:path";
// Restore inventory, history side: every file deleted from the monorepo history, grouped by directory and classified:
// moved (the same blob exists in HEAD), purged (deleting commit message says purge/slop/remove brand/demo...),
// or candidate lost feature (code, no equivalent blob in HEAD). Output: JSON on --out plus a summary on stdout.
// Usage: bun scripts/restore-history.ts --out <json> [--depth 2]
const arg = (k: string, d?: string) => (Bun.argv.includes(k) ? Bun.argv[Bun.argv.indexOf(k) + 1] : d);
const out = arg("--out")!;
const depth = Number(arg("--depth", "2"));
const root = join(import.meta.dir, "..").replace(/\\/g, "/");

const head = new Set<string>();
for (const l of (await Bun.$`git -C ${root} ls-tree -r HEAD`.quiet().text()).split("\n")) { const m = /^\d+ blob ([0-9a-f]{40})\t/.exec(l); if (m) head.add(m[1]); }
const headPaths = new Set((await Bun.$`git -C ${root} ls-tree -r --name-only HEAD`.quiet().text()).split("\n"));

const log = await Bun.$`git -C ${root} log --diff-filter=D -M50% --raw --no-abbrev --format=@@%H%x09%ad%x09%s --date=short`.quiet().text();
type F = { path: string; oid: string; commit: string; date: string; subject: string };
const files: F[] = [];
let cur = { c: "", d: "", s: "" };
for (const l of log.split("\n")) {
  if (l.startsWith("@@")) { const [c, d, ...s] = l.slice(2).split("\t"); cur = { c, d, s: s.join("\t") }; continue; }
  const m = /^:\d+ 0+ ([0-9a-f]{40}) 0+ D\t(.*)$/.exec(l);
  if (m) files.push({ path: m[2].replace(/^"|"$/g, ""), oid: m[1], commit: cur.c, date: cur.d, subject: cur.s });
}
const PURGE = /purg|slop|fake|brand|demo|remove|drop|delete|clean|dedup|duplicate|legacy|obsolete|dead|junk|stale|unused|retire/i;
const CODE = /\.(ts|tsx|rs|py|go|c|h|cc|cpp|cs|js|mjs|sh|ps1|lua|zig|wgsl|toml|json|yaml|yml|md|css|scss|html)$/;
const groups = new Map<string, { dir: string; files: number; code: number; moved: number; stillThere: number; commits: Map<string, { date: string; subject: string; n: number }> }>();
for (const f of files) {
  const dir = f.path.split("/").slice(0, depth).join("/");
  const g = groups.get(dir) ?? { dir, files: 0, code: 0, moved: 0, stillThere: 0, commits: new Map() };
  g.files++;
  if (CODE.test(f.path)) g.code++;
  if (head.has(f.oid)) g.moved++;
  if (headPaths.has(f.path)) g.stillThere++;
  const c = g.commits.get(f.commit) ?? { date: f.date, subject: f.subject, n: 0 };
  c.n++; g.commits.set(f.commit, c);
  groups.set(dir, g);
}
const rows = [...groups.values()].map((g) => {
  const cs = [...g.commits].sort((a, b) => b[1].n - a[1].n);
  const top = cs[0];
  const purgeMsg = cs.some(([, c]) => PURGE.test(c.subject));
  const movedRatio = g.files ? g.moved / g.files : 0;
  const cls = movedRatio >= 0.6 ? "moved" : g.stillThere / g.files >= 0.8 ? "re-added" : purgeMsg ? "purged" : g.code ? "candidate" : "non-code";
  return { dir: g.dir, files: g.files, code: g.code, movedRatio: Number(movedRatio.toFixed(2)), class: cls, commit: top[0].slice(0, 9), date: top[1].date, subject: top[1].subject.slice(0, 160), commits: cs.length };
}).sort((a, b) => b.files - a.files);
await Bun.write(out, JSON.stringify({ deletedFiles: files.length, rows }, null, 1));
const by: Record<string, number> = {};
for (const r of rows) by[r.class] = (by[r.class] ?? 0) + r.files;
console.log(JSON.stringify({ deletedFiles: files.length, groups: rows.length, filesByClass: by }));
