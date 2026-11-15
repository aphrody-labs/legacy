// Hardcode and slop scanner for the tracked tree. One engine, three front ends: this CLI, the stdio MCP server
// (scripts/hygiene-mcp.ts, relay hub server `hygiene`) and `just hygiene`. Dead path references come from
// scripts/hygiene-refs.ts (the former var/coh/deadrefs.ts).
//
// usage: bun scripts/hygiene.ts [--rule id[,id]] [--json] [--summary] [--limit N] [--paths a,b] [--root dir]
// Suppression: `hygiene-ok: <reason>` on the line, or an entry in scripts/hygiene.allow.json ({ "<rule>": ["<glob>"] }).
//
// Criteria (fetched live 2026-11-15):
// - Google eng-practices, "What to look for in a code review": no over-engineering or functionality not needed
//   now; comments explain why, not what (https://google.github.io/eng-practices/review/reviewer/looking-for.html).
// - Google developer documentation style guide, "Timeless documentation": no time-relative or version-bound
//   statements that rot (https://developers.google.com/style/timeless-documentation).
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Hit = { rule: string; file: string; line: number; text: string };
export type Rule = {
  id: string;
  why: string;
  /** file predicate on the repo-relative path */
  files?: (f: string) => boolean;
  /** line scanner; return true to flag */
  line?: (l: string, f: string) => boolean;
  /** path scanner (file names) */
  path?: (f: string) => boolean;
};

const CODE = /\.(ts|tsx|js|mjs|cjs|rs|sh|ps1|just|py|c|h|zig|cs)$|(^|\/)justfile$/;
const DOC = /\.(md|mdx|txt)$/;
const LOCK = /(^|\/)(Cargo\.lock|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|flake\.lock|src\.lock\.json|.*\.lock)$/;
const MANIFEST = /(^|\/)(Cargo\.toml|package\.json|tools\.toml|toolchain[^/]*\.toml|chrome-channels\.toml|DEPS|deny\.toml|fonts\.lock\.toml|.*\.csproj|.*\.zon)$/;

// Never scanned: pinned upstream trees, vendored or generated upstream copies, verdict archive, binary payloads.
const SKIP = [
  /^third_party\//, /^docs\/reviews\//, /^apps\/(rosegriffon|shenron)\//, /^apps\/auto\/vendor\//,
  /^tools\/lore\//, /^docs\/lore\//, /^src\/lore\//, /^\.agents\/skills\/[^/]+\/references\//,
  /^docs\/bun\//, /^docs\/(nextjs|shadcn|base-ui|better-auth|tailwindcss)\//, /^docs\/lfs\/logs\//,
  /(^|\/)(node_modules|target|dist)\//, /\.(png|jpe?g|gif|ico|wasm|ttf|otf|woff2?|icns|zip|gz|zst|xz|bin|node|dll|exe|pdf|webp|svg|snap)$/i,
  // areas owned by other sessions
  /^src\/(sys|bun-flat|gnu|ghidra[^/]*|electron-migrate)\//, /^packages\/(gnu|ghidra)\//, /^packages\/ai-os\/src\/relay\//,
  /^infra\/android\//, /^scripts\/android-/,
  LOCK, /(^|\/)(Cargo\.toml)$/ /* root manifests are not edited by the purge */,
];
// Absorbed upstream code keeps its own TODOs; they are tracked upstream, not here.
const UPSTREAM_PORT = /^(src|packages\/browser\/native|packages\/native\/native)\//;
export const skipped = (f: string) => SKIP.some((r) => r.test(f));

const AI_FILLER =
  /\b(delve[sd]?|seamless(ly)?|tapestry|game-?chang(er|ing)|cutting-edge|state-of-the-art|supercharg\w+|unlock(s|ing)? the (power|potential)|elevate[sd]?|pivotal|testament to|in today's (fast|digital)|navigate the (complex|landscape)|rich tapestry|véritable|incontournable|au cœur de|révolutionn\w+|sublim\w+)\b/i;
const SOVEREIGN = /\b(sovereign|antigravity)\b/i;
const STUB = /\b(TODO: implement|not implemented yet|lorem ipsum|placeholder implementation|stub implementation|fake output|demo only)\b/i;
const ABS_PATH = /(\b[A-Za-z]:[\\/](?:src|Users|labs|msys\d*|Program Files)[\\/]|(?<![\w.])\/(?:home|Users)\/[a-z][\w-]*\/|\/srv\/(?:src|build|artifacts)\b)/;
const MAGIC_DATE = /\b20[2-3]\d-[01]\d-[0-3]\d\b/;
const DATED_PROSE = /\b(as of|état au|etat au|snapshot|validated on|verified on|checked on|measured|mesuré|vérifié le|au) +(the +)?20[2-3]\d-[01]\d-[0-3]\d\b/i;
const PIN_NPM = /(?:^|[\s"'`=(])(?:npx|bunx|bun (?:add|x|install)|npm (?:i|install)|pnpm (?:add|dlx))\s+(?:-[\w-]+\s+)*(@?[\w./-]+)@(\d+\.\d+\.\d+[\w.-]*)/;
const PIN_CLONE = /\bgit clone\b[^\n]*(?:-b|--branch)\s+v?\d+\.\d+|--(?:tag|rev)\s+v?\d+\.\d+\.\d+|\bcurl\b[^\n]*\/releases\/download\/v?\d+\.\d+/;
const PIN_ACTION = /\buses:\s*[\w./-]+@v?\d+\.\d+\.\d+\b/;
const SLUG = /["'`]([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)["'`]/g;
const SCRAPE = /(href=|<a [^>]*href|DOMParser|cheerio|parse5|querySelectorAll)[^\n]*|\bfetch\([^)]*(github\.com\/[^/]+\/[^/]+\/releases|kernel\.org|googlesource\.com)[^)]*\)\s*\.then\(\s*\(?r\)?\s*=>\s*r\.text\(\)/;
const SCRAPE_HOST = /(github\.com\/[^/\s"'`]+\/[^/\s"'`]+\/(releases|tags)\b(?!\/download)|kernel\.org\/(?!releases\.json)|android\.googlesource\.com)/;

export const RULES: Rule[] = [
  { id: "sovereign", why: "Legacy Sovereign/Antigravity wording often wraps fake outputs; verify the claim or delete it", files: (f) => (CODE.test(f) || DOC.test(f)) && !/^\.agents\/skills\/rust-stack-sovereign\//.test(f), line: (l) => SOVEREIGN.test(l) },
  { id: "ai-filler", why: "AI-filler prose (humanizer catalogue); say the fact", files: (f) => DOC.test(f), line: (l) => AI_FILLER.test(l) },
  { id: "stub", why: "Stub, demo or fake output left in tracked code (eng-practices: no functionality not needed now)", files: (f) => CODE.test(f) && !UPSTREAM_PORT.test(f) && !/(^|\/)(tests?|__tests__|fixtures?)\//.test(f) && !/\.test\./.test(f), line: (l) => STUB.test(l) },
  { id: "backup-file", why: "Backup or leftover file; git is the history", path: (f) => /\.(bak|orig|rej|swp|old)(-[\w.]+)?$|~$|(^|\/)\.#|\.old$/.test(f) },
  { id: "dated-filename", why: "Dated file name: a snapshot maintained by hand (style guide: timeless documentation)", path: (f) => !/^(docs\/reviews|docs\/proofs)\//.test(f) && /(^|[/_.-])20[2-3]\d-?[01]\d(-?[0-3]\d)?([/_.-]|$)/.test(f.split("/").pop()!) },
  { id: "magic-date", why: "Date literal in code: compute it or read it from the source of truth", files: (f) => CODE.test(f) && !/\.test\./.test(f) && !/^(bench|test)\//.test(f), line: (l) => MAGIC_DATE.test(l) && !/^\s*(\/\/|#|\*|\/\*)/.test(l) },
  { id: "dated-snapshot", why: "Hand-maintained dated statement in prose (style guide: timeless documentation)", files: (f) => DOC.test(f) && !MANIFEST.test(f), line: (l) => DATED_PROSE.test(l) },
  { id: "absolute-path", why: "Machine-specific absolute path; derive from the repo root, SRC_ROOT or the home directory", files: (f) => (CODE.test(f) || DOC.test(f) || /\.(toml|json|ya?ml)$/.test(f)) && !MANIFEST.test(f), line: (l) => ABS_PATH.test(l) },
  { id: "pinned-version", why: "Version or tag pinned outside a manifest or lockfile; resolve latest from the registry or the manifest", files: (f) => (CODE.test(f) || DOC.test(f) || /\.ya?ml$/.test(f)) && !MANIFEST.test(f) && !/^\.github\/workflows\//.test(f), line: (l) => PIN_NPM.test(l) || PIN_CLONE.test(l) || PIN_ACTION.test(l) },
  { id: "hardcoded-list", why: "Hard-coded repo slug list that the GitHub API or a manifest provides (8+ slugs in one file)", files: (f) => /\.(ts|tsx|js|mjs|rs|sh)$/.test(f) && !/\.test\./.test(f) },
  { id: "home-scraper", why: "Home-made scraper of an upstream page; use the releases API, gitiles JSON, kernel.org releases.json, Repology or nvchecker", files: (f) => /\.(ts|tsx|js|mjs|sh|py)$/.test(f) && !/\.test\./.test(f), line: (l) => SCRAPE_HOST.test(l) && /(fetch|curl|xh|wget|Invoke-WebRequest)/.test(l) && !/api\.github\.com|releases\.json|\?format=JSON|--json|releases\/latest\/download/.test(l) },
];

const allow: Record<string, string[]> = existsSync(join(import.meta.dir, "hygiene.allow.json"))
  ? JSON.parse(readFileSync(join(import.meta.dir, "hygiene.allow.json"), "utf8"))
  : {};
const globRe = (g: string) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*") + "$");
const allowed = (rule: string, f: string) => (allow[rule] ?? []).some((g) => globRe(g).test(f));

export function listFiles(root: string, paths: string[] = []): string[] {
  const r = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", "--", ...paths]);
  return r.stdout.toString().split("\0").filter(Boolean).filter((f) => !skipped(f));
}

export function scan(root: string, opts: { rules?: string[]; paths?: string[] } = {}): Hit[] {
  const rules = RULES.filter((r) => !opts.rules?.length || opts.rules.includes(r.id));
  const hits: Hit[] = [];
  for (const f of listFiles(root, opts.paths)) {
    const abs = join(root, f);
    for (const r of rules) if (r.path?.(f) && !allowed(r.id, f)) hits.push({ rule: r.id, file: f, line: 0, text: "" });
    const need = rules.filter((r) => (r.line || r.id === "hardcoded-list") && (r.files?.(f) ?? true) && !allowed(r.id, f));
    if (!need.length) continue;
    let text: string;
    try {
      if (!existsSync(abs) || statSync(abs).size > 512_000) continue;
      text = readFileSync(abs, "utf8");
    } catch { continue; }
    const lines = text.split("\n");
    for (const r of need) {
      if (r.id === "hardcoded-list") {
        const slugs = new Set<string>();
        for (const m of text.matchAll(SLUG)) if (/^[\w.-]+\/[\w.-]+$/.test(m[1]!) && !/\.(ts|js|json|md|rs|css|html)$/.test(m[1]!) && !/^(node|src|dist|lib|bin|usr|var|etc|tmp|docs?|apps?|packages?|crates?|infra|scripts?|test|tests|bench|assets|plugins)\//.test(m[1]!) && !m[1]!.includes("..")) slugs.add(m[1]!);
        if (slugs.size >= 8) hits.push({ rule: r.id, file: f, line: 0, text: `${slugs.size} slugs: ${[...slugs].slice(0, 3).join(", ")}` });
        continue;
      }
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (l.length > 600 || l.includes("hygiene-ok")) continue;
        if (r.line!(l, f)) hits.push({ rule: r.id, file: f, line: i + 1, text: l.trim().slice(0, 160) });
      }
    }
  }
  return hits;
}

// dead-ref: repo-relative paths and relative markdown links that point to nothing (fiction and moved targets).
const TOP = "(?:docs|scripts|infra|packages|apps|third_party|src|tools|plugins|conformance|assets|\\.github|\\.agents)";
const REF = new RegExp("(?<![\\w./-])(" + TOP + "/[A-Za-z0-9_@.+\\-/]+)", "g");
const LINK = /\]\((?!https?:|#|mailto:)([^)\s#]+)/g;
export function deadRefs(root: string, paths?: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of listFiles(root, paths)) {
    if (!/\.(md|mdx|ts|just|ya?ml|toml|sh|json)$|justfile$/.test(f) || allowed("dead-ref", f)) continue;
    let text: string;
    try { if (statSync(join(root, f)).size > 512_000) continue; text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    const seen = new Set<string>();
    const add = (p: string, shown: string) => { if (!seen.has(p)) { seen.add(p); hits.push({ rule: "dead-ref", file: f, line: text.slice(0, text.indexOf(shown) < 0 ? 0 : text.indexOf(shown)).split("\n").length, text: shown }); } };
    for (const m of text.matchAll(REF)) {
      const p = m[1]!.replace(/[.,:;)`'"]+$/, "").replace(/\/+$/, "");
      if (/[*{}<>$]/.test(p) || p.includes("...") || (p.startsWith("third_party/") && p.split("/").length > 2)) continue;
      if (!existsSync(join(root, p))) add(p, p);
    }
    if (/\.mdx?$/.test(f)) for (const m of text.matchAll(LINK)) {
      const p = join(root, f, "..", decodeURI(m[1]!));
      if (!existsSync(p)) add("link:" + m[1], m[1]!);
    }
  }
  return hits;
}

export function summarize(hits: Hit[]) {
  const by: Record<string, { hits: number; files: Set<string> }> = {};
  for (const h of hits) (by[h.rule] ??= { hits: 0, files: new Set() }, by[h.rule]!.hits++, by[h.rule]!.files.add(h.file));
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { hits: v.hits, files: v.files.size }]));
}

if (import.meta.main) {
  const a = Bun.argv.slice(2);
  const opt = (k: string) => { const i = a.indexOf(k); return i < 0 ? undefined : a[i + 1]; };
  const root = opt("--root") ?? import.meta.dir.replace(/[\\/]scripts$/, "");
  const rules = opt("--rule")?.split(",");
  const paths = opt("--paths")?.split(",");
  const limit = Number(opt("--limit") ?? 0);
  const hits = scan(root, { rules, paths });
  // dead-ref is opt-in: src-b0's src/* renames keep moving the targets
  if (rules?.includes("dead-ref")) hits.push(...deadRefs(root, paths));
  if (a.includes("--summary")) console.log(JSON.stringify(summarize(hits), null, 1));
  else if (a.includes("--json")) console.log(JSON.stringify(limit ? hits.slice(0, limit) : hits));
  else for (const h of limit ? hits.slice(0, limit) : hits) console.log(`${h.rule}\t${h.file}:${h.line}\t${h.text}`);
  if (!a.includes("--summary") && !a.includes("--json")) console.error(`${hits.length} hits`);
  process.exitCode = hits.length ? 1 : 0;
}
