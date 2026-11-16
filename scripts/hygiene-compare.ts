// Proof of the tree-sitter hygiene rules against the line scanners on the whole tracked tree.
//
//   bun scripts/hygiene-compare.ts [--rule id[,id]] [--samples N] [--root dir]
//
// For each rule that reads tree-sitter nodes (node-builtin, literal-identity, personal-data, non-english) the same files
// are scanned with engine "lines" (the former rule: one regex or predicate per physical line) and engine "ast"
// (`aphrody-code query`). Prints, per rule: hits of both engines, the common ones, the ones only the line scanner found (a
// match outside a string, a comment or an import: identifier, regex literal, test table) and the ones only the tree found.
import { RULES, scan, type Hit } from "./hygiene.ts";

const a = Bun.argv.slice(2);
const opt = (k: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
const root = opt("--root") ?? import.meta.dir.replace(/[\\/]scripts$/, "");
const samples = Number(opt("--samples") ?? 5);
const ids = opt("--rule")?.split(",") ?? RULES.filter((r) => r.scope || r.ast).map((r) => r.id);
const key = (h: Hit) => `${h.file}:${h.line}`;

for (const id of ids) {
  const t0 = performance.now();
  const lines = scan(root, { rules: [id], engine: "lines" });
  const t1 = performance.now();
  const ast = scan(root, { rules: [id], engine: "ast" });
  const t2 = performance.now();
  const inAst = new Set(ast.map(key));
  const inLines = new Set(lines.map(key));
  const common = lines.filter((h) => inAst.has(key(h)));
  const lineOnly = lines.filter((h) => !inAst.has(key(h)));
  const astOnly = ast.filter((h) => !inLines.has(key(h)));
  console.log(
    `${id}: lines ${lines.length} (${lines.length ? new Set(lines.map((h) => h.file)).size : 0} files, ${Math.round(t1 - t0)} ms)` +
      `  ast ${ast.length} (${new Set(ast.map((h) => h.file)).size} files, ${Math.round(t2 - t1)} ms)` +
      `  common ${common.length}  lines-only ${lineOnly.length}  ast-only ${astOnly.length}`,
  );
  for (const [label, rows] of [["lines-only", lineOnly], ["ast-only", astOnly]] as const)
    for (const h of rows.slice(0, samples)) console.log(`  ${label}  ${h.file}:${h.line}  ${h.text.slice(0, 110)}`);
}
