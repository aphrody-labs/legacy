// Catalog generator: reads the global types of the monorepo live and renders what is derived from them.
//
//   bun scripts/catalog.ts                 write every output
//   bun scripts/catalog.ts --check         exit 1 listing the outputs that differ from the tree (CI)
//   bun scripts/catalog.ts --base <ref> --out-dir <dir>  read the hand-written text from a git ref, write elsewhere
//   bun scripts/catalog.ts --lock <file>   read the third-party pins from another src.lock.json
//   bun scripts/catalog.ts --locale <tag>  text language (default: the source locale of packages/i18n/i18n.config.json)
//   bun scripts/catalog.ts profile <id> [--out <file>] [--check]
//                                          a GitHub profile README ranked live from the GitHub API (scripts/catalog.config.json)
//
// Types come from `types` of scripts/catalog.config.json: Rust workspace members of Cargo.toml (crate), Bun workspaces of
// package.json (package), apps/* (app), build/*, device/*, prebuilts/* (infra), the pins of src.lock.json (third-party) and .agents/skills/*
// (skill). The logo is docs/logo/aphrody.png (the avatar of the aphrody-labs organisation). Outputs:
//   - README.md: the `header` and `types` blocks between `<!-- catalog:begin NAME -->` and `<!-- catalog:end -->`;
//   - one README per crate, package and own app: a `unit` block from its manifest; any hand-written text around the
//     markers stays, a README without markers gets the block after its first heading;
//   - docs/reference/catalog/<type>.md, one index per type;
//   - apps/web/public/catalog.json, read by apps/web/build.ts (the site pages).
// Nothing is typed here: no version, count or date goes into a text, the text comes from the i18n catalogs
// (packages/i18n/catalogs/catalog/<locale>.json, same format and fallback chain as @aphrody/i18n; this file has no
// dependency so a profile repository can run it from a sparse checkout).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { captures, factsOfSources } from "./ay-facts.ts";

const root = join(import.meta.dir, "..").replaceAll("\\", "/");
const args = Bun.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const read = (p: string) => readFileSync(join(root, p), "utf8");
const exists = (p: string) => existsSync(join(root, p));
const isDir = (p: string) => exists(p) && statSync(join(root, p)).isDirectory();
const dirs = (p: string) => (isDir(p) ? readdirSync(join(root, p), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);
const toml = (p: string) => Bun.TOML.parse(read(p)) as Record<string, any>;

// ---------------------------------------------------------------------------------------------
// i18n: the catalogs of packages/i18n, resolved the way @aphrody/i18n does (exact tag, language, source locale)

const i18nDir = "packages/i18n";
const sourceLocale = process.env.APHRODY_I18N_SOURCE || (exists(`${i18nDir}/i18n.config.json`) ? JSON.parse(read(`${i18nDir}/i18n.config.json`)).sourceLocale : undefined) || "en";
const locale = opt("locale") ?? sourceLocale;
/** Hand-written text is read from this git ref instead of the working tree (another session's edits stay out). */
const baseRef = opt("base");
const outDir = opt("out-dir");
const messageDir = `${i18nDir}/catalogs/catalog`;
const messages = (tag: string): Record<string, string> => (exists(`${messageDir}/${tag}.json`) ? JSON.parse(read(`${messageDir}/${tag}.json`)) : {});
const chain = [...new Set([locale, locale.split("-")[0]!, sourceLocale])].map(messages);
const t = (key: string, vars: Record<string, string> = {}): string => {
  const hit = chain.map((c) => c[key]).find((m) => m !== undefined);
  if (hit === undefined) throw new Error(`catalog message missing: ${key} (${messageDir}/${sourceLocale}.json)`);
  return hit.replace(/\{\$(\w+)\}/g, (_, v) => vars[v] ?? `{$${v}}`);
};

// ---------------------------------------------------------------------------------------------
// Sources

interface Entry {
  name: string;
  description: string;
  path: string;
  /** Path of the README that carries the unit block, when this entry owns one. */
  readme?: string;
  commands?: string[];
  extra?: Record<string, string>;
}
interface Kind {
  id: string;
  name: string;
  description: string;
}

const config = JSON.parse(read("scripts/catalog.config.json")) as { name: string; types: Kind[] };
const kinds: Kind[] = config.types;
const projectName: string = config.name;
const slug = (() => {
  const url: string = JSON.parse(read("package.json")).repository?.url ?? "";
  const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  if (!m) throw new Error("package.json repository.url: no GitHub slug");
  return m[1]!;
})();

const oneLine = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
/** First sentence, at most 180 characters, safe in a table cell. */
const short = (s: unknown): string => {
  const one = oneLine(s);
  const cut = one.match(/^(.{1,180}?[.!?])(\s|$)/)?.[1] ?? (one.length > 180 ? one.slice(0, 177).trimEnd() + "..." : one);
  return cut.replaceAll("|", "\\|");
};
const submodules = new Set(
  exists(".gitmodules") ? [...read(".gitmodules").matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1]!.trim()) : [],
);
const isSubmodule = (p: string) => [...submodules].some((s) => p === s || p.startsWith(`${s}/`));

function crates(): Entry[] {
  const ws = toml("Cargo.toml").workspace ?? {};
  const wsDesc: string | undefined = ws.package?.description;
  const out: Entry[] = [];
  for (const dir of (ws.members ?? []) as string[]) {
    if (!exists(`${dir}/Cargo.toml`)) continue;
    const m = toml(`${dir}/Cargo.toml`);
    const p = m.package ?? {};
    const name: string = p.name ?? dir;
    const desc = typeof p.description === "string" ? p.description : p.description?.workspace ? wsDesc : "";
    const bins: string[] = (m.bin ?? []).map((b: any) => b.name);
    out.push({
      name,
      description: oneLine(desc),
      path: dir,
      readme: `${dir}/README.md`,
      commands: [`cargo test -p ${name}`, ...bins.map((b) => `cargo run -p ${name} --bin ${b}`)],
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function packages(): Entry[] {
  const ws = JSON.parse(read("package.json")).workspaces;
  const globs: string[] = Array.isArray(ws) ? ws : ws?.packages ?? [];
  const found = new Set<string>();
  for (const g of globs) {
    if (g.endsWith("/*")) for (const d of dirs(g.slice(0, -2))) exists(`${g.slice(0, -2)}/${d}/package.json`) && found.add(`${g.slice(0, -2)}/${d}`);
    else if (exists(`${g}/package.json`)) found.add(g);
  }
  return [...found].sort().map((dir) => {
    const p = JSON.parse(read(`${dir}/package.json`));
    const scripts = Object.keys(p.scripts ?? {}).slice(0, 8).map((s) => `bun run --cwd ${dir} ${s}`);
    return { name: p.name ?? dir, description: oneLine(p.description), path: dir, readme: `${dir}/README.md`, commands: scripts };
  });
}

/** First prose paragraph of a README: a top-level paragraph node of the Markdown grammar (tree-sitter through `aphrody-code query`); the block scanner below runs where ay is absent. */
function firstParagraph(file: string): string {
  if (!exists(file)) return "";
  const text = read(file).replace(/<!-- catalog:begin [\s\S]*?<!-- catalog:end -->/g, "");
  const ff = factsOfSources(new Map([["README.md", text]]), ["paragraph"])?.get("README.md");
  if (ff && !ff.error) {
    const p = captures(ff, "paragraph").find((c) => (c.k === "section" || c.k === "document") && !/^(!\[|<)/.test(c.t));
    return oneLine(p?.t);
  }
  const body = read(file).replace(/<!-- catalog:begin [\s\S]*?<!-- catalog:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n\r?\n/).map((b) => b.trim()).find((b) => b && !b.startsWith("#") && !b.startsWith("<") && !b.startsWith("|") && !b.startsWith("```") && !b.startsWith("!["));
  return oneLine(body);
}

function apps(): Entry[] {
  return dirs("apps").filter((d) => !d.startsWith(".")).map((d) => {
    const dir = `apps/${d}`;
    const p = exists(`${dir}/package.json`) ? JSON.parse(read(`${dir}/package.json`)) : {};
    const sub = isSubmodule(dir);
    return {
      name: d,
      description: oneLine(p.description) || firstParagraph(`${dir}/README.md`),
      extra: oneLine(p.description) ? undefined : { source: "readme" },
      path: dir,
      readme: sub ? undefined : `${dir}/README.md`,
      commands: sub ? [] : Object.keys(p.scripts ?? {}).slice(0, 8).map((s) => `bun run --cwd ${dir} ${s}`),
    };
  });
}

const INFRA_ROOTS = ["build", "device", "prebuilts"];
const infra = (): Entry[] => INFRA_ROOTS.flatMap((top) => dirs(top).map((d) => ({ name: d, description: firstParagraph(`//README.md`), path: `/` })));

function thirdParty(): Entry[] {
  const file = opt("lock");
  let lock: Record<string, unknown>;
  try {
    lock = JSON.parse(file ? readFileSync(file, "utf8") : read("src.lock.json"));
  } catch (e) {
    throw new Error(`${file ?? "src.lock.json"}: not valid JSON (${e instanceof Error ? e.message : e})`);
  }
  return Object.entries<any>(lock)
    .filter(([k, v]) => k.startsWith("third_party/") && v && typeof v === "object")
    .map(([k, v]) => ({
      name: k.slice("third_party/".length),
      description: v.upstream_url ? String(v.upstream_url).replace(/\.git$/, "").replace(/^https?:\/\//, "") : "",
      path: k,
      extra: { pillar: String(v.pillar ?? ""), fork: String(v.url ?? "").replace(/\.git$/, ""), upstream: String(v.upstream_url ?? "").replace(/\.git$/, "") },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function skills(): Entry[] {
  return dirs(".agents/skills").filter((d) => exists(`.agents/skills/${d}/SKILL.md`)).map((d) => {
    const fm = read(`.agents/skills/${d}/SKILL.md`).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const desc = fm.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "") ?? "";
    return { name: d, description: oneLine(desc), path: `.agents/skills/${d}` };
  });
}

const sources: Record<string, () => Entry[]> = { crate: crates, package: packages, app: apps, infra, "third-party": thirdParty, skill: skills };
const catalog = (): Record<string, Entry[]> => Object.fromEntries(kinds.filter((k) => sources[k.id]).map((k) => [k.id, sources[k.id]!()]));

// ---------------------------------------------------------------------------------------------
// Rendering

const LOGO = "docs/logo/aphrody.png";
const relLink = (from: string, to: string) => posix.relative(posix.dirname(from), to) || ".";
const BEGIN = (n: string) => `<!-- catalog:begin ${n} -->`;
const END = "<!-- catalog:end -->";
const block = (name: string, body: string) => `${BEGIN(name)}\n${body.trim()}\n${END}`;

/** Replaces the named block of `existing`; no block yet: after the first heading (or at the top), hand-written text kept. */
function merge(existing: string | null, name: string, body: string, opts: { title?: string } = {}): string {
  const fresh = block(name, body);
  if (existing === null) return `${opts.title ? `# ${opts.title}\n\n` : ""}${fresh}\n`;
  const re = new RegExp(`${BEGIN(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}`);
  if (re.test(existing)) return existing.replace(re, () => fresh);
  const lines = existing.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 >= 0) return [...lines.slice(0, h1 + 1), "", fresh, ...lines.slice(h1 + 1)].join("\n");
  return `${fresh}\n\n${existing}`;
}

function unitBlock(kind: Kind, e: Entry): string {
  const from = e.readme!;
  const lines = [
    ...(e.extra?.source === "readme" ? [] : [e.description ? `> ${e.description}` : `> ${t("no_description")}`, ""]),
    `| ${t("type")} | ${t("path")} |`,
    "| :-- | :-- |",
    `| ${kind.name} | \`${e.path}\` |`,
  ];
  if (e.commands?.length) lines.push("", `**${t("commands")}**`, "", "```sh", ...e.commands, "```");
  if (kind.id === "crate") lines.push("", t("remote_build"));
  lines.push("", `${t("part_of", { name: projectName })}: [${slug}](${relLink(from, "README.md")}), [${t("catalog")}](${relLink(from, `docs/reference/catalog/${kind.id}.md`)}).`);
  return lines.join("\n");
}

const indexTable = (kind: Kind, entries: Entry[], from: string): string => {
  const rows = entries.map((e) => {
    const link = `[${e.name.replaceAll("|", "\\|")}](${relLink(from, e.path)})`;
    return `| ${link} | ${short(e.description) || "-"} |`;
  });
  return [`| ${t("name")} | ${t("description")} |`, "| :-- | :-- |", ...rows].join("\n");
};

const logoBlock = (from: string) => `<img alt="${projectName}" src="${relLink(from, LOGO)}" width="96" height="96">`;

function rootBlocks(data: Record<string, Entry[]>): { header: string; types: string } {
  const header = logoBlock("README.md");
  const rows = kinds.filter((k) => data[k.id]).map((k) => {
    const where = k.id === "third-party" ? "third_party" : k.id === "skill" ? ".agents/skills" : k.id === "crate" ? "src" : k.id === "package" ? "packages" : k.id === "app" ? "apps" : INFRA_ROOTS.join("/`, `");
    return `| [${k.name}](docs/reference/catalog/${k.id}.md) | \`${where}/\` | ${k.description} |`;
  });
  const types = [`## ${t("catalog")}`, "", t("catalog_intro"), "", `| ${t("type")} | ${t("path")} | ${t("description")} |`, "| :-- | :-- | :-- |", ...rows].join("\n");
  return { header, types };
}

// ---------------------------------------------------------------------------------------------
// Outputs of the repository

function outputs(): Map<string, string> {
  const out = new Map<string, string>();
  const data = catalog();
  const keep = (p: string) => {
    if (!baseRef) return exists(p) ? read(p) : null;
    const r = Bun.spawnSync(["git", "-C", root, "show", `${baseRef}:${p}`]);
    return r.exitCode === 0 ? r.stdout.toString() : null;
  };

  const { header, types } = rootBlocks(data);
  let readme = keep("README.md");
  readme = merge(readme, "header", header);
  readme = merge(readme, "types", types);
  out.set("README.md", readme);

  for (const k of kinds.filter((k) => data[k.id])) {
    const entries = data[k.id]!;
    const page = `docs/reference/catalog/${k.id}.md`;
    out.set(page, `# ${k.name}\n\n${k.description}\n\n${indexTable(k, entries, page)}\n`);
    for (const e of entries.filter((e) => e.readme)) out.set(e.readme!, merge(keep(e.readme!), "unit", unitBlock(k, e), { title: e.name }));
  }

  const site = "apps/web/public";
  out.set(`${site}/catalog.json`, JSON.stringify({ locale, types: kinds.filter((k) => data[k.id]).map((k) => ({ id: k.id, name: k.name, description: k.description, entries: data[k.id]!.map(({ name, description, path }) => ({ name, description, path })) })) }, null, 2) + "\n");
  return out;
}

const norm = (s: string) => s.replace(/\r\n/g, "\n");
function apply(files: Map<string, string>, check: boolean): number {
  const stale: string[] = [];
  for (const [p, body] of files) {
    const target = join(outDir ?? root, p);
    const cur = existsSync(target) ? norm(readFileSync(target, "utf8")) : null;
    if (cur === norm(body)) continue;
    stale.push(p);
    if (!check) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }
  const verb = check ? "differs" : "written";
  for (const p of stale) console.log(`${verb}: ${p}`);
  return stale.length;
}

// ---------------------------------------------------------------------------------------------
// GitHub profiles, ranked live

interface Profile {
  id: string;
  kind: "org" | "user";
  /** Repository that holds the README and its path inside it (informational; --out says where to write). */
  repo: string;
  file: string;
  /** Owners whose public repositories are ranked. */
  sources: string[];
  top: number;
}
interface Config {
  profiles: Profile[];
  ranking: { starWeight: number; recentDays: number; recentWeight: number; ciPassWeight: number; includeForks: boolean };
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
async function gh<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "aphrody-catalog", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 404 || res.status === 409) return null;
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return (await res.json()) as T;
}

interface Repo {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  private: boolean;
  default_branch: string;
  html_url: string;
  topics?: string[];
}

async function listRepos(owner: string): Promise<Repo[]> {
  const all: Repo[] = [];
  const base = (await gh<{ type: string }>(`/users/${owner}`))?.type === "Organization" ? `/orgs/${owner}/repos?type=public` : `/users/${owner}/repos?type=owner`;
  for (let page = 1; page < 20; page++) {
    const batch = await gh<Repo[]>(`${base}&per_page=100&page=${page}`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function ci(repo: Repo): Promise<{ ok: boolean; workflow?: string }> {
  const runs = await gh<{ workflow_runs: { conclusion: string | null; path: string }[] }>(`/repos/${repo.full_name}/actions/runs?branch=${repo.default_branch}&event=push&status=completed&per_page=1`);
  const run = runs?.workflow_runs?.[0];
  return { ok: run?.conclusion === "success", workflow: run?.path?.split("/").pop() };
}

async function profile(id: string): Promise<string> {
  const cfg: Config = JSON.parse(read("scripts/catalog.config.json"));
  const p = cfg.profiles.find((x) => x.id === id);
  if (!p) throw new Error(`profile ${id}: not in scripts/catalog.config.json`);
  const r = cfg.ranking;
  const repos = (await Promise.all(p.sources.map((o) => listRepos(o)))).flat().filter((x) => !x.archived && !x.private && (r.includeForks || !x.fork) && !cfg.profiles.some((q) => q.repo.toLowerCase() === x.full_name.toLowerCase()));
  const now = Date.now();
  const scored = await Promise.all(
    repos.map(async (x) => {
      const status = await ci(x);
      const recent = (now - Date.parse(x.pushed_at)) / 86_400_000 <= r.recentDays;
      return { repo: x, status, score: x.stargazers_count * r.starWeight + (recent ? r.recentWeight : 0) + (status.ok ? r.ciPassWeight : 0) };
    }),
  );
  const top = scored.sort((a, b) => b.score - a.score || Date.parse(b.repo.pushed_at) - Date.parse(a.repo.pushed_at)).slice(0, p.top);

  // The logo is the live avatar of the organisation that owns this repository; the title and the text come from the profile itself.
  const logoUrl = (await gh<{ avatar_url: string }>(`/orgs/${slug.split("/")[0]}`))?.avatar_url;
  if (!logoUrl) throw new Error(`profile ${id}: no avatar for ${slug.split("/")[0]}`);
  const self = await gh<{ name?: string; login: string; description?: string; bio?: string }>(`/${p.kind === "org" ? "orgs" : "users"}/${p.sources[0]}`);
  if (!self) throw new Error(`profile ${id}: ${p.sources[0]} not found`);
  const meta = await gh<{ default_branch: string }>(`/repos/${slug}`);
  const tree = `https://github.com/${slug}/blob/${meta?.default_branch ?? "main"}`;
  const rows = top.map(({ repo, status }) => {
    const badge = status.workflow ? `<a href="${repo.html_url}/actions/workflows/${status.workflow}"><img alt="${t("ci")}" src="${repo.html_url}/actions/workflows/${status.workflow}/badge.svg?branch=${repo.default_branch}"></a>` : "-";
    return `| [${repo.name}](${repo.html_url}) | ${oneLine(repo.description).replaceAll("|", "\\|") || "-"} | ${repo.language ?? "-"} | ${repo.stargazers_count} | ${badge} |`;
  });
  const typeRows = kinds.filter((k) => sources[k.id]).map((k) => `[${k.name}](${tree}/docs/reference/catalog/${k.id}.md)`);
  const body = [
    '<p align="center">',
    `  <img alt="${projectName}" src="${logoUrl}${logoUrl.includes("?") ? "&" : "?"}s=200" width="100" height="100">`,
    "</p>",
    "",
    `<h1 align="center">${self.name || self.login}</h1>`,
    "",
    ...((self.description || self.bio) ? [`<p align="center">${oneLine(self.description || self.bio)}</p>`, ""] : []),
    "",
    `## ${t("projects")}`,
    "",
    `| ${t("project")} | ${t("description")} | ${t("language")} | ${t("stars")} | ${t("ci")} |`,
    "| :-- | :-- | :-- | --: | :-: |",
    ...rows,
    "",
    `## ${t("catalog")}`,
    "",
    typeRows.join(" | "),
    "",
    t("profile_source", { url: `https://github.com/${slug}` }),
  ].join("\n");
  return body;
}

// ---------------------------------------------------------------------------------------------

if (args[0] === "profile") {
  const id = args[1];
  if (!id) throw new Error("usage: catalog.ts profile <id> [--out <file>] [--check]");
  const file = opt("out") ?? join(root, "..", "profile.md");
  const body = await profile(id);
  const cur = existsSync(file) ? readFileSync(file, "utf8") : null;
  const next = merge(cur, "profile", body);
  if (flag("check")) {
    if (cur !== null && norm(cur) === norm(next)) process.exit(0);
    console.log(`differs: ${file}`);
    process.exit(1);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
  console.log(`written: ${file}`);
} else {
  const changed = apply(outputs(), flag("check"));
  if (flag("check") && changed) {
    console.error(`${changed} output(s) differ: run \`bun scripts/catalog.ts\``);
    process.exit(1);
  }
}
