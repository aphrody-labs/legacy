#!/usr/bin/env bun
// Monorepo topology map: units and manifest edges from checkdeps (--units), plus what manifests
// cannot show: cross-language invocations (a repo path literal of another unit in source, e.g. ay
// running a Bun facade), name references (imports by crate or package name), binaries and entry
// points (Cargo bins, package.json bin, pyproject scripts, justfile recipes, ay External routes),
// and data stores touched through their client APIs. Writes docs/topology/{topology.json,
// TOPOLOGY.html,call-graph.mmd,data-lineage.mmd,critical-path.mmd} and prints a summary.
// Usage: bun scripts/topology.ts [--out DIR] [--viewer <topology-viewer.html>]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const args = Bun.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const out = join(root, opt("--out") ?? "docs/topology");

type Unit = { dir: string; name: string; kind: "cargo" | "bun" | "uv"; deps: string[]; layer: number | null };
const cd = Bun.spawnSync(["bun", join(root, "scripts/checkdeps.ts"), "--units"], { cwd: root });
const { layers: LAYERS, units, findings } = JSON.parse(cd.stdout.toString()) as { layers: string[]; units: Unit[]; findings: { level: string; from: string; to: string; msg: string }[] };
const byDir = new Map(units.map((u) => [u.dir, u]));
const dirs = [...byDir.keys()].sort((a, b) => b.length - a.length);
const ownerOf = (rel: string) => dirs.find((d) => rel === d || rel.startsWith(d + "/"));

// --- Source walk: LOC, path literals, name tokens, data-store markers (one pass per file).
const SRC = /\.(rs|ts|tsx|js|mjs|c|h|cc|cpp|zig|py|toml)$/;
const SKIP = new Set(["node_modules", "target", ".git", "dist", "out", "gen", "vendor", "fixtures", "third_party"]);
const norm = (s: string) => s.toLowerCase().replaceAll("-", "_");
const names = new Map<string, string>(); // normalized crate/package name -> unit dir
for (const u of units) names.set(norm(u.name), u.dir);
for (const u of units) if (u.kind === "bun") names.set(norm(u.name.split("/").pop()!), names.get(norm(u.name.split("/").pop()!)) ?? u.dir);

// Data stores reached through a client: a manifest dependency on a known client library, or a Bun
// built-in client API in source. An edge means "links a client", not a measured read or write.
const STORES: { id: string; name: string; libs: string[]; bunApi: RegExp }[] = [
  { id: "ds:sqlite", name: "SQLite", libs: ["rusqlite", "libsqlite3-sys", "better-sqlite3"], bunApi: /["']bun:sqlite["']/ },
  { id: "ds:valkey", name: "Valkey / Redis", libs: ["redis", "fred", "ioredis"], bunApi: /\bBun\.redis\b|new RedisClient\(/ },
  { id: "ds:s3", name: "S3 / R2", libs: ["aws-sdk-s3", "@aws-sdk/client-s3", "rust-s3"], bunApi: /\bBun\.s3\b|new S3Client\(/ },
  { id: "ds:postgres", name: "Postgres", libs: ["tokio-postgres", "postgres", "deadpool-postgres", "pg"], bunApi: /\bBun\.sql\b|new SQL\(/ },
];

const loc = new Map<string, number>();
const edges = new Map<string, Set<string>>(); // "src|dst|kind"
const addEdge = (s: string, t: string, kind: string) => {
  if (s === t) return;
  const k = `${s}|${t}|${kind}`;
  if (!edges.has(k)) edges.set(k, new Set());
};
const mentions = new Map<string, Set<string>>(); // target unit -> units naming it

function walk(abs: string, unit: string) {
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const p = join(abs, e.name);
    const rel = relative(root, p).replaceAll("\\", "/");
    if (e.isDirectory()) {
      if (byDir.has(rel)) continue; // nested unit: walked on its own
      walk(p, unit);
      continue;
    }
    if (!SRC.test(e.name) || statSync(p).size > 2_000_000) continue;
    const text = readFileSync(p, "utf8");
    if (!e.name.endsWith(".toml")) loc.set(unit, (loc.get(unit) ?? 0) + text.split("\n").length);
    for (const m of text.matchAll(/["'`]((?:src|packages|apps|bench|test|build|device|prebuilts)\/[\w./-]+)/g)) {
      const t = ownerOf(m[1]!.replace(/\/+$/, ""));
      if (t && t !== unit) addEdge(unit, t, "dispatch");
    }
    for (const m of text.matchAll(/[@A-Za-z][\w@/-]{2,}/g)) {
      const t = names.get(norm(m[0]!));
      if (t && t !== unit) (mentions.get(t) ?? mentions.set(t, new Set()).get(t)!).add(unit);
    }
    if (/\.(ts|tsx|js|mjs)$/.test(e.name)) for (const s of STORES) if (s.bunApi.test(text)) addEdge(unit, s.id, "call");
  }
}
for (const u of units) if (existsSync(join(root, u.dir))) walk(join(root, u.dir), u.dir);
for (const u of units) for (const d of u.deps) addEdge(u.dir, d, "call");
// Client libraries declared in the manifests.
for (const u of units) {
  const abs = join(root, u.dir);
  const declared = new Set<string>();
  if (u.kind === "cargo") {
    const c = Bun.TOML.parse(readFileSync(join(abs, "Cargo.toml"), "utf8")) as any;
    for (const tab of [c.dependencies, ...Object.values<any>(c.target ?? {}).map((x) => x.dependencies)]) for (const k of Object.keys(tab ?? {})) declared.add(k);
  } else if (u.kind === "bun") {
    const j = JSON.parse(readFileSync(join(abs, "package.json"), "utf8"));
    for (const k of Object.keys({ ...j.dependencies, ...j.optionalDependencies })) declared.add(k);
  }
  for (const s of STORES) if (s.libs.some((l) => declared.has(l))) addEdge(u.dir, s.id, "call");
}
// Drop dispatch edges already covered by a manifest call edge.
for (const k of [...edges.keys()]) {
  const [s, t, kind] = k.split("|");
  if (kind === "dispatch" && edges.has(`${s}|${t}|call`)) edges.delete(k);
}

// --- Entry points: binaries and the outer invokers that reach them.
const entries = new Set<string>();
const binOwner = new Map<string, string>();
for (const u of units) {
  const abs = join(root, u.dir);
  if (u.kind === "cargo") {
    const t = Bun.TOML.parse(readFileSync(join(abs, "Cargo.toml"), "utf8")) as any;
    const bins: string[] = (t.bin ?? []).map((b: any) => b.name);
    if (existsSync(join(abs, "src/main.rs"))) bins.push(t.package?.name);
    if (existsSync(join(abs, "src/bin"))) for (const f of readdirSync(join(abs, "src/bin"))) bins.push(f.replace(/\.rs$/, ""));
    for (const b of bins.filter(Boolean)) (binOwner.set(b, u.dir), entries.add(u.dir));
    // cdylib / staticlib: loaded through FFI (bun:ffi, JNI, pyo3, C), an outer entry by construction.
    if ((t.lib?.["crate-type"] ?? []).some((c: string) => c === "cdylib" || c === "staticlib")) entries.add(u.dir);
  } else if (u.kind === "bun") {
    const j = JSON.parse(readFileSync(join(abs, "package.json"), "utf8"));
    // bin, an app, or a package script that runs one of its own files (`bun mirror.ts`).
    const ownScript = Object.values<string>(j.scripts ?? {}).some((s) => /^bun (run )?\.?\/?[\w./-]+\.(ts|js)\b/.test(s));
    if (j.bin || u.dir.startsWith("apps/") || ownScript) entries.add(u.dir);
    for (const b of typeof j.bin === "string" ? [u.name] : Object.keys(j.bin ?? {})) binOwner.set(b, u.dir);
  } else {
    const t = Bun.TOML.parse(readFileSync(join(abs, "pyproject.toml"), "utf8")) as any;
    if (t.project?.scripts || t.project?.["entry-points"]) entries.add(u.dir);
  }
}
// Test and bench units run under cargo test / cargo bench / bun test.
for (const u of units) if (/^(test|bench)\//.test(u.dir)) entries.add(u.dir);
// Deployed units: a Worker (wrangler config) or a cloud function is invoked by its platform.
for (const u of units)
  if (["wrangler.toml", "wrangler.jsonc", "wrangler.json", "cloudflare.config.ts", "function.yaml"].some((f) => existsSync(join(root, u.dir, f))) || /^device\/gcloud\/.*function/.test(u.dir)) entries.add(u.dir);
// justfile recipes: a virtual entry node dispatching to every unit path it names.
const justText = [join(root, "justfile"), ...readdirSync(root).filter((f) => f.endsWith(".just")).map((f) => join(root, f))]
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const JUST = "just";
for (const m of justText.matchAll(/((?:src|packages|apps|bench|test|scripts|build|device|prebuilts)\/[\w./-]+)/g)) {
  const t = ownerOf(m[1]!);
  if (t) addEdge(JUST, t, "dispatch");
}
// ay External routes resolve to the unit owning that binary; Package routes run packages/<name>/src/cli.ts.
const unresolved: string[] = [];
const ayLib = join(root, "system/ay/src/lib.rs");
if (existsSync(ayLib)) {
  const ayText = readFileSync(ayLib, "utf8");
  for (const m of ayText.matchAll(/Route::External\("([^"]+)"/g)) {
    const t = binOwner.get(m[1]!);
    if (t) addEdge("system/ay", t, "dispatch");
    else if (!["just"].includes(m[1]!)) unresolved.push(m[1]!);
  }
  for (const m of ayText.matchAll(/Route::Package\("([\w-]+)"/g)) {
    const t = ownerOf(`system/${m[1]}`) ?? ownerOf(`system/${m[1]}-ts`) ?? ownerOf(`frameworks/${m[1]}`) ?? ownerOf(`frameworks/${m[1]}-ts`);
    if (t) addEdge("system/ay", t, "dispatch");
  }
}
// CI workflows run units by path (`bun system/deploy/src/cli.ts`, `cargo test -p`), and the root uv
// workspace lists its Python members: both are outer invokers.
const CI = "ci";
const UV = "uv";
const wfDir = join(root, ".github/workflows");
if (existsSync(wfDir))
  for (const f of readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)))
    for (const m of readFileSync(join(wfDir, f), "utf8").matchAll(/((?:src|packages|apps|bench|test|scripts|build|device|prebuilts|tools)\/[\w./-]+)/g)) {
      const t = ownerOf(m[1]!);
      if (t) addEdge(CI, t, "dispatch");
    }
const rootPy = join(root, "pyproject.toml");
if (existsSync(rootPy))
  for (const mem of ((Bun.TOML.parse(readFileSync(rootPy, "utf8")) as any).tool?.uv?.workspace?.members ?? []) as string[]) {
    const t = ownerOf(mem);
    if (t) addEdge(UV, t, "dispatch");
  }

// --- Tree grouped by DEPS.rules layer.
const lang = (u: Unit) => (u.kind === "cargo" ? "rust" : u.kind === "bun" ? "typescript" : "python");
const domains = LAYERS.map((name, i) => ({
  id: `dom:L${i}`,
  name,
  kind: "domain",
  children: units.filter((u) => u.layer === i).map((u) => ({ id: u.dir, name: u.name, kind: "module", language: lang(u), loc: loc.get(u.dir) ?? 0, file: u.dir })),
}));
const unlayered = units.filter((u) => u.layer === null);
if (unlayered.length)
  domains.push({ id: "dom:none", name: "Unlayered", kind: "domain", children: unlayered.map((u) => ({ id: u.dir, name: u.name, kind: "module", language: lang(u), loc: loc.get(u.dir) ?? 0, file: u.dir })) });
const usedStores = STORES.filter((s) => [...edges.keys()].some((k) => k.split("|")[1] === s.id));
const tree = {
  id: "sys",
  name: "src",
  kind: "system",
  children: [
    ...domains.filter((d) => d.children.length),
    { id: "dom:entry", name: "Entry points", kind: "domain", children: [{ id: JUST, name: "justfile", kind: "job" }, { id: CI, name: "GitHub workflows", kind: "job" }, { id: UV, name: "uv workspace", kind: "job" }] },
    { id: "dom:data", name: "Data stores", kind: "domain", children: usedStores.map((s) => ({ id: s.id, name: s.name, kind: "datastore" })) },
  ],
};
entries.add(JUST);
entries.add(CI);
entries.add(UV);

const edgeList = [...edges.keys()].map((k) => {
  const [source, target, kind] = k.split("|");
  return { source: source!, target: target!, kind: kind! };
});
const inbound = new Map<string, number>();
for (const e of edgeList) if (e.kind === "call" || e.kind === "dispatch") inbound.set(e.target, (inbound.get(e.target) ?? 0) + 1);
// Dead ends: no inbound edge, not an entry point, and never named by another unit (dynamic use).
const deadEnds = units
  .filter((u) => !inbound.get(u.dir) && !entries.has(u.dir) && !(mentions.get(u.dir)?.size))
  .map((u) => u.dir)
  .sort();
const named = units.filter((u) => !inbound.get(u.dir) && !entries.has(u.dir) && mentions.get(u.dir)?.size).map((u) => u.dir);
if (named.length) console.log(`named only: ${named.join(", ")}`);

// --- Observations.
const top = [...inbound].filter(([k]) => byDir.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 5);
const cycles = findings.filter((f) => f.msg.startsWith("cycle"));
const clients = usedStores.map((s) => ({ s, n: edgeList.filter((e) => e.target === s.id).length })).sort((a, b) => b.n - a.n);
const bunCrates = units.filter((u) => u.name.startsWith("bun_")).length;
const observations = [
  `Most depended-on units (single points of failure): ${top.map(([k, n]) => `${byDir.get(k)!.name} (${n})`).join(", ")}.`,
  `${deadEnds.length} units have no inbound edge, no binary and are never named elsewhere: unwired candidates for wiring into ay or deletion.`,
  `${named.length} more units have no manifest or path edge but are named in other sources; their use is dynamic (FFI, generated code, docs) and is not counted dead.`,
  `${bunCrates} of ${units.filter((u) => u.kind === "cargo").length} Rust units are absorbed Bun crates (bun_*).`,
  clients.length ? `Units linking a data-store client (manifest dependency or Bun built-in API; read/write not measured): ${clients.map(({ s, n }) => `${s.name} ${n}`).join(", ")}.` : "No data-store client detected.",
  cycles.length ? `${cycles.length} dependency cycles reported by checkdeps.` : "No dependency cycle (checkdeps).",
  unresolved.length ? `ay External routes with no binary in the tree: ${unresolved.join(", ")}.` : "Every ay External route resolves to a binary in the tree.",
];

// --- Flows computed from the graph, nothing typed by hand: for every entry point, the shortest
// call/dispatch path to a data store; the three entries that reach the most units are kept.
const has = (id: string) => byDir.has(id) || id === JUST || id === CI || id === UV || id.startsWith("ds:");
const out_ = new Map<string, { to: string; kind: string }[]>();
for (const e of edgeList) (out_.get(e.source) ?? out_.set(e.source, []).get(e.source)!).push({ to: e.target, kind: e.kind });
const label = (id: string) => byDir.get(id)?.name ?? usedStores.find((s) => s.id === id)?.name ?? id;
const persona = (id: string) =>
  id === JUST ? "maintainer (just recipe)" : id === CI ? "CI (GitHub workflow)" : id === UV ? "Python user (uv workspace)" : id.startsWith("apps/") ? "app user" : "CLI or library user";
function pathTo(src: string) {
  const prev = new Map<string, string | null>([[src, null]]);
  const q = [src];
  for (let i = 0; i < q.length; i++)
    for (const { to } of out_.get(q[i]!) ?? [])
      if (!prev.has(to)) {
        prev.set(to, q[i]!);
        q.push(to);
      }
  const store = q.find((n) => n.startsWith("ds:"));
  const path: string[] = [];
  for (let n: string | null | undefined = store; n; n = prev.get(n)) path.unshift(n);
  return { reach: q.length - 1, path };
}
const flows = [...entries]
  .filter(has)
  .map((id) => ({ id, ...pathTo(id) }))
  .filter((r) => r.path.length >= 2)
  .sort((a, b) => b.reach - a.reach)
  .slice(0, 3)
  .map((r) => ({
    name: `${label(r.id)} to ${label(r.path.at(-1)!)}`,
    persona: persona(r.id),
    description: `Shortest dependency path from the entry point ${label(r.id)} (reaches ${r.reach} units) to the data store ${label(r.path.at(-1)!)}.`,
    steps: r.path.map((n, i) => ({ label: i ? `${label(r.path[i - 1]!)} uses ${label(n)}` : `Entry: ${label(n)}`, nodes: [n] })),
  }));

const topology = { system: "src monorepo", root: tree, edges: edgeList, entryPoints: [...entries].filter(has).sort(), deadEnds, observations, flows };
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "topology.json"), JSON.stringify(topology, null, 1) + "\n");

// --- Viewer (template injection, "<" ">" "&" escaped so no </script> breakout).
const viewer = opt("--viewer");
if (viewer && existsSync(viewer)) {
  const tpl = readFileSync(viewer, "utf8");
  const marker = "/*__TOPOLOGY_DATA__*/ null";
  if (!tpl.includes(marker)) throw new Error(`injection marker not found in ${viewer}`);
  const data = JSON.stringify(topology).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
  writeFileSync(join(out, "TOPOLOGY.html"), tpl.replace(marker, `/*__TOPOLOGY_DATA__*/ ${data}`));
}

// --- Mermaid at layer level (small and exportable).
const layerOf = (id: string) => (byDir.get(id)?.layer ?? null);
const lnode = (l: number | null) => (l === null ? "none" : `L${l}`);
const lcount = new Map<string, number>();
for (const e of edgeList)
  if ((e.kind === "call" || e.kind === "dispatch") && byDir.has(e.source) && byDir.has(e.target)) {
    const k = `${lnode(layerOf(e.source))}-->${lnode(layerOf(e.target))}`;
    lcount.set(k, (lcount.get(k) ?? 0) + 1);
  }
const mmdCall = ["graph TD", ...LAYERS.map((n, i) => `  L${i}["${n}"]`), `  just(["just / ay entry points"]):::entry`, `  just --> L5`, ...[...lcount].map(([k, n]) => `  ${k.replace("-->", ` -- ${n} --> `)}`), "  classDef entry fill:#ffd,stroke:#a80"].join("\n");
const lineage = new Map<string, number>();
for (const e of edgeList) if (e.target.startsWith("ds:")) {
  const k = `${lnode(layerOf(e.source))}|${e.target}|client`;
  lineage.set(k, (lineage.get(k) ?? 0) + 1);
}
const mmdData = ["graph LR", ...usedStores.map((s) => `  ${s.id.slice(3)}[("${s.name}")]`), ...[...lineage].map(([k, n]) => {
  const [l, s, kind] = k.split("|");
  return `  ${l} -- "${n} units link the client" --> ${s!.slice(3)}`;
})].join("\n");
const f0 = flows[0];
const mmdPath = f0 ? ["flowchart TD", ...f0.steps.map((s, i) => `  s${i}["${i + 1}. ${s.label}<br/>${s.nodes.join(", ")}"]`), ...f0.steps.slice(1).map((_, i) => `  s${i} --> s${i + 1}`), "  %% no telemetry wired: wall-clock not annotated"].join("\n") : "flowchart TD\n  none[no flow]";
writeFileSync(join(out, "call-graph.mmd"), mmdCall + "\n");
writeFileSync(join(out, "data-lineage.mmd"), mmdData + "\n");
writeFileSync(join(out, "critical-path.mmd"), mmdPath + "\n");

// --- Summary.
const kinds = edgeList.reduce<Record<string, number>>((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {});
console.log(`topology: ${units.length} units, ${edgeList.length} edges ${JSON.stringify(kinds)}, ${topology.entryPoints.length} entry points, ${deadEnds.length} dead ends -> ${relative(root, out)}`);
for (const d of domains.filter((d) => d.children.length)) console.log(`  ${d.name}: ${d.children.length} units, ${d.children.reduce((a, c) => a + (c.loc ?? 0), 0)} loc`);
for (const o of observations) console.log(`- ${o}`);
console.log(`dead ends: ${deadEnds.join(" ")}`);
