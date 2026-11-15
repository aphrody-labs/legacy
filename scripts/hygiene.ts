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
import { sensitiveValues } from "../packages/env-kit/src/discover.ts";
import { isNonSourceProse, sourceLanguage } from "../packages/i18n/src/detect.ts";

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

const SOURCE_LANG = sourceLanguage();
const CODE =
  /\.(ts|tsx|js|mjs|cjs|rs|sh|ps1|just|py|c|h|zig|cs)$|(^|\/)justfile$/;
const DOC = /\.(md|mdx|txt)$/;
const LOCK =
  /(^|\/)(Cargo\.lock|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|flake\.lock|src\.lock\.json|.*\.lock)$/;
const MANIFEST =
  /(^|\/)(Cargo\.toml|package\.json|tools\.toml|toolchain[^/]*\.toml|chrome-channels\.toml|DEPS|deny\.toml|fonts\.lock\.toml|.*\.csproj|.*\.zon)$/;

// Never scanned: pinned upstream trees, vendored or generated upstream copies, verdict archive, binary payloads.
const SKIP = [
  /^third_party\//,
  /^docs\/reviews\//,
  /^apps\/(rosegriffon|shenron)\//,
  /^apps\/auto\/vendor\//,
  /^tools\/lore\//,
  /^docs\/lore\//,
  /^src\/lore\//,
  /^\.agents\/skills\/[^/]+\/references\//,
  /^docs\/bun\//,
  /^docs\/(nextjs|shadcn|base-ui|better-auth|tailwindcss)\//,
  /^docs\/lfs\/logs\//,
  /(^|\/)(node_modules|target|dist)\//,
  /\.(png|jpe?g|gif|ico|wasm|ttf|otf|woff2?|icns|zip|gz|zst|xz|bin|node|dll|exe|pdf|webp|svg|snap)$/i,
  // areas owned by other sessions
  /^src\/(sys|bun-flat|gnu|ghidra[^/]*|electron-migrate)\//,
  /^packages\/(gnu|ghidra)\//,
  /^packages\/ai-os\/src\/relay\//,
  /^infra\/android\//,
  /^scripts\/android-/,
  LOCK,
  /(^|\/)(Cargo\.toml)$/ /* root manifests are not edited by the purge */,
];
// Absorbed upstream code keeps its own TODOs; they are tracked upstream, not here.
const UPSTREAM_PORT =
  /^(src|packages\/browser\/native|packages\/native\/native)\//;
export const skipped = (f: string) => SKIP.some((r) => r.test(f));

const AI_FILLER =
  /\b(delve[sd]?|seamless(ly)?|tapestry|game-?chang(er|ing)|cutting-edge|state-of-the-art|supercharg\w+|unlock(s|ing)? the (power|potential)|testament to|pinnacle|in today.s (fast|digital)|navigate the (complex|landscape)|rich tapestry|incontournable|au cœur de|révolutionn\w+)\b/i;
const BANNED_LIST =
  /\b(zero|no|avoid|clich|puffery|tropes|catalogue|AI words)\b/i; // lines that name the words in order to ban them
const SOVEREIGN = /(?<![\w\/.-])sovereign(?![\w\/.-])/i; // Antigravity is a real product (agy CLI), not slop
const STUB =
  /\b(TODO: implement|not implemented yet|lorem ipsum|placeholder implementation|stub implementation|fake output|demo only)\b/i;
const ABS_USER = /([A-Za-z]:[\\/]labs\b)/;
// personal-data: values discovered on this machine (cache) plus generic personal patterns.
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
let siteRe: RegExp | null | undefined;
/**
 * Values the discovery cache last saw (owner identity, Windows user and home, host names and addresses; see
 * packages/env-kit/src/discover.ts): the list lives in ~/.cache/aphrody, never in the repository. A host's /24 covers
 * its whole mesh. An all-caps machine name is also a brand word, so it matches in hostname contexts only.
 */
function sitePattern(): RegExp | null {
  if (siteRe !== undefined) return siteRe;
  const { values, machine } = sensitiveValues();
  const alts = new Set<string>();
  for (const s of values) {
    const net = /^(\d+\.\d+\.\d+)\.\d+$/.exec(s);
    alts.add(net && /^10\./.test(s) ? escRe(net[1]!) + "\\.\\d{1,3}" : escRe(s));
  }
  if (machine && machine.length >= 5) {
    alts.add("(?<=(?:[Hh]ostname|COMPUTERNAME|[Mm]achine|HOST)\\W{0,6})" + escRe(machine) + "(?![-\\w])");
  }
  return (siteRe = alts.size ? new RegExp("(?<![A-Za-z0-9])(" + [...alts].join("|") + ")(?![A-Za-z0-9])") : null);
}
const PD_USERPATH = /(?:[A-Za-z]:[\\/]Users[\\/]|\/home\/|\/Users\/)(?!Public\b|Default\b|user\b|name\b|you\b|me\b|runner\b|\$|%|<|\{|\*|\.\.\.|[Xx]{2,}|node\b|ubuntu\b|builder\b|vscode\b|app\b|nobody\b|Shared\b|linuxbrew\b|git\b|bun\b|aphrody\b|agent\b|auto\b|legacy\b|backups\b|nativelink\b|[A-Za-z]*\\?\w*example)[A-Za-z][\w.-]*/;
// Public IPv4 only: documentation, loopback, link-local and RFC 1918 ranges are not personal (a site's own mesh is caught by its CIDR in the private file).
const PD_IPV4 = /(?<![\w.-])(?!(?:0|127|255)\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|169\.254\.|240\.0\.)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\w.]*\w)(?!\.\d|-\d)/;
const PD_EMAIL = /[\w.+-]+@(?!example\.|exemple\.|users\.noreply\.github\.com|aphrody\.|localhost|[\w.-]*\.example\b|[\w.-]*aphrody\.)[\w-]+(?:\.[\w-]+)*\.(?!png\b|jpe?g\b|webp\b|gif\b|svg\b|service\b|socket\b|timer\b|target\b|mesh\b|local\b)[A-Za-z]{2,}\b/;
// Lines where a dotted quad is a version, an OID or a user agent, and where an e-mail credits an upstream author or is a sample.
const PD_VERSIONISH = /version|chrom(e|ium)|mozilla|user.?agent|rustc|\bv8\b|\boid\b|cargo|\bbun\b|\bnode\b|\{text\}|CN=|\b\d+\.\d+\.\d+\.\d+\s*(release|build|nightly)|"ua"|"EN-|"[A-Z]+_?VERSION/i;
const PD_CREDIT = /copyright|\(c\)|author|signed-off|co-authored|maintainer|contact|mailto:|user:pass@|git@github|jane\.doe/i;
export function personalData(l: string): boolean {
  const re = sitePattern();
  return (
    (re?.test(l) ?? false) ||
    PD_USERPATH.test(l) ||
    (PD_IPV4.test(l) && !PD_VERSIONISH.test(l)) ||
    (PD_EMAIL.test(l) && !PD_CREDIT.test(l))
  );
}
const ABS_SRC = /\b[A-Za-z]:[\\/]src\b|\/srv\/src\b/; // the checkout location: fine in prose and fleet host config, not in code
const MAGIC_DATE = /\b20[2-3]\d-[01]\d-[0-3]\d\b/;
const DATED_PROSE =
  /\b(as of|état au|etat au|snapshot|validated on|verified on|checked on|measured|mesuré|vérifié le|au) +(the +)?20[2-3]\d-[01]\d-[0-3]\d\b/i;
const PIN_NPM =
  /(?:^|[\s"'`=(])(?:npx|bunx|bun (?:add|x|install)|npm (?:i|install)|pnpm (?:add|dlx))\s+(?:-[\w-]+\s+)*(@?[\w./-]+)@(\d+\.\d+\.\d+[\w.-]*)/;
const PIN_CLONE =
  /\bgit clone\b[^\n]*(?:-b|--branch)\s+v?\d+\.\d+|--(?:tag|rev)\s+v?\d+\.\d+\.\d+|\bcurl\b[^\n]*\/releases\/download\/v?\d+\.\d+/;
const PIN_ACTION = /\buses:\s*[\w./-]+@v?\d+\.\d+\.\d+\b/;
const SLUG = /["'`]([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)["'`]/g;
const SCRAPE =
  /(href=|<a [^>]*href|DOMParser|cheerio|parse5|querySelectorAll)[^\n]*|\bfetch\([^)]*(github\.com\/[^/]+\/[^/]+\/releases|kernel\.org|googlesource\.com)[^)]*\)\s*\.then\(\s*\(?r\)?\s*=>\s*r\.text\(\)/;
const SCRAPE_HOST =
  /(github\.com\/[^/\s"'`]+\/[^/\s"'`]+\/(releases|tags)\b(?!\/download)|kernel\.org\/(?!releases\.json)|android\.googlesource\.com)/;

/** node: APIs with a native Bun replacement (https://bun.com/docs/runtime/file-io and the Bun API reference). */
export const NODE_REPLACED: [RegExp, string][] = [
  [/from ["']node:child_process["']|require\(["']node:child_process["']\)/, "Bun.spawn / Bun.spawnSync / Bun.$"],
  [/(?<![.\w])fileURLToPath\(/, "Bun.fileURLToPath or import.meta.dir / import.meta.path"],
  [/(?<!["'`\w])(?:crypto\.)?createHash\((?![^)]*\)\s*:)/, "Bun.CryptoHasher"],
  [/\b(gzipSync|gunzipSync|deflateSync|inflateSync|zstdCompressSync|zstdDecompressSync)\b[^\n]*from ["']node:zlib["']/, "Bun.gzipSync / Bun.gunzipSync / Bun.deflateSync / Bun.zstdCompressSync (brotli has no Bun API, so node:zlib stays for it)"],
  [/from ["']node:https?["']/, "Bun.serve / fetch"],
  [/from ["']node:(test|assert(\/strict)?)["']/, "bun:test"],
  [/from ["']node:sqlite["']/, "bun:sqlite"],
  [/\bpromisify\(/, "the promise API itself"],
  [/from ["']node:readline["']/, "for await (const line of console)"],
];

/**
 * package.json dependencies that Bun replaces natively: name -> [replacement, Bun docs page]. Docs are mirrored in
 * aphrody-labs/bun (docs/, https://bun.com/docs). A dependency stays only with a measured gain or a missing Bun
 * feature, written in the manifest's "bunExceptions" map: { "<dep>": "<reason>" }.
 */
const DOCS = "https://bun.com/docs/";
const bunAlt = (what: string, page: string): [string, string] => [what, DOCS + page];
export const BUN_REPLACED: Record<string, [string, string]> = {};
for (const [names, what, page] of [
  ["jest ts-jest @jest/globals vitest mocha chai jasmine ava tap supertest", "bun test (bun:test)", "test"],
  ["ts-node tsx ts-node-dev babel-node @swc-node/register sucrase", "bun run file.ts", "runtime"],
  ["esbuild webpack webpack-cli rollup parcel tsup unbuild @swc/core @babel/core @babel/cli @babel/preset-env @babel/preset-typescript", "bun build / Bun.build / Bun.Transpiler", "bundler"],
  ["nodemon", "bun --watch / bun --hot", "runtime/watch-mode"],
  ["dotenv dotenv-expand dotenv-cli", ".env is read automatically", "runtime/environment-variables"],
  ["node-fetch undici axios got ky cross-fetch isomorphic-fetch whatwg-fetch superagent request", "global fetch", "runtime/networking/fetch"],
  ["ws isomorphic-ws uWebSockets.js", "Bun.serve websocket / global WebSocket", "runtime/http/websockets"],
  ["express koa fastify restify", "Bun.serve", "runtime/http/server"],
  ["uuid nanoid", "crypto.randomUUID / Bun.randomUUIDv7", "guides/util/javascript-uuid"],
  ["glob fast-glob globby tiny-glob micromatch minimatch picomatch", "Bun.Glob", "runtime/glob"],
  ["better-sqlite3 sqlite3 sqlite sql.js", "bun:sqlite", "runtime/sqlite"],
  ["pg postgres mysql2 mysql postgres-js", "Bun.SQL", "runtime/sql"],
  ["redis ioredis @redis/client", "Bun.redis", "runtime/redis"],
  ["@aws-sdk/client-s3 aws-sdk minio", "Bun.s3", "runtime/s3"],
  ["bcrypt bcryptjs argon2 @node-rs/argon2 @node-rs/bcrypt", "Bun.password", "runtime/hashing"],
  ["xxhash xxhash-wasm xxhashjs crc crc-32 murmurhash cityhash", "Bun.hash", "runtime/hashing"],
  ["yaml js-yaml yamljs", "Bun.YAML / import of .yaml", "runtime/yaml"],
  ["toml @iarna/toml smol-toml @ltd/j-toml", "Bun.TOML / import of .toml", "runtime/toml"],
  ["json5", "Bun.JSON5 / import of .json5", "runtime/json5"],
  ["marked markdown-it", "Bun.markdown", "runtime/markdown"],
  ["chalk kleur picocolors colorette ansi-colors", "Bun.color / util.styleText", "runtime/color"],
  ["color tinycolor2 color-convert", "Bun.color", "runtime/color"],
  ["strip-ansi", "Bun.stripANSI", "runtime/utils"],
  ["string-width", "Bun.stringWidth", "runtime/utils"],
  ["escape-html", "Bun.escapeHTML", "runtime/utils"],
  ["fast-deep-equal dequal lodash.isequal", "Bun.deepEquals", "runtime/utils"],
  ["which", "Bun.which", "runtime/utils"],
  ["execa cross-spawn shelljs zx", "Bun.spawn / Bun.$", "runtime/shell"],
  ["semver", "Bun.semver", "runtime/semver"],
  ["cookie js-cookie", "Bun.Cookie / Bun.CookieMap", "runtime/cookies"],
  ["csrf csurf", "Bun.CSRF", "runtime/csrf"],
  ["node-cron cron node-schedule", "Bun.cron", "runtime/cron"],
  ["pako fflate zlib-sync", "Bun.gzipSync / Bun.deflateSync / Bun.zstdCompressSync", "runtime/utils"],
  ["tar tar-stream adm-zip jszip", "Bun.Archive", "runtime/archive"],
  ["minimist yargs yargs-parser commander mri arg", "util.parseArgs (node:util, fully supported)", "runtime/nodejs-compat"],
  ["rimraf mkdirp fs-extra del make-dir", "node:fs rm/mkdir with recursive, Bun.write", "runtime/file-io"],
  ["cross-env", "Bun scripts and Bun.env", "runtime/environment-variables"],
  ["@types/node", "bun-types (@types/bun)", "typescript"],
] as [string, string, string][])
  for (const n of names.split(" ")) BUN_REPLACED[n] = bunAlt(what, page);

/** Locale catalogues are the only place a non-English string may live. */
const LOCALE_FILE =
  /(^|\/)(locales?|messages|i18n|l10n|translations?)\/|(^|[./])(fr|fr-FR)\.(json|ftl|arb|po|xlf|xliff|properties|ts)$|\/values-fr\/|\.fr\.(md|mdx|html)$|(^|\/)(fr|es|ja|zh-CN|de|it|pt)\//;
export const RULES: Rule[] = [
  {
    id: "non-english",
    why: "Source is English (the sourceLocale of packages/i18n/i18n.config.json); user-facing text goes through i18n catalogues and nothing else is written in another language (language detector: eld)",
    files: (f) => (CODE.test(f) || DOC.test(f)) && !LOCALE_FILE.test(f),
    line: (l, f) => isNonSourceProse(l, CODE.test(f), SOURCE_LANG),
  },
  {
    id: "node-builtin",
    why: "A node: API that Bun replaces natively (bun-only stack; Bun's file-io docs keep node:fs for mkdir/readdir/stat and node:path/node:os have no Bun equivalent, so those stay)",
    files: (f) =>
      /\.(ts|tsx|js|mjs|cjs)$/.test(f) &&
      !/\.d\.ts$/.test(f) &&
      !UPSTREAM_PORT.test(f) &&
      !/(^|\/)node_modules\//.test(f) &&
      !/^\.agents\/skills\/(vercel-|jules-|stitch-)/.test(f) /* skills mirrored from Vercel and Google keep their upstream code */ &&
      !/\/test\/.*\.test\.ts$/.test(f) /* fixtures quote node: imports as data */,
    line: (l) => NODE_REPLACED.some(([re]) => re.test(l)),
  },
  {
    id: "bun-dependency",
    why: "A package.json dependency that Bun replaces natively (bun-only stack); an exception needs a measured gain or a missing Bun feature in the manifest's bunExceptions map",
    files: (f) => /(^|\/)package\.json$/.test(f) && !/(^|\/)(node_modules|fixtures?)\//.test(f) && !UPSTREAM_PORT.test(f) && !/^\.agents\/skills\/(vercel-|jules-|stitch-)/.test(f),
  },
  {
    id: "sovereign",
    why: "Legacy 'Sovereign' wording often wraps fake outputs; verify the claim or delete it",
    files: (f) =>
      CODE.test(f) || DOC.test(f),
    line: (l) => SOVEREIGN.test(l),
  },
  {
    id: "ai-filler",
    why: "AI-filler prose (humanizer catalogue); say the fact",
    files: (f) => DOC.test(f),
    line: (l) => AI_FILLER.test(l) && !BANNED_LIST.test(l),
  },
  {
    id: "stub",
    why: "Stub, demo or fake output left in tracked code (eng-practices: no functionality not needed now)",
    files: (f) =>
      CODE.test(f) &&
      !UPSTREAM_PORT.test(f) &&
      !/(^|\/)(tests?|__tests__|fixtures?)\//.test(f) &&
      !/\.test\./.test(f),
    line: (l) => STUB.test(l),
  },
  {
    id: "backup-file",
    why: "Backup or leftover file; git is the history",
    path: (f) =>
      /\.(bak|orig|rej|swp|old)(-[\w.]+)?$|~$|(^|\/)\.#|\.old$/.test(f),
  },
  {
    id: "dated-filename",
    why: "Dated file name: a snapshot maintained by hand (style guide: timeless documentation)",
    path: (f) =>
      !/^(docs\/reviews|docs\/proofs)\//.test(f) &&
      /(^|[/_.-])20[2-3]\d-?[01]\d(-?[0-3]\d)?([/_.-]|$)/.test(
        f.split("/").pop()!,
      ),
  },
  {
    id: "magic-date",
    why: "Date literal in code: compute it or read it from the source of truth",
    files: (f) =>
      CODE.test(f) &&
      !UPSTREAM_PORT.test(f) &&
      !/\.test\./.test(f) &&
      !/^(bench|test)\//.test(f) &&
      !/(^|\/)(tests?|examples?|e2e|modeles)\//.test(f),
    line: (l) =>
      MAGIC_DATE.test(l) &&
      !/(version|compat\w*_?date|protocolVersion|VERSIONS|metadataProfile|"mcp-)/i.test(
        l,
      ) &&
      !/^\s*(\/\/|#|\*|\/\*)/.test(l),
  },
  {
    id: "dated-snapshot",
    why: "Hand-maintained dated statement in prose (style guide: timeless documentation)",
    files: (f) => DOC.test(f) && !MANIFEST.test(f),
    line: (l) => DATED_PROSE.test(l),
  },
  {
    id: "absolute-path",
    why: "Machine-specific absolute path; derive from the repo root, SRC_ROOT or the home directory",
    files: (f) =>
      (CODE.test(f) || DOC.test(f) || /\.(toml|json|ya?ml)$/.test(f)) &&
      !MANIFEST.test(f),
    line: (l, f) =>
      ABS_USER.test(l) ||
      (CODE.test(f) && !/^(infra|scripts\/bench)\//.test(f) && ABS_SRC.test(l)),
  },
  {
    id: "personal-data",
    why: "Personal or site-specific value (identity, account, host, address, user path); resolve it at run time (packages/env-kit/src/discover.ts, loaders/shell/discover.sh) and name roles in prose. The rule also flags every value the discovery cache holds; it skips that part when the cache is absent (CI)",
    files: (f) => !MANIFEST.test(f) && !/(^|\/)site\.example\.toml$/.test(f) && !/\.test\.|(^|\/)(tests?|e2e|fixtures?)\/|cloudflare|^src\/|^docs\/proofs\/|^\.agents\/skills\//i.test(f) && !/\.(png|jpg|svg|wasm|woff2?|ico|pdf|lock|der)$/.test(f),
    line: (l) => personalData(l),
  },
  {
    id: "ssh-alias",
    why: "Legacy ssh alias (vps, cdn) of a fleet host; use the role (fr1, fr2, prd), a Host alias of ~/.ssh/config that also carries the old names",
    files: (f) => !MANIFEST.test(f) && !/\.(png|jpg|svg|wasm|woff2?|ico|pdf|lock|der)$/.test(f) && !/^(docs\/reviews|third_party)\//.test(f),
    line: (l) => /\b(ssh|scp)(\.exe)?\b/.test(l) && /(?<![\w./-])(vps|cdn)(?![\w.-])/.test(l),
  },
  {
    id: "pinned-version",
    why: "Version or tag pinned outside a manifest or lockfile; resolve latest from the registry or the manifest",
    files: (f) =>
      (CODE.test(f) || DOC.test(f) || /\.ya?ml$/.test(f)) &&
      !MANIFEST.test(f) &&
      !/^\.github\/workflows\//.test(f),
    line: (l) => PIN_NPM.test(l) || PIN_CLONE.test(l) || PIN_ACTION.test(l),
  },
  {
    id: "hardcoded-list",
    why: "Hard-coded repo slug list that the GitHub API or a manifest provides (8+ slugs in one file)",
    files: (f) =>
      /\.(ts|tsx|js|mjs|rs|sh)$/.test(f) &&
      !UPSTREAM_PORT.test(f) &&
      !/\.(test|d)\./.test(f),
  },
  {
    id: "home-scraper",
    why: "Home-made scraper of an upstream page; use the releases API, gitiles JSON, kernel.org releases.json, Repology or nvchecker",
    files: (f) => /\.(ts|tsx|js|mjs|sh|py)$/.test(f) && !/\.test\./.test(f),
    line: (l) =>
      SCRAPE_HOST.test(l) &&
      /(fetch|curl|xh|wget|Invoke-WebRequest)/.test(l) &&
      !/api\.github\.com|releases\.json|\?format=JSON|--json|releases\/latest\/download/.test(
        l,
      ),
  },
];

const allow: Record<string, string[]> = existsSync(
  join(import.meta.dir, "hygiene.allow.json"),
)
  ? JSON.parse(
      readFileSync(join(import.meta.dir, "hygiene.allow.json"), "utf8"),
    )
  : {};
const globRe = (g: string) =>
  new RegExp(
    "^" +
      g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\0")
        .replace(/\*/g, "[^/]*")
        .replace(/\0/g, ".*") +
      "$",
  );
const allowed = (rule: string, f: string) =>
  (allow[rule] ?? []).some((g) => globRe(g).test(f));

const DEP_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
/** Dependencies of one package.json that Bun replaces and that carry no written exception. */
export function bunDependencyHits(f: string, text: string): Hit[] {
  let j: Record<string, any>;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const exceptions: Record<string, unknown> = j.bunExceptions ?? {};
  const lines = text.split("\n");
  const hits: Hit[] = [];
  for (const sec of DEP_SECTIONS)
    for (const name of Object.keys(j[sec] ?? {})) {
      const alt = BUN_REPLACED[name];
      const reason = exceptions[name];
      if (!alt || (typeof reason === "string" && reason.trim().length > 12)) continue;
      const line = lines.findIndex((l) => l.includes(`"${name}"`) && /:\s*"/.test(l)) + 1;
      hits.push({ rule: "bun-dependency", file: f, line, text: `${name} (${sec}): use ${alt[0]} (${alt[1]})` });
    }
  return hits;
}

export function listFiles(root: string, paths: string[] = []): string[] {
  const r = Bun.spawnSync([
    "git",
    "-C",
    root,
    "ls-files",
    "-z",
    "--",
    ...paths,
  ]);
  return r.stdout
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((f) => !skipped(f));
}

export function scan(
  root: string,
  opts: { rules?: string[]; paths?: string[] } = {},
): Hit[] {
  const rules = RULES.filter(
    (r) => !opts.rules?.length || opts.rules.includes(r.id),
  );
  const hits: Hit[] = [];
  for (const f of listFiles(root, opts.paths)) {
    const abs = join(root, f);
    for (const r of rules)
      if (r.path?.(f) && !allowed(r.id, f))
        hits.push({ rule: r.id, file: f, line: 0, text: "" });
    const need = rules.filter(
      (r) =>
        (r.line || r.id === "hardcoded-list" || r.id === "bun-dependency") &&
        (r.files?.(f) ?? true) &&
        !allowed(r.id, f),
    );
    if (!need.length) continue;
    let text: string;
    try {
      if (!existsSync(abs) || statSync(abs).size > 512_000) continue;
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (const r of need) {
      if (r.id === "bun-dependency") {
        hits.push(...bunDependencyHits(f, text));
        continue;
      }
      if (r.id === "hardcoded-list") {
        const slugs = new Set<string>();
        for (const m of text.matchAll(SLUG))
          if (
            /^[\w.-]+\/[\w.-]+$/.test(m[1]!) &&
            !/\.(ts|js|json|md|rs|css|html)$/.test(m[1]!) &&
            !/^(node|src|dist|lib|bin|usr|var|etc|tmp|docs?|apps?|packages?|crates?|infra|scripts?|test|tests|bench|assets|plugins|third_party|roles|image|application|text|video|audio|font|multipart|Europe|America|Asia|shell|desktop|documentation|fournisseurs|clients|factures)\//.test(
              m[1]!,
            ) &&
            !m[1]!.includes("..")
          )
            slugs.add(m[1]!);
        if (slugs.size >= 8)
          hits.push({
            rule: r.id,
            file: f,
            line: 0,
            text: `${slugs.size} slugs: ${[...slugs].slice(0, 3).join(", ")}`,
          });
        continue;
      }
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (l.length > 600 || l.includes("hygiene-ok")) continue;
        if (r.line!(l, f))
          hits.push({
            rule: r.id,
            file: f,
            line: i + 1,
            text: l.trim().slice(0, 160),
          });
      }
    }
  }
  return hits;
}

// dead-ref: repo-relative paths and relative markdown links that point to nothing (fiction and moved targets).
const TOP =
  "(?:docs|scripts|infra|packages|apps|third_party|src|tools|plugins|conformance|assets|\\.github|\\.agents)";
const REF = new RegExp("(?<![\\w./$-])(" + TOP + "/[A-Za-z0-9_@.+\\-/]+)", "g");
const LINK = /\]\((?!https?:|#|mailto:)([^)\s#]+)/g;
// MCP and JSON-RPC method names that look like paths.
// Optional inputs that are absent by design: owner-written, read when present (the readers handle the absence).
// Trees of other projects that docs cite by path: Chromium (tools/clang, tools/rust, tools/build), Bun (scripts/build), Linux (scripts/kconfig, tools/testing).
const UPSTREAM_PREFIX =
  /^(tools\/(clang|rust|build|python|run_tests\.py|bazel|testing)\b|scripts\/(build(\.ts|\/)|get_maintainer|kconfig\/|run-clang-format)|docs\/(project|runtime)\/)/;
// Build outputs and generated trees: not tracked, produced by a script.
const BUILD_OUTPUT =
  /(^|\/)(gen|gen-cache|generated|zig-out|dist|target|node_modules|out)(\/|$)|(^|\/)\.next[^/]*(\/|$)/;
// A sentence that says the target is gone, ignored or upstream's cites a path that is correct as written (rule 4 and history prose).
const GONE_OR_UPSTREAM =
  /\b(removed|deleted|purged|absent|dropped|legacy|orphan\w*|gitignored|ignored|replaces|replaced|former|formerly|no longer|does not exist|not (?:in|present)|upstream|supprim\w+|retir\w+|remplace\w*|amont|ignoré\w*|n'existe|ex-\w+)\b|\bno \`/i;
const NOT_PATHS =
  /^docs\/reviews\/|^(tools\/(list|call)|\.agents\/owner-rules\.json)$/;
// Skills name the user's project tree (src/components, src/pages) and licence folders copy upstream texts: neither points into this repo.
// Skills are adopted from upstream (their paths name the user's project), licence folders copy upstream texts, and test files
// carry fixture paths (packages/a/x.ts): none of these points into this repo.
const UPSTREAM_TEXT =
  /^docs\/compiler\/|^apps\/nt\/(docs\/(bun|interop)|sdk\/tools)\/|(^|\/)licenses\/|^\.agents\/skills\/|\.test\.[jt]sx?$|(^|\/)(tests?|__tests__|fixtures?)\//;
// A reference is live when it resolves from the repo root or from any directory above the file: sub-projects
// (apps/auto, packages/*) write paths relative to their own root.
// third_party/<name> is also live when src.lock.json declares the clone (checkouts are not all present on every machine)
// or when it is a directory of the Chromium checkout's own third_party (Chromium prose, not this repo).
let lockText: string | undefined;
let forksText: string | undefined;
function liveFrom(root: string, file: string, p: string): boolean {
  if (existsSync(join(root, p))) return true;
  if (p.startsWith("third_party/")) {
    lockText ??= existsSync(join(root, "src.lock.json"))
      ? readFileSync(join(root, "src.lock.json"), "utf8")
      : "";
    forksText ??= existsSync(join(root, "third_party/forks.txt"))
      ? readFileSync(join(root, "third_party/forks.txt"), "utf8")
      : "";
    const name = p.split("/")[1]!;
    if (
      forksText
        .split("\n")
        .some((l) => l.split(/\s/)[0]!.split("/")[1] === name)
    )
      return true;
    if (
      lockText.includes('"' + p + '"') ||
      existsSync(join(root, "third_party/chromium/src", p))
    )
      return true;
  }
  // src/<dir>/... with no such src/<dir> anywhere above the file names a tree of an upstream project (rustc, Windows Terminal,
  // node-api-dotnet...), not a moved path of this repo: rule 4, left as is.
  if (
    /^src\/[^/]+\//.test(p) &&
    !existsSync(join(root, p.split("/").slice(0, 2).join("/")))
  )
    return true;
  const parts = file.split("/").slice(0, -1);
  for (let n = parts.length; n > 0; n--)
    if (existsSync(join(root, ...parts.slice(0, n), p))) return true;
  return false;
}
export function deadRefs(root: string, paths?: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of listFiles(root, paths)) {
    if (
      !/\.(md|mdx|ts|just|ya?ml|toml|sh|json)$|justfile$/.test(f) ||
      allowed("dead-ref", f) ||
      UPSTREAM_TEXT.test(f) ||
      UPSTREAM_PORT.test(f)
    )
      continue;
    let text: string;
    try {
      if (statSync(join(root, f)).size > 512_000) continue;
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    const seen = new Set<string>();
    const add = (p: string, shown: string) => {
      if (!seen.has(p)) {
        seen.add(p);
        hits.push({
          rule: "dead-ref",
          file: f,
          line: text
            .slice(0, text.indexOf(shown) < 0 ? 0 : text.indexOf(shown))
            .split("\n").length,
          text: shown,
        });
      }
    };
    for (const m of text.matchAll(REF)) {
      if (
        /[\w.-]+\/[\w.-]+:$/.test(
          text.slice(Math.max(0, m.index! - 80), m.index!),
        )
      )
        continue; // explicit upstream path: oven-sh/bun:src/...
      const p = m[1]!.replace(/[.,:;)`'"]+$/, "").replace(/\/+$/, "");
      if (
        /[*{}<>$]/.test(p) ||
        p.includes("...") ||
        (p.startsWith("third_party/") && p.split("/").length > 2)
      )
        continue;
      const ls0 = text.lastIndexOf("\n", m.index!) + 1;
      const le0 = text.indexOf("\n", m.index!);
      if (GONE_OR_UPSTREAM.test(text.slice(ls0, le0 < 0 ? undefined : le0)))
        continue;
      if (
        NOT_PATHS.test(p) ||
        /[-_]$/.test(p) ||
        UPSTREAM_PREFIX.test(p) ||
        BUILD_OUTPUT.test(p)
      )
        continue;
      // a script run from its own package or container directory: `bun src/cli.ts`, `bun run --cwd pkg src/cli.ts`, `bun build ... src/x.ts`
      const lineStart = text.lastIndexOf("\n", m.index!) + 1;
      if (
        /\b(bun|bunx|node|bash|sh)\b[^\n]*$/.test(
          text.slice(lineStart, m.index!),
        ) &&
        p.startsWith("src/")
      )
        continue; // a name prefix of a glob (third_party/tree-sitter-<lang>)
      if (!liveFrom(root, f, p)) add(p, p);
    }
    if (/\.mdx?$/.test(f))
      for (const m of text.matchAll(LINK)) {
        if (m[1]!.startsWith("/") || /(^|\/)crates\/?$/.test(m[1]!)) continue; // crates/ is being renamed repo-wide by another session // site route of a documentation site, not a file
        const p = join(root, f, "..", decodeURI(m[1]!));
        if (!existsSync(p)) add("link:" + m[1], m[1]!);
      }
  }
  return hits;
}

export function summarize(hits: Hit[]) {
  const by: Record<string, { hits: number; files: Set<string> }> = {};
  for (const h of hits)
    ((by[h.rule] ??= { hits: 0, files: new Set() }),
      by[h.rule]!.hits++,
      by[h.rule]!.files.add(h.file));
  return Object.fromEntries(
    Object.entries(by).map(([k, v]) => [
      k,
      { hits: v.hits, files: v.files.size },
    ]),
  );
}

if (import.meta.main) {
  const a = Bun.argv.slice(2);
  const opt = (k: string) => {
    const i = a.indexOf(k);
    return i < 0 ? undefined : a[i + 1];
  };
  const root = opt("--root") ?? import.meta.dir.replace(/[\\/]scripts$/, "");
  const rules = opt("--rule")?.split(",");
  const paths = opt("--paths")?.split(",");
  const limit = Number(opt("--limit") ?? 0);
  const hits = scan(root, { rules, paths });
  // dead-ref is opt-in: src-b0's src/* renames keep moving the targets
  if (rules?.includes("dead-ref")) hits.push(...deadRefs(root, paths));
  if (a.includes("--summary"))
    console.log(JSON.stringify(summarize(hits), null, 1));
  else if (a.includes("--json"))
    console.log(JSON.stringify(limit ? hits.slice(0, limit) : hits));
  else
    for (const h of limit ? hits.slice(0, limit) : hits)
      console.log(`${h.rule}\t${h.file}:${h.line}\t${h.text}`);
  if (!a.includes("--summary") && !a.includes("--json"))
    console.error(`${hits.length} hits`);
  process.exitCode = hits.length ? 1 : 0;
}
