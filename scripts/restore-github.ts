// Restore inventory, GitHub side: every repo reachable by the token (user, orgs, collaborator), archived and forks included.
// Content comparison by blob oid, not by name: a treeless depth-1 clone gives the remote tree without downloading blobs;
// each remote blob oid is looked up in the oid set of the monorepo HEAD. Forks are compared to their parent (compare API).
// Usage: bun scripts/restore-github.ts --out <json> [--work <dir>] [--only owner/repo,...] [--jobs 6]
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const arg = (k: string, d?: string) => (Bun.argv.includes(k) ? Bun.argv[Bun.argv.indexOf(k) + 1] : d);
const out = arg("--out")!;
const work = arg("--work", join(process.env.TEMP ?? "/tmp", "restore", "gh"))!;
const only = arg("--only")?.split(",");
const jobs = Number(arg("--jobs", "6"));
const root = join(import.meta.dir, "..").replace(/\\/g, "/");
mkdirSync(work, { recursive: true });

const token = (process.env.GH_TOKEN ?? (await Bun.$`bash ${process.env.HOME}/.local/bin/gh auth token`.nothrow().quiet().text())).trim();
const api = async (path: string): Promise<any> => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "aphrody-restore" } });
    if (r.status === 403 || r.status === 429) { await Bun.sleep(5000); continue; }
    if (!r.ok) return { __status: r.status };
    return r.json();
  }
  return { __status: 429 };
};
const pages = async (path: string) => {
  const all: any[] = [];
  for (let p = 1; p < 50; p++) {
    const j = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`);
    if (!Array.isArray(j)) break;
    all.push(...j);
    if (j.length < 100) break;
  }
  return all;
};

// 1. Discovery: user repos (all affiliations) + every org the user belongs to + personal accounts seen as owners.
const repos = new Map<string, any>();
const add = (l: any[]) => l.forEach((r) => repos.set(r.full_name, r));
add(await pages("user/repos?affiliation=owner,collaborator,organization_member"));
const orgs = (await pages("user/orgs")).map((o) => o.login);
for (const o of orgs) add(await pages(`orgs/${o}/repos?type=all`));
const me = (await api("user")).login;
for (const o of new Set([me, ...[...repos.values()].map((r) => r.owner.login)])) {
  if (!orgs.includes(o)) add(await pages(`users/${o}/repos?type=all`));
}
console.error(`discovered ${repos.size} repos, owners: ${[...new Set([...repos.values()].map((r) => r.owner.login))].join(",")}`);

// 2. Local oid set (monorepo HEAD) and oid -> path map.
const lsTree = await Bun.$`git -C ${root} ls-tree -r HEAD`.quiet().text();
const oidPath = new Map<string, string>();
for (const line of lsTree.split("\n")) {
  const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.*)$/.exec(line);
  if (m && m[2] === "blob") oidPath.set(m[3], m[4]);
}
const forksTxt = await Bun.file(`${root}/third_party/forks.txt`).text();
const lockTxt = await Bun.file(`${root}/src.lock.json`).text();
const EMPTY = "e69de29bb2d1d6434b8b29ae775ad8c7bd3d7f45";

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${btoa(`x-access-token:${token}`)}` };
const git = async (args: string[], cwd?: string) => {
  const p = Bun.spawn(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out: o, err: e };
};

type Row = Record<string, unknown>;
const rows: Row[] = [];
const shas = new Map<string, string[]>(); // repo -> non-default branch tip shas

const inspect = async (r: any) => {
  const base: Row = {
    source: "github", id: r.full_name, kind: r.fork ? "fork" : "repo", language: r.language ?? "-", updated: r.pushed_at,
    archived: r.archived, private: r.private, sizeKb: r.size, description: r.description ?? "", defaultBranch: r.default_branch,
  };
  if (r.fork) {
    const parent = r.parent ?? (await api(`repos/${r.full_name}`)).parent;
    base.parent = parent?.full_name;
    if (parent) {
      const c = await api(`repos/${r.full_name}/compare/${parent.owner.login}:${parent.default_branch}...${r.owner.login}:${r.default_branch}`);
      base.ahead = c.ahead_by; base.behind = c.behind_by;
    }
    const short = r.name;
    base.pinned = forksTxt.includes(r.full_name) || lockTxt.includes(`aphrody-labs/${short}`) || lockTxt.includes(`/${short}"`) || lockTxt.includes(`/${short}.git`);
    base.status = base.ahead && Number(base.ahead) > 0 ? "unique-commits" : "present-identical";
    base.note = base.ahead ? `fork ${base.ahead} commit(s) ahead of ${base.parent}${base.pinned ? ", pinned in tree" : ""}` : `pristine fork of ${base.parent}${base.pinned ? ", pinned in tree" : ""}`;
    rows.push(base);
    return;
  }
  if (!r.size) { rows.push({ ...base, status: "missing", note: "empty repository" }); return; }
  const dir = join(work, r.full_name.replace("/", "__"));
  if (!existsSync(join(dir, ".git", "HEAD"))) {
    const c = await git(["clone", "--filter=blob:none", "--depth=1", "--no-checkout", "--single-branch", "-q", `https://github.com/${r.full_name}.git`, dir]);
    if (c.code) { rows.push({ ...base, status: "blocked", note: c.err.trim().slice(0, 200) }); return; }
  }
  const t = await git(["ls-tree", "-r", "HEAD"], dir);
  const rem = t.out.split("\n").map((l) => /^(\d+) blob ([0-9a-f]{40})\t(.*)$/.exec(l)).filter(Boolean).map((m) => ({ oid: m![2], path: m![3] }));
  const real = rem.filter((x) => x.oid !== EMPTY);
  const hit = real.filter((x) => oidPath.has(x.oid));
  const dirs = new Map<string, number>();
  for (const h of hit) {
    const p = oidPath.get(h.oid)!.split("/").slice(0, 2).join("/");
    dirs.set(p, (dirs.get(p) ?? 0) + 1);
  }
  const best = [...dirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p}(${n})`);
  const ratio = real.length ? hit.length / real.length : 0;
  const head = (await git(["rev-parse", "HEAD"], dir)).out.trim();
  const lr = await git(["ls-remote", "--heads", "--tags", `https://github.com/${r.full_name}.git`]);
  const refs = lr.out.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]);
  const heads = refs.filter(([, n]) => n.startsWith("refs/heads/"));
  shas.set(r.full_name, [head, ...heads.map(([s]) => s)]);
  rows.push({ ...base, files: real.length, shared: hit.length, ratio: Number(ratio.toFixed(3)), monorepoPaths: best, head, branches: heads.length, tags: refs.length - heads.length, branchNames: heads.map(([, n]) => n.slice(11)).slice(0, 12) });
};

const queue = [...repos.values()].filter((r) => !only || only.includes(r.full_name));
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) {
    const r = queue.shift()!;
    try { await inspect(r); } catch (e) { rows.push({ source: "github", id: r.full_name, kind: "repo", status: "blocked", note: String(e).slice(0, 200) }); }
    if (rows.length % 25 === 0) console.error(`${rows.length}/${repos.size}`);
  }
}));

// 3. History presence: which remote tips already exist in the monorepo object database; unknown tips are unique commits.
const all = [...new Set([...shas.values()].flat())];
const known = new Set<string>();
if (all.length) {
  const p = Bun.spawn(["git", "-C", root, "cat-file", "--batch-check"], { stdin: new Blob([all.map((s) => `${s}\n`).join("")]), stdout: "pipe" });
  for (const l of (await new Response(p.stdout).text()).split("\n")) { const m = /^([0-9a-f]{40}) commit/.exec(l); if (m) known.add(m[1]); }
}
for (const row of rows) {
  const s = shas.get(row.id as string);
  if (!s) continue;
  const [head, ...tips] = s;
  const unknownTips = tips.filter((t) => !known.has(t)).length;
  row.headInHistory = known.has(head);
  row.unknownBranchTips = unknownTips;
  const ratio = Number(row.ratio ?? 0);
  let status = ratio >= 0.98 ? "present-identical" : row.headInHistory ? "present-newer" : ratio > 0.05 ? "present-older" : "missing";
  if (unknownTips > 0 && status === "present-identical") status = "unique-commits";
  row.status = status;
}
rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
await Bun.write(out, JSON.stringify({ at: new Date().toISOString(), monorepoHead: (await Bun.$`git -C ${root} rev-parse HEAD`.quiet().text()).trim(), orgs, rows }, null, 1));
console.error(`done ${rows.length}`);
