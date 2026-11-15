// Generates docs/project/naming.md from scripts/naming-inventory.ts: scheme, counts, names breaking it, blast radius.
// Usage: bun scripts/naming-check.ts [--write]   (without --write: prints to stdout)
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
const inv = spawnSync("bun", [`${root}/scripts/naming-inventory.ts`], { encoding: "utf8", maxBuffer: 1 << 28 });
const e: { kind: string; name: string; path: string; extra?: string }[] = JSON.parse(inv.stdout);
const identity = Bun.TOML.parse(await Bun.file(`${root}/tools/identity.toml`).text()) as any;
const prefix: string = identity.naming.crate_prefix;
const scope: string = identity.naming.npm_scope;
const cliCrate: string = identity.cli.crate;
const historical = new Set(Object.keys(identity.naming.crate_names ?? {}));

const refs = (tok: string) => {
  const r = spawnSync("git", ["-C", root, "grep", "-I", "-l", "-w", "-F", "--", tok, "--", ":!third_party", ":!Cargo.lock", ":!docs/project/naming.md"], { encoding: "utf8", maxBuffer: 1 << 28 });
  return r.stdout.split("\n").filter(Boolean).length;
};

const kinds = [...new Set(e.map(x => x.kind))].sort();
const counts = kinds.map(k => `| ${k} | ${e.filter(x => x.kind === k).length} |`).join("\n");

// 1. Cargo package vs directory (apps/auto is a separate product with its own workspace, bun_* is the upstream Bun namespace).
const cargoBad: string[][] = [];
for (const x of e.filter(x => x.kind === "cargo-package" && !x.path.startsWith("apps/auto/"))) {
  if (/^bun_/.test(x.name) || x.name === "reedline") continue;
  const seg = x.path.replace(/\/Cargo\.toml$/, "").split("/");
  const b = seg.at(-1)!, dir = seg.length > 1 ? seg.slice(1).join("-") : b;
  const ok = new Set([b, prefix + b, dir, prefix + dir, b.replace(/_/g, "-"), prefix + b.replace(/_/g, "-")]);
  if (ok.has(x.name)) continue;
  const target = prefix + (dir.startsWith("wayland-") ? dir : dir);
  cargoBad.push([x.name, seg.join("/"), target, String(refs(x.name)), x.name === cliCrate ? "identity.toml [cli].crate" : historical.has(b) || [...historical].some(h => identity.naming.crate_names[h] === x.name) ? "identity.toml [naming.crate_names]" : ""]);
}

// 2. npm names outside the scope (apps/auto and skill fixtures are separate products or upstream samples).
const npmBad: string[][] = [];
for (const x of e.filter(x => x.kind === "npm-package")) {
  if (/^(apps\/auto\/|src\/(runtime|niubash|node-fallbacks|rubash)\/|\.agents\/skills\/)/.test(x.path)) continue;
  const dir = x.path.replace(/\/package\.json$/, "").split("/").at(-1)!;
  if (x.path === "package.json") continue;
  if (!x.name.startsWith(scope + "/")) npmBad.push([x.name, x.path, `${scope}/${dir}`, String(refs(x.name))]);
  else if (x.name.slice(scope.length + 1) !== dir) npmBad.push([x.name, x.path, `${scope}/${dir}`, String(refs(x.name))]);
}

// 3. Synonym groups: one concept, one name. canonical first.
const groups: [string, string, string[]][] = [
  ["flag", "--out", ["--out", "--output", "--output-json"]],
  ["flag", "--runs", ["--runs", "--run", "--iterations"]],
  ["flag", "--timeout", ["--timeout", "--timeout-ms", "--time-limit-mins"]],
  ["flag", "--write", ["--write", "--apply"]],
  ["flag", "--dry-run", ["--dry-run", "--no-write"]],
  ["subcommand", "update", ["up", "bump", "self-update", "update"]],
  ["subcommand", "shell", ["sh", "shell", "shell-matrix"]],
  ["subcommand", "sync", ["sync", "pull", "fetch"]],
  ["subcommand", "list", ["ls", "list"]],
];
const syn: string[][] = [];
for (const [kind, canon, names] of groups) {
  const pool = e.filter(x => (kind === "flag" ? x.kind === "clap-flag" : x.kind === "clap-subcommand") && names.includes(x.name));
  const found = [...new Set(pool.map(x => x.name))];
  if (found.filter(n => n !== canon).length === 0) continue;
  for (const n of found.filter(n => n !== canon)) {
    syn.push([kind, n, canon, [...new Set(pool.filter(x => x.name === n).map(x => x.path))].join(", "), String(refs(n))]);
  }
}

// 4. Codename subcommands/bins (a name that does not say its domain).
const codename = new Set(["omarchy", "forge", "fabric", "low", "niu", "gnu", "jules", "scope", "wslg-rs", "gamescope-rs", "py2bun-rs"]);
const code = e.filter(x => ["clap-subcommand", "cargo-bin"].includes(x.kind) && codename.has(x.name)).map(x => [x.kind, x.name, x.path, String(refs(x.name))]);

// 5. Bin names: snake_case or an -rs suffix or an identity prefix on a binary.
const binBad = e.filter(x => x.kind === "cargo-bin" && !x.path.startsWith("apps/auto/") && (/_/.test(x.name) || /-rs$/.test(x.name) || x.name.startsWith(prefix) || x.name.startsWith("bun-"))).map(x => [x.name, x.path, x.name.replace(/_/g, "-").replace(/-rs$/, ""), String(refs(x.name))]);

// 6. CI workflow names vs file stems.
const ciBad = e.filter(x => x.kind === "ci-workflow").filter(x => {
  const stem = x.path.split("/").pop()!.replace(/\.ya?ml$/, "");
  return x.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") !== stem;
}).map(x => [x.name, x.path]);

// 7. MCP tools: <server>__<verb>_<noun>.
const verbs = new Set("add ask call get list parse query index run search send view use register sync info read write audit validate migrate transform analyze optimize bench decompile ingest status inventory transpile generate".split(" "));
const mcpBad = e.filter(x => x.kind === "mcp-tool" && !verbs.has(x.name.split("_")[0])).map(x => [x.name, x.path]);
const mcpAll = e.filter(x => x.kind === "mcp-tool").length;

const table = (head: string[], rows: string[][]) =>
  rows.length ? `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map(r => `| ${r.map(c => c.replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")}\n` : "None.\n";

const total = e.length;
const breaking = cargoBad.length + npmBad.length + syn.length + code.length + binBad.length + ciBad.length + mcpBad.length;

const md = `# Naming

Generated by \`bun scripts/naming-check.ts --write\` from \`bun scripts/naming-inventory.ts\` (static scan of manifests, clap derive definitions, justfiles, workflows). Do not edit the tables by hand. The identity values (product, binary, scope, crate prefix) are variables in \`tools/identity.toml\`; this file never writes them as literals except in generated rows.

## Rules

1. Subcommands are one lowercase English word, a domain (\`ay arch\`, \`ay deploy\`) or a verb (\`ay sync\`); a sub-level under a domain is a verb. One concept, one name: no synonym, no alias except a recorded legacy alias.
2. No codename: a command, binary or crate name says its domain. Upstream names stay as they are (rule 7).
3. Crates: \`<crate_prefix><domain>\` with the directory name equal to the package name (nested: \`<crate_prefix><parent>-<child>\`); the lib name is the package name with \`-\` turned into \`_\` (Rust API Guidelines, naming: snake_case for items; Cargo accepts kebab package names). A bin named \`<binary>\` is the multicall CLI; other bins are \`<domain>\` kebab-case, without \`-rs\`, without snake_case.
4. npm: \`<npm_scope>/<directory name>\`; the bin names follow rule 3.
5. Flags: long kebab-case (GNU getopt_long, POSIX utility syntax, clig.dev), short forms only for common ones (\`-h\`, \`-V\`, \`-v\`, \`-q\`, \`-n\` for dry run, \`-o\` for out); the same flag for the same concept across subcommands (\`--out\`, \`--runs\`, \`--timeout\`, \`--write\`, \`--dry-run\`; units in the value, not in the flag name).
6. MCP tools: registered as \`<verb>_<noun>\` inside a server, exposed by the hub as \`<server>__<verb>_<noun>\`. Just recipes: \`<domain>-<verb>\`, kebab-case. CI workflow \`name:\` equals the file stem.
7. Upstream namespaces are never renamed: \`bun_*\` crates in the Bun upstream layout, win32, ffmpeg, Chromium, upstream crates and packages, Python (PEP 8: lowercase, underscores for modules) and Go (short lowercase package names) module names of upstream projects.
8. A legacy name stays a hidden alias for one release cycle when users or scripts call it, and is recorded in the alias table below.

Sources: Bun CLI (\`bun <verb>\`), Cargo (\`cargo <verb>\`), Rust API Guidelines (naming), GNU getopt_long and POSIX utility conventions, clig.dev, npm scope rules, PEP 8, Effective Go package names. The live read of these pages was not done in the session that generated this file (network timeout); rules 1 to 8 are the repository's choices based on them, to be confirmed against the sources when the first batch is executed.

## Inventory (generated)

| Kind | Names |
|---|---|
${counts}
| total | ${total} |

Names breaking the scheme: ${breaking} rows below (a name can appear in two tables). Synonym rows are candidates: the semantics of each subcommand are confirmed before its batch. apps/auto (own workspace and scope) and the \`bun_*\` crates are excluded from the diff.

## Cargo packages: directory and prefix

${table(["Name", "Path", "Target", "Files referencing", "Recorded"], cargoBad)}
## npm names

${table(["Name", "Path", "Target", "Files referencing"], npmBad)}
## CLI synonyms (one concept, one name)

${table(["Kind", "Name", "Canonical", "Defined in", "Files referencing"], syn)}
## Codenames

${table(["Kind", "Name", "Path", "Files referencing"], code)}
## Bin names

${table(["Name", "Path", "Target", "Files referencing"], binBad)}
## CI workflow names versus file stems

${table(["Workflow name", "Path"], ciBad)}
## MCP tools whose registered name does not start with a verb (${mcpBad.length} of ${mcpAll})

${table(["Name", "Path"], mcpBad)}
## Legacy aliases

None recorded yet: no rename has been executed.
`;

if (process.argv.includes("--write")) await Bun.write(`${root}/docs/project/naming.md`, md);
else console.log(md);
console.error(`inventory=${total} breaking=${breaking}`);
