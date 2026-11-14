// fr2: prove the Rust onBeforeParse plugin runs under bun.
//   bun scripts/native-proof.ts <addon.node> <binary>
// 1. NAPI fast path: addon.analyze(binary)  2. Bun.build with onBeforeParse on <binary>.ghidra.js stub.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeGhidraPlugin } from "../src/plugin.ts";

const [addon, bin] = process.argv.slice(2) as [string, string];
const napi = require(addon) as { analyze(p: string, n?: number): string; version(): string };
console.log("version:", napi.version());
const t0 = performance.now();
const rep = JSON.parse(napi.analyze(bin, 16));
console.log("napi analyze ms:", (performance.now() - t0).toFixed(1), "format:", rep.format, "functions:", rep.decompiled_functions.length, "entry:", rep.entry_point_va);

const dir = "/tmp/native-proof";
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "target.ghidra.js"), bin); // stub text = binary path
writeFileSync(join(dir, "app.ts"), `import report, { functions, entry } from "./target.ghidra.js";\nconsole.log(JSON.stringify({ n: functions.length, entry, format: report.format, first: functions[0]?.name }));\n`);
const res = await Bun.build({ entrypoints: [join(dir, "app.ts")], outdir: join(dir, "out"), target: "bun", plugins: [nativeGhidraPlugin(addon)] });
console.log("build success:", res.success, res.logs.map(String).join("|"));
const outFile = join(dir, "out", "app.js");
const code = readFileSync(outFile, "utf8");
console.log("bundle contains analysis:", code.includes("decompiled_functions"));
const run = Bun.spawnSync(["bun", outFile]);
console.log("bundle run:", run.stdout.toString().trim(), run.stderr.toString().trim());
