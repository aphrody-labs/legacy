// fr2 smoke: bun scripts/smoke.ts <binary>
import { withProgram } from "../src/index.ts";
const bin = process.argv[2] ?? "/bin/ls";
const t0 = performance.now();
await withProgram(bin, { projectLocation: "/tmp/ghidra-smoke" }, async ({ flat, program }) => {
  console.log("name", await program.getName());
  console.log("lang", await (await program.getLanguageID()).toString());
  const fm = await program.getFunctionManager();
  console.log("functions", await fm.getFunctionCount());
  const first = await flat.getFirstFunction();
  console.log("first", await first.getName(), await (await first.getEntryPoint()).toString());
});
console.log("ms", Math.round(performance.now() - t0));
process.exit(0);
