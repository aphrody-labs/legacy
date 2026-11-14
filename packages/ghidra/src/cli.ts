#!/usr/bin/env bun
// bun ghidra analyze <binary> [--decompile] [--max N] | functions <binary> | decompile <binary> <name> | script <binary> <script.ts> [args]
import { openProgram, stop, runScript } from "./api.ts";
import { summarize, listFunctions, decompile } from "./analysis.ts";

const [cmd, bin, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(n);
const opt = (n: string) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const projectLocation = process.env.GHIDRA_PROJECTS ?? `${process.env.TMPDIR ?? "/tmp"}/bun-ghidra-projects`;

if (!cmd || !bin) {
  console.error("usage: bun-ghidra analyze|functions|decompile|script <binary> ...");
  process.exit(2);
}
try {
  if (cmd === "script") {
    await runScript(bin, rest[0]!, { projectLocation, scriptArgs: rest.slice(1) });
  } else {
    const h = await openProgram(bin, { projectLocation, analyze: !flag("--no-analyze") });
    try {
      if (cmd === "analyze") console.log(JSON.stringify(await summarize(h.program, { max: opt("--max") ? Number(opt("--max")) : undefined, decompile: flag("--decompile") }), null, 2));
      else if (cmd === "functions") console.log(JSON.stringify(await listFunctions(h.program), null, 2));
      else if (cmd === "decompile") {
        const fns = await (await (await h.program.getFunctionManager()).getFunctions(true)).$list();
        for (const f of fns) if (String(await f.getName()) === rest[0] || String(await (await f.getEntryPoint()).toString()) === rest[0]) console.log(await decompile(h.program, f));
      } else throw new Error(`unknown command ${cmd}`);
    } finally {
      await h.close();
    }
  }
} finally {
  await stop();
}
process.exit(0);
