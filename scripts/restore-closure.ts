// Restore tool: bring back Rust crates of a cloned workspace together with their path-dependency closure, one directory
// per crate under --to (the identity prefix is stripped from the directory name), through restore-import (gitleaks gate,
// no overwrite). Path dependencies between restored crates are rewritten to the new directory names; a crate whose
// directory already exists in the tree is not touched (single copy) and counts as satisfied.
// Usage: bun scripts/restore-closure.ts --clone <dir> --crates a,b,c --to src [--prefix aphrody-] [--crates-dir crates] [--dry]
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const argv = Bun.argv.slice(2);
const opt = (k: string, d?: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const clone = opt("--clone")!;
const want = opt("--crates")!.split(",");
const to = opt("--to")!;
const prefix = opt("--prefix", "aphrody-")!;
const cdir = opt("--crates-dir", "crates")!;
const dry = argv.includes("--dry");
const root = join(import.meta.dir, "..").replace(/\\/g, "/");

const dirs = new Set(readdirSync(join(clone, cdir)));
const pathDeps = (dir: string) => {
  const t = readFileSync(join(clone, cdir, dir, "Cargo.toml"), "utf8");
  return [...t.matchAll(/path\s*=\s*"\.\.\/([^"/]+)"/g)].map((m) => m[1]).filter((d) => dirs.has(d));
};
const closure = new Set<string>();
const visit = (d: string) => { if (closure.has(d) || !dirs.has(d)) return; closure.add(d); pathDeps(d).forEach(visit); };
for (const w of want) visit(w.startsWith(prefix) ? w : prefix + w);
const name = (d: string) => (d.startsWith(prefix) ? d.slice(prefix.length) : d);
const report: Record<string, unknown>[] = [];
const created: string[] = [];
for (const d of [...closure].sort()) {
  const dest = `${to}/${name(d)}`;
  if (existsSync(join(root, dest))) { report.push({ crate: d, dest, status: "exists, kept" }); continue; }
  const r = await Bun.$`bun ${import.meta.dir}/restore-import.ts --repo-dir-unused --dir ${join(clone, cdir, d)} --to ${dest} ${dry ? ["--dry"] : []}`.nothrow().text();
  let j: any = {}; try { j = JSON.parse(r); } catch { j = { error: r.slice(0, 200) }; }
  report.push({ crate: d, dest, written: j.written, secrets: j.secrets?.length, error: j.error });
  created.push(dest);
}
if (!dry) {
  for (const dest of created) {
    const f = join(root, dest, "Cargo.toml");
    if (!existsSync(f)) continue;
    let s = readFileSync(f, "utf8");
    s = s.replace(/path\s*=\s*"\.\.\/([^"/]+)"/g, (m, d) => (closure.has(d) ? `path = "../${name(d)}"` : m));
    writeFileSync(f, s);
  }
}
console.log(JSON.stringify(report, null, 1));
