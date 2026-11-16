#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Deterministic NHITL VCS & GitHub Forge controller (`ay-vcs` / `just vcs`).
// Authenticated exclusively via the `aphrody-labs` GitHub App (`tools/agents/gh-token.ts`)
// and backed by Git 2.56 (Scalar/blobless), Gitoxide (`gix` 0.61), Jujutsu (`jj` 0.46),
// and `src.lock.json` + `.gitmodules` + `third_party/forks.txt`.
//
// Subcommands:
//   auth [status]                                               Verify GitHub App token & remote reachability
//   submodules [status|init|sync|verify]                        Blobless submodule lifecycle + src.lock.json parity
//   worktree [list|add <name> [ref]|rm <name>|prune]            Isolated .worktrees/<name> + jj workspace tracking
//   issue [list|view <n>|create --title T [--body B]|close <n>] GitHub App REST issue triage & creation
//   pr [list|view <n>|create ...|checks <n>|merge <n>]          GitHub App REST PR creation, CI checks & merge
//   fork [audit [--limit N]|sync [repo|--all]|add <owner/repo>] Server-side fork audit, merge-upstream & registration

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { token } from "../tools/agents/gh-token.ts";
import { findRoot, loadIdentity } from "./identity.ts";

const API = "https://api.github.com";
const UA = "aphrody-vcs/1.0 (+https://github.com/aphrody-labs/ay)";

export type SubmoduleEntry = {
  name: string;
  path: string;
  url: string;
  branch: string;
  gitlinkSha: string | null;
  headSha: string | null;
  lockSha: string | null;
  initialized: boolean;
  clean: boolean;
  inSync: boolean;
};

export type WorktreeEntry = {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  prunable: string | null;
  locked: string | null;
};

export type ForkAuditEntry = {
  upstream: string;
  fork: string;
  language: string;
  exists: boolean;
  defaultBranch: string | null;
  parent: string | null;
  archived: boolean;
};

function flag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function opt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function positionals(argv: string[], valuedFlags: string[] = []): string[] {
  const vf = new Set(valuedFlags);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (vf.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

function run(cmd: string[], cwd: string) {
  const r = Bun.spawnSync(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  return {
    code: r.exitCode ?? 1,
    out: r.stdout.toString().trim(),
    err: r.stderr.toString().trim(),
  };
}

export function defaultRepo(root: string): string {
  const id = loadIdentity(root);
  const org = id.orgs[id.product.repo_org ?? "lab"];
  return `${org}/${id.product.repo}`;
}

async function ghApi<T = any>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    owner?: string;
    allowStatus?: number[];
  } = {},
): Promise<{ status: number; data: T }> {
  const owner = init.owner ?? "aphrody-labs";
  const tok = await token(owner);
  if (!tok) {
    throw new Error(
      `GitHub App installation token unavailable for ${owner} (check APHRODY_APP_KEY / APHRODY_APP_CLIENT_ID in DPAPI/systemd-creds)`,
    );
  }
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(init.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok && !init.allowStatus?.includes(res.status)) {
    throw new Error(
      `GitHub API ${init.method ?? "GET"} ${path} -> HTTP ${res.status}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return { status: res.status, data };
}

export function parseGitmodules(text: string): {
  name: string;
  path: string;
  url: string;
  branch: string;
}[] {
  const entries: { name: string; path: string; url: string; branch: string }[] =
    [];
  let cur: { name: string; path: string; url: string; branch: string } | null =
    null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const hdr = line.match(/^\[submodule\s+"([^"]+)"\]$/);
    if (hdr) {
      if (cur && cur.path && cur.url) entries.push(cur);
      cur = { name: hdr[1]!, path: "", url: "", branch: "main" };
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (k === "path") cur.path = v!.trim();
    else if (k === "url") cur.url = v!.trim();
    else if (k === "branch") cur.branch = v!.trim();
  }
  if (cur && cur.path && cur.url) entries.push(cur);
  return entries;
}

export function parseWorktreePorcelain(text: string): WorktreeEntry[] {
  const blocks = text
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean);
  return blocks.map((b) => {
    const e: WorktreeEntry = {
      path: "",
      head: "",
      branch: null,
      bare: false,
      prunable: null,
      locked: null,
    };
    for (const line of b.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) e.path = line.slice(9).trim();
      else if (line.startsWith("HEAD ")) e.head = line.slice(5).trim();
      else if (line.startsWith("branch "))
        e.branch = line
          .slice(7)
          .trim()
          .replace(/^refs\/heads\//, "");
      else if (line === "bare") e.bare = true;
      else if (line.startsWith("prunable"))
        e.prunable = line.slice(8).trim() || "prunable";
      else if (line.startsWith("locked"))
        e.locked = line.slice(6).trim() || "locked";
    }
    return e;
  });
}

export function parseForksManifest(
  text: string,
): { upstream: string; repoName: string; language: string }[] {
  const out: { upstream: string; repoName: string; language: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [upstream, language = ""] = line.split(/\s+/, 2);
    if (!upstream || !upstream.includes("/")) continue;
    const repoName = upstream.split("/")[1]!;
    out.push({ upstream, repoName, language });
  }
  return out;
}

export function inspectSubmodules(root: string): SubmoduleEntry[] {
  const gmPath = join(root, ".gitmodules");
  if (!existsSync(gmPath)) return [];
  const mods = parseGitmodules(readFileSync(gmPath, "utf8"));
  const lockPath = join(root, "src.lock.json");
  const lockRepos: Record<string, { commit?: string }> = existsSync(lockPath)
    ? (JSON.parse(readFileSync(lockPath, "utf8")).repositories ?? {})
    : {};

  return mods.map((m) => {
    const ls = run(["git", "ls-tree", "HEAD", "--", m.path], root);
    const shaMatch = ls.out.match(/\b([0-9a-f]{40})\b/);
    const gitlinkSha = shaMatch ? shaMatch[1]! : null;

    const subDir = join(root, m.path);
    const initialized = existsSync(join(subDir, ".git"));
    let headSha: string | null = null;
    let clean = true;
    if (initialized) {
      const rev = run(["git", "rev-parse", "HEAD"], subDir);
      if (rev.code === 0 && /^[0-9a-f]{40}$/.test(rev.out)) headSha = rev.out;
      const st = run(["git", "status", "--porcelain"], subDir);
      clean = st.code === 0 && st.out.length === 0;
    }
    const lockSha = lockRepos[m.path]?.commit ?? null;
    const inSync = Boolean(
      gitlinkSha &&
      (!initialized || headSha === gitlinkSha) &&
      (!lockSha || lockSha === gitlinkSha || lockSha === headSha),
    );
    return {
      ...m,
      gitlinkSha,
      headSha,
      lockSha,
      initialized,
      clean,
      inSync,
    };
  });
}

async function cmdAuth(root: string, argv: string[]): Promise<number> {
  const repo = opt(argv, "-R") ?? opt(argv, "--repo") ?? defaultRepo(root);
  const tok = await token("aphrody-labs");
  if (!tok) {
    console.error("vcs auth: GitHub App token unavailable");
    return 1;
  }
  const [{ data: repoInfo }, { data: inst }] = await Promise.all([
    ghApi(`/repos/${repo}`),
    ghApi(`/installation/repositories?per_page=1`),
  ]);
  const remotes = run(["git", "remote", "-v"], root)
    .out.split(/\r?\n/)
    .filter(Boolean);
  const lsRemote = run(["git", "ls-remote", "aphrody", "HEAD"], root);
  const payload = {
    ok: lsRemote.code === 0,
    app: "aphrody-labs",
    canonical_repo: repoInfo.full_name,
    default_branch: repoInfo.default_branch,
    installation_repos: inst.total_count,
    remote_head: lsRemote.out.split(/\s+/)[0] ?? null,
    remotes,
  };
  console.log(JSON.stringify(payload, null, 2));
  return payload.ok ? 0 : 1;
}

async function cmdSubmodules(root: string, argv: string[]): Promise<number> {
  const sub = positionals(argv)[0] ?? "status";
  const asJson = flag(argv, "--json");

  if (sub === "init") {
    const syncRes = run(["git", "submodule", "sync", "--recursive"], root);
    if (syncRes.code !== 0) {
      console.error(syncRes.err || syncRes.out);
      return 1;
    }
    const upd = run(
      ["git", "submodule", "update", "--init", "--depth", "1", "--jobs", "4"],
      root,
    );
    if (upd.code !== 0) {
      console.error(upd.err || upd.out);
      return 1;
    }
  } else if (sub === "sync") {
    run(["git", "submodule", "sync", "--recursive"], root);
    const mods = inspectSubmodules(root);
    for (const m of mods) {
      if (!m.initialized) continue;
      const subDir = join(root, m.path);
      const f = run(
        ["git", "fetch", "--filter=blob:none", "origin", m.branch],
        subDir,
      );
      if (f.code !== 0) {
        console.error(`${m.path}: fetch failed: ${f.err}`);
        return 1;
      }
      const ff = run(
        ["git", "merge", "--ff-only", `origin/${m.branch}`],
        subDir,
      );
      if (ff.code !== 0) {
        console.error(`${m.path}: fast-forward failed: ${ff.err}`);
        return 1;
      }
    }
  }

  const entries = inspectSubmodules(root);
  if (asJson) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const e of entries) {
      const state = !e.initialized
        ? "UNINITIALIZED"
        : !e.clean
          ? "DIRTY"
          : e.inSync
            ? "OK"
            : "DRIFT";
      console.log(
        `${state.padEnd(14)} ${e.path.padEnd(20)} gitlink=${(e.gitlinkSha ?? "-").slice(0, 12)} head=${(e.headSha ?? "-").slice(0, 12)} lock=${(e.lockSha ?? "-").slice(0, 12)} url=${e.url}`,
      );
    }
  }
  if (sub === "verify") {
    const bad = entries.filter(
      (e) => !e.gitlinkSha || (e.initialized && !e.clean),
    );
    return bad.length ? 1 : 0;
  }
  return 0;
}

async function cmdWorktree(root: string, argv: string[]): Promise<number> {
  const pos = positionals(argv, ["--branch", "-b"]);
  const sub = pos[0] ?? "list";
  const asJson = flag(argv, "--json");
  const wtRoot = join(root, ".worktrees");

  if (sub === "prune") {
    const r = run(["git", "worktree", "prune", "-v"], root);
    if (r.out) console.log(r.out);
    return r.code;
  }
  if (sub === "add") {
    const name = pos[1];
    const ref = pos[2] ?? "HEAD";
    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      console.error("usage: vcs worktree add <safe-name> [ref] [-b <branch>]");
      return 2;
    }
    mkdirSync(wtRoot, { recursive: true });
    const target = join(wtRoot, name);
    const branch = opt(argv, "-b") ?? opt(argv, "--branch");
    const args = branch
      ? ["git", "worktree", "add", "-b", branch, target, ref]
      : ["git", "worktree", "add", "--detach", target, ref];
    const r = run(args, root);
    if (r.code !== 0) {
      console.error(r.err || r.out);
      return r.code;
    }
    console.log(target);
    return 0;
  }
  if (sub === "rm" || sub === "remove") {
    const name = pos[1];
    if (!name) {
      console.error("usage: vcs worktree rm <name|path>");
      return 2;
    }
    const candidate = existsSync(name)
      ? resolve(name)
      : join(wtRoot, basename(name));
    if (resolve(candidate).toLowerCase() === resolve(root).toLowerCase()) {
      console.error("refusing to remove primary checkout root");
      return 2;
    }
    const force = flag(argv, "--force") ? ["--force"] : [];
    const r = run(["git", "worktree", "remove", ...force, candidate], root);
    if (r.code !== 0 && existsSync(candidate) && flag(argv, "--force")) {
      rmSync(candidate, { recursive: true, force: true });
    }
    run(["git", "worktree", "prune"], root);
    return r.code;
  }

  const raw = run(["git", "worktree", "list", "--porcelain"], root);
  const list = parseWorktreePorcelain(raw.out);
  const jjAvailable = Boolean(Bun.which("jj")) && existsSync(join(root, ".jj"));
  const jjWorkspaces = jjAvailable
    ? run(["jj", "workspace", "list"], root).out.split(/\r?\n/).filter(Boolean)
    : [];

  if (asJson) {
    console.log(
      JSON.stringify({ worktrees: list, jj_workspaces: jjWorkspaces }, null, 2),
    );
  } else {
    for (const w of list) {
      const tag = w.branch ? `[${w.branch}]` : "(detached)";
      const extra = [w.locked ? "locked" : "", w.prunable ? "prunable" : ""]
        .filter(Boolean)
        .join(",");
      console.log(
        `${w.head.slice(0, 12)}  ${tag.padEnd(14)} ${w.path}${extra ? ` (${extra})` : ""}`,
      );
    }
    if (jjWorkspaces.length) {
      console.log(`jj workspaces: ${jjWorkspaces.join(" | ")}`);
    }
  }
  return 0;
}

async function cmdIssue(root: string, argv: string[]): Promise<number> {
  const valued = [
    "-R",
    "--repo",
    "--state",
    "--limit",
    "--title",
    "--body",
    "--labels",
  ];
  const pos = positionals(argv, valued);
  const sub = pos[0] ?? "list";
  const repo = opt(argv, "-R") ?? opt(argv, "--repo") ?? defaultRepo(root);
  const asJson = flag(argv, "--json");

  if (sub === "list") {
    const state = opt(argv, "--state") ?? "open";
    const limit = Number(opt(argv, "--limit") ?? "20");
    const { data } = await ghApi<any[]>(
      `/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=${limit}`,
    );
    const issues = data.filter((x) => !x.pull_request);
    if (asJson) {
      console.log(JSON.stringify(issues, null, 2));
    } else if (!issues.length) {
      console.log(`No ${state} issues in ${repo}`);
    } else {
      for (const i of issues) {
        console.log(
          `#${String(i.number).padEnd(5)} [${i.state}] ${i.title} (${i.html_url})`,
        );
      }
    }
    return 0;
  }
  if (sub === "view") {
    const num = pos[1];
    if (!num) {
      console.error("usage: vcs issue view <number>");
      return 2;
    }
    const { data } = await ghApi(`/repos/${repo}/issues/${num}`);
    if (asJson) console.log(JSON.stringify(data, null, 2));
    else
      console.log(
        `#${data.number} [${data.state}] ${data.title}\n${data.html_url}\n\n${data.body ?? ""}`,
      );
    return 0;
  }
  if (sub === "create") {
    const title = opt(argv, "--title");
    if (!title) {
      console.error(
        "usage: vcs issue create --title <title> [--body <body>] [--labels a,b]",
      );
      return 2;
    }
    const body = opt(argv, "--body") ?? "";
    const labels = (opt(argv, "--labels") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { data } = await ghApi(`/repos/${repo}/issues`, {
      method: "POST",
      body: { title, body, ...(labels.length ? { labels } : {}) },
    });
    console.log(
      asJson
        ? JSON.stringify(data, null, 2)
        : `${data.number}\t${data.html_url}`,
    );
    return 0;
  }
  if (sub === "close") {
    const num = pos[1];
    if (!num) {
      console.error("usage: vcs issue close <number>");
      return 2;
    }
    const { data } = await ghApi(`/repos/${repo}/issues/${num}`, {
      method: "PATCH",
      body: { state: "closed" },
    });
    console.log(`closed #${data.number} (${data.html_url})`);
    return 0;
  }
  console.error("usage: vcs issue list|view|create|close");
  return 2;
}

async function cmdPr(root: string, argv: string[]): Promise<number> {
  const valued = [
    "-R",
    "--repo",
    "--state",
    "--limit",
    "--title",
    "--body",
    "--head",
    "--base",
    "--method",
  ];
  const pos = positionals(argv, valued);
  const sub = pos[0] ?? "list";
  const repo = opt(argv, "-R") ?? opt(argv, "--repo") ?? defaultRepo(root);
  const asJson = flag(argv, "--json");

  if (sub === "list") {
    const state = opt(argv, "--state") ?? "open";
    const limit = Number(opt(argv, "--limit") ?? "20");
    const { data } = await ghApi<any[]>(
      `/repos/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=${limit}`,
    );
    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else if (!data.length) {
      console.log(`No ${state} pull requests in ${repo}`);
    } else {
      for (const p of data) {
        console.log(
          `#${String(p.number).padEnd(5)} [${p.state}] ${p.head.label} -> ${p.base.ref}  ${p.title} (${p.html_url})`,
        );
      }
    }
    return 0;
  }
  if (sub === "view") {
    const num = pos[1];
    if (!num) {
      console.error("usage: vcs pr view <number>");
      return 2;
    }
    const { data } = await ghApi(`/repos/${repo}/pulls/${num}`);
    if (asJson) console.log(JSON.stringify(data, null, 2));
    else
      console.log(
        `#${data.number} [${data.state}] ${data.title}\n${data.head.label} -> ${data.base.ref} (mergeable=${data.mergeable})\n${data.html_url}\n\n${data.body ?? ""}`,
      );
    return 0;
  }
  if (sub === "checks") {
    const num = pos[1];
    if (!num) {
      console.error("usage: vcs pr checks <number|sha>");
      return 2;
    }
    let sha = num;
    if (/^\d+$/.test(num)) {
      const { data: pr } = await ghApi(`/repos/${repo}/pulls/${num}`);
      sha = pr.head.sha;
    }
    const { data } = await ghApi(
      `/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
    );
    const runs = data.check_runs ?? [];
    if (asJson) {
      console.log(JSON.stringify(runs, null, 2));
    } else {
      for (const c of runs) {
        console.log(
          `${String(c.conclusion ?? c.status).padEnd(12)} ${c.name} (${c.html_url ?? ""})`,
        );
      }
    }
    const failed = runs.some(
      (c: any) =>
        c.status === "completed" &&
        !["success", "neutral", "skipped"].includes(c.conclusion ?? ""),
    );
    return failed ? 1 : 0;
  }
  if (sub === "create") {
    const title = opt(argv, "--title");
    const head = opt(argv, "--head");
    const base = opt(argv, "--base") ?? "main";
    const body = opt(argv, "--body") ?? "";
    const draft = flag(argv, "--draft");
    if (!title || !head) {
      console.error(
        "usage: vcs pr create --title <t> --head <branch|org:branch> [--base main] [--body b] [--draft]",
      );
      return 2;
    }
    const { data } = await ghApi(`/repos/${repo}/pulls`, {
      method: "POST",
      body: { title, head, base, body, draft },
    });
    console.log(
      asJson
        ? JSON.stringify(data, null, 2)
        : `${data.number}\t${data.html_url}`,
    );
    return 0;
  }
  if (sub === "merge") {
    const num = pos[1];
    const method = (opt(argv, "--method") ?? "squash") as
      "squash" | "merge" | "rebase";
    if (!num) {
      console.error(
        "usage: vcs pr merge <number> [--method squash|merge|rebase]",
      );
      return 2;
    }
    const { data } = await ghApi(`/repos/${repo}/pulls/${num}/merge`, {
      method: "PUT",
      body: { merge_method: method },
    });
    console.log(`merged #${num}: ${data.sha} (${data.message})`);
    return 0;
  }
  console.error("usage: vcs pr list|view|checks|create|merge");
  return 2;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await fn(items[cur]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function cmdFork(root: string, argv: string[]): Promise<number> {
  const valued = ["--limit", "--org", "--concurrency", "--lang"];
  const pos = positionals(argv, valued);
  const sub = pos[0] ?? "audit";
  const org = opt(argv, "--org") ?? "aphrody-labs";
  const forksFile = join(root, "third_party", "forks.txt");
  const asJson = flag(argv, "--json");

  if (sub === "add") {
    const upstream = pos[1];
    if (!upstream || !/^[\w.-]+\/[\w.-]+$/.test(upstream)) {
      console.error("usage: vcs fork add <owner/repo> [--lang <Lang>]");
      return 2;
    }
    const { data: srcRepo } = await ghApi(`/repos/${upstream}`);
    const lang = opt(argv, "--lang") ?? srcRepo.language ?? "";
    const forkName = upstream.split("/")[1]!;
    const existing = await ghApi(`/repos/${org}/${forkName}`, {
      allowStatus: [404],
    });
    let forkUrl = existing.status === 200 ? existing.data.html_url : "";
    if (existing.status === 404) {
      const created = await ghApi(`/repos/${upstream}/forks`, {
        method: "POST",
        body: { organization: org, default_branch_only: true },
      });
      forkUrl = created.data.html_url;
    }
    const text = existsSync(forksFile) ? readFileSync(forksFile, "utf8") : "";
    const entries = parseForksManifest(text);
    if (
      !entries.some((e) => e.upstream.toLowerCase() === upstream.toLowerCase())
    ) {
      const line = lang ? `${upstream} ${lang}` : upstream;
      writeFileSync(forksFile, `${text.replace(/\s*$/, "")}\n${line}\n`);
    }
    console.log(`${org}/${forkName}\t${forkUrl}`);
    return 0;
  }

  const entries = parseForksManifest(readFileSync(forksFile, "utf8")).filter(
    (e) => !e.upstream.toLowerCase().startsWith(`${org.toLowerCase()}/`),
  );
  const limit = Number(opt(argv, "--limit") ?? String(entries.length));
  const concurrency = Number(opt(argv, "--concurrency") ?? "8");
  const targetRepo = pos[1];
  const selected = targetRepo
    ? entries.filter(
        (e) =>
          e.upstream.toLowerCase() === targetRepo.toLowerCase() ||
          e.repoName.toLowerCase() === targetRepo.toLowerCase(),
      )
    : entries.slice(0, limit);

  if (sub === "audit") {
    const rows = await mapPool(
      selected,
      concurrency,
      async (e): Promise<ForkAuditEntry> => {
        const r = await ghApi(`/repos/${org}/${e.repoName}`, {
          allowStatus: [404],
        });
        if (r.status === 404) {
          return {
            upstream: e.upstream,
            fork: `${org}/${e.repoName}`,
            language: e.language,
            exists: false,
            defaultBranch: null,
            parent: null,
            archived: false,
          };
        }
        return {
          upstream: e.upstream,
          fork: r.data.full_name,
          language: e.language || r.data.language || "",
          exists: true,
          defaultBranch: r.data.default_branch,
          parent: r.data.parent?.full_name ?? null,
          archived: Boolean(r.data.archived),
        };
      },
    );
    const missing = rows.filter((r) => !r.exists);
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            total_checked: rows.length,
            ok: rows.length - missing.length,
            missing,
          },
          null,
          2,
        ),
      );
    } else {
      for (const r of rows) {
        console.log(
          `${(r.exists ? "OK" : "MISSING").padEnd(8)} ${r.fork.padEnd(38)} <- ${r.upstream} (${r.defaultBranch ?? "-"})`,
        );
      }
      console.log(
        `Checked ${rows.length} forks (${rows.length - missing.length} present, ${missing.length} missing).`,
      );
    }
    return missing.length ? 1 : 0;
  }

  if (sub === "sync") {
    if (!targetRepo && !flag(argv, "--all") && !opt(argv, "--limit")) {
      console.error(
        "usage: vcs fork sync <repo> | vcs fork sync --all | vcs fork sync --limit <N>",
      );
      return 2;
    }
    const results = await mapPool(selected, concurrency, async (e) => {
      const info = await ghApi(`/repos/${org}/${e.repoName}`, {
        allowStatus: [404],
      });
      if (info.status === 404) {
        return {
          fork: `${org}/${e.repoName}`,
          status: "missing",
          detail: "not forked",
        };
      }
      const branch = info.data.default_branch ?? "main";
      const sync = await ghApi(`/repos/${org}/${e.repoName}/merge-upstream`, {
        method: "POST",
        body: { branch },
        allowStatus: [409, 422],
      });
      return {
        fork: `${org}/${e.repoName}`,
        branch,
        status:
          sync.status === 200
            ? (sync.data.merge_type ?? "synced")
            : `http_${sync.status}`,
        detail: sync.data?.message ?? "",
      };
    });
    if (asJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) {
        console.log(`${r.status.padEnd(14)} ${r.fork} (${r.detail})`);
      }
    }
    return results.some(
      (r) => r.status === "missing" || r.status === "http_409",
    )
      ? 1
      : 0;
  }

  console.error("usage: vcs fork audit|sync|add");
  return 2;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const root = findRoot();
  const [domain, ...rest] = argv;
  switch (domain) {
    case "auth":
      return cmdAuth(root, rest);
    case "submodules":
    case "submodule":
      return cmdSubmodules(root, rest);
    case "worktree":
    case "worktrees":
    case "wt":
      return cmdWorktree(root, rest);
    case "issue":
    case "issues":
      return cmdIssue(root, rest);
    case "pr":
    case "pulls":
      return cmdPr(root, rest);
    case "fork":
    case "forks":
      return cmdFork(root, rest);
    default:
      console.log(`Usage: bun scripts/vcs.ts <domain> <subcommand> [options]

Domains:
  auth [status]                                               Verify GitHub App token & aphrody remote
  submodules [status|init|sync|verify] [--json]               Blobless submodule lifecycle & src.lock.json check
  worktree [list|add <name> [ref]|rm <name>|prune] [--json]   Isolated .worktrees/<name> + jj workspace list
  issue [list|view <n>|create --title T|close <n>] [--json]   GitHub App REST issue management
  pr [list|view <n>|checks <n>|create ...|merge <n>] [--json] GitHub App REST PR & CI check management
  fork [audit [--limit N]|sync <repo|--all>|add <o/r>]        Fork manifest audit & server-side merge-upstream`);
      return domain === "--help" || domain === "-h" || !domain ? 0 : 2;
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
