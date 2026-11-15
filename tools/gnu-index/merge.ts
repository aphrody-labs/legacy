// Merge research into docs/native/gnu/gnu-packages.json (and re-render PACKAGES.md):
//   - `purpose` (null) <- first sentence of the official blurb, full text in `blurb` (docs/research/gnu-blurbs-2026-11-14.json, a fixed snapshot)
//   - MISSING ftp.gnu.org/gnu/ dirs absent from the inventory, added with their newest tarball from the mirror listing
//   - `latest_release` <- GSRC when GSRC is newer (docs/research/gsrc-gnu.json); `gsrc` carries id, version, sha256, deps
// Idempotent: `generated` only moves when the merged content changes; sources.gsrc and sources.ftp_dirs name the revno and the rows present.
// Usage: bun tools/gnu-index/merge.ts [--offline]   (offline: skip the ftp listings, keep already added rows)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGsrc } from "../../packages/gnu/src/store.ts";
import { cmpVer, gsrcId } from "./ids.ts";

const root = join(import.meta.dir, "../..");
const J = join(root, "docs/native/gnu/gnu-packages.json");
const data = JSON.parse(readFileSync(J, "utf8"));
const blurbs: Record<string, string> = JSON.parse(readFileSync(join(root, "docs/research/gnu-blurbs-2026-11-14.json"), "utf8")).blurbs;
const gsrcFile = loadGsrc(root);
const gsrc: Record<string, any> = gsrcFile.packages;
const before = JSON.stringify(data);
const offline = process.argv.includes("--offline");

const gid = gsrcId;

const clean = (s: string) => s.replace(/\(\s*(doc|info|manual)\s*\)/gi, "").replace(/\s+/g, " ").trim();
const first = (s: string) => {
  const m = clean(s).match(/^(.{40,260}?[.!?])(\s|$)/);
  return m ? m[1] : clean(s).slice(0, 260);
};

// ftp.gnu.org/gnu/ directories absent from the inventory (the others there are not packages: GNUinfo, Licenses, non-gnu, savannah, windows, MicrosPorts, MailingListArchives, GNUsBulletins).
const MISSING: { name: string; hosted_only?: boolean; category: string }[] = [
  { name: "guile-debbugs", category: "libraries" },
  { name: "micron", category: "applications" },
  { name: "sauce", category: "applications" },
  { name: "speedx", category: "applications" },
  { name: "cfengine", category: "applications", hosted_only: true },
  { name: "flex", category: "toolchain", hosted_only: true },
  { name: "git", category: "toolchain", hosted_only: true },
  ...["csb", "ga", "hr", "is", "it", "sk"].map((l) => ({ name: `aspell-dict-${l}`, category: "applications" })),
];

const MONTH: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** Newest tarball of ftp.gnu.org/gnu/<dir>/ through a mirror fetched on fr2 (ftp.gnu.org times out from the PC, fr1 and fr2). */
function listing(dir: string) {
  const p = Bun.spawnSync(["ssh", "cdn", `wget -q -T 20 -O - https://mirrors.kernel.org/gnu/${dir}/`], { timeout: 60000 });
  const html = p.stdout.toString();
  const re = /<a href="([^"?\/][^"]*\.(?:tar\.(?:gz|xz|bz2|lz|Z)|tgz|zip))">[^<]*<\/a>\s+(\d{2})-(\w{3})-(\d{4})/g;
  const rows = [...html.matchAll(re)].map((m) => ({ file: m[1], date: `${m[4]}-${MONTH[m[3]]}-${m[2]}` }));
  if (!rows.length) return null;
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const { file, date } = rows[0];
  return { version: (file.match(/-(\d[\w.]*?)\.(?:tar|tgz|zip)/) ?? [])[1] ?? "", date, path: `https://ftp.gnu.org/gnu/${dir}/${file}` };
}

const byName: Map<string, any> = new Map(data.packages.map((p: any) => [p.name, p]));
const stats = { purpose: 0, added: 0, release: 0 };

for (const m of MISSING) {
  const have = byName.get(m.name);
  if (have) {
    if (!have.latest_release && !offline) have.latest_release = listing(m.name);
    continue;
  }
  const rel = offline ? null : listing(m.name);
  const row = {
    name: m.name,
    category: m.category,
    fsf_section: null,
    purpose: null,
    languages: null,
    license: null,
    license_source: null,
    status: "active",
    latest_release: rel,
    ftp_dir_mtime: rel?.date ?? null,
    repo: null,
    last_commit: null,
    manual: `https://www.gnu.org/software/${m.name}/manual/`,
    manual_verified: false,
    homepage: `https://www.gnu.org/software/${m.name}/`,
    ubuntu: null,
    arch: null,
    modern: [],
    verdict: m.hosted_only ? "keep upstream (hébergé seulement sur ftp.gnu.org ; projet hors GNU)" : "drop (hors périmètre)",
    priority: null,
    ...(m.hosted_only ? { hosted_only: true } : {}),
  };
  data.packages.push(row);
  byName.set(m.name, row);
  stats.added++;
}

for (const p of data.packages) {
  const b = blurbs[p.name] ?? blurbs[`gnu-${p.name}`];
  if (b) {
    p.blurb = clean(b);
    if (!p.purpose) {
      p.purpose = first(b);
      stats.purpose++;
    }
  }
  const g = gsrc[gid(p.name)];
  if (g) {
    const sha = Object.values<string>(g.sha256 ?? {})[0] ?? null;
    p.gsrc = { id: gid(p.name), version: g.version, sha256: sha, deps: [...new Set([...(g.builddeps ?? []), ...(g.libdeps ?? [])])].sort() };
    const cur = p.latest_release?.version;
    if (g.version && (!cur || cmpVer(g.version, cur) > 0)) {
      p.latest_release = { version: g.version, date: p.latest_release?.date ?? null, path: p.latest_release?.path ?? null, source: "gsrc" };
      stats.release++;
    }
  }
}

data.sources.blurbs = "https://www.gnu.org/manual/blurbs.html (docs/research/gnu-blurbs-2026-11-14.json)";
data.sources.gsrc = `${gsrcFile.source} (docs/research/gsrc-gnu.json)`;
data.sources.ftp_dirs = `https://ftp.gnu.org/gnu/ directory listings: ${MISSING.filter((m) => byName.has(m.name)).map((m) => m.name).join(" ")}`;
data.counts = data.packages.reduce((a: any, r: any) => ((a[r.category] = (a[r.category] ?? 0) + 1), a), {});
// One date for the whole file: it moves only when this merge changed something (same inputs, same output).
if (JSON.stringify(data) !== before) data.generated = new Date().toISOString().slice(0, 10);
writeFileSync(J, JSON.stringify(data, null, 1) + "\n");

// PACKAGES.md: same rendering as build.ts
const rows = data.packages;
const cats = [...new Set<string>(rows.map((r: any) => r.category))].sort();
const esc = (s: any) => String(s ?? "").replace(/\|/g, "\\|");
let md = `# Paquets GNU : table classée (${rows.length} entrées, ${data.generated})\n\nSource de vérité : [gnu-packages.json](gnu-packages.json), généré à partir des sources listées dans [INDEX.md](INDEX.md), puis complété par \`tools/gnu-index/merge.ts\` (blurbs officiels, GSRC, répertoires ftp manquants). Colonnes : version et date = dernière archive dans ftp.gnu.org/gnu/<nom>/ (ls-lrRt.txt, trié par date), ou GSRC quand il est plus récent ; « commit » = âge du dernier commit dans l'index cgit Savannah (vide si le dépôt est ailleurs ou absent) ; licence = curée, sinon \`%LICENSE%\` du paquet Arch ; « — » = inconnu, [NV].\n\n`;
for (const cat of cats) {
  const rs = rows.filter((r: any) => r.category === cat);
  md += `## ${cat} (${rs.length})\n\n| Paquet | Rôle | Lang. | Licence | Statut | Dernière version (ftp) | Dépôt / commit | Verdict |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rs) {
    const rel = r.latest_release ? `${r.latest_release.version}${r.latest_release.date ? ` (${r.latest_release.date})` : ""}` : "—";
    const repo = r.repo ? `[${r.repo.includes("savannah") ? "savannah" : new URL(r.repo).host}](${r.repo})${r.last_commit ? " " + r.last_commit : ""}` : "—";
    md += `| [${r.name}](${r.manual}) | ${esc(r.purpose)} | ${esc(r.languages ?? "—")} | ${esc(r.license ?? "—")} | ${r.status} | ${rel} | ${repo} | ${esc(r.verdict)} |\n`;
  }
  md += "\n";
}
writeFileSync(join(root, "docs/native/gnu/PACKAGES.md"), md);
console.log(JSON.stringify({ total: rows.length, ...stats, noPurpose: rows.filter((r: any) => !r.purpose).length }));
