#!/usr/bin/env bun
// Repository coherence: path references in docs, scripts, infra and agent files that no longer
// resolve, their classification (moved per git rename history, or dead), rewrites of moved paths,
// and path-scoped commits through a private index so the shared index of other sessions is never
// touched. Driven by the `coherence-fixer` / `fact-checker` agents and the `coherence-sweep`
// workflow (.claude/agents, .claude/workflows); `hook` is their PostToolUse check.
//
//   bun scripts/coherence.ts scan [paths...] [--json]        dead references (+ var/coherence/coherence.db)
//   bun scripts/coherence.ts plan [--json]                   work lists per area in var/coherence/<area>.json
//   bun scripts/coherence.ts fix-moves [paths...] [--dry]    rewrite moved paths in files without foreign edits
//   bun scripts/coherence.ts commit -m <msg> <files...> | --list <file>
//   bun scripts/coherence.ts gate [paths...]                 exit 1 when a dead reference remains
//   bun scripts/coherence.ts hook                            Claude Code PostToolUse hook (stdin JSON)

import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "var", "coherence");
export const DEFAULT_ROOTS = [
  "docs",
  "scripts",
  "build",
  "device",
  "prebuilts",
  ".agents",
  ".claude",
  "README.md",
  "AGENTS.md",
  "GEMINI.md",
  "CLAUDE.md",
  "tools.toml",
  "third_party/ECOSYSTEM.toml",
  "third_party/forks.txt",
  "third_party/vendor.lock",
];
const SCANNED =
  /\.(md|mdx|ts|js|just|ya?ml|toml|sh|ps1|json|txt|lock)$|justfile$/;
const TOP =
  "(?:docs|scripts|build|device|prebuilts|crates|packages|apps|third_party|src|tools|plugins|conformance|assets|bench|test|\\.github|\\.agents|\\.claude)";
const REF = new RegExp(`(?<![\\w./@-])(${TOP}/[A-Za-z0-9_@.+\\-/]+)`, "g");
const LINK = /\]\((?!https?:|#|mailto:|data:)([^)\s#?]+)/g;

/** Paths an agent of the coherence sweep never commits (owned by other workstreams). */
export const PROTECTED: RegExp[] = [
  /^Cargo\.(toml|lock)$/,
  /^crates\//,
  /^(kernel|hardware|system|frameworks)\//,
  /^bench\//,
  /^test\//,
  /^docs\/ARCHITECTURE\.md$/,
  /(^|\/)justfile$/,
  /\.just$/,
  /^\.github\/workflows\//,
  /^(MAINTAINERS|OWNERS)$/,
  /(^|\/)DEPS\.rules$/,
  /^scripts\/checkdeps\.ts$/,
  /^src\.lock\.json$/,
  /^DEPS$/,
  /^deny\.toml$/,
];
export const isProtected = (p: string) => PROTECTED.some((r) => r.test(p));

/** Work areas of a sweep, first match wins. */
export const AREAS: [string, RegExp][] = [
  ["research", /^docs\/(research|product|replica|nextjs|shadcn|tooling)\//],
  ["native", /^docs\/native\//],
  ["docs", /^docs\//],
  ["agents", /^(\.agents|\.claude)\/|^(README|AGENTS|GEMINI|CLAUDE)\.md$/],
  ["infra", /^(scripts|build|device|prebuilts|tools|third_party)/],
];
export const areaOf = (f: string) =>
  AREAS.find(([, r]) => r.test(f))?.[0] ?? "other";

/** Files whose references describe another repository's tree (upstream copies). */
const FOREIGN = [
  /^\.agents\/skills\/[^/]+\/references\//,
  /^docs\/lore\//,
  /^docs\/i18n\//,
];

export type Ref = {
  file: string;
  ref: string;
  kind: "moved" | "dead";
  to?: string;
};

/** Repo-relative references and relative markdown links found in `text`. */
export function extractRefs(
  text: string,
  markdown: boolean,
): { paths: string[]; links: string[] } {
  const paths = new Set<string>();
  for (const m of text.matchAll(REF)) {
    if ("*{<$".includes(text[m.index! + m[0].length] ?? " ")) continue; // glob or template, not a path
    const p = m[1]!.replace(/[.,:;)`'"\]]+$/, "").replace(/\/+$/, "");
    if (
      !/[*{}<>$]/.test(p) &&
      !p.includes("...") &&
      !/\/(x|y|z|foo|bar|name|NAME)$/.test(p)
    )
      paths.add(p);
  }
  const links = new Set<string>();
  if (markdown) for (const m of text.matchAll(LINK)) links.add(m[1]!);
  return { paths: [...paths], links: [...links] };
}

/** Replace whole-path occurrences of `from` by `to` (not prefixes of longer names). */
export function rewrite(
  text: string,
  pairs: [string, string][],
): { text: string; edits: number } {
  let edits = 0;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [a, b] of [...pairs].sort((x, y) => y[0].length - x[0].length)) {
    text = text.replace(
      new RegExp(`(?<![\\w./-])${esc(a)}(?![\\w-]|\\.\\w)`, "g"),
      () => (edits++, b),
    );
  }
  return { text, edits };
}

const git = (args: string[], env?: Record<string, string | undefined>) => {
  const r = Bun.spawnSync(["git", ...args], {
    cwd: ROOT,
    env: env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0)
    throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
};

export function tracked(paths: string[]): string[] {
  return git(["ls-files", "-z", "--", ...paths])
    .split("\0")
    .filter((f) => f && SCANNED.test(f));
}

/** old path -> new path from git rename history (files and the directories they imply). */
export function renameMap(since = "2026-10-01"): Map<string, string> {
  const out = git([
    "-c",
    "diff.renameLimit=30000",
    "log",
    `--since=${since}`,
    "-M",
    "--diff-filter=R",
    "--name-status",
    "--format=",
  ]);
  const map = new Map<string, string>();
  for (const line of out.split("\n")) {
    const [st, a, b] = line.split("\t");
    if (!st?.startsWith("R") || !a || !b) continue;
    map.set(a, b);
    const x = a.split("/"),
      y = b.split("/");
    while (x.length > 1 && y.length > 1 && x.at(-1) === y.at(-1))
      (x.pop(), y.pop());
    if (x.at(-1) === y.at(-1) || x.length === 1) continue;
    if (!map.has(x.join("/"))) map.set(x.join("/"), y.join("/"));
  }
  return map;
}

function resolveMove(
  ref: string,
  moves: Map<string, string>,
): string | undefined {
  const parts = ref.split("/");
  for (let i = parts.length; i > 0; i--) {
    const to = moves.get(parts.slice(0, i).join("/"));
    if (!to) continue;
    const cand = [to, ...parts.slice(i)].join("/");
    if (
      existsSync(join(ROOT, cand)) &&
      cand.split("/").at(-1) === ref.split("/").at(-1) &&
      !cand.startsWith("crates/")
    )
      return cand;
  }
}

const exists = (p: string) => existsSync(join(ROOT, p));
const relExists = (file: string, ref: string) => {
  for (let d = dirname(file); ; d = dirname(d)) {
    if (exists(join(d, ref))) return true;
    if (d === "." || d === "") return false;
  }
};

/** Upstream clones in third_party (directories with a .git), for paths that belong to them. */
const clones = (): string[] => {
  const dir = join(ROOT, "third_party");
  return existsSync(dir)
    ? readdirSync(dir).filter((d) => existsSync(join(dir, d, ".git")))
    : [];
};

/** The text names an upstream clone (`bun`, `servo`, `third_party/chromium`) whose tree holds `ref`. */
export function upstreamOf(
  ref: string,
  text: string,
  names: string[],
): string | undefined {
  const lower = text.toLowerCase();
  for (const n of names) {
    const word = n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?<![\\w-])${word}(?![\\w-])`).test(lower)) continue;
    for (const base of [n, `${n}/src`])
      if (existsSync(join(ROOT, "third_party", base, ref)))
        return `third_party/${base}`;
  }
}

export async function scan(paths: string[]): Promise<Ref[]> {
  const moves = renameMap();
  const names = clones();
  const files = tracked(paths);
  const per = await Promise.all(
    files.map(async (file) => {
      if (FOREIGN.some((r) => r.test(file))) return [];
      const text = await Bun.file(join(ROOT, file))
        .text()
        .catch(() => "");
      const { paths: refs, links } = extractRefs(text, /\.mdx?$/.test(file));
      const found: Ref[] = [];
      for (const ref of refs) {
        if (exists(ref) || relExists(file, ref)) continue;
        if (
          /^third_party\/[^/]+\/./.test(ref) &&
          exists(ref.split("/").slice(0, 2).join("/"))
        )
          continue; // inside a clone
        if (upstreamOf(ref, text, names)) continue; // path of an upstream tree the text talks about
        const to = resolveMove(ref, moves);
        found.push(
          to ? { file, ref, kind: "moved", to } : { file, ref, kind: "dead" },
        );
      }
      for (const link of links) {
        const target = normalize(join(dirname(file), decodeURI(link))).replace(
          /\\/g,
          "/",
        );
        if (!exists(target))
          found.push({ file, ref: `link:${link}`, kind: "dead" });
      }
      return found;
    }),
  );
  return per.flat();
}

function store(refs: Ref[]) {
  mkdirSync(OUT, { recursive: true });
  const db = new Database(join(OUT, "coherence.db"));
  db.run(
    "CREATE TABLE IF NOT EXISTS refs (file TEXT, ref TEXT, kind TEXT, target TEXT, PRIMARY KEY (file, ref))",
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS scans (head TEXT, dead INTEGER, moved INTEGER)",
  );
  const files = [...new Set(refs.map((r) => r.file))];
  db.transaction(() => {
    for (const f of files) db.run("DELETE FROM refs WHERE file = ?", [f]);
    const ins = db.prepare("INSERT OR REPLACE INTO refs VALUES (?, ?, ?, ?)");
    for (const r of refs) ins.run(r.file, r.ref, r.kind, r.to ?? null);
    db.run("INSERT INTO scans VALUES (?, ?, ?)", [
      git(["rev-parse", "--short", "HEAD"]).trim(),
      refs.filter((r) => r.kind === "dead").length,
      refs.filter((r) => r.kind === "moved").length,
    ]);
  })();
  db.close();
}

/** Worktree content of `file` differs from HEAD only by `pairs`: no other session's edit in it. */
function pureAfter(file: string, pairs: [string, string][]): boolean {
  let head: string;
  try {
    head = git(["show", `HEAD:${file}`]);
  } catch {
    return false;
  }
  return rewrite(head, pairs).text === readFileSync(join(ROOT, file), "utf8");
}

export function fixMoves(refs: Ref[], dry: boolean): string[] {
  const byFile = new Map<string, [string, string][]>();
  for (const r of refs)
    if (r.kind === "moved" && r.to && !isProtected(r.file))
      (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)!).push([
        r.ref,
        r.to,
      ]);
  const changed: string[] = [];
  for (const [file, pairs] of byFile) {
    const abs = join(ROOT, file);
    const before = readFileSync(abs, "utf8");
    if (git(["diff", "--name-only", "--", file]).trim()) continue; // someone else's uncommitted edit
    const { text, edits } = rewrite(before, pairs);
    if (!edits) continue;
    if (!dry) writeFileSync(abs, text);
    if (dry || pureAfter(file, pairs)) changed.push(file);
  }
  return changed;
}

/** Commit `files` (worktree content, deletions included) on HEAD through a private index; retries
 * when HEAD moves; then moves shared-index entries that still hold the old HEAD blob. */
export function commit(
  message: string,
  files: string[],
  opts: { allowProtected?: boolean; root?: string } = {},
): string {
  const root = opts.root ?? ROOT;
  const bad = files.filter(isProtected);
  if (bad.length && !opts.allowProtected)
    throw new Error(`protected paths refused: ${bad.join(", ")}`);
  const run = (args: string[], env?: Record<string, string | undefined>) => {
    const r = Bun.spawnSync(["git", ...args], {
      cwd: root,
      env: env ?? process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (r.exitCode !== 0)
      throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
    return r.stdout.toString().trim();
  };
  const idx = join(
    process.env.TEMP ?? process.env.TMPDIR ?? "/tmp",
    `coherence-index-${process.pid}-${Bun.nanoseconds()}`,
  );
  const priv = { ...process.env, GIT_INDEX_FILE: idx };
  for (let attempt = 0; ; attempt++) {
    rmSync(idx, { force: true });
    const head = run(["rev-parse", "HEAD"]);
    run(["read-tree", head], priv);
    const old = new Map<string, string>();
    for (const f of files) {
      try {
        old.set(f, run(["rev-parse", `${head}:${f}`]));
      } catch {
        /* new file */
      }
    }
    for (let i = 0; i < files.length; i += 200)
      run(
        ["update-index", "--add", "--remove", "--", ...files.slice(i, i + 200)],
        priv,
      );
    const tree = run(["write-tree"], priv);
    if (tree === run(["rev-parse", `${head}^{tree}`])) {
      rmSync(idx, { force: true });
      return head;
    }
    const sha = run(["commit-tree", tree, "-p", head, "-m", message], priv);
    rmSync(idx, { force: true });
    try {
      run(["update-ref", "refs/heads/main", sha, head]);
    } catch (e) {
      if (attempt < 8) continue;
      throw e;
    }
    for (const f of files) {
      const cur = run(["ls-files", "-s", "--", f]).split(/\s+/)[1];
      if (!cur || cur !== old.get(f)) continue;
      const entry = run(["ls-tree", sha, "--", f]);
      if (!entry) run(["update-index", "--force-remove", "--", f]);
      else {
        const [mode, , blob] = entry.split(/\s+/);
        run(["update-index", "--cacheinfo", `${mode},${blob},${f}`]);
      }
    }
    return sha;
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
}

async function main(argv: string[]): Promise<number> {
  const [cmd = "scan", ...rest] = argv;
  const json = rest.includes("--json");
  const dry = rest.includes("--dry");
  const pos = () => rest.filter((a) => !a.startsWith("--"));
  const roots = () => (pos().length ? pos() : DEFAULT_ROOTS);
  switch (cmd) {
    case "scan":
    case "gate": {
      const refs = await scan(roots());
      if (!pos().length) store(refs);
      const dead = refs.filter((r) => r.kind === "dead"),
        moved = refs.filter((r) => r.kind === "moved");
      if (json) console.log(JSON.stringify(refs, null, 1));
      else {
        for (const r of refs)
          console.log(
            `${r.kind}\t${r.file}\t${r.ref}${r.to ? `\t-> ${r.to}` : ""}`,
          );
        console.error(
          `${dead.length} dead, ${moved.length} moved, in ${new Set(refs.map((r) => r.file)).size} files`,
        );
      }
      return cmd === "gate" && refs.length ? 1 : 0;
    }
    case "plan": {
      const refs = await scan(DEFAULT_ROOTS);
      store(refs);
      const areas: Record<string, { file: string; dead: string[] }[]> = {};
      const byFile = Map.groupBy(
        refs.filter((r) => !isProtected(r.file)),
        (r) => r.file,
      );
      for (const [file, rs] of byFile)
        (areas[areaOf(file)] ??= []).push({
          file,
          dead: rs.map((r) => (r.to ? `${r.ref} -> ${r.to}` : r.ref)),
        });
      mkdirSync(OUT, { recursive: true });
      const summary = Object.entries(areas).map(([area, list]) => {
        const path = join(OUT, `${area}.json`);
        writeFileSync(path, JSON.stringify(list, null, 1));
        return {
          area,
          list: path,
          files: list.length,
          refs: list.reduce((n, x) => n + x.dead.length, 0),
        };
      });
      console.log(
        json
          ? JSON.stringify(summary)
          : summary
              .map(
                (s) => `${s.area}\t${s.files} files\t${s.refs} refs\t${s.list}`,
              )
              .join("\n"),
      );
      return 0;
    }
    case "fix-moves": {
      const changed = fixMoves(await scan(roots()), dry);
      console.log(changed.join("\n"));
      console.error(
        `${changed.length} files ${dry ? "would change" : "rewritten"}`,
      );
      return 0;
    }
    case "commit": {
      const msg = flag(rest, "-m"),
        list = flag(rest, "--list");
      const files = [
        ...(list ? readFileSync(list, "utf8").split(/\r?\n/) : []),
        ...pos(),
      ]
        .map((s) => s.trim())
        .filter(Boolean);
      if (!msg || !files.length) {
        console.error("usage: commit -m <message> <files...> | --list <file>");
        return 2;
      }
      console.log(
        commit(msg, files, {
          allowProtected: rest.includes("--allow-protected"),
        }).slice(0, 10),
        files.length,
        "files",
      );
      return 0;
    }
    case "hook": {
      // PostToolUse: report dead references left in the file just written; exit 2 feeds stderr back to the agent.
      const input = JSON.parse((await Bun.stdin.text()) || "{}");
      const file = String(input?.tool_input?.file_path ?? "");
      if (!file) return 0;
      const rel = normalize(file)
        .replace(/\\/g, "/")
        .replace(normalize(ROOT).replace(/\\/g, "/") + "/", "");
      if (rel.startsWith("..") || rel.includes(":") || !SCANNED.test(rel))
        return 0;
      const notes: string[] = [];
      if (isProtected(rel))
        notes.push(
          `${rel} is protected (owned by another workstream): revert your edit to it.`,
        );
      const refs =
        existsSync(join(ROOT, rel)) && git(["ls-files", "--", rel]).trim()
          ? await scan([rel])
          : [];
      // crates/* paths are rewritten repo-wide by the src/ relayout: not the agent's to fix.
      for (const r of refs.filter((x) => !x.ref.startsWith("crates/")))
        notes.push(`${r.kind}: ${r.ref}${r.to ? ` (now ${r.to})` : ""}`);
      if (!notes.length) return 0;
      console.error(`coherence ${rel}:\n${notes.join("\n")}`);
      return 2;
    }
    default:
      console.error(`unknown command ${cmd}`);
      return 2;
  }
}

if (import.meta.main) process.exitCode = await main(Bun.argv.slice(2));
