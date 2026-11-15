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
// Types come from `[[type]]` of packages/design/brand/brand.toml (one icon each, docs/icons): Rust workspace members of
// Cargo.toml (crate), Bun workspaces of package.json (package), apps/* (app), infra/* (infra), the pins of src.lock.json
// (third-party) and .agents/skills/* (skill). Outputs:
//   - README.md: the `header` and `types` blocks between `<!-- catalog:begin NAME -->` and `<!-- catalog:end -->`;
//   - one README per crate, package and own app: a `unit` block from its manifest; any hand-written text around the
//     markers stays, a README without markers gets the block after its first heading;
//   - docs/reference/catalog/<type>.md, one index per type;
//   - apps/aphrody/public/catalog.json and catalog/index.html (the site page, tokens from packages/design), with the type
//     icons copied to apps/aphrody/public/brand/icons.
// Nothing is typed here: no version, count or date goes into a text, the text comes from the i18n catalogs
// (packages/i18n/catalogs/catalog/<locale>.json, same format and fallback chain as @aphrody/i18n; this file has no
// dependency so a profile repository can run it from a sparse checkout).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

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
  symbol: string;
  description: string;
}

const brand = toml("packages/design/brand/brand.toml");
const kinds: Kind[] = brand.type ?? [];
const kindOf = (id: string) => kinds.find((k) => k.id === id) ?? { id, name: id, symbol: "", description: "" };
const projectName: string = brand.brand.name;
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

function firstParagraph(file: string): string {
  if (!exists(file)) return "";
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

const infra = (): Entry[] => dirs("infra").map((d) => ({ name: d, description: firstParagraph(`infra/${d}/README.md`), path: `infra/${d}` }));

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

const iconPath = (id: string) => `docs/icons/${id}.svg`;
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
  const icon = relLink(from, iconPath(kind.id));
  const lines = [
    `<img src="${icon}" alt="${kind.name}" width="40" height="40" align="right">`,
    "",
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

const logoBlock = (from: string, org: string) =>
  [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${relLink(from, `docs/logo/${org}-wordmark-dark.svg`)}">`,
    `  <img alt="${projectName}" src="${relLink(from, `docs/logo/${org}-wordmark-light.svg`)}" height="56">`,
    "</picture>",
  ].join("\n");

function rootBlocks(data: Record<string, Entry[]>): { header: string; types: string } {
  const primary = (brand.org ?? []).find((o: any) => o.primary) ?? (brand.org ?? [])[0];
  const badges = (brand.badge ?? []).map((b: any) => `<img alt="${b.label}" src="docs/badges/${b.id}.svg">`).join(" ");
  const header = [logoBlock("README.md", primary.id), "", badges].join("\n");
  const rows = kinds.filter((k) => data[k.id]).map((k) => {
    const where = k.id === "third-party" ? "third_party" : k.id === "skill" ? ".agents/skills" : k.id === "crate" ? "src" : k.id === "package" ? "packages" : k.id === "app" ? "apps" : "infra";
    return `| <img src="${iconPath(k.id)}" alt="" width="24" height="24"> [${k.name}](docs/reference/catalog/${k.id}.md) | \`${where}/\` | ${k.description} |`;
  });
  const types = [`## ${t("catalog")}`, "", t("catalog_intro"), "", `| ${t("type")} | ${t("path")} | ${t("description")} |`, "| :-- | :-- | :-- |", ...rows].join("\n");
  return { header, types };
}

function siteHtml(data: Record<string, Entry[]>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const repo = `https://github.com/${slug}/tree/main`;
  const sections = kinds.filter((k) => data[k.id]).map((k) => {
    const items = data[k.id]!.map((e) => `<li><a href="${repo}/${esc(e.path)}">${esc(e.name)}</a>${e.description ? `<span>${esc(short(e.description).replaceAll("\\|", "|").replaceAll("`", ""))}</span>` : ""}</li>`).join("\n");
    return `<section id="${k.id}"><h2><img src="/brand/icons/${k.id}.svg" alt="" width="32" height="32">${esc(k.name)}</h2><p>${esc(k.description)}</p><details><summary>${esc(t("entries"))}</summary><ul>\n${items}\n</ul></details></section>`;
  });
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t("catalog"))} - ${esc(projectName)}</title>
<meta name="description" content="${esc(t("catalog_intro"))}">
<link rel="canonical" href="https://aphrody.com/catalog/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/tokens.css">
<style>
body{margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:var(--md-sys-typescale-body-large-size)/1.5 var(--md-ref-typeface-plain)}
main{max-width:72ch;margin:0 auto;padding:2rem 1rem}
h1{font-size:var(--md-sys-typescale-headline-large-size);margin:0 0 .5rem}
h2{display:flex;gap:.75rem;align-items:center;font-size:var(--md-sys-typescale-title-large-size);margin:2rem 0 .25rem}
p{color:var(--md-sys-color-on-surface-variant);margin:.25rem 0 1rem}
summary{cursor:pointer;padding:.75rem 0;min-height:48px;box-sizing:border-box}
ul{list-style:none;margin:0;padding:0}
li{display:flex;flex-direction:column;padding:.5rem 0;border-top:1px solid var(--md-sys-color-outline-variant)}
li span{color:var(--md-sys-color-on-surface-variant);font-size:var(--md-sys-typescale-body-medium-size)}
a{color:var(--md-sys-color-primary)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--md-sys-color-secondary);outline-offset:2px}
</style>
</head>
<body>
<main>
<h1>${esc(t("catalog"))}</h1>
<p>${esc(t("catalog_intro"))}</p>
${sections.join("\n")}
</main>
</body>
</html>
`;
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
    out.set(page, `<img src="${relLink(page, iconPath(k.id))}" alt="" width="48" height="48">\n\n# ${k.name}\n\n${k.description}\n\n${indexTable(k, entries, page)}\n`);
    for (const e of entries.filter((e) => e.readme)) out.set(e.readme!, merge(keep(e.readme!), "unit", unitBlock(k, e), { title: e.name }));
  }

  const site = "apps/aphrody/public";
  out.set(`${site}/catalog.json`, JSON.stringify({ locale, types: kinds.filter((k) => data[k.id]).map((k) => ({ id: k.id, name: k.name, description: k.description, icon: `/brand/icons/${k.id}.svg`, entries: data[k.id]!.map(({ name, description, path }) => ({ name, description, path })) })) }, null, 2) + "\n");
  out.set(`${site}/catalog/index.html`, siteHtml(data));
  for (const k of kinds.filter((k) => data[k.id])) if (exists(iconPath(k.id))) out.set(`${site}/brand/icons/${k.id}.svg`, read(iconPath(k.id)));
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
  /** brand.toml organisation whose wordmark heads the page. */
  org: string;
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
  const runs = await gh<{ workflow_runs: { conclusion: string | null; path: string }[] }>(`/repos/${repo.full_name}/actions/runs?branch=${repo.default_branch}&status=completed&per_page=1`);
  const run = runs?.workflow_runs?.[0];
  return { ok: run?.conclusion === "success", workflow: run?.path?.split("/").pop() };
}

async function profile(id: string): Promise<string> {
  const cfg: Config = JSON.parse(read("scripts/catalog.config.json"));
  const p = cfg.profiles.find((x) => x.id === id);
  if (!p) throw new Error(`profile ${id}: not in scripts/catalog.config.json`);
  const r = cfg.ranking;
  const repos = (await Promise.all(p.sources.map((o) => listRepos(o)))).flat().filter((x) => !x.archived && !x.private && (r.includeForks || !x.fork));
  const now = Date.now();
  const scored = await Promise.all(
    repos.map(async (x) => {
      const status = await ci(x);
      const recent = (now - Date.parse(x.pushed_at)) / 86_400_000 <= r.recentDays;
      return { repo: x, status, score: x.stargazers_count * r.starWeight + (recent ? r.recentWeight : 0) + (status.ok ? r.ciPassWeight : 0) };
    }),
  );
  const top = scored.sort((a, b) => b.score - a.score || Date.parse(b.repo.pushed_at) - Date.parse(a.repo.pushed_at)).slice(0, p.top);

  const org = (brand.org ?? []).find((o: any) => o.id === p.org);
  if (!org) throw new Error(`profile ${id}: organisation ${p.org} not in brand.toml`);
  const meta = await gh<{ default_branch: string }>(`/repos/${slug}`);
  const raw = `https://raw.githubusercontent.com/${slug}/${meta?.default_branch ?? "main"}`;
  const tree = `https://github.com/${slug}/blob/${meta?.default_branch ?? "main"}`;
  const wordmark = (theme: string) => `${raw}/docs/logo/${org.id}-wordmark-${theme}.svg`;
  const rows = top.map(({ repo, status }) => {
    const badge = status.workflow ? `<a href="${repo.html_url}/actions/workflows/${status.workflow}"><img alt="${t("ci")}" src="${repo.html_url}/actions/workflows/${status.workflow}/badge.svg?branch=${repo.default_branch}"></a>` : "-";
    return `| [${repo.name}](${repo.html_url}) | ${oneLine(repo.description).replaceAll("|", "\\|") || "-"} | ${repo.language ?? "-"} | ${repo.stargazers_count} | ${badge} |`;
  });
  const typeRows = kinds.filter((k) => sources[k.id]).map((k) => `<a href="${tree}/docs/reference/catalog/${k.id}.md"><img src="${raw}/docs/icons/${k.id}.svg" alt="${k.name}" width="40" height="40" title="${k.name}"></a>`);
  const body = [
    '<p align="center">',
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${wordmark("dark")}">`,
    `  <img alt="${org.name} ${org.suffix}" src="${wordmark("light")}" height="64">`,
    "</picture>",
    "</p>",
    "",
    `<p align="center">${org.tagline}</p>`,
    "",
    `## ${t("projects")}`,
    "",
    `| ${t("project")} | ${t("description")} | ${t("language")} | ${t("stars")} | ${t("ci")} |`,
    "| :-- | :-- | :-- | --: | :-: |",
    ...rows,
    "",
    `## ${t("catalog")}`,
    "",
    `<p>${typeRows.join(" ")}</p>`,
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
