// Map of the Bun Rust crates of the fork (third_party/bun) for `ay`: which crates exist, their workspace dependency
// edges, which reach JavaScriptCore or the JS parser, and the edges to cut so the non-JS features build without them.
// Generated, never hand-written: `bun scripts/ay-bun-map.ts [--write] [--json]`.
// Source: <fork>/Cargo.toml (workspace.dependencies) and every <fork>/src/**/Cargo.toml (the Bun upstream layout).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fork = join(root, "third_party", "bun");
const outJson = join(root, "docs", "native", "deps", "ay-bun-crates.json");
const outMd = join(root, "docs", "native", "deps", "ay-bun-crates.md");

/** Crates that carry JavaScriptCore (the engine and everything that embeds it). */
const JSC_ROOTS = (name: string): boolean =>
  /^bun_(jsc|runtime|executable|webcore|bake|node_fallbacks_jsc)$/.test(name) || /_jsc$/.test(name);
/** Crates that carry the JS/TS language front end (parser, printer, transpiler, bundler, JS AST, module resolution of JS). */
const JS_ROOTS = (name: string): boolean => /^bun_(js_parser|js_printer|transpiler|bundler|react_compiler|sema.*|lint.*)$/.test(name);

type Crate = { name: string; dir: string; manifest: string; deps: string[] };

function walk(dir: string, found: string[]): void {
  for (const e of readdirSync(dir)) {
    if (e === "target" || e === "node_modules" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, found);
    else if (e === "Cargo.toml") found.push(p);
  }
}

function load(): Crate[] {
  const rootToml = Bun.TOML.parse(readFileSync(join(fork, "Cargo.toml"), "utf8")) as any;
  const wsDeps: Record<string, any> = rootToml.workspace?.dependencies ?? {};
  const pkgOf = (key: string, spec: any): string => (spec && typeof spec === "object" && spec.package) || wsDeps[key]?.package || key;
  const files: string[] = [];
  walk(join(fork, "src"), files);
  const crates: Crate[] = [];
  for (const f of files) {
    const t = Bun.TOML.parse(readFileSync(f, "utf8")) as any;
    const name = t.package?.name;
    if (!name) continue;
    const tables: any[] = [t.dependencies ?? {}, t["build-dependencies"] ?? {}];
    for (const tgt of Object.values<any>(t.target ?? {})) tables.push(tgt.dependencies ?? {});
    const deps = new Set<string>();
    for (const tbl of tables) for (const [k, spec] of Object.entries(tbl)) deps.add(pkgOf(k, spec));
    crates.push({ name, dir: relative(root, join(f, "..")).replaceAll("\\", "/"), manifest: relative(root, f).replaceAll("\\", "/"), deps: [...deps].sort() });
  }
  return crates.sort((a, b) => a.name.localeCompare(b.name));
}

const crates = load();
const byName = new Map(crates.map((c) => [c.name, c]));
const internal = (c: Crate) => c.deps.filter((d) => byName.has(d));

/** Shortest dependency path from `from` to any crate matching `isRoot` (BFS over internal edges). */
function pathTo(from: string, isRoot: (n: string) => boolean): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur !== from && isRoot(cur)) {
      const p: string[] = [];
      for (let n: string | null = cur; n; n = prev.get(n) ?? null) p.unshift(n);
      return p;
    }
    for (const d of internal(byName.get(cur)!)) if (!prev.has(d)) (prev.set(d, cur), queue.push(d));
  }
  return null;
}

const rows = crates.map((c) => {
  const jscPath = JSC_ROOTS(c.name) ? [c.name] : pathTo(c.name, JSC_ROOTS);
  const jsPath = JS_ROOTS(c.name) ? [c.name] : pathTo(c.name, JS_ROOTS);
  return {
    crate: c.name,
    dir: c.dir,
    internalDeps: internal(c),
    externalDeps: c.deps.filter((d) => !byName.has(d)).length,
    jsc: JSC_ROOTS(c.name) ? "root" : jscPath ? "reaches" : "clean",
    js: JS_ROOTS(c.name) ? "root" : jsPath ? "reaches" : "clean",
    jscPath: jscPath && jscPath.length > 1 ? jscPath : undefined,
    jsPath: jsPath && jsPath.length > 1 ? jsPath : undefined,
  };
});

/** Direct edges from a non-root crate into a root: the cuts (or the `_jsc` split already made upstream). */
const cuts = {
  jsc: crates.flatMap((c) => (JSC_ROOTS(c.name) ? [] : internal(c).filter(JSC_ROOTS).map((to) => ({ from: c.name, to })))),
  js: crates.flatMap((c) => (JS_ROOTS(c.name) || JSC_ROOTS(c.name) ? [] : internal(c).filter(JS_ROOTS).map((to) => ({ from: c.name, to })))),
};

/** Crates the ay core wants (Bun's non-JS features); the generator reports their cleanliness, it does not pick them. */
const WANTED = ["bun_install", "bun_semver", "bun_spawn", "bun_http", "bun_s3_signing", "bun_sql", "bun_valkey", "bun_archive", "bun_tar", "bun_glob", "bun_watcher", "bun_ini", "bun_dotenv", "bun_which", "bun_url", "bun_patch", "bun_shell_parser", "bun_clap", "bun_bunfig", "bun_paths", "bun_sys", "bun_wyhash", "bun_histogram", "bun_md", "bun_zstd", "bun_brotli", "bun_zlib", "bun_dns", "bun_router", "bun_csrf"];

const data = {
  generator: "scripts/ay-bun-map.ts",
  fork: relative(root, fork).replaceAll("\\", "/"),
  crateCount: crates.length,
  summary: {
    jscRoots: rows.filter((r) => r.jsc === "root").map((r) => r.crate),
    jsRoots: rows.filter((r) => r.js === "root").map((r) => r.crate),
    clean: rows.filter((r) => r.jsc === "clean" && r.js === "clean").length,
    jscClean: rows.filter((r) => r.jsc === "clean").length,
  },
  wanted: WANTED.map((n) => rows.find((r) => r.crate === n) ?? { crate: n, missing: true }),
  cuts,
  crates: rows,
};

if (process.argv.includes("--json")) console.log(JSON.stringify(data, null, 2));

function md(): string {
  const L: string[] = [];
  L.push("# Bun crates of the fork, as seen by ay", "", "Generated by `bun scripts/ay-bun-map.ts --write`; do not edit by hand.", "");
  L.push(`Fork checkout: \`${data.fork}\` (${data.crateCount} crates). JSC roots: ${data.summary.jscRoots.length}; JS front-end roots: ${data.summary.jsRoots.length}.`);
  L.push(`Crates with no path to JSC: ${data.summary.jscClean}; with no path to JSC or the JS front end: ${data.summary.clean}.`, "");
  L.push("## Wanted by the ay core", "", "| crate | JSC | JS front end | path to the JS front end |", "|---|---|---|---|");
  for (const w of data.wanted as any[]) L.push(w.missing ? `| ${w.crate} | absent | absent | |` : `| ${w.crate} | ${w.jsc} | ${w.js} | ${(w.jsPath ?? []).join(" > ")} |`);
  L.push("", "## Direct edges into JSC (to cut or already split into `_jsc` crates)", "");
  L.push(...(cuts.jsc.length ? cuts.jsc.map((e) => `- ${e.from} -> ${e.to}`) : ["none"]));
  L.push("", "## Direct edges into the JS front end", "", ...(cuts.js.length ? cuts.js.map((e) => `- ${e.from} -> ${e.to}`) : ["none"]));
  L.push("", "## All crates", "", "| crate | dir | JSC | JS | internal deps |", "|---|---|---|---|---|");
  for (const r of rows) L.push(`| ${r.crate} | ${r.dir.replace(/^third_party\/bun\//, "")} | ${r.jsc} | ${r.js} | ${r.internalDeps.length} |`);
  return L.join("\n") + "\n";
}

if (process.argv.includes("--write")) {
  writeFileSync(outJson, JSON.stringify(data, null, 2) + "\n");
  writeFileSync(outMd, md());
  console.log(`wrote ${relative(root, outJson)} and ${relative(root, outMd)} (${crates.length} crates)`);
} else if (!process.argv.includes("--json")) {
  console.log(md());
}
