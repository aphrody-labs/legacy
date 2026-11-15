#!/usr/bin/env bun
// Second half of the rescue (after fleet-rescue-inventory.ts), run as root on the host that is about to lose a disk:
//   bun fleet-rescue-apply.ts <inventory.json> <rescue-dir> [--only-prefix /home]
// For every repo under the prefix that has unpushed commits (or whose state is unknown because it is shallow and differs from its
// upstream) or no remote: try `git push --all` to its remote (never forced); when that fails or there is no remote, copy the whole
// repository (with .git) into <rescue-dir>/trees/<absolute path>. Every source tree without git is copied the same way (rsync, build
// output and package caches excluded). Nothing is deleted. Result: <rescue-dir>/apply.json (one row per path: action, result, bytes).
import { writeFileSync, mkdirSync } from "node:fs";

const [invPath, rescue, flag, prefix = "/"] = Bun.argv.slice(2);
if (!invPath || !rescue) { console.error("usage: fleet-rescue-apply.ts <inventory.json> <rescue-dir> [--only-prefix P]"); process.exit(64); }
const inv = await Bun.file(invPath).json() as { repos: any[]; sourceTreesWithoutGit: string[] };
const under = (p: string) => flag !== "--only-prefix" || p.startsWith(prefix);
const sh = (cmd: string[], t = 600) => { const r = Bun.spawnSync(["timeout", String(t), ...cmd], { stdout: "pipe", stderr: "pipe" }); return { ok: r.exitCode === 0, out: (r.stdout.toString() + r.stderr.toString()).trim().slice(0, 300) }; };
const EXC = ["--exclude=node_modules", "--exclude=target", "--exclude=__pycache__", "--exclude=.cache", "--exclude=*.o", "--exclude=dist"];
const dest = (p: string) => `${rescue}/trees${p}`;
const copy = (p: string) => { mkdirSync(dest(p), { recursive: true }); return sh(["rsync", "-a", ...EXC, `${p}/`, `${dest(p)}/`], 1800); };
const rows: any[] = [];

for (const r of inv.repos.filter((r) => under(r.path))) {
  const noRemote = r.remotes.length === 0;
  const risky = noRemote || r.unpushedCommits !== 0 || r.dirtyTracked > 0 || r.stashes > 0;
  if (!risky) continue;
  let res = "";
  if (!noRemote && !r.bare && r.unpushedCommits > 0) {
    const p = sh(["git", "-c", "safe.directory=*", "-C", r.path, "push", "--all", "--no-verify"], 300);
    res = p.ok ? "pushed" : `push-failed: ${p.out}`;
    if (p.ok) { rows.push({ path: r.path, action: "push", result: res }); if (r.dirtyTracked === 0 && r.stashes === 0) continue; }
  }
  const c = copy(r.path);
  rows.push({ path: r.path, action: "copy", reason: noRemote ? "no remote" : `unpushed=${r.unpushedCommits} dirty=${r.dirtyTracked} stashes=${r.stashes}`, push: res || undefined, result: c.ok ? "copied" : `copy-failed: ${c.out}` });
}
for (const t of inv.sourceTreesWithoutGit.filter(under)) {
  const c = copy(t);
  rows.push({ path: t, action: "copy", reason: "source tree without git", result: c.ok ? "copied" : `copy-failed: ${c.out}` });
}
writeFileSync(`${rescue}/apply.json`, JSON.stringify(rows, null, 1));
const n = (k: string) => rows.filter((x) => x.result?.startsWith(k)).length;
console.log(JSON.stringify({ rows: rows.length, pushed: n("pushed"), copied: n("copied"), failed: rows.filter((x) => /failed/.test(x.result)).length }));
