import { join } from "node:path";
// Restore inventory, registry side: compare every npm tarball and crates.io crate we published with the monorepo.
// In-memory only (no extraction to disk). Content comparison by git blob oid against the monorepo HEAD, plus name match
// against workspace manifests. Usage: bun scripts/restore-compare-registries.ts --in registries.json --out compare.json
import { gunzipSync } from "bun";

const arg = (k: string, d?: string) => (Bun.argv.includes(k) ? Bun.argv[Bun.argv.indexOf(k) + 1] : d);
const inp = arg("--in")!;
const out = arg("--out")!;
const jobs = Number(arg("--jobs", "8"));
const root = join(import.meta.dir, "..").replace(/\\/g, "/");
const UA = "aphrody-restore/1.0 (+https://github.com/aphrody-labs/aphrody)";

const lsTree = await Bun.$`git -C ${root} ls-tree -r HEAD`.quiet().text();
const oidPath = new Map<string, string>();
for (const line of lsTree.split("\n")) {
  const m = /^(\d+) blob ([0-9a-f]{40})\t(.*)$/.exec(line);
  if (m) oidPath.set(m[2], m[3]);
}

// Workspace names: package.json "name" and Cargo.toml [package] name, with versions.
const names = new Map<string, { path: string; version?: string }[]>();
const addName = (n: string, path: string, version?: string) => names.set(n, [...(names.get(n) ?? []), { path, version }]);
const manifests = lsTree.split("\n").map((l) => /^(\d+) blob ([0-9a-f]{40})\t(.*)$/.exec(l)).filter((m) => m && /(^|\/)(package\.json|Cargo\.toml)$/.test(m[3]) && !m[3].includes("node_modules/")).map((m) => ({ oid: m![2], path: m![3] }));
const blobs = Bun.spawn(["git", "-C", root, "cat-file", "--batch"], { stdin: new Blob([manifests.map((m) => `${m.oid}\n`).join("")]), stdout: "pipe" });
const buf = new Uint8Array(await new Response(blobs.stdout).arrayBuffer());
{
  let i = 0; const dec = new TextDecoder(); let k = 0;
  while (i < buf.length && k < manifests.length) {
    let e = i; while (buf[e] !== 10) e++;
    const [, , sz] = dec.decode(buf.subarray(i, e)).split(" ");
    const size = Number(sz); const body = dec.decode(buf.subarray(e + 1, e + 1 + size)); i = e + 1 + size + 1;
    const m = manifests[k++];
    if (m.path.endsWith("package.json")) {
      try { const j = JSON.parse(body); if (j.name) addName(j.name, m.path.replace(/\/package\.json$/, ""), j.version); } catch {}
    } else {
      const pk = /\[package\]([\s\S]*?)(\n\[|$)/.exec(body)?.[1] ?? "";
      const n = /^name\s*=\s*"([^"]+)"/m.exec(pk)?.[1]; const v = /^version\s*=\s*"([^"]+)"/m.exec(pk)?.[1];
      if (n) addName(n, m.path.replace(/\/Cargo\.toml$/, ""), v);
    }
  }
}
console.error(`monorepo: ${oidPath.size} blobs, ${names.size} workspace names`);

const blobOid = (b: Uint8Array) => {
  const h = new Bun.CryptoHasher("sha1");
  h.update(`blob ${b.length}\0`); h.update(b);
  return h.digest("hex");
};
const untar = (tar: Uint8Array) => {
  const files: { name: string; oid: string; size: number }[] = [];
  const dec = new TextDecoder();
  let i = 0;
  while (i + 512 <= tar.length) {
    const h = tar.subarray(i, i + 512);
    if (h.every((x) => x === 0)) break;
    const str = (a: number, b: number) => dec.decode(h.subarray(a, b)).replace(/\0.*$/, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(345, 500);
    const name = (prefix ? `${prefix}/` : "") + str(0, 100);
    i += 512;
    if (type === "0") files.push({ name, oid: blobOid(tar.subarray(i, i + size)), size });
    i += Math.ceil(size / 512) * 512;
  }
  return files;
};
const SRC = /\.(ts|tsx|rs|py|go|c|h|cc|cpp|md|toml|css|scss|html|lua|wgsl|proto|sql|yaml|yml)$/;
const BUILD = /(^|\/)(dist|build|lib|esm|cjs|out|target)\//;
const cmpVer = (a = "0", b = "0") => { const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };

const reg = JSON.parse(await Bun.file(inp).text());
const rows: any[] = reg.rows;
const result: any[] = [];
const queue = [...rows];
const fetchBuf = async (url: string) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (r.status === 429) { await Bun.sleep(3000); continue; }
      if (!r.ok) return { status: r.status } as any;
      return new Uint8Array(await r.arrayBuffer());
    } catch { await Bun.sleep(1000); }
  }
  return { status: 0 } as any;
};
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) {
    const row = queue.shift()!;
    const url = row.source === "npm" ? row.extra?.tarball : `https://crates.io/api/v1/crates/${row.name}/${row.version}/download`;
    const res: any = { source: row.source, id: row.name, kind: row.kind, version: row.version, updated: row.date, ...(row.source === "npm" ? { deprecated: row.extra?.deprecated, versions: row.extra?.versions, repository: row.extra?.repository } : { repository: row.extra?.repository }) };
    if (!url) { result.push({ ...res, status: "blocked", note: "no tarball url" }); continue; }
    const data = await fetchBuf(url);
    if (!(data instanceof Uint8Array)) { result.push({ ...res, status: "blocked", note: `download http ${data.status}` }); continue; }
    let files; try { files = untar(gunzipSync(data)); } catch (e) { result.push({ ...res, status: "blocked", note: `untar ${e}` }); continue; }
    const real = files.filter((f) => f.size > 0 && !/\.(map)$/.test(f.name));
    const src = real.filter((f) => SRC.test(f.name) && !BUILD.test(f.name));
    const hit = real.filter((f) => oidPath.has(f.oid));
    const hitSrc = src.filter((f) => oidPath.has(f.oid));
    const nm = names.get(row.name) ?? [];
    const dirs = new Map<string, number>();
    for (const h of hit) { const p = oidPath.get(h.oid)!.split("/").slice(0, 3).join("/"); dirs.set(p, (dirs.get(p) ?? 0) + 1); }
    const best = [...dirs].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p, n]) => `${p}(${n})`);
    const ratio = real.length ? hit.length / real.length : 0;
    const sratio = src.length ? hitSrc.length / src.length : 0;
    let status: string;
    if (nm.length) {
      const v = nm[0].version;
      const c = cmpVer(v, row.version);
      status = c < 0 ? "present-older" : c > 0 ? "present-newer" : "present-identical";
      if (c === 0 && sratio < 0.5 && src.length > 3) status = "present-newer";
    } else if (ratio >= 0.5 || sratio >= 0.5) status = "present-older";
    else if (real.length <= 2 || (src.length === 0 && ratio < 0.2)) status = "missing";
    else status = ratio > 0.1 ? "present-older" : "missing";
    result.push({ ...res, files: real.length, srcFiles: src.length, shared: hit.length, ratio: Number(ratio.toFixed(3)), srcRatio: Number(sratio.toFixed(3)), nameMatch: nm.map((n) => `${n.path}@${n.version ?? "?"}`), monorepoPaths: best, status });
    if (result.length % 50 === 0) console.error(`${result.length}/${rows.length}`);
    if (row.source === "crates.io") await Bun.sleep(300);
  }
}));
result.sort((a, b) => `${a.source}/${a.id}`.localeCompare(`${b.source}/${b.id}`));
await Bun.write(out, JSON.stringify({ at: new Date().toISOString(), rows: result }, null, 1));
console.error(`done ${result.length}`);
