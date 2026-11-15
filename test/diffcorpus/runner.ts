// diffcorpus: differential runner (port of runner.py). Every case is a shell snippet run with `-c` by a GNU bash oracle
// and by a target shell; stdout, stderr, exit status and timeout are compared after normalisation. Expectations come
// from the oracle at run time, never from stored goldens.
//
//   bun test/diffcorpus/runner.ts --shell "<command prefix>" [--gnu bash] [--only ID|CATEGORY] [--include-gnu] [--out FILE] [--jobs N]
//
// The shell is a command prefix, so the embedded engine runs as `--shell "ay sh"`. `@@SELF@@` in a case is replaced by
// the prefix. GNU_BASH, RUBASH, NIUBASH and AY_BIN supply defaults for --gnu and the `--target` shortcuts.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Case = [id: string, category: string, script: string];
export interface Outcome {
  stdout: string;
  stderr: string;
  exit: number | null;
  timeout: boolean;
}

export const HERE = import.meta.dir;
/** Failures adjudicated stable against the engine's master: reported as KNOWN, any other failure is NEW. */
export const KNOWN_STABLE = new Set(["gl08", "ms10"]);
export const TIMEOUT_MS = 8000;

export function loadCases(includeGnu = false, dir = HERE): Case[] {
  const cases: Case[] = [];
  for (const sub of includeGnu ? ["cases", "cases-gnu"] : ["cases"]) {
    const d = join(dir, sub);
    for (const f of readdirSync(d).filter((n) => n.endsWith(".json")).sort()) cases.push(...(JSON.parse(readFileSync(join(d, f), "utf8")) as Case[]));
  }
  const ids = cases.map((c) => c[0]);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate case ids in the corpus");
  return cases;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Normalisation shared by both sides: the shell's own path and name, scratch directories, timings, two-decimal numbers. */
export function normalize(text: string, shell: string[], tmp: string): string {
  let out = text;
  const first = shell[0] ?? "";
  const base = first.split(/[\\/]/).pop() ?? first;
  // The prefix, its program path and name (names under four characters would eat ordinary words), the embedded engine's argv0.
  const names = [shell.join(" "), first, base.length >= 4 ? base : "", "ay-sh"];
  for (const pat of names) if (pat) out = out.replaceAll(pat, "SHELL");
  if (tmp) out = out.replaceAll(tmp, "TMP");
  return out
    .replaceAll("rubash", "SHELL")
    .replaceAll("bash", "SHELL")
    .replace(/case-[A-Za-z0-9_]+/g, "case-X")
    .replace(/diffrun-[A-Za-z0-9_]+/g, "diffrun-X")
    .replace(/\d+m\d+\.\d+s/g, "TIME")
    .replace(/\b\d+\.\d{2}\b/g, "NUM");
}

/** Run one case with `shell` (a command prefix). */
export async function runOne(shell: string[], script: string, tmpRoot: string): Promise<Outcome> {
  const work = mkdtempSync(join(tmpRoot, "case-"));
  const home = join(work, "home");
  mkdirSync(home);
  const self = shell.join(" ");
  const body = script.replaceAll("@@SELF@@", self);
  try {
    const proc = Bun.spawn([...shell, "-c", body], {
      cwd: work,
      env: { LC_ALL: "C", TZ: "UTC", PATH: "/usr/bin:/bin", HOME: home, TERM: "dumb", TMPDIR: work },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, TIMEOUT_MS);
    const reading = Promise.all([proc.stdout.text(), proc.stderr.text()]);
    const code = await proc.exited;
    clearTimeout(timer);
    // After a kill the pipes can stay open through grandchildren: keep what was read so far, do not wait for them.
    const [so, se] = timedOut ? await Promise.race([reading, Bun.sleep(200).then(() => ["", ""])]) : await reading;
    return { stdout: normalize(so, shell, work), stderr: normalize(se, shell, work), exit: timedOut ? null : code, timeout: timedOut };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export interface CaseResult {
  id: string;
  category: string;
  script: string;
  pass: boolean;
  known_stable: boolean;
  gnu: Outcome;
  target: Outcome;
}

export const same = (a: Outcome, b: Outcome) => a.stdout === b.stdout && a.stderr === b.stderr && a.exit === b.exit && a.timeout === b.timeout;

/** Run `cases` against the oracle and the target, `jobs` at a time. */
export async function runCorpus(cases: Case[], gnu: string[], target: string[], jobs = 4, log: (line: string) => void = () => {}): Promise<CaseResult[]> {
  const tmpRoot = mkdtempSync(join(tmpdir(), "diffrun-"));
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < cases.length; i = next++) {
      const [id, category, script] = cases[i]!;
      const g = await runOne(gnu, script, tmpRoot);
      const t = await runOne(target, script, tmpRoot);
      const pass = same(g, t);
      const known = !pass && KNOWN_STABLE.has(id);
      results[i] = { id, category, script, pass, known_stable: known, gnu: g, target: t };
      log(`${pass ? "PASS" : known ? "FAIL(known-stable)" : "FAIL"} ${id} (${category})`);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  return results;
}

export function summary(results: CaseResult[]) {
  const failures = results.filter((r) => !r.pass);
  const known = failures.filter((r) => r.known_stable).map((r) => r.id);
  const fresh = failures.filter((r) => !r.known_stable).map((r) => r.id);
  return { total: results.length, pass: results.length - failures.length, fail: failures.length, known, fresh };
}

const split = (s: string) => s.split(/\s+/).filter(Boolean);

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const targetName = opt("--target");
  const shortcut: Record<string, string | undefined> = { rubash: Bun.env.RUBASH, niubash: Bun.env.NIUBASH, gnu: Bun.env.GNU_BASH, ay: Bun.env.AY_BIN ? `${Bun.env.AY_BIN} sh` : undefined };
  const targetCmd = opt("--shell") ?? (targetName ? shortcut[targetName] : undefined);
  if (!targetCmd) {
    console.error('usage: bun test/diffcorpus/runner.ts --shell "<command prefix>" | --target rubash|niubash|ay|gnu  [--gnu CMD] [--only ID] [--include-gnu] [--out FILE] [--jobs N]');
    process.exit(2);
  }
  const gnuCmd = opt("--gnu") ?? Bun.env.GNU_BASH ?? Bun.which("bash") ?? "bash";
  const only = opt("--only");
  const cases = loadCases(args.includes("--include-gnu")).filter(([id, cat]) => !only || id.includes(only) || cat.includes(only));
  const results = await runCorpus(cases, split(gnuCmd), split(targetCmd), Number(opt("--jobs") ?? 4), (l) => console.log(l));
  const s = summary(results);
  const outPath = opt("--out") ?? join(HERE, `results-${targetName ?? "target"}.json`);
  writeFileSync(outPath, JSON.stringify({ gnu: gnuCmd, target: targetCmd, total: s.total, pass: s.pass, fail: s.fail, known_stable_failures: s.known, new_failures: s.fresh, results }, null, 1));
  console.log(`TOTAL ${s.total} PASS ${s.pass} FAIL ${s.fail} (known-stable: ${s.known.join(",") || "-"}; new: ${s.fresh.join(",") || "-"})`);
  process.exit(s.fresh.length ? 1 : 0);
}
