import { describe, expect, test } from "bun:test";
import { ayBinary, factsOf, innerText, outermost, segmentLines, type Capture, type FileFacts } from "./ay-facts.ts";
import { nodeBuiltinLines, scan } from "./hygiene.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cap = (n: string, t: string, l: number, s: number): Capture => ({ n, t, l, el: l, s, e: s + t.length, k: "" });
const facts = (...matches: Capture[][]): FileFacts => ({
  file: "a.ts",
  lang: "typescript",
  error: null,
  has_error: false,
  matches: matches.map((c, p) => ({ p, c })),
});

describe("facts helpers", () => {
  test("outermost drops a string nested in a template string", () => {
    const ff = facts([cap("string", "`a ${'b'} c`", 1, 0)], [cap("string", "'b'", 1, 6)], [cap("string", "'z'", 2, 20)]);
    expect(outermost(ff, ["string"]).map((c) => c.t)).toEqual(["`a ${'b'} c`", "'z'"]);
  });

  test("segment lines keep their physical line numbers", () => {
    const ff = facts([cap("comment", "/* a\n b */", 3, 0)], [cap("string", '"x"', 5, 30)]);
    expect(segmentLines(ff, ["comment", "string"])).toEqual([
      [3, "comment", "/* a"],
      [4, "comment", " b */"],
      [5, "string", '"x"'],
    ]);
    expect(segmentLines(ff, ["string"]).length).toBe(1);
  });

  test("inner text strips comment markers and quotes", () => {
    expect(innerText("comment", "// note here")).toBe("note here");
    expect(innerText("comment", "/** doc */")).toBe("doc");
    expect(innerText("comment", " * line")).toBe("line");
    expect(innerText("comment", "# shell")).toBe("shell");
    expect(innerText("string", '"hello"')).toBe("hello");
    expect(innerText("string", "`tpl`")).toBe("tpl");
  });
});

describe("node-builtin on facts", () => {
  test("imports, requires and calls of the replaced node APIs", () => {
    const ff = facts(
      [cap("import.source", '"node:child_process"', 1, 0)],
      [cap("import.source", '"node:fs"', 2, 40)],
      [cap("import.source", '"node:zlib"', 3, 60), cap("import.name", "gzipSync", 3, 70)],
      [cap("import.source", '"node:zlib"', 3, 60), cap("import.name", "brotliCompressSync", 3, 90)],
      [cap("import.source", '"node:zlib"', 7, 200), cap("import.name", "brotliCompressSync", 7, 210)],
      [cap("call", "crypto.createHash", 9, 300)],
      [cap("call", "fileURLToPath", 10, 320)],
      [cap("call", "path.fileURLToPath", 11, 340)],
      [cap("call", "util.promisify", 12, 360)],
    );
    expect(nodeBuiltinLines(ff).sort((a, b) => a - b)).toEqual([1, 3, 9, 10, 12]);
  });
});

// The tree-sitter engine needs ay with `code query`; without it the rules keep their line scanners.
const ay = ayBinary(join(import.meta.dir, ".."));
(ay ? describe : describe.skip)("hygiene rules through ay code query", () => {
  test("a node: import in a string, a comment or a regex literal is not an import", () => {
    const dir = mkdtempSync(join(tmpdir(), "hygiene-ast-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "src/a.ts"),
        [
          'import { spawn } from "node:child_process";',
          '// import x from "node:child_process" in a comment',
          'const doc = "use from \\"node:child_process\\" never";',
          "const re = /from [\"']node:child_process[\"']/;",
          "",
        ].join("\n"),
      );
      const got = factsOf(dir, ["src/a.ts"], ["import", "call"]);
      expect(got?.get("src/a.ts")?.error).toBeNull();
      expect(nodeBuiltinLines(got!.get("src/a.ts")!)).toEqual([1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scan: engine ast flags only the real import, engine lines flags every line that quotes it", () => {
    const dir = mkdtempSync(join(tmpdir(), "hygiene-scan-"));
    try {
      const sh = (...a: string[]) => Bun.spawnSync(["git", "-C", dir, ...a]);
      sh("init", "-q");
      mkdirSync(join(dir, "lib"));
      writeFileSync(
        join(dir, "lib/a.ts"),
        ['import { spawn } from "node:child_process";', '// from "node:child_process" in a comment', "export const re = /from \"node:child_process\"/;", ""].join("\n"),
      );
      sh("add", ".");
      const ast = scan(dir, { rules: ["node-builtin"], engine: "ast" });
      const lines = scan(dir, { rules: ["node-builtin"], engine: "lines" });
      expect(ast.map((h) => h.line)).toEqual([1]);
      expect(lines.map((h) => h.line)).toEqual([1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
