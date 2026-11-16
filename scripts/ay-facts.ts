// Source facts through `aphrody-code query` (or `ay code query`): comments, strings, imports, calls (code) and headings, paragraphs (Markdown)
// as tree-sitter nodes, from the one engine of system/core (system/core/src/facts.rs; queries in system/core/queries/facts).
// Analysis lives in Rust; the tools in this directory keep their rules and call this module for the nodes.
// Every function returns undefined when `ay` (or its `code query` command) is absent, and the caller keeps its own
// scanner as the fallback: a tool must still run where ay is not built.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Capture = { n: string; l: number; el: number; s: number; e: number; t: string; k: string };
export type FileFacts = {
  file: string;
  lang: string;
  error: string | null;
  has_error: boolean;
  matches: { p: number; c: Capture[] }[];
};

/** Files that the facts layer parses as code (the dedicated grammars of system/core with comments and strings). */
export const CODE_FACTS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|py|pyi|sh|bash|c|h|cc|cpp|cxx|hpp|go|lua)$/;

type Runner = { bin: string; prefix: string[] };
let resolved: Runner | null | undefined;
/**
 * The program that answers `query`: `aphrody-code` (cargo build -p aphrody-core --features cli; $APHRODY_CODE_BIN, the
 * cargo target of this checkout, PATH), else `ay code` ($AY_BIN, the cargo target, PATH). `ay code` runs it once the ay crate embeds `aphrody_core::cli::Cmd`.
 */
export function runner(root: string): Runner | undefined {
  if (process.env.APHRODY_FACTS === "off") return undefined; // the callers' line scanners, for comparison
  if (resolved !== undefined) return resolved ?? undefined;
  const ext = process.platform === "win32" ? ".exe" : "";
  const targets = [process.env.CARGO_TARGET_DIR, join(root, "target")].filter((t): t is string => !!t);
  const dirs = targets.flatMap((t) => [join(t, "release"), join(t, "debug")]);
  const candidates: Runner[] = [
    { bin: process.env.APHRODY_CODE_BIN ?? "", prefix: ["query"] },
    ...dirs.map((d) => ({ bin: join(d, `aphrody-code${ext}`), prefix: ["query"] })),
    { bin: Bun.which("aphrody-code") ?? "", prefix: ["query"] },
    { bin: process.env.AY_BIN ?? "", prefix: ["code", "query"] },
    ...dirs.map((d) => ({ bin: join(d, `ay${ext}`), prefix: ["code", "query"] })),
    { bin: Bun.which("ay") ?? "", prefix: ["code", "query"] },
  ];
  for (const c of candidates) {
    if (!c.bin || !existsSync(c.bin)) continue;
    const r = Bun.spawnSync([c.bin, ...c.prefix, "--help"], { stdout: "ignore", stderr: "ignore" });
    if (r.exitCode === 0) return (resolved = c);
  }
  resolved = null;
  return undefined;
}
export const ayBinary = (root: string): string | undefined => runner(root)?.bin;

/** Facts of `files` (paths relative to `root`), one `query` call, parsed in parallel; a result cache under var/cache/facts (APHRODY_FACTS_CACHE=off disables, = a path moves it) means an unchanged file is not parsed again. */
export function factsOf(
  root: string,
  files: string[],
  only: string[] = [],
  maxBytes = 512_000,
  cache: string | undefined = join(root, "var", "cache", "facts"),
  query?: string,
): Map<string, FileFacts> | undefined {
  const run = runner(root);
  if (!run) return undefined;
  const out = new Map<string, FileFacts>();
  if (!files.length) return out;
  const args = [...run.prefix, "-", "--max-bytes", String(maxBytes), ...(cache && process.env.APHRODY_FACTS_CACHE !== "off" ? ["--cache", process.env.APHRODY_FACTS_CACHE ?? cache] : []), ...(query ? ["--query", query] : []), ...(only.length ? ["--only", only.join(",")] : [])];
  const r = Bun.spawnSync([run.bin, ...args], { cwd: root, stdin: Buffer.from(files.join("\0")), stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) return undefined;
  for (const line of r.stdout.toString().split("\n")) {
    if (!line) continue;
    const ff = JSON.parse(line) as FileFacts;
    out.set(ff.file, ff);
  }
  return out;
}

/** Facts of sources that are not on disk (a git blob, generated text): written to a scratch directory, parsed, removed. */
export function factsOfSources(sources: Map<string, string>, only: string[] = []): Map<string, FileFacts> | undefined {
  const dir = mkdtempSync(join(tmpdir(), "ay-facts-"));
  try {
    for (const [name, text] of sources) {
      const p = join(dir, name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text);
    }
    return factsOf(dir, [...sources.keys()], only, 64_000_000, join(tmpdir(), "aphrody-facts-cache"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const captures = (ff: FileFacts, name: string): Capture[] =>
  ff.matches.flatMap((m) => m.c).filter((c) => c.n === name);

/** Outermost captures of `kinds`, in source order (a string inside a template substitution is part of its parent). */
export function outermost(ff: FileFacts, kinds: string[]): Capture[] {
  const all = ff.matches.flatMap((m) => m.c).filter((c) => kinds.includes(c.n)).sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Capture[] = [];
  let end = -1;
  for (const c of all) {
    if (c.s >= end) {
      out.push(c);
      end = c.e;
    }
  }
  return out;
}

/** The lines of every comment and string: [1-based line, kind, text of that line]. */
export function segmentLines(ff: FileFacts, kinds: ("comment" | "string")[]): [number, "comment" | "string", string][] {
  const rows: [number, "comment" | "string", string][] = [];
  for (const c of outermost(ff, kinds)) c.t.split("\n").forEach((t, i) => rows.push([c.l + i, c.n as "comment" | "string", t]));
  return rows;
}

/** Text of a comment line without its markers; of a string line without the quotes of its first and last line. */
export function innerText(kind: "comment" | "string", text: string): string {
  if (kind === "comment") return text.replace(/^\s*(?:\/\/+[/!]?|\/\*+!?|\*(?!\/)|#+|--+(?:\[=*\[)?)\s?/, "").replace(/\s*\*+\/\s*$/, "").trim();
  return text.replace(/^[\s]*(?:[rbfRBF]{0,2}|r#*|b)?(?:"""|'''|["'`])/, "").replace(/(?:"""|'''|["'`])#*\s*$/, "");
}
