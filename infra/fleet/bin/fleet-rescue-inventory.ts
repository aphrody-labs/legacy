#!/usr/bin/env bun
// Inventory of everything that is not a cache under the given roots, before any purge (docs/infra/SINGLE-SERVER.md, rescue).
//   sudo bun fleet-rescue-inventory.ts <out.json> <root> [<root> ...]
// Read-only. Walks without entering .git, node_modules, target, caches. Records:
//   repos     work trees (a `.git` entry) and bare repos (HEAD + objects + refs): remotes, branch, commits on no remote
//             (`git log --branches --not --remotes`), stashes, uncommitted tracked changes, last commit date
//   size      kilobytes of each repo (du -sk, one filesystem)
//   services  per repo, the systemd units, compose files, nginx/haproxy configs and cron entries whose text mentions its path
//   trees     directories with a source manifest (Cargo.toml, package.json, pyproject.toml, go.mod, setup.py, *.csproj,
//             CMakeLists.txt, Makefile) that no repo above them covers: sources without any git history
// Nothing is copied, pushed or deleted here; the report decides what the rescue step does.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const [out, ...roots] = Bun.argv.slice(2);
if (!out || roots.length === 0) { console.error("usage: fleet-rescue-inventory.ts <out.json> <root>..."); process.exit(64); }

// third-party caches that hold git clones but no work of ours (plugin managers, package caches, agent snapshots)
const PRUNE = ["/.bun/install", "/.local/share/nvim", "/.local/share/opencode", "/.local/share/pnpm", "/.cargo/registry", "/.cargo/git", "/.cache", "/.npm", "/.rustup", "/.claude/plugins", "/.nvm", "/.pyenv", "/go/pkg"];
const SKIP = new Set([".git", "node_modules", "target", ".cache", ".npm", ".rustup", "__pycache__", ".gradle", ".nuget", ".pnpm-store", "site-packages", ".venv", "venv", "dist-newstyle"]);
const MANIFESTS = /^(Cargo\.toml|package\.json|pyproject\.toml|go\.mod|setup\.py|CMakeLists\.txt|Makefile|.*\.csproj|.*\.sln)$/;
const repos: { path: string; bare: boolean }[] = [];
const manifestDirs = new Set<string>();
let dirs = 0;

const ONE_FS = process.env.ONE_FS === "1"; // stay on the filesystem of each root (skip the btrfs pool mounts under /srv)
let rootDev = 0;
function walk(dir: string): void {
  if (ONE_FS) { try { if (statSync(dir).dev !== rootDev) return; } catch { return; } }
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (PRUNE.some((x) => dir.includes(x))) return;
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
for (const r of roots) if (existsSync(r)) { if (ONE_FS) rootDev = statSync(r).dev; walk(r); }

const g = (cwd: string, ...a: string[]) => {
  const p = Bun.spawnSync(["git", "-c", "safe.directory=*", "-C", cwd, ...a], { stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : "";
};
const repoSet = repos.map((r) => r.path);
const covered = (d: string) => repoSet.some((r) => d === r || d.startsWith(r + "/"));

// text of every service definition, read once
const svcFiles: string[] = [];
for (const d of ["/etc/systemd/system", "/etc/nginx", "/etc/haproxy", "/etc/aphrody-cluster", "/etc/cron.d", "/var/spool/cron", "/var/spool/cron/crontabs"]) {
  const stack = [d];
  while (stack.length) { const x = stack.pop()!; let es; try { es = readdirSync(x, { withFileTypes: true }); } catch { continue; } for (const e of es) { const f = join(x, e.name); if (e.isDirectory()) stack.push(f); else if (e.isFile()) svcFiles.push(f); } }
}
for (const r of roots) { const st = [r]; let n = 0; while (st.length && n < 20000) { const x = st.pop()!; n++; let es; try { es = readdirSync(x, { withFileTypes: true }); } catch { continue; } for (const e of es) { if (SKIP.has(e.name)) continue; const f = join(x, e.name); if (e.isDirectory()) st.push(f); else if (/^(docker-)?compose.*\.ya?ml$/.test(e.name)) svcFiles.push(f); } } }
const svcText = svcFiles.map((f) => { try { return [f, readFileSync(f, "utf8")] as const; } catch { return [f, ""] as const; } });
const crontabs = Bun.spawnSync(["sh", "-c", "for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u $u 2>/dev/null | sed \"s|^|$u: |\"; done"]).stdout.toString();
const usedBy = (path: string) => [...svcText.filter(([, t]) => t.includes(path)).map(([f]) => f), ...(crontabs.includes(path) ? ["crontab"] : [])];

const repoRows = repos.map((r) => {
  const gitdir = r.bare ? r.path : r.path;
  const remotes = g(gitdir, "remote", "-v").split("\n").filter(Boolean).filter((l) => l.includes("(fetch)")).map((l) => l.replace(/\s+\(fetch\).*$/, "").replace(/\/\/[^@/]+@/, "//***@"));
  const shallow = g(gitdir, "rev-parse", "--is-shallow-repository") === "true";
  const unpushed0 = g(gitdir, "log", "--branches", "--not", "--remotes", "--oneline", "-n", "1000").split("\n").filter(Boolean).length;
  const unpushed = shallow ? -1 : unpushed0; // shallow clones cannot tell
  const dirty = r.bare ? 0 : g(gitdir, "status", "--porcelain", "-uno").split("\n").filter(Boolean).length;
  return {
    path: r.path, bare: r.bare, shallow, remotes, branch: g(gitdir, "rev-parse", "--abbrev-ref", "HEAD"),
    unpushedCommits: unpushed, dirtyTracked: dirty, stashes: g(gitdir, "stash", "list").split("\n").filter(Boolean).length,
    lastCommit: g(gitdir, "log", "-1", "--format=%cI", "--all"),
    sizeKb: Number(Bun.spawnSync(["du", "-sxk", r.path]).stdout.toString().split("\t")[0]) || 0, services: usedBy(r.path),
  };
});
const trees = [...manifestDirs].filter((d) => !covered(d)).filter((d) => !manifestDirs.has(dirname(d)) || !covered(dirname(d))).sort();
// keep only the topmost uncovered manifest directories
const top = trees.filter((d, i) => !trees.slice(0, i).some((p) => d.startsWith(p + "/")));
const report = {
  generated: new Date().toISOString(), roots, dirsWalked: dirs,
  summary: {
    repos: repoRows.length, bare: repoRows.filter((r) => r.bare).length, noRemote: repoRows.filter((r) => r.remotes.length === 0).length,
    withUnpushed: repoRows.filter((r) => r.unpushedCommits > 0).length, shallow: repoRows.filter((r) => r.shallow).length, withDirty: repoRows.filter((r) => r.dirtyTracked > 0).length,
    sourceTreesWithoutGit: top.length,
  },
  repos: repoRows, sourceTreesWithoutGit: top,
};
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.summary));
