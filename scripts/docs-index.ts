// Generated docs index: docs/README.md is written from the markdown files of docs/ (title, one line, link).
//
//   bun scripts/docs-index.ts            write docs/README.md
//   bun scripts/docs-index.ts --check    exit 1 when docs/README.md differs from the tree (CI)
//
// Title: front-matter `title`, else the first `# ` heading, else the file name. One line: the first prose line after the
// title, cut at the first sentence end. Nothing typed by hand: no count, date or version goes into the output.
// Front matter, headings and paragraphs are nodes of the Markdown grammar (tree-sitter through `aphrody-code query`): a `# `
// inside a code fence is not a heading, a paragraph inside a list or a quote is not the summary. Where ay is absent the
// line scanner (describeLines) produces the index.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { captures, factsOfSources, type FileFacts } from "./ay-facts.ts";

const root = join(import.meta.dir, "..").replaceAll("\\", "/");
const docs = join(root, "docs").replaceAll("\\", "/");
const OUT = join(docs, "README.md");
const SKIP = new Set(["README.md", "node_modules", "graph"]); // graph/: generated graph reports

// Committed files only (HEAD): the output must not depend on the working tree of one machine.
const walk = (_dir: string): string[] =>
  Bun.spawnSync(["git", "-C", root, "ls-tree", "-r", "-z", "--name-only", "HEAD", "--", "docs"])
    .stdout.toString()
    .split("\0")
    .filter((p) => /\.mdx?$/.test(p) && p !== "docs/README.md" && !p.split("/").some((s) => SKIP.has(s) || s.startsWith(".")))
    .map((p) => `${root}/${p}`)
    .sort();

const clean = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\|/g, "/")
    .trim();

const headText = (file: string): string =>
  Bun.spawnSync(["git", "-C", root, "show", `HEAD:${file.slice(root.length + 1)}`]).stdout.toString().replace(/\r\n/g, "\n");

const baseName = (file: string) => file.slice(file.lastIndexOf("/") + 1).replace(/\.mdx?$/, "");
const finish = (file: string, title: string, line: string) => {
  const cut = line.search(/[.:;]\s/);
  if (cut > 20) line = line.slice(0, cut);
  if (line.length > 120) line = `${line.slice(0, 117).trimEnd()}...`;
  return { title: clean(title) || baseName(file), line: line.replace(/[.:;]$/, "") };
};
const EMBED = /^(!\[|\[!|:::|<)/;

function describeNodes(file: string, ff: FileFacts): { title: string; line: string } {
  let title = "";
  let from = 0;
  const fm = captures(ff, "frontmatter")[0];
  if (fm) {
    try {
      const y = Bun.YAML.parse(fm.t.replace(/^---[ \t]*\n/, "").replace(/\n?---[ \t]*\n?$/, "")) as { title?: unknown } | null;
      if (typeof y?.title === "string") title = y.title;
    } catch {}
    from = fm.e;
  }
  if (!title) {
    const h1 = captures(ff, "heading").find((h) => /^#[ \t]+\S/.test(h.t) || /\n=+[ \t]*\n?$/.test(h.t));
    if (h1) {
      title = h1.t.split("\n")[0]!.replace(/^#[ \t]+/, "");
      from = h1.e;
    }
  }
  let line = "";
  for (const p of captures(ff, "paragraph")) {
    if (p.s < from || (p.k !== "section" && p.k !== "document")) continue;
    for (const l of p.t.split("\n")) {
      if (EMBED.test(l.trim())) continue;
      line = clean(l);
      if (line) break;
    }
    if (line) break;
  }
  return finish(file, title, line);
}

function describeLines(file: string, text: string): { title: string; line: string } {
  let body = text;
  let title = "";
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    title = fm[1]!.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
    body = text.slice(fm[0].length);
  }
  const lines = body.split("\n");
  let i = 0;
  if (!title) {
    i = lines.findIndex((l) => /^# \S/.test(l));
    title = i >= 0 ? lines[i]!.slice(2) : "";
  }
  let inCode = false;
  let line = "";
  for (const l of lines.slice(Math.max(i + 1, 0))) {
    if (/^\s*```/.test(l)) inCode = !inCode;
    if (inCode || !l.trim() || /^(#|\||>|-{3}|\s*[-*+]\s|\s*\d+\.\s|<|!\[|\[!|:::)/.test(l.trim())) continue;
    line = clean(l);
    if (line) break;
  }
  return finish(file, title, line);
}

function render(): string {
  const groups = new Map<string, string[]>();
  const files = walk(docs);
  const texts = new Map(files.map((f) => [f, headText(f)]));
  const facts = factsOfSources(new Map([...texts].map(([f, t]) => [posix.relative(root, f), t])), ["frontmatter", "heading", "paragraph"]);
  for (const f of files) {
    const rel = posix.relative(docs, f);
    const top = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : ".";
    const ff = facts?.get(posix.relative(root, f));
    const d = ff && !ff.error ? describeNodes(f, ff) : describeLines(f, texts.get(f)!);
    const row = `- [${d.title.replace(/[\[\]]/g, "")}](${encodeURI(rel)})${d.line ? `: ${d.line}` : ""}`;
    (groups.get(top) ?? groups.set(top, []).get(top)!).push(row);
  }
  const out = [
    "# docs",
    "",
    "Generated by `bun scripts/docs-index.ts` from the markdown files of this directory; CI runs it with `--check`. Edit a document, not this index.",
    "",
  ];
  const order = [...groups.keys()].sort((a, b) => (a === "." ? -1 : b === "." ? 1 : a.localeCompare(b)));
  for (const k of order) {
    out.push(k === "." ? "## Top level" : `## ${k}`, "", ...groups.get(k)!, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

const next = render();
if (Bun.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (cur !== next) {
    console.error("docs/README.md is out of date: run `bun scripts/docs-index.ts`");
    process.exit(1);
  }
  console.log("docs index: up to date");
} else {
  writeFileSync(OUT, next);
  console.log(`docs index: ${next.split("\n").length} lines`);
}
