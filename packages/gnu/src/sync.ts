// One poll cycle: fetch the upstream sources, rebuild the feed, then mirror new tarballs and Rust binaries to R2.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildAtom, buildFeed } from "./feed.ts";
import { buildKernel, mirrorKernel, pollKernel } from "./kernel.ts";
import { RUST_MAP, githubToken, pollCrates, pollGithub } from "./rust.ts";
import { buildSite } from "./site.ts";
import {
  type Inventory,
  type State,
  appendEvents,
  loadInventory,
  loadState,
  paths,
  readEvents,
  readJson,
  saveState,
  writeAtomic,
} from "./store.ts";
import type { Entry, Feed, FtpListing, GnuEvent } from "./types.ts";
import {
  FTP_LISTING,
  GSRC_REVNO,
  INFO_GNU,
  UA,
  parseInfoGnu,
  parseInfoRefs,
  parseListing,
  parseRevno,
  pollMonths,
  savannahGitUrl,
} from "./upstream.ts";
import { gsrcKeyring, sha256File, verifySignature } from "./verify.ts";

export type SyncOpts = {
  /** Skip downloads to R2. */
  mirror?: boolean;
  /** Skip Savannah head polling. */
  heads?: boolean;
  /** Skip GitHub and crates.io. */
  rust?: boolean;
  /** Skip the Linux kernel section. */
  kernel?: boolean;
  /** Skip the static site build. */
  site?: boolean;
  bucket?: string;
  gsrcRoot?: string;
  /** Max tarballs mirrored per cycle, and max size in bytes. */
  maxFiles?: number;
  maxBytes?: number;
  log?: (s: string) => void;
};

const get = (url: string, headers: Record<string, string> = {}, ms = 60_000) =>
  fetch(url, {
    headers: { "user-agent": UA, ...headers },
    signal: AbortSignal.timeout(ms),
  });

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
    }),
  );
}

async function fetchListing(st: State, dir: string): Promise<FtpListing> {
  const cache = join(dir, "ls-lrRt.txt.gz");
  const h: Record<string, string> = {};
  if (st.ftp.etag && (await Bun.file(cache).exists()))
    h["if-none-match"] = st.ftp.etag;
  try {
    const r = await get(FTP_LISTING, h);
    if (r.status === 200) {
      await Bun.write(cache, await r.arrayBuffer());
      st.ftp.etag = r.headers.get("etag") ?? undefined;
      st.ftp.mtime = r.headers.get("last-modified")
        ? new Date(r.headers.get("last-modified")!).toISOString()
        : undefined;
    }
  } catch {
    // fall back to the cached copy
  }
  st.ftp.checked = Date.now();
  const f = Bun.file(cache);
  return (await f.exists())
    ? parseListing(
        new TextDecoder().decode(
          Bun.gunzipSync(new Uint8Array(await f.arrayBuffer())),
        ),
      )
    : new Map();
}

async function fetchAnnounce(st: State) {
  for (const month of pollMonths()) {
    try {
      const prev = st.announce[month];
      const r = await get(
        `${INFO_GNU}${month}/`,
        prev?.etag ? { "if-none-match": prev.etag } : {},
        30_000,
      );
      if (r.status === 200)
        st.announce[month] = {
          etag: r.headers.get("etag") ?? undefined,
          items: parseInfoGnu(await r.text(), month),
        };
    } catch {
      // keep cache
    }
  }
}

/** Rotating poll of Savannah git heads: oldest-checked repos first, `batch` per cycle. */
async function fetchHeads(
  st: State,
  inv: Inventory,
  ids: string[],
  batch = 120,
) {
  const todo = ids
    .map((id) => ({
      id,
      url: savannahGitUrl(
        inv.pkgs[id]?.repo ?? inv.pkgs[inv.gsrc[id]?.tarball ?? ""]?.repo,
      ),
    }))
    .filter((x): x is { id: string; url: string } => !!x.url)
    .toSorted(
      (a, b) => (st.heads[a.id]?.checked ?? 0) - (st.heads[b.id]?.checked ?? 0),
    )
    .slice(0, batch);
  await pool(todo, 8, async ({ id, url }) => {
    try {
      const r = await get(
        `${url}/info/refs?service=git-upload-pack`,
        {},
        20_000,
      );
      if (!r.ok) return;
      const { head } = parseInfoRefs(await r.text());
      if (!head) return;
      const prev = st.heads[id];
      st.heads[id] = {
        head,
        changed_at:
          prev && prev.head === head
            ? prev.changed_at
            : new Date().toISOString(),
        checked: Date.now(),
      };
    } catch {
      // next cycle
    }
  });
}

async function fetchGuixHead(st: State) {
  try {
    const r = await get(
      "https://git.savannah.gnu.org/git/guix.git/info/refs?service=git-upload-pack",
      {},
      20_000,
    );
    if (r.ok)
      st.guix = {
        head: parseInfoRefs(await r.text()).head,
        checked: Date.now(),
      };
  } catch {
    // keep
  }
}

async function fetchRevno(st: State) {
  try {
    const r = await get(GSRC_REVNO, {}, 20_000);
    if (r.ok)
      st.gsrc = { revno: parseRevno(await r.text()), checked: Date.now() };
  } catch {
    // keep
  }
}

const rclone = (args: string[]) => Bun.$`rclone ${args}`.quiet().nothrow();

async function mirrorTarballs(
  feed: Feed,
  st: State,
  opts: Required<Pick<SyncOpts, "bucket" | "maxFiles" | "maxBytes">> & SyncOpts,
  staging: string,
  events: GnuEvent[],
) {
  const log = opts.log ?? (() => {});
  const todo = feed.entries
    .filter(
      (e) =>
        e.upstream.source === "ftp" &&
        e.upstream.url &&
        !e.mirror &&
        (e.upstream.size ?? 0) <= opts.maxBytes,
    )
    .slice(0, opts.maxFiles);
  for (const e of todo) {
    const u = e.upstream;
    const dir = join(staging, e.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const file = join(dir, u.file!);
    try {
      const r = await get(u.url!, {}, 600_000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await Bun.write(file, r);
      const sha = await sha256File(file);
      if (u.sha256 && u.sha256_source === "gsrc" && u.sha256 !== sha)
        throw new Error(`sha256 differs from GSRC (${sha})`);
      let sigPath: string | null = null;
      if (u.sig_url) {
        const s = await get(u.sig_url, {}, 30_000);
        if (s.ok) {
          sigPath = `${file}.sig`;
          await Bun.write(sigPath, s);
        }
      }
      const keyring = opts.gsrcRoot
        ? await gsrcKeyring(opts.gsrcRoot, e.id)
        : null;
      const signature = await verifySignature(file, sigPath, keyring);
      const key = `gnu/${e.ftp}/${u.file}`;
      const up = await rclone(["copyto", file, `r2:${opts.bucket}/${key}`]);
      if (up.exitCode)
        throw new Error(
          `rclone: ${up.stderr.toString().trim().split("\n").at(-1)}`,
        );
      let sigKey: string | null = null;
      if (sigPath) {
        sigKey = `${key}.sig`;
        await rclone(["copyto", sigPath, `r2:${opts.bucket}/${sigKey}`]);
      }
      st.mirror[e.id] = {
        file: u.file!,
        sha256: sha,
        key,
        sig_key: sigKey,
        at: new Date().toISOString(),
        signature,
      };
      log(`mirror ${e.id} ${u.file} ${signature.status}`);
    } catch (err) {
      log(`mirror ${e.id} failed: ${String(err).slice(0, 160)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  void events;
}

const ASSET =
  /(x86_64|aarch64).*(linux-(gnu|musl)|windows-msvc|pc-windows).*\.(tar\.gz|tar\.xz|zip)$/;

/** Release binaries of the Rust drop-ins flagged `mirror` (x86_64 and aarch64, Linux and Windows) to r2:<bucket>/rust/<repo>/<tag>/. */
async function mirrorRust(
  st: State,
  opts: { bucket: string; token?: string; log?: (s: string) => void },
) {
  const repos = new Set(
    Object.values(RUST_MAP)
      .flat()
      .filter((d) => d.mirror)
      .map((d) => d.repo),
  );
  for (const repo of repos) {
    const tag = st.github[repo]?.tag;
    if (!tag || st.rust_mirror[repo]?.tag === tag) continue;
    try {
      const h: Record<string, string> = {
        accept: "application/vnd.github+json",
      };
      if (opts.token) h.authorization = `Bearer ${opts.token}`;
      const r = await get(
        `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        h,
        30_000,
      );
      if (!r.ok) continue;
      const assets =
        (
          (await r.json()) as {
            assets?: {
              name: string;
              browser_download_url: string;
              size: number;
            }[];
          }
        ).assets ?? [];
      const keys: string[] = [];
      for (const a of assets.filter(
        (x) => ASSET.test(x.name) && x.size < 200_000_000,
      )) {
        const tmp = join(paths().staging, `rust-${a.name}`);
        const d = await get(a.browser_download_url, {}, 300_000);
        if (!d.ok) continue;
        await Bun.write(tmp, d);
        const key = `rust/${repo}/${tag}/${a.name}`;
        const up = await rclone(["copyto", tmp, `r2:${opts.bucket}/${key}`]);
        rmSync(tmp, { force: true });
        if (!up.exitCode) keys.push(key);
      }
      if (keys.length)
        st.rust_mirror[repo] = { tag, keys, at: new Date().toISOString() };
      opts.log?.(`rust-mirror ${repo} ${tag}: ${keys.length} assets`);
    } catch {
      // next cycle
    }
  }
}

export function diffEvents(prev: Feed | null, next: Feed): GnuEvent[] {
  const at = next.generated;
  const old = new Map((prev?.entries ?? []).map((e) => [e.id, e]));
  const out: GnuEvent[] = [];
  for (const e of next.entries) {
    const o = old.get(e.id);
    if (!o) continue;
    if (e.upstream.version && e.upstream.version !== o.upstream.version)
      out.push({
        at,
        id: e.id,
        kind: "release",
        detail: `${o.upstream.version ?? "?"} -> ${e.upstream.version}`,
      });
    for (const r of e.rust) {
      const p = o.rust.find((x) => x.repo === r.repo);
      if (r.version && p && r.version !== p.version)
        out.push({
          at,
          id: e.id,
          kind: "rust",
          detail: `${r.name} ${p.version ?? "?"} -> ${r.version}`,
        });
    }
    if (e.announce && e.announce.url !== o.announce?.url)
      out.push({ at, id: e.id, kind: "announce", detail: e.announce.subject });
  }
  const oldK = new Map(
    (prev?.kernel?.releases ?? []).map((r) => [`${r.moniker}:${r.series}`, r]),
  );
  for (const r of next.kernel?.releases ?? []) {
    const o = oldK.get(`${r.moniker}:${r.series}`);
    if (o && o.version !== r.version && r.moniker !== "linux-next")
      out.push({
        at,
        id: `linux-${r.series}`,
        kind: "kernel",
        detail: `${o.version} -> ${r.version}`,
      });
  }
  return out;
}

export async function sync(opts: SyncOpts = {}): Promise<Feed> {
  const log = opts.log ?? (() => {});
  const p = paths();
  mkdirSync(p.staging, { recursive: true });
  const [inv, st] = await Promise.all([loadInventory(), loadState(p)]);
  const prev = await readJson<Feed | null>(p.feed, null);
  const listing = await fetchListing(st, p.home);
  log(`ftp: ${listing.size} dirs`);
  await Promise.all([fetchAnnounce(st), fetchRevno(st), fetchGuixHead(st)]);
  if (opts.rust !== false) {
    const token = await githubToken();
    await pollGithub(
      [
        ...new Set(
          Object.values(RUST_MAP)
            .flat()
            .map((d) => d.repo),
        ),
      ],
      st.github,
      { token },
    );
    await pollCrates(
      [
        ...new Set(
          Object.values(RUST_MAP)
            .flat()
            .flatMap((d) => (d.crate ? [d.crate] : [])),
        ),
      ],
      st.crates,
    );
  }
  if (opts.kernel !== false)
    await pollKernel(st.kernel, { token: await githubToken() });
  if (opts.heads !== false)
    await fetchHeads(st, inv, [
      ...new Set([...Object.keys(inv.gsrc), ...Object.keys(inv.pkgs)]),
    ]);
  let feed = await buildFeed(inv, st, listing);
  const events: GnuEvent[] = diffEvents(prev, feed);
  if (opts.mirror) {
    const bucket = opts.bucket ?? Bun.env.GNU_BUCKET ?? "aphrody-gnu";
    await mirrorTarballs(
      feed,
      st,
      {
        ...opts,
        bucket,
        maxFiles: opts.maxFiles ?? 12,
        maxBytes: opts.maxBytes ?? 400_000_000,
      },
      p.staging,
      events,
    );
    if (opts.kernel !== false)
      await mirrorKernel(st.kernel, buildKernel(st.kernel), {
        bucket,
        staging: p.staging,
        log,
      });
    if (opts.rust !== false)
      await mirrorRust(st, { bucket, token: await githubToken(), log });
    feed = await buildFeed(inv, st, listing);
  }
  await writeAtomic(p.feed, JSON.stringify(feed));
  await writeAtomic(p.atom, buildAtom(feed));
  await appendEvents(events, p);
  await saveState(st, p);
  if (opts.site !== false) await buildSite(feed, p.site, await readEvents(p));
  log(`feed: ${feed.counts.packages} packages, ${events.length} events`);
  return feed;
}

export type { Entry };
