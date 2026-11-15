#!/usr/bin/env bun
// py2bun file.py [-o file.ts]  (Bun entrypoint over the Rust CLI)
import { transpileFile } from "./index";

const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const out = oi >= 0 ? args[oi + 1] : undefined;
const input = args.find((a, i) => !a.startsWith("-") && i !== (oi >= 0 ? oi + 1 : -1));
if (!input) {
  console.error("usage: py2bun file.py [-o file.ts]");
  process.exit(2);
}
const r = await transpileFile(input, out);
for (const d of r.diagnostics) console.error(`${input}:${d.line}:${d.col}: ${d.severity}: ${d.message}`);
if (!out && r.ts) process.stdout.write(r.ts);
process.exitCode = r.ok ? 0 : 1;
