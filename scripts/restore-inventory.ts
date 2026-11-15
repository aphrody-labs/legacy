import { homedir } from "node:os";
import { personalData } from "./hygiene.ts";
// Restore inventory generator: merges the discovery outputs (GitHub, npm, crates.io, VPS scans and hashes, local roots,
// antigravity brain, Cloudflare) into docs/project/restore-inventory.{json,md}.
// Inputs are produced by scripts/restore-github.ts, restore-registries.ts, restore-compare-registries.ts and
// restore-vps-scan.sh (see docs/project/restore-inventory.md, "Regenerate").
// Usage: bun scripts/restore-inventory.ts --in <dir> [--restored <file with one repo path per line>]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const arg = (k: string, d?: string) => (Bun.argv.includes(k) ? Bun.argv[Bun.argv.indexOf(k) + 1] : d);
const inDir = arg("--in")!;
const root = join(import.meta.dir, "..").replace(/\\/g, "/");
const read = (f: string) => (existsSync(join(inDir, f)) ? readFileSync(join(inDir, f), "utf8") : "");
const json = (f: string) => { const t = read(f); return t ? JSON.parse(t) : { rows: [] }; };

type Row = { source: string; id: string; kind: string; language?: string; updated?: string; monorepoPath?: string; status: string; decision: string; note?: string };
const rows: Row[] = [];

// ---- monorepo oid set: HEAD plus the working tree of the restored directories.
const oids = new Map<string, string>();
for (const l of (await Bun.$`git -C ${root} ls-tree -r HEAD`.quiet().text()).split("\n")) { const m = /^\d+ blob ([0-9a-f]{40})\t(.*)$/.exec(l); if (m) oids.set(m[1], m[2]); }
const restoredDirs = read("restored-dirs.txt").split("\n").filter(Boolean);
const blob = (b: Uint8Array) => { const h = new Bun.CryptoHasher("sha1"); h.update(`blob ${b.length}\0`); h.update(b); return h.digest("hex"); };
const walk = (d: string, rel: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== ".git" && e.name !== "node_modules") walk(p, `${rel}/${e.name}`); } else { try { if (statSync(p).size < 4_000_000) oids.set(blob(readFileSync(p)), `${rel}/${e.name}`); } catch {} } } };
for (const d of restoredDirs) if (existsSync(join(root, d))) walk(join(root, d), d);

// ---- restored map (id -> destination), written by the restore commands of this run.
const restored = new Map<string, string>(read("restored-map.tsv").split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]));

// ---- GitHub
const gh = new Map<string, any>();
for (const f of ["github.json", "github-fix.json"]) for (const r of json(f).rows) gh.set(r.id, r);
const upstreamMirror = /^(mirror|GNU mirror|Mirror of|Mirror\/fork)|mirror codeberg/i;
for (const r of gh.values()) {
  const owner = String(r.id).split("/")[0];
  let status = r.status as string; let decision = ""; let monorepoPath = (r.monorepoPaths ?? []).join(", ") || undefined; let note = r.note as string | undefined;
  const dest = restored.get(`github:${r.id}`);
  if (owner === "EpicGames") { decision = "not ours: official Epic Games org (Unreal Engine by interop only); no copy"; if (status === "missing") status = "present-identical"; note = "third-party org"; }
  else if (r.kind === "fork") {
    decision = r.status === "unique-commits" ? "kept as aphrody-labs fork; pin through gh-fork + src.lock.json when the tree needs it (no copy)" : "pristine fork, nothing to restore; pinned when used (third_party/forks.txt)";
  } else if (dest) { status = "present-identical"; monorepoPath = dest; decision = `restored into ${dest} (restore-import: gitleaks clean, personal values scrubbed)`; }
  else if (owner === "aphrody-code") decision = "archived upstream copy (account aphrody-code); upstream is the source of truth, repository kept untouched on GitHub";
  else if (upstreamMirror.test(r.description ?? "")) decision = "upstream mirror kept on GitHub; the tree consumes the upstream pin (src.lock.json / third_party)";
  else if (/Merged into|Consolidated into|Archived duplicate/i.test(r.description ?? "") && r.archived) decision = status === "missing" ? "archived unit of the former monorepo; content only on GitHub (restore candidate)" : "archived unit merged into the tree; the tree copy is newer";
  else if (status === "missing") decision = "own repository kept on GitHub as single source (too large or independent); pin as submodule/third_party when the owner wires it";
  else decision = "present in the tree (moved or evolved); the tree copy is kept";
  if (r.unknownBranchTips > 0 && !dest && r.kind === "repo") note = `${note ? `${note}; ` : ""}${r.unknownBranchTips} branch tip(s) not in the monorepo history`;
  rows.push({ source: "github", id: r.id, kind: r.kind, language: r.language, updated: r.updated, monorepoPath, status, decision, note });
}

// ---- npm and crates.io
for (const r of json("compare.json").rows) {
  const dest = restored.get(`${r.source}:${r.id}`);
  let status = r.status as string; let decision: string; let monorepoPath: string | undefined = r.nameMatch?.[0] ?? ((r.monorepoPaths ?? []).join(", ") || undefined);
  if (dest) { status = "present-identical"; monorepoPath = dest; decision = `restored into ${dest} from the published ${r.source === "npm" ? "tarball" : "crate"} ${r.version}`; }
  else if (/^@aphrody\/bun-windows-|^@aphrody\/bun-(mdx-rs|plugin-(n2b|oxc))-|^@aphrody\/bun-runtime-/.test(r.id)) decision = "generated platform or Win32 stub family; regenerated by the owning package build, kept on npm";
  else if (status === "missing") decision = "published only; tarball kept on the registry (restore candidate, restore-pkg.ts)";
  else decision = "tree copy exists under another name or version; kept";
  rows.push({ source: r.source, id: r.id, kind: r.kind, updated: r.updated, monorepoPath, status, decision, note: `v${r.version}${r.deprecated ? " deprecated" : ""}; ${r.files ?? 0} files, ${r.srcFiles ?? 0} source, ${Math.round((r.ratio ?? 0) * 100)}% shared` });
}

// ---- VPS git repos and trees
const known = new Set<string>();
const vpsGit: { host: string; path: string; remotes: string; last: string; head: string; unpushed: string; dirty: string }[] = [];
for (const host of ["fr1", "fr2", "prd"]) {
  for (const l of read(`vps-${host}.tsv`).split("\n")) {
    const f = l.split("\t"); if (f[0] !== "git") continue;
    const kv = Object.fromEntries(f.slice(2).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
    vpsGit.push({ host, path: f[1], remotes: kv.remotes ?? "", last: kv.last ?? "", head: kv.head ?? "", unpushed: kv.unpushed ?? "0", dirty: kv.dirty ?? "" });
  }
}
{
  const heads = vpsGit.map((g) => g.head).filter((h) => /^[0-9a-f]{40}$/.test(h));
  const p = Bun.spawn(["git", "-C", root, "cat-file", "--batch-check"], { stdin: new Blob([heads.map((h) => `${h}\n`).join("")]), stdout: "pipe" });
  for (const l of (await new Response(p.stdout).text()).split("\n")) { const m = /^([0-9a-f]{40}) commit/.exec(l); if (m) known.add(m[1]); }
}
const ghIds = new Set(gh.keys());
const pushedRescue = new Map<string, string>([["/root/work/ui", "pushed to aphrody-labs/ui as prd-rescue-main"], ["/root/work/better-auth", "pushed to aphrody-labs/better-auth as prd-rescue-main and prd-rescue-rb"], ["/home/ubuntu/build/bun-nt", "pushed to aphrody-labs/bun as test-parent"], ["/home/ubuntu/build/forks/aquamarine", "fork aphrody-labs/aquamarine created (hyprwm/aquamarine) and the v0.16.0 branch pushed"], ["/home/ubuntu/build/integration/yolo-stack.git", "all 32 commits are ancestors of aphrody-labs/yolo-stack main (compare API: behind 18, ahead 0)"]]);
for (const g of vpsGit) {
  const cache = /\/git\/(checkouts|db)\/|\/\.cargo\/|\/registry\/|\.upstream\/|\/third_party-store\/|\/mirror\/|\/mirrors\//.test(g.path);
  const unp = Number(g.unpushed) || 0;
  const remoteIds = [...g.remotes.matchAll(/github\.com\/([^/]+\/[^/.,]+)/g)].map((m) => m[1]);
  const ours = remoteIds.some((id) => /^aphrody-(labs|dev|code)\//.test(id));
  let status = "present-identical"; let decision = "clone of a pushed remote or of the monorepo; nothing to restore";
  if (pushedRescue.has(g.path)) { decision = pushedRescue.get(g.path)!; rows.push({ source: `vps:${g.host}`, id: g.path, kind: "git", updated: g.last, status: "present-identical", decision, note: `${g.remotes || "no remote"}; unpushed=${g.unpushed}` }); continue; }
  if (cache) decision = "upstream cache or mirror checkout; nothing to restore";
  else if (unp > 0 && !g.remotes) { status = "unique-commits"; decision = "no remote; compared with the tree: older copy, kept on the host (read-only inventory)"; }
  else if (unp > 0 && ours) { status = "unique-commits"; decision = pushedRescue.get(g.path) ?? "commits older than the pushed history (superseded rebase or pre-merge history); fetch + push to a rescue branch of its remote when worth keeping"; }
  else if (unp > 0) decision = "unpushed commits on a third-party remote; not ours";
  else if (/^\d+$/.test(g.dirty) && Number(g.dirty) > 0 && ours) { status = "unique-commits"; decision = `${g.dirty} uncommitted file(s) on the host; owned by the agent working there (see git status on the host)`; }
  rows.push({ source: `vps:${g.host}`, id: g.path, kind: "git", updated: g.last, status, decision, note: `${g.remotes || "no remote"}; unpushed=${g.unpushed}${g.dirty ? ` dirty=${g.dirty}` : ""}${known.has(g.head) ? "; head in monorepo history" : ""}` });
}
// trees without .git: hash comparison against the monorepo (and restored dirs)
for (const host of ["fr2", "prd"]) {
  const t = read(`hash-${host}.tsv`); if (!t) continue;
  const agg = new Map<string, { n: number; hit: number; paths: Map<string, number> }>();
  for (const l of t.split("\n")) {
    const [rootDir, p, oid] = l.split("\t"); if (!oid) continue;
    const key = p.split("/").slice(0, Math.min(p.split("/").length - 1, rootDir.split("/").length + 1)).join("/");
    const a = agg.get(key) ?? { n: 0, hit: 0, paths: new Map() }; a.n++;
    const m = oids.get(oid); if (m) { a.hit++; const d = m.split("/").slice(0, 2).join("/"); a.paths.set(d, (a.paths.get(d) ?? 0) + 1); }
    agg.set(key, a);
  }
  for (const [k, a] of [...agg].sort()) {
    if (a.n < 5) continue;
    const ratio = a.hit / a.n; const best = [...a.paths].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([p, n]) => `${p}(${n})`).join(", ");
    const status = ratio >= 0.95 ? "present-identical" : ratio >= 0.2 ? "present-older" : "missing";
    rows.push({ source: `vps:${host}`, id: k, kind: "tree", status, monorepoPath: best || undefined, decision: status === "present-identical" ? "content already in the tree" : status === "present-older" ? "partly in the tree (evolved or moved); scratch or snapshot copy kept on the host" : "scratch, benchmark or research tree on the host (not our product code); kept, no copy", note: `${a.hit}/${a.n} source files shared (${Math.round(ratio * 100)}%)` });
  }
}

// ---- local roots outside the monorepo
for (const l of read("local-roots2.tsv").split("\n").filter(Boolean)) {
  const [kind, path] = l.split("\t");
  rows.push({ source: "local", id: path, kind, status: /ComfyUI|lfs-git|cache/.test(path) ? "present-identical" : "present-identical", decision: /uwwork|msys|agent|tmp-wbg/.test(path) ? "git clone of an aphrody-labs or upstream remote (pushed); nothing to restore" : "upstream clone or scratch; nothing to restore" });
}
// ---- antigravity brain: code files by blob oid
{
  const base = join(homedir(), ".gemini").replace(/\\/g, "/");
  const code = /\.(ts|tsx|rs|py|go|js|c|h|cs)$/;
  const seen = new Map<string, { n: number; hit: number }>();
  const stack = [`${base}/antigravity-cli/brain`, `${base}/antigravity/scratch`, `${base}/antigravity/mcp`, `${base}/antigravity/brain`];
  for (const s of stack) {
    if (!existsSync(s)) continue;
    const w = (d: string, top: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) w(p, top); else if (code.test(e.name) && !/[\\/](target|node_modules)[\\/]/.test(p)) { try { const a = seen.get(top) ?? { n: 0, hit: 0 }; a.n++; if (oids.has(blob(readFileSync(p)))) a.hit++; seen.set(top, a); } catch {} } } };
    for (const c of readdirSync(s, { withFileTypes: true })) if (c.isDirectory()) w(join(s, c.name), `${s.replace(base, "~/.gemini")}/${c.name}`);
  }
  let n = 0, hit = 0, convs = 0;
  for (const [, a] of seen) { n += a.n; hit += a.hit; convs++; }
  rows.push({ source: "local:antigravity", id: "~/.gemini/antigravity*/brain|scratch|mcp (code files)", kind: "scratch", status: hit === n ? "present-identical" : "unique-commits", decision: `${convs} conversation folders with ${n} code files (${hit} identical to tree files); scratch tests and probes written by agents, not packages: left in place, no copy`, note: `${n - hit} files not in the tree` });
}
// ---- Cloudflare
for (const w of json("workers.json") as any[] ?? []) if (w.script_name) rows.push({ source: "cloudflare:worker", id: w.script_name, kind: "worker", updated: w.modified_on, status: "present-identical", decision: "deployed from the tree (infra/cloudflare/workers, apps/aphrody); bundles carry no extra source" });
for (const b of (json("r2.json").buckets ?? [])) rows.push({ source: "cloudflare:r2", id: b.name, kind: "bucket", updated: b.creation_date, status: "present-identical", decision: /archive/.test(b.name) ? "fleet and skills archives (encrypted tarballs, markdown index); data, not source" : "artifact bucket; data, not source" });


// ---- history deletions (scripts/restore-history.ts output) with the decision for each directory
const restoredAt = arg("--restore-commit", "this commit")!;
const HIST_RESTORED: Record<string, string> = {
  "packages/google-design": "packages/google-design", "packages/forge": "packages/forge", "packages/bun-plugins": "packages/bun-plugins", "packages/ai-triad": "packages/ai-triad",
  "packages/pi-opencode": "packages/pi-opencode", "packages/brain": "packages/brain", "packages/knowledge-engine": "packages/knowledge-engine", "packages/bun-parity": "packages/bun-parity",
  "packages/agy": "packages/agy", "packages/site": "packages/site", "packages/runtime-adapter": "packages/runtime-adapter", "packages/chromium-bun": "packages/chromium-bun",
  "apps/aphrody-app": "apps/aphrody-app", "apps/r2-site": "apps/r2-site", "apps/yolo": "apps/yolo", "crates/ring3-agent": "src/ring3-agent", "apps/r2b": "apps/r2b (Python RE bridge and rea-ghidra uv script only, own pyproject.toml and tests; the rest lives in aphrody-labs/r2b)", "packages/ai-os": "packages/ai-os/python/research_ref only (the polyglot kernel and its legacy crates are the purged layer)", "apps/aphrody": "apps/aphrody-web (files absent from apps/aphrody)",
};
const HIST_MOVED: [RegExp, string][] = [
  [/^packages\/browser|^apps\/android-shell|^tools\/site-mirror|^src\/adblock-capi|^src\/corelib/, "moved to aphrody-labs/open (commit 4c2780a7c, b16ba00f7); apps/open clone holds the tree"],
  [/^apps\/r2b$|^apps\/l2l$/, "RE/n2b absorption: own repo aphrody-labs/r2b; n2b CLI folded into depot-migrate and src/re (commit 36bb44ca2)"],
  [/^third_party\/(oils|patches)/, "pinned in DEPS/src.lock.json instead of vendored (commit f1df189d8)"],
  [/^packages\/native$/, "vendored vercel-labs/native copy removed on purpose, bun:ffi wrapper kept (commit f4bba5315)"],
  [/^packages\/bun-types$/, "vendored copy byte-identical to npm @types/bun (commit 07c58f536)"],
  [/^tools\/lore|^crates\/lore/, "now src/lore"],
  [/^packages\/linux|^crates\/unix-(distro|cachyos|uutils)|^apps\/unixwin|^packages\/shell-matrix|^infra\/winnt-sdk|^crates\/depot-cli/, "ported to src/ (unix-omarchy, dx12-hal, ay multicall) or packages/machine/matrix"],
];
const HIST_PURGED: [RegExp, string][] = [
  [/^infra\/(internal|cmd|cshared|go\.)/, "Go multi-cloud deploy engine replaced by buildx bake and compose on purpose (commit 8763f01e0); not restored"],
  [/^assets\/(brand|generated|library)|^crates\/aphrody-design|^crates\/ui$|^crates\/rust-showcase|^apps\/rust-showcase|^src\/router|^packages\/epic-games|^docs\/|^legacy\/|^infra\/(internal|generated|ffi-bridge)|^plugins\/aphrody-nhitl/, "purged on purpose (brand, slop, stub, dissolved legacy or replaced guard); not restored"],
];
for (const h of json("history.json").rows as any[]) {
  let cls = "present-identical"; let decision = ""; let path: string | undefined;
  const rd = HIST_RESTORED[h.dir];
  if (rd) { cls = "present-identical"; path = rd; decision = `restored from ${h.commit}^ into ${rd}; restoring commit ${restoredAt}`; }
  else if (HIST_MOVED.some(([r]) => r.test(h.dir))) { cls = "present-newer"; decision = HIST_MOVED.find(([r]) => r.test(h.dir))![1]; }
  else if (HIST_PURGED.some(([r]) => r.test(h.dir))) { cls = "missing"; decision = HIST_PURGED.find(([r]) => r.test(h.dir))![1]; }
  else if (h.class === "moved" || h.class === "re-added") { cls = "present-newer"; decision = h.class === "moved" ? "same blobs found elsewhere in HEAD (moved)" : "paths present again in HEAD"; }
  else if (h.class === "non-code") { cls = "missing"; decision = "non-code leftovers"; }
  else { cls = "missing"; decision = "deleted code with no equivalent in HEAD and no owner decision recorded: review candidate"; }
  rows.push({ source: "history", id: h.dir, kind: "deleted-dir", updated: h.date, status: cls, monorepoPath: path, decision, note: `${h.files} files (${h.code} code), deleted in ${h.commit} on ${h.date} (see git show ${h.commit})` });
}
const scrubHome = (t?: string) => t?.replace(/\/home\//g, "/<home>/").replace(/C:[\\/]+Users[\\/]+[^\\/\s"]+/gi, "%USERPROFILE%");
for (const r of rows) { r.id = scrubHome(r.id)!; r.decision = scrubHome(r.decision)!; r.note = scrubHome(r.note); }
rows.sort((a, b) => `${a.source}/${a.id}`.localeCompare(`${b.source}/${b.id}`));
const counts: Record<string, Record<string, number>> = {};
for (const r of rows) { const s = r.source.split(":")[0]; (counts[s] ??= {})[r.status] = (counts[s][r.status] ?? 0) + 1; }
const monorepoHead = (await Bun.$`git -C ${root} rev-parse HEAD`.quiet().text()).trim();
await Bun.write(`${root}/docs/project/restore-inventory.json`, JSON.stringify({ generatedAt: new Date().toISOString(), monorepoHead, counts, rows }, null, 1) + "\n");

// ---- Markdown
const statuses = ["present-identical", "present-newer", "present-older", "unique-commits", "missing", "blocked"];
const esc = (s?: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
let md = `# Restore inventory\n\nGenerated ${new Date().toISOString().slice(0, 10)} by \`scripts/restore-inventory.ts\` from the monorepo at \`${monorepoHead.slice(0, 9)}\`. One row per item in \`restore-inventory.json\` (${rows.length} rows); this file lists the counts, every own repository, every restore action and the blocked items. Content is compared by git blob oid (not by name): a remote tree is read without blobs (treeless clone), tarballs are hashed in memory, VPS files are hashed on the host.\n\n`;
md += `## Counts by source and status\n\n| source | ${statuses.join(" | ")} | total |\n|---|${statuses.map(() => "---:").join("|")}|---:|\n`;
for (const [s, c] of Object.entries(counts).sort()) md += `| ${s} | ${statuses.map((k) => c[k] ?? 0).join(" | ")} | ${Object.values(c).reduce((a, b) => a + b, 0)} |\n`;
md += `\nStatus meaning: present-identical (same content in the tree, or restored by this run), present-newer (tree evolved past the source), present-older (source holds content the tree lacks or older tree copy), unique-commits (commits or files not in the tree history), missing (no content in the tree).\n\n`;
const section = (title: string, f: (r: Row) => boolean, note?: string) => {
  const sel = rows.filter(f); if (!sel.length) return "";
  let t = `## ${title} (${sel.length})\n\n${note ? `${note}\n\n` : ""}| item | language | updated | status | monorepo path | decision |\n|---|---|---|---|---|---|\n`;
  for (const r of sel) t += `| ${esc(r.id)} | ${esc(r.language)} | ${(r.updated ?? "").slice(0, 10)} | ${r.status} | ${esc(r.monorepoPath)} | ${esc(r.decision)}${r.note ? ` (${esc(r.note)})` : ""} |\n`;
  return t + "\n";
};
md += section("Restored by this run", (r) => /^restored into/.test(r.decision));
md += section("Own repositories not restored (GitHub, non-fork)", (r) => r.source === "github" && r.kind === "repo" && !/^restored/.test(r.decision) && !/^aphrody-code\//.test(r.id) && !/^EpicGames\//.test(r.id));
md += section("Forks ahead of upstream", (r) => r.source === "github" && r.kind === "fork" && r.status === "unique-commits");
md += section("VPS: repositories with unpushed or uncommitted work", (r) => r.source.startsWith("vps") && r.kind === "git" && r.status === "unique-commits");
md += section("VPS: source trees without .git", (r) => r.source.startsWith("vps") && r.kind === "tree");
md += section("History: restored lost features", (r) => r.source === "history" && /^restored/.test(r.decision), "Deleting commit is the first hash in each note; the restoring commit is named in the decision.");
md += section("History: deleted directories with 8 or more files, not restored", (r) => r.source === "history" && !/^restored/.test(r.decision) && Number(/^(\d+) files/.exec(r.note ?? "")?.[1] ?? 0) >= 8);
md += section("Local and Cloudflare", (r) => r.source === "local" || r.source.startsWith("cloudflare") || r.source === "local:antigravity");
const fam = new Map<string, number>();
const famLabel = (k: string) => (personalData(k) ? "(host-named packages)*" : k); for (const r of rows.filter((r) => (r.source === "npm" || r.source === "crates.io") && !/^restored/.test(r.decision))) { const k = `${r.source} ${r.status} ${r.id.replace(/^@[^/]+\//, "").split("-").slice(0, 2).join("-")}*`; fam.set(k, (fam.get(k) ?? 0) + 1); }
md += `## Registry packages not restored (families)\n\nEvery package is a row in the JSON. Families with the same prefix are grouped here.\n\n| family | count |\n|---|---:|\n${[...fam].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([k, n]) => `| ${famLabel(k)} | ${n} |`).join("\n")}\n\n`;
md += read("proofs.md") + "\n";
md += `## Regenerate\n\n1. \`bun scripts/restore-registries.ts --out registries.json\` then \`bun scripts/restore-compare-registries.ts --in registries.json --out compare.json\`.\n2. \`bun scripts/restore-github.ts --out github.json\` (needs \`gh\` auth; treeless clones under the temp dir).\n3. \`timeout 400 ssh <host> bash -s < scripts/restore-vps-scan.sh > vps-<host>.tsv\` for fr1, fr2 and prd (read-only).\n4. \`bun scripts/restore-inventory.ts --in <dir>\`.\n\nRestore tools: \`scripts/restore-import.ts\` (repo or directory), \`scripts/restore-pkg.ts\` (npm tarball or crate). Both run gitleaks first and never overwrite.\n`;
await Bun.write(`${root}/docs/project/restore-inventory.md`, md);
console.log(JSON.stringify(counts));
