// Third-party inputs of `ay brand build` (src/ui/kit/src/brand), fetched into packages/design/brand/gen-cache/, which the
// build never deletes (gitignored; `gen/` holds the outputs):
//  - the [[font]] files of brand.toml and their OFL.txt from google/fonts (refused unless SIL OFL 1.1 without a
//    Reserved Font Name), at gen-cache/fonts/<id>.ttf and <id>-OFL.txt;
//  - Material Symbols Rounded from google/material-design-icons: the variable font and its codepoints
//    (gen-cache/symbols/), the 48 px fill 1 glyph of every product and type (symbols/48/<name>.svg) and the 24 px outline
//    and fill SVGs of every [symbols] name (symbols/24/<name>.svg, <name>-fill.svg);
//  - the CC0 HDRI of [environment], pinned by sha256 in brand.toml (Poly Haven is not a git host).
// GitHub sources resolve live to the latest commit of the default branch; every file is verified against the
// git blob SHA-1 that the GitHub API reports for it, and the resolved commits and blobs go to
// packages/design/brand/inputs.lock.json (read by the build for the manifest). `locked` refetches exactly the lock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pool } from "./util.ts";

export const FONTS_REPO = "google/fonts";
export const SYMBOLS_REPO = "google/material-design-icons";
const SYMBOLS_FONT = "variablefont/MaterialSymbolsRounded[FILL,GRAD,opsz,wght]";

export interface Lock {
  repos: Record<string, string>;
  files: Record<string, { repo: string; path: string; blob: string }>;
}

interface Toml {
  product?: { symbol: string }[];
  type?: { symbol: string }[];
  symbols: { font_file: string; codepoints_file: string; names: string[] };
  font?: { id: string; path: string }[];
  brand: { font_file: string };
  environment?: { file: string; url?: string; sha256?: string };
}

/** One file to fetch: `out` relative to packages/design/brand. */
export interface Want {
  out: string;
  repo: string;
  path: string;
  /** SIL OFL.txt of a font: the license is checked before the file is kept. */
  ofl?: string;
}

export function blobSha1(bytes: Uint8Array): string {
  const h = new Bun.CryptoHasher("sha1");
  h.update(`blob ${bytes.length}\0`);
  h.update(bytes);
  return h.digest("hex");
}

const sha256 = (b: Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(b).digest("hex");

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export const rawUrl = (repo: string, commit: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${encodePath(path)}`;

/** SIL OFL 1.1 and no Reserved Font Name in the copyright header. Returns the problem or "". */
export function oflProblem(text: string): string {
  if (!text.includes("SIL Open Font License, Version 1.1"))
    return "not SIL OFL 1.1";
  if (/Reserved Font Name/i.test(text.split("-----")[0] ?? ""))
    return "declares a Reserved Font Name";
  return "";
}

/** Every file the build reads from gen-cache, derived from brand.toml. */
export function plan(m: Toml): Want[] {
  const sym = (name: string, file: string) =>
    `symbols/web/${name}/materialsymbolsrounded/${file}`;
  const wants: Want[] = [];
  for (const f of m.font ?? []) {
    wants.push({
      out: `gen-cache/fonts/${f.id}.ttf`,
      repo: FONTS_REPO,
      path: f.path,
    });
    wants.push({
      out: `gen-cache/fonts/${f.id}-OFL.txt`,
      repo: FONTS_REPO,
      path: f.path.replace(/[^/]+$/, "OFL.txt"),
      ofl: f.id,
    });
  }
  wants.push(
    {
      out: m.symbols.font_file,
      repo: SYMBOLS_REPO,
      path: `${SYMBOLS_FONT}.ttf`,
    },
    {
      out: m.symbols.codepoints_file,
      repo: SYMBOLS_REPO,
      path: `${SYMBOLS_FONT}.codepoints`,
    },
  );
  for (const s of [
    ...new Set([...(m.product ?? []), ...(m.type ?? [])].map((p) => p.symbol)),
  ].sort())
    wants.push({
      out: `gen-cache/symbols/48/${s}.svg`,
      repo: SYMBOLS_REPO,
      path: sym(s, `${s}_fill1_48px.svg`),
    });
  for (const s of m.symbols.names) {
    wants.push(
      {
        out: `gen-cache/symbols/24/${s}.svg`,
        repo: SYMBOLS_REPO,
        path: sym(s, `${s}_24px.svg`),
      },
      {
        out: `gen-cache/symbols/24/${s}-fill.svg`,
        repo: SYMBOLS_REPO,
        path: sym(s, `${s}_fill1_24px.svg`),
      },
    );
  }
  return wants;
}

let tokenCache: string | undefined | null = null;
function token(): string | undefined {
  if (tokenCache !== null) return tokenCache;
  tokenCache = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  if (!tokenCache) {
    try {
      const r = Bun.spawnSync(["gh", "auth", "token"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      if (r.exitCode === 0) tokenCache = r.stdout.toString().trim() || undefined;
    } catch {
      // gh absent: unauthenticated API (60 requests per hour)
    }
  }
  return tokenCache;
}

async function get(url: string, headers: Record<string, string> = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429)
        throw new Error(`${url}: HTTP ${res.status}`);
      if (i === 3) throw new Error(`${url}: HTTP ${res.status}`);
    } catch (e) {
      if (i === 3 || String(e).includes("HTTP 4")) throw e;
    }
    await Bun.sleep(1000 * (i + 1));
  }
}

async function api<T>(path: string): Promise<T> {
  const t = token();
  const res = await get(`https://api.github.com/${path}`, {
    accept: "application/vnd.github+json",
    "user-agent": "aphrody-brand-inputs",
    ...(t ? { authorization: `Bearer ${t}` } : {}),
  });
  return (await res.json()) as T;
}

/** Latest commit of the default branch. */
async function latest(repo: string): Promise<string> {
  const [c] = await api<{ sha: string }[]>(`repos/${repo}/commits?per_page=1`);
  if (!c?.sha) throw new Error(`${repo}: no commit`);
  return c.sha;
}

export function parseLock(text: string): Lock {
  const l = JSON.parse(text) as Lock;
  if (!l.repos || !l.files) throw new Error("inputs.lock.json: repos/files");
  return l;
}

export async function fetchBrandInputs(
  root: string,
  opts: { locked?: boolean } = {},
): Promise<{
  repos: Record<string, string>;
  files: number;
  downloaded: number;
  lock: string;
}> {
  const brandDir = join(root, "packages", "design", "brand");
  const lockFile = join(brandDir, "inputs.lock.json");
  const m = Bun.TOML.parse(
    readFileSync(join(brandDir, "brand.toml"), "utf8"),
  ) as unknown as Toml;
  const wants = plan(m);
  const old = existsSync(lockFile)
    ? parseLock(readFileSync(lockFile, "utf8"))
    : undefined;
  if (opts.locked && !old) throw new Error("--locked: no inputs.lock.json");

  const repos: Record<string, string> = {};
  for (const repo of [...new Set(wants.map((w) => w.repo))].sort())
    repos[repo] = opts.locked ? old!.repos[repo]! : await latest(repo);

  // Expected git blob of every file: the lock, or the directory listings of the resolved commit.
  const listings = new Map<string, Promise<Map<string, string>>>();
  const listing = (repo: string, dir: string) => {
    const k = `${repo}:${dir}`;
    if (!listings.has(k))
      listings.set(
        k,
        api<{ name: string; sha: string }[]>(
          `repos/${repo}/contents/${encodePath(dir)}?ref=${repos[repo]}`,
        ).then((a) => new Map(a.map((e) => [e.name, e.sha]))),
      );
    return listings.get(k)!;
  };
  const expected = async (w: Want): Promise<string> => {
    if (opts.locked) {
      const e = old!.files[w.out];
      if (!e) throw new Error(`${w.out}: not in inputs.lock.json`);
      return e.blob;
    }
    const slash = w.path.lastIndexOf("/");
    const sha = (await listing(w.repo, w.path.slice(0, slash))).get(
      w.path.slice(slash + 1),
    );
    if (!sha) throw new Error(`${w.repo}@${repos[w.repo]}: ${w.path} missing`);
    return sha;
  };

  let downloaded = 0;
  const files: Lock["files"] = {};
  await pool(wants, 8, async (w) => {
    const blob = await expected(w);
    const out = join(brandDir, w.out);
    files[w.out] = { repo: w.repo, path: w.path, blob };
    if (
      existsSync(out) &&
      blobSha1(new Uint8Array(readFileSync(out))) === blob
    )
      return;
    const bytes = new Uint8Array(
      await (await get(rawUrl(w.repo, repos[w.repo]!, w.path))).arrayBuffer(),
    );
    const got = blobSha1(bytes);
    if (got !== blob)
      throw new Error(`${w.out}: git blob ${got}, GitHub reports ${blob}`);
    if (w.ofl) {
      const bad = oflProblem(new TextDecoder().decode(bytes));
      if (bad) throw new Error(`${w.ofl}: ${bad}`);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    downloaded++;
  });

  // Every font file the build loads must now exist.
  for (const f of [m.brand.font_file, m.symbols.font_file])
    if (!existsSync(join(brandDir, f))) throw new Error(`${f}: not fetched`);

  const env = m.environment;
  if (env?.url && env.sha256) {
    const out = join(brandDir, env.file);
    if (
      !existsSync(out) ||
      sha256(new Uint8Array(readFileSync(out))) !== env.sha256
    ) {
      const bytes = new Uint8Array(await (await get(env.url)).arrayBuffer());
      if (sha256(bytes) !== env.sha256)
        throw new Error(`${env.url}: sha256 ${sha256(bytes)}, brand.toml ${env.sha256}`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      downloaded++;
    }
  }

  if (!opts.locked) {
    const sorted = <T>(o: Record<string, T>) =>
      Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    const next = `${JSON.stringify({ repos: sorted(repos), files: sorted(files) }, null, 2)}\n`;
    if (!existsSync(lockFile) || readFileSync(lockFile, "utf8") !== next)
      writeFileSync(lockFile, next);
  }
  return { repos, files: wants.length, downloaded, lock: lockFile };
}

/** `ay assets brand-inputs [--locked]`; also runnable alone (`bun packages/assets/src/brand-inputs.ts`) where no node_modules exist (fr1 build checkout). */
export async function brandInputsCommand(
  root: string,
  locked: boolean,
): Promise<void> {
  const r = await fetchBrandInputs(root, { locked });
  for (const [repo, commit] of Object.entries(r.repos))
    console.log(`${repo} ${commit}`);
  console.log(
    `brand-inputs: ${r.files} files (${r.downloaded} downloaded), lock ${r.lock}`,
  );
}

if (import.meta.main)
  await brandInputsCommand(
    process.env.SRC_ROOT ?? join(import.meta.dir, "..", "..", ".."),
    process.argv.includes("--locked"),
  );
