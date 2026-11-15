#!/usr/bin/env bun
// shellbench CLI (port of bench.py):
//   bun bench/shell/cli.ts list [--category C] [--tag T]
//   bun bench/shell/cli.ts run --shell "<command prefix>" [--name N] [--out DIR] [--reps N] [--warmup N] [--category C] [--tag T] [--filter RE] [--limit N] [--verify-only] [--save-baseline F]
//   bun bench/shell/cli.ts compare NEW.json --baseline OLD.json [--threshold PCT]
//   bun bench/shell/cli.ts gap SUBJECT.json REFERENCE.json [--out F]
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { VERSION, Runner, compare, dumpCsv, dumpJson, dumpMarkdown, flagRows, gapTiers, hostMeta, loadCases, nsPerOp, shellVersion, type Case, type CaseResult, type RunFile } from "./lib.ts";

const args = Bun.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const split = (s: string) => s.split(/\s+/).filter(Boolean);

function filter(cases: Case[]): Case[] {
  const category = opt("--category");
  const tag = opt("--tag");
  const rx = opt("--filter") ? new RegExp(opt("--filter")!) : null;
  return cases.filter((c) => (!category || c.category === category) && (!tag || c.tags.includes(tag)) && (!rx || rx.test(c.id)));
}

const pad = (s: string, n: number) => s.padEnd(n);
const load = async (p: string) => (await Bun.file(p).json()) as RunFile;

async function main(): Promise<number> {
  switch (cmd) {
    case "list": {
      const cases = filter(await loadCases());
      const by = new Map<string, Case[]>();
      for (const c of cases) by.set(c.category, [...(by.get(c.category) ?? []), c]);
      for (const cat of [...by.keys()].sort()) {
        console.log(`${cat} (${by.get(cat)!.length})`);
        for (const c of by.get(cat)!.sort((a, b) => (a.id < b.id ? -1 : 1))) console.log(`  ${pad(c.id, 46)} ${pad(c.kind, 7)} ${c.title}`);
      }
      console.log(`total: ${cases.length} cases`);
      return 0;
    }
    case "run": {
      let cases = filter(await loadCases());
      if (opt("--limit")) cases = cases.slice(0, Number(opt("--limit")));
      const shellArg = opt("--shell");
      if (!shellArg) {
        console.error("run: --shell is required");
        return 2;
      }
      const shell = split(shellArg);
      const name = opt("--name") ?? basename(shell[0]!);
      const reps = Number(opt("--reps") ?? 5);
      const warmup = Number(opt("--warmup") ?? 1);
      const started = new Date();
      const meta = { tool: `shellbench ${VERSION}`, shell: shellArg, shell_name: name, shell_version: await shellVersion(shell), started: started.toISOString().slice(0, 19), reps, warmup, ...(await hostMeta()) };
      const runner = new Runner(shell, reps, warmup);
      if (args.includes("--verify-only")) {
        let bad = 0;
        for (const [i, c] of cases.entries()) {
          const r = await runner.verifyCase(c);
          if (r.status !== "ok") {
            bad++;
            console.log(`[${i + 1}/${cases.length}] ${pad(r.id, 46)} ${pad(r.status, 13)} ${r.error}`);
          }
        }
        console.log(`verify-only: ${cases.length - bad} ok / ${cases.length} total`);
        return bad ? 1 : 0;
      }
      const results: CaseResult[] = [];
      for (const [i, c] of cases.entries()) {
        const r = await runner.runCase(c);
        results.push(r);
        console.log(`[${i + 1}/${cases.length}] ${pad(r.id, 46)} ${pad(r.status, 13)} ${r.status === "ok" ? `${nsPerOp(r).toFixed(0)} ns/op` : r.error}`);
      }
      const out = opt("--out") ?? "results";
      mkdirSync(out, { recursive: true });
      const stamp = started.toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const base = join(out, `${stamp}-${name}`);
      writeFileSync(`${base}.json`, dumpJson(meta, results));
      writeFileSync(`${base}.csv`, dumpCsv(results));
      writeFileSync(`${base}.md`, dumpMarkdown(meta, results));
      const ok = results.filter((r) => r.status === "ok").length;
      console.log(`wrote ${base}.{json,csv,md}  (${ok} ok / ${results.length} total)`);
      if (opt("--save-baseline")) {
        writeFileSync(opt("--save-baseline")!, dumpJson(meta, results));
        console.log(`baseline saved: ${opt("--save-baseline")}`);
      }
      return ok ? 0 : 1;
    }
    case "compare": {
      const base = opt("--baseline");
      if (!args[1] || !base) {
        console.error("compare: NEW.json --baseline OLD.json");
        return 2;
      }
      const threshold = Number(opt("--threshold") ?? 5);
      const rows = flagRows(compare(await load(args[1]), await load(base)), threshold);
      console.log("| case | baseline | new | delta | flag |\n|---|---|---|---|---|");
      for (const r of [...rows].sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))) {
        console.log(`| ${r.id} | ${r.base_ns === null ? "-" : r.base_ns.toFixed(0)} | ${r.new_ns === null ? "-" : r.new_ns.toFixed(0)} | ${r.delta_pct === null ? "-" : `${r.delta_pct >= 0 ? "+" : ""}${r.delta_pct.toFixed(1)}%`} | ${r.flag} |`);
      }
      const bad = rows.filter((r) => r.flag === "REGRESSION").length;
      console.log(`regressions beyond ${threshold.toFixed(1)}%: ${bad}`);
      return bad ? 1 : 0;
    }
    case "gap": {
      if (!args[1] || !args[2]) {
        console.error("gap: SUBJECT.json REFERENCE.json [--out F]");
        return 2;
      }
      const [subj, ref] = [await load(args[1]), await load(args[2])];
      const text = gapTiers(compare(subj, ref), String(subj.meta.shell_name ?? "subject"), String(ref.meta.shell_name ?? "reference"));
      if (opt("--out")) {
        writeFileSync(opt("--out")!, text);
        console.log(`wrote ${opt("--out")}`);
      } else console.log(text);
      return 0;
    }
    default:
      console.error("usage: shellbench list|run|compare|gap (see the header of bench/shell/cli.ts)");
      return cmd === undefined || cmd === "--help" ? 0 : 2;
  }
}

process.exitCode = await main();
