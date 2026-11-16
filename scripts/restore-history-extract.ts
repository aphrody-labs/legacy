// Restore tool, history side: bring back a directory as it was just before the commit that deleted it.
// Files whose blob or path is still in HEAD are skipped with --gone-only (a lost feature, not a moved one).
// The result goes through restore-import (gitleaks gate, never overwrites).
// Usage: bun scripts/restore-history-extract.ts --commit <deleting sha> --dir system/x --to system/x [--gone-only] [--only <regex>] [--dry]
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const commit = opt("--commit")!;
const dir = opt("--dir")!.replace(/\/$/, "");
const to = opt("--to")!;
const goneOnly = argv.includes("--gone-only");
const dry = argv.includes("--dry");
const overwrite = argv.includes("--overwrite");
const only = opt("--only") ? new RegExp(opt("--only")!) : undefined; // restrict to matching paths (e.g. Go or Python files)
const root = join(import.meta.dir, "..").replace(/\\/g, "/");

const head = new Set<string>();
for (const l of (await Bun.$`git -C ${root} ls-tree -r HEAD`.quiet().text()).split("\n")) { const m = /^\d+ blob ([0-9a-f]{40})\t/.exec(l); if (m) head.add(m[1]); }
const headPaths = new Set((await Bun.$`git -C ${root} ls-tree -r --name-only HEAD`.quiet().text()).split("\n"));

const out = join(process.env.TEMP ?? "/tmp", "restore", "hist", `${commit.slice(0, 9)}_${dir.replace(/[/\\]/g, "_")}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tree = await Bun.$`git -C ${root} ls-tree -r ${commit}^ -- ${dir}`.quiet().text();
let n = 0, skipped = 0;
for (const l of tree.split("\n")) {
  const m = /^(\d+) blob ([0-9a-f]{40})\t(.*)$/.exec(l.replace(/"/g, ""));
  if (!m) continue;
  if (only && !only.test(m[3])) continue;
  if (goneOnly && (head.has(m[2]) || headPaths.has(m[3]))) { skipped++; continue; }
  const rel = m[3].slice(dir.length + 1);
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const data = await Bun.$`git -C ${root} cat-file blob ${m[2]}`.quiet().arrayBuffer();
  await Bun.write(dest, new Uint8Array(data));
  n++;
}
console.error(`${dir}@${commit.slice(0, 9)}^: ${n} files extracted, ${skipped} still in HEAD`);
const r = await Bun.$`bun ${import.meta.dir}/restore-import.ts --dir ${out} --to ${to} ${dry ? ["--dry"] : []} ${overwrite ? ["--overwrite"] : []}`.nothrow().text();
console.log(r);
