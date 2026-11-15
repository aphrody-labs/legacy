#!/usr/bin/env bun
// Compiles rules/*.md (sorted by the section prefixes of rules/_sections.md) into AGENTS.md.
//   bun .agents/skills/axum/scripts/compile.ts [--check]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const rulesDir = join(root, "rules");
const sections = readFileSync(join(rulesDir, "_sections.md"), "utf8");
const prefixes = [...sections.matchAll(/`([a-z]+-)`/g)].map((m) => m[1]!);
const files = readdirSync(rulesDir).filter(
  (f) => f.endsWith(".md") && !f.startsWith("_"),
);
const rank = (f: string) => prefixes.findIndex((p) => f.startsWith(p));
files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const body = files.map((f) =>
  readFileSync(join(rulesDir, f), "utf8")
    .replace(/^---[\s\S]*?---\n+/, "")
    .trim(),
);
const meta = JSON.parse(readFileSync(join(root, "metadata.json"), "utf8")) as {
  abstract: string;
};
const out = `# Axum rules (compiled)\n\nGenerated from \`rules/\` by \`scripts/compile.ts\`; edit the rules, not this file.\n\n${meta.abstract}\n\n${sections.replace(/^# Sections\n+/, "## Sections\n\n").trim()}\n\n${body.join("\n\n---\n\n")}\n`;
const target = join(root, "AGENTS.md");
if (Bun.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== out) {
    console.error(
      "AGENTS.md is stale: bun .agents/skills/axum/scripts/compile.ts",
    );
    process.exit(1);
  }
} else writeFileSync(target, out);
console.log(`${files.length} rules`);
