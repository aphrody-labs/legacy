// Bun-side wrapper: shells to the Rust CLI (`py2bun-rs`, crate src/py2bun).
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Diagnostic {
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}
export interface TranspileResult {
  /** Bun TypeScript; empty on a syntax error. */
  ts: string;
  diagnostics: Diagnostic[];
  /** true when `ts` was produced and no error diagnostics exist. */
  ok: boolean;
}

const exe = process.platform === "win32" ? ".exe" : "";

/** Resolve the CLI: $PY2BUN_BIN, then `py2bun-rs` on PATH, then the crate's cargo target dirs. */
export function findBinary(): string | null {
  const env = process.env.PY2BUN_BIN;
  if (env && existsSync(env)) return env;
  const onPath = Bun.which("py2bun-rs");
  if (onPath) return onPath;
  const here = dirname(fileURLToPath(import.meta.url));
  const crate = join(here, "..", "..", "..", "src", "py2bun");
  for (const p of [join(crate, "target", "release", `py2bun-rs${exe}`), join(crate, "target", "debug", `py2bun-rs${exe}`)]) if (existsSync(p)) return p;
  return null;
}

/** Transpile Python source to Bun TypeScript. */
export function transpile(source: string, bin: string | null = findBinary()): TranspileResult {
  if (!bin) throw new Error("py2bun-rs not found: set PY2BUN_BIN or build src/py2bun (cargo build --release)");
  const p = Bun.spawnSync([bin, "-", "--json"], { stdin: new TextEncoder().encode(source), stdout: "pipe", stderr: "pipe" });
  const diagnostics: Diagnostic[] = [];
  for (const l of p.stderr.toString().split("\n")) {
    if (!l.startsWith("{")) continue;
    try {
      diagnostics.push(JSON.parse(l));
    } catch (e) {
      diagnostics.push({ line: 0, col: 0, severity: "error", message: `unparseable diagnostic: ${l}` } as Diagnostic);
    }
  }
  const ts = p.stdout.toString();
  return { ts, diagnostics, ok: ts.length > 0 && !diagnostics.some((d) => d.severity === "error") };
}

/** Transpile a .py file; writes `out` when given. */
export async function transpileFile(path: string, out?: string, bin?: string | null): Promise<TranspileResult> {
  const r = transpile(await Bun.file(path).text(), bin ?? findBinary());
  if (out && r.ts) await Bun.write(out, r.ts);
  return r;
}
