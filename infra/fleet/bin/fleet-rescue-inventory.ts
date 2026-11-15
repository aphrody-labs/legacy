#!/usr/bin/env bun
// Inventory of everything that is not a cache under the given roots, before any purge (docs/infra/SINGLE-SERVER.md, rescue).
//   sudo bun fleet-rescue-inventory.ts <out.json> <root> [<root> ...]
// Read-only. Walks without entering .git, node_modules, target, caches. Records:
//   repos     work trees (a `.git` entry) and bare repos (HEAD + objects + refs): remotes, branch, commits on no remote
//             (`git log --branches --not --remotes`), stashes, uncommitted tracked changes, last commit date
//   trees     directories with a source manifest (Cargo.toml, package.json, pyproject.toml, go.mod, setup.py, *.csproj,
//             CMakeLists.txt, Makefile) that no repo above them covers: sources without any git history
// Nothing is copied, pushed or deleted here; the report decides what the rescue step does.
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const [out, ...roots] = Bun.argv.slice(2);
if (!out || roots.length === 0) { console.error("usage: fleet-rescue-inventory.ts <out.json> <root>..."); process.exit(64); }

const SKIP = new Set([".git", "node_modules", "target", ".cache", ".npm", ".rustup", "__pycache__", ".gradle", ".nuget", ".pnpm-store", "site-packages", ".venv", "venv", "dist-newstyle"]);
const MANIFESTS = /^(Cargo\.toml|package\.json|pyproject\.toml|go\.mod|setup\.py|CMakeLists\.txt|Makefile|.*\.csproj|.*\.sln)$/;
const repos: { path: string; bare: boolean }[] = [];
const manifestDirs = new Set<string>();
let dirs = 0;

function walk(dir: string): void {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  dirs++;
  const names = new Set(ents.map((e) => e.name));
  if (names.has(".git")) repos.push({ path: dir, bare: false });
  else if (names.has("HEAD") && names.has("objects") && names.has("refs") && !dir.includes("/.git/")) { repos.push({ path: dir, bare: true }); return; }
  for (const e of ents) {
    if (e.isFile() && MANIFESTS.test(e.name)) manifestDirs.add(dir);
    if (e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name)) {
      if (e.name === "registry" && (dir.endsWith("/.cargo") || dir.endsWith("/.cargo/registry"))) continue;
      walk(join(dir, e.name));
    }
  }
}
for (const r of roots) if (existsSync(r)) walk(r);

const g = (cwd: string, ...a: string[]) => {
  const p = Bun.spawnSync(["git", "-c", "safe.directory=*", "-C", cwd, ...a], { stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : "";
};
const repoSet = repos.map((r) => r.path);
const covered = (d: string) => repoSet.some((r) => d === r || d.startsWith(r + "/"));

const repoRows = repos.map((r) => {
  const gitdir = r.bare ? r.path : r.path;
  const remotes = g(gitdir, "remote", "-v").split("\n").filter(Boolean).filter((l) => l.endsWith("(fetch)")).map((l) => l.replace(/\s+\(fetch\)$/, "").replace(/\/\/[^@/]+@/, "//***@"));
  const unpushed = g(gitdir, "log", "--branches", "--not", "--remotes", "--oneline", "-n", "1000").split("\n").filter(Boolean).length;
  const dirty = r.bare ? 0 : g(gitdir, "status", "--porcelain", "-uno").split("\n").filter(Boolean).length;
  return {
    path: r.path, bare: r.bare, remotes, branch: g(gitdir, "rev-parse", "--abbrev-ref", "HEAD"),
    unpushedCommits: unpushed, dirtyTracked: dirty, stashes: g(gitdir, "stash", "list").split("\n").filter(Boolean).length,
    lastCommit: g(gitdir, "log", "-1", "--format=%cI", "--all"),
  };
});
const trees = [...manifestDirs].filter((d) => !covered(d)).filter((d) => !manifestDirs.has(dirname(d)) || !covered(dirname(d))).sort();
// keep only the topmost uncovered manifest directories
const top = trees.filter((d, i) => !trees.slice(0, i).some((p) => d.startsWith(p + "/")));
const report = {
  generated: new Date().toISOString(), roots, dirsWalked: dirs,
  summary: {
    repos: repoRows.length, bare: repoRows.filter((r) => r.bare).length, noRemote: repoRows.filter((r) => r.remotes.length === 0).length,
    withUnpushed: repoRows.filter((r) => r.unpushedCommits > 0).length, withDirty: repoRows.filter((r) => r.dirtyTracked > 0).length,
    sourceTreesWithoutGit: top.length,
  },
  repos: repoRows, sourceTreesWithoutGit: top,
};
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.summary));
