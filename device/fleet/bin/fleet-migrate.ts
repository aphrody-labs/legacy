#!/usr/bin/env bun
// Inventory-driven plan to bring every checkout of a host into the one layout (cluster.toml [layout], docs/infra/SINGLE-SERVER.md).
//   bun fleet-migrate.ts <inventory.json> <host-role> <out-dir> [--layout key=value ...]
// Reads: the inventory written by fleet-rescue-inventory.ts, tools/identity.toml ([product] repo, [orgs]), cluster.toml [layout]
// (through `layout` key=value pairs, default parsed from device/fleet/cluster.toml). Writes <out-dir>/<host>.plan.json and
// <out-dir>/<host>.sh. The script is a DRY RUN unless APPLY=1; it never deletes a checkout that has unpushed commits, dirty files,
// no remote, a referencing service, an open file or a modification within 7 days, and it moves with a compatibility symlink
// at the old path (reversible: remove the link, move back). Service repointing edits the unit text, then restarts only with RESTART=1.
// Names are never literal: the monorepo directory is {repo} of identity.toml, other checkouts are <org>/<repo> read from the remote.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { posix, dirname as pdir, join as pjoin } from "node:path";
const { dirname, basename, join } = posix;

const [invPath, host, outDir] = Bun.argv.slice(2);
if (!invPath || !host || !outDir) { console.error("usage: fleet-migrate.ts <inventory.json> <host> <out-dir>"); process.exit(64); }
const root = pjoin(pdir(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..", "..");

const toml = (path: string) => {
  const out: Record<string, Record<string, string>> = {}; let sec = "";
  for (const l of readFileSync(path, "utf8").split("\n")) {
    const m = l.match(/^\s*\[([^\]]+)\]/); if (m) { sec = m[1]; out[sec] ??= {}; continue; }
    const kv = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/); if (kv && sec) out[sec][kv[1]] = kv[2];
  }
  return out;
};
const id = toml(pjoin(root, "tools/identity.toml")), cl = toml(pjoin(root, "device/fleet/cluster.toml")).layout;
const sub = (v: string) => v.replaceAll("{root}", cl.root).replaceAll("{repo}", id.product.repo);
const L = { monorepo: sub(cl.monorepo), repos: sub(cl.repos), data: sub(cl.data), xbuild: sub(cl.xbuild) };
const orgs = new Set(Object.values(id.orgs ?? {}));
const monoNames = new Set([id.product.repo, "src"]); // "src": the name the repository had before the rename (GitHub redirects)

type Repo = { path: string; bare: boolean; shallow: boolean; remotes: string[]; branch: string; unpushedCommits: number; dirtyTracked: number; stashes: number; lastCommit: string; sizeKb: number; services: string[] };
const inv = JSON.parse(readFileSync(invPath, "utf8")) as { repos: Repo[]; sourceTreesWithoutGit: string[] };
const paths = inv.repos.map((r) => r.path);
const nested = (r: Repo) => paths.some((p) => p !== r.path && r.path.startsWith(p + "/"));

const byPath = new Map(inv.repos.map((r) => [r.path, r]));
function ident(r: Repo, depth = 0): { org: string; name: string } {
  const u = r.remotes[0]?.split(/\s+/)[1];
  // a clone of a checkout of this host (origin is a local path): same identity as the checkout it was cloned from
  const lp = u?.replace(/^file:\/\//, "");
  if (lp?.startsWith("/") && depth < 4 && byPath.has(lp)) return ident(byPath.get(lp)!, depth + 1);
  if (!u) return { org: "_local", name: basename(r.path).replace(/\.git$/, "") };
  const m = u.match(/^(?:https?:\/\/|git@|ssh:\/\/git@)([^/:]+)[/:](?:([^/]+)\/)?([^/]+?)(?:\.git)?\/?$/);
  if (!m) return { org: "_local", name: basename(r.path) };
  return { org: m[1] === "github.com" ? (m[2] ?? "_") : m[1], name: m[3] };
}
const isMono = (i: { org: string; name: string }) => orgs.has(i.org) && monoNames.has(i.name);
const target = (r: Repo) => { const i = ident(r); return isMono(i) ? L.monorepo : join(L.repos, i.org, i.name); };

const live = inv.repos.filter((r) => !nested(r) && !r.path.startsWith(L.xbuild + "/")); // xbuild holds caches, rescue copies and backups: never planned
const groups = new Map<string, Repo[]>();
for (const r of live) { const i = ident(r); const k = isMono(i) ? "@mono" : `${i.org}/${i.name}`; groups.set(k, [...(groups.get(k) ?? []), r]); }

const score = (r: Repo, want: string) =>
  (r.path === want ? 1000 : 0) + (r.services.length ? 500 : 0) + (r.shallow ? 0 : 100) - r.dirtyTracked * 10 + (r.unpushedCommits > 0 ? 5 : 0) + Date.parse(r.lastCommit || "1970-01-01") / 1e12;

type Act = { kind: "keep" | "move" | "delete-dup" | "rescue" | "push" | "repoint"; path: string; to?: string; why: string; services?: string[] };
const acts: Act[] = [];
for (const [k, rs] of groups) {
  const want = k === "@mono" ? L.monorepo : target(rs[0]);
  const canon = [...rs].sort((a, b) => score(b, want) - score(a, want))[0];
  for (const r of rs) {
    const noRemote = r.remotes.length === 0;
    if (r === canon) {
      if (noRemote) acts.push({ kind: "rescue", path: r.path, to: join(L.xbuild, "rescue", host, r.path), why: "no remote: copy, keep (never deleted)" });
      if (r.path === want) acts.push({ kind: "keep", path: r.path, why: "already at the layout path" });
      else if (r.dirtyTracked > 0 && want !== L.monorepo) acts.push({ kind: "push", path: r.path, why: `${r.dirtyTracked} dirty files: left in place until its owner commits (then it moves to ${want})` });
      else acts.push({ kind: "move", path: r.path, to: want, why: `canonical copy of ${k}`, services: r.services });
      if (r.unpushedCommits > 0 || r.dirtyTracked > 0) acts.push({ kind: "push", path: r.path, why: `${r.unpushedCommits} unpushed, ${r.dirtyTracked} dirty: push before anything moves` });
      continue;
    }
    if (noRemote || r.unpushedCommits !== 0 || r.dirtyTracked > 0 || r.stashes > 0) {
      acts.push({ kind: "push", path: r.path, why: `duplicate of ${canon.path} holding ${r.unpushedCommits} unpushed, ${r.dirtyTracked} dirty, ${r.stashes} stashes (-1 = shallow, unknown): push or rescue, then it becomes deletable` });
      if (noRemote) acts.push({ kind: "rescue", path: r.path, to: join(L.xbuild, "rescue", host, r.path), why: "no remote" });
      continue;
    }
    if (r.services.length) { acts.push({ kind: "repoint", path: r.path, to: want, why: "duplicate referenced by a service", services: r.services }); continue; }
    acts.push({ kind: "delete-dup", path: r.path, why: `clean duplicate of ${canon.path} (${Math.round(r.sizeKb / 1024)} MB, no service, no unpushed, no dirty)` });
  }
}
const plan = { host, layout: L, repos: inv.repos.length, groups: groups.size, actions: acts, sourceTreesWithoutGit: inv.sourceTreesWithoutGit.length };
mkdirSync(outDir, { recursive: true });
writeFileSync(pjoin(outDir, `${host}.plan.json`), JSON.stringify(plan, null, 1));

const q = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
// PART=now: checkouts no service uses; PART=window: monorepo and service-referenced paths (production hosts run these in the owner window)
const isSvc = (a: Act) => (a.services?.length ?? 0) > 0 || a.to === L.monorepo || a.kind === "repoint";
const part = process.env.PART ?? "all";
const sel = acts.filter((a) => part === "window" ? isSvc(a) : part === "now" ? !isSvc(a) : true);
const suffix = part === "all" ? "" : `.${part}`;
const sh: string[] = [
  "#!/bin/bash", `# Generated by device/fleet/bin/fleet-migrate.ts for ${host}; DRY RUN unless APPLY=1 (RESTART=1 also restarts repointed units).`,
  "set -u", 'run() { if [ "${APPLY:-0}" = 1 ]; then echo "+ $*"; "$@"; else echo "  would: $*"; fi; }',
  'busy() { ls -l /proc/[0-9]*/cwd 2>/dev/null | grep -q -- "-> $1"; }',
  'idle() { [ -z "$(find "$1" -maxdepth 6 -newermt "-7 days" -not -path "*/.git/*" -print -quit 2>/dev/null)" ] && ! ls -l /proc/[0-9]*/cwd 2>/dev/null | grep -q -- "-> $1"; }',
  `run install -d ${q(L.repos)} ${q(L.xbuild + "/rescue/" + host)}`,
];
for (const a of sel) {
  if (a.kind === "keep") continue;
  sh.push(`# ${a.kind}: ${a.path}${a.to ? " -> " + a.to : ""} (${a.why})`);
  if (a.kind === "move") {
    sh.push(`if [ -e ${q(a.path)} ] && [ ! -L ${q(a.path)} ] && [ ! -e ${q(a.to!)} ]${a.services?.length || a.to === L.monorepo ? "" : ` && idle ${q(a.path)}`}; then run install -d ${q(dirname(a.to!))}; run mv ${q(a.path)} ${q(a.to!)}; [ "\${APPLY:-0}" = 1 ] && printf '%s\\t%s\\n' ${q(a.path)} ${q(a.to!)} >> ${q(L.xbuild + "/rescue/" + host + "/moves.tsv")}; ${a.services?.length || a.to === L.monorepo ? `run ln -s ${q(a.to!)} ${q(a.path)}` : "true"}; fi`);
    if (a.services?.length) sh.push("# units: their repo copy carries @@layout.monorepo@@ and is re-rendered on the next fleet-ship; the host copy is edited now");
    for (const s of a.services ?? []) sh.push(`[ -f ${q(s)} ] && run sed -i -E ${q(`s#${a.path.replace(/[.]/g, "[.]")}([^A-Za-z0-9_.-]|$)#${a.to}\\1#g`)} ${q(s)}`);
    if (a.services?.length) sh.push('run systemctl daemon-reload', '[ "${RESTART:-0}" = 1 ] && echo "restart and PROVE each unit above with a real call whose content is checked"');
  } else if (a.kind === "repoint") {
    for (const s of a.services ?? []) sh.push(`[ -f ${q(s)} ] && run sed -i -E ${q(`s#${a.path.replace(/[.]/g, "[.]")}([^A-Za-z0-9_.-]|$)#${a.to}\\1#g`)} ${q(s)}`);
    sh.push("run systemctl daemon-reload");
  } else if (a.kind === "rescue") {
    sh.push(`[ ! -e ${q(a.to!)} ] && run install -d ${q(dirname(a.to!))} && run cp -a --reflink=auto ${q(a.path)} ${q(a.to!)}`);
  } else if (a.kind === "push") {
    sh.push(`echo "  NEEDS PUSH OR RESCUE FIRST: ${a.path}"`);
  } else if (a.kind === "delete-dup") {
    sh.push(`if [ -n "$(git -c safe.directory=\x27*\x27 -C ${q(a.path)} status --porcelain 2>/dev/null)" ]; then echo "  kept (untracked or modified files inside): ${a.path}"; elif ! busy ${q(a.path)}; then run rm -rf ${q(a.path)}; else echo "  kept (a process works inside): ${a.path}"; fi`);
  }
}
writeFileSync(pjoin(outDir, `${host}${suffix}.sh`), sh.join("\n") + "\n");
const n = (k: string) => acts.filter((a) => a.kind === k).length;
console.log(JSON.stringify({ host, repos: inv.repos.length, canonicalGroups: groups.size, keep: n("keep"), move: n("move"), deleteDup: n("delete-dup"), pushOrRescue: n("push"), rescue: n("rescue"), repoint: n("repoint"), treesWithoutGit: inv.sourceTreesWithoutGit.length }));
