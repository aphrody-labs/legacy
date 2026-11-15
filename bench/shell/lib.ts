// shellbench: performance suite for Bash-style shells (port of the Python `benchsuite`). One corpus of cases (data), one
// methodology, any shell binary. Cases are loop (counting loop inside one process, metric ns/op), process (one launch per
// repetition) or script (setup and body written to a file, one run per repetition).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { cpus, platform, arch, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const VERSION = "0.2.0";

export interface Case {
  id: string;
  title: string;
  category: string;
  body: string;
  kind: "loop" | "process" | "script";
  setup: string;
  epilogue: string;
  iters: number;
  argv: string[];
  env: [string, string][];
  files: [string, string][];
  tags: string[];
  timeout: number;
  expect_rc: number;
  expect_out: string;
  autorange: boolean;
}

export type Status = "ok" | "error" | "timeout" | "verify-failed";

export interface CaseResult {
  id: string;
  title: string;
  category: string;
  kind: string;
  iters: number;
  runs_ns: number[];
  status: Status;
  error: string;
  verified: boolean;
}

export const newResult = (c: Case): CaseResult => ({ id: c.id, title: c.title, category: c.category, kind: c.kind, iters: c.iters, runs_ns: [], status: "ok", error: "", verified: false });

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export const medianOf = median;
export const minNs = (r: CaseResult) => (r.runs_ns.length ? Math.min(...r.runs_ns) : NaN);
export const medianNs = (r: CaseResult) => median(r.runs_ns);
export const p95Ns = (r: CaseResult) => {
  if (!r.runs_ns.length) return NaN;
  const s = [...r.runs_ns].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)]!;
};
export const nsPerOp = (r: CaseResult) => (r.kind === "process" ? medianNs(r) : r.iters ? medianNs(r) / r.iters : NaN);
export const opsPerS = (r: CaseResult) => {
  const n = nsPerOp(r);
  return n && n === n && n > 0 ? 1e9 / n : NaN;
};

export interface ResultRow {
  id: string;
  title: string;
  category: string;
  kind: string;
  iters: number;
  status: string;
  error: string;
  verified: boolean;
  runs_ns: number[];
  min_ns: number | null;
  median_ns: number | null;
  p95_ns: number | null;
  ns_per_op: number | null;
  ops_per_s: number | null;
}

// JSON has no NaN: unmeasurable figures are null, as the Python tool wrote them via the csv/md layers.
const fin = (x: number) => (Number.isFinite(x) ? x : null);
export const toRow = (r: CaseResult): ResultRow => ({
  id: r.id, title: r.title, category: r.category, kind: r.kind, iters: r.iters, status: r.status, error: r.error, verified: r.verified, runs_ns: r.runs_ns,
  min_ns: fin(minNs(r)), median_ns: fin(medianNs(r)), p95_ns: fin(p95Ns(r)), ns_per_op: fin(nsPerOp(r)), ops_per_s: fin(opsPerS(r)),
});

// ---- corpus -----------------------------------------------------------------------------------------------------------

/** The frozen corpus (cases.json.gz, 779 cases): the Python generators' output, annotated with `cap:*` tags. */
export async function loadCases(path = join(import.meta.dir, "cases.json.gz")): Promise<Case[]> {
  const cases = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await Bun.file(path).arrayBuffer())))) as Case[];
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
    seen.add(c.id);
  }
  return cases;
}

// ---- compile ----------------------------------------------------------------------------------------------------------

/** Full script text for loop and script kinds (and process cases that name `{script}`). */
export function renderScript(c: Case): string {
  const parts: string[] = [];
  const trim = (s: string) => s.replace(/\n+$/, "");
  if (c.setup) parts.push(trim(c.setup));
  if (c.kind === "loop") {
    parts.push(`for ((__bs_i=0; __bs_i<${c.iters}; __bs_i++)); do`);
    if (c.body) parts.push(trim(c.body));
    parts.push("done", "unset __bs_i");
  } else if (c.body) parts.push(trim(c.body));
  if (c.epilogue) parts.push(trim(c.epilogue));
  return `${parts.join("\n")}\n`.replaceAll("{iters}", String(c.iters));
}

export function renderArgv(c: Case, scriptPath: string | null, workdir: string): string[] {
  return c.argv.map((a) => {
    const w = a.replaceAll("{work}", workdir);
    return w === "{script}" ? scriptPath! : w.replaceAll("{iters}", String(c.iters));
  });
}

// ---- fixtures ---------------------------------------------------------------------------------------------------------

const WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(" ");

/** `@gen:<kind>:N` fixture content (lines, words, kv, csv, path), generated before timing starts. */
export function generate(spec: string): string {
  const [kind, arg] = spec.slice(5).split(":");
  const n = Number(arg);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    switch (kind) {
      case "lines": rows.push(`line ${i} lorem ipsum dolor sit amet ${(i * 7) % 997}\n`); break;
      case "words": rows.push(`${Array.from({ length: 8 }, (_, j) => WORDS[(i + j) % WORDS.length]).join(" ")}\n`); break;
      case "kv": rows.push(`key${i}=value${i}\n`); break;
      case "csv": rows.push(`${i},field${i},3.14,item-${i},active,${i % 50}\n`); break;
      case "path": rows.push(`dir${i % 97}/sub${i % 13}/file_${i}.txt\n`); break;
      default: throw new Error(`unknown fixture generator: ${spec}`);
    }
  }
  return rows.join("");
}

export const materialize = (content: string) => (content.startsWith("@gen:") ? generate(content) : content);

// ---- runner -----------------------------------------------------------------------------------------------------------

export const TARGET_RUN_NS = 200_000_000;
export const MAX_AUTORANGE_FACTOR = 1000;

interface Launch {
  ns: number | null;
  rc: number | null;
  out: string;
  err: "timeout" | null;
}

export class Runner {
  readonly root: string;
  constructor(readonly shell: string[], readonly reps = 5, readonly warmup = 1, root?: string) {
    this.root = root ?? mkdtempSync(join(tmpdir(), "benchsuite-"));
  }

  private async launch(argv: string[], cwd: string, env: Record<string, string>, timeoutS: number, capture = false): Promise<Launch> {
    const t0 = Bun.nanoseconds();
    const proc = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: capture ? "pipe" : "ignore", stderr: capture ? "pipe" : "ignore" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutS * 1000);
    // Output is read while the shell runs (a full pipe would stall it). After a kill the pipes may stay open through grandchildren: do not wait for them.
    const reading = capture ? Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(([o, e]) => o + e) : Promise.resolve("");
    const code = await proc.exited;
    clearTimeout(timer);
    const ns = Bun.nanoseconds() - t0;
    if (timedOut) {
      reading.catch(() => {});
      return { ns: null, rc: null, out: "", err: "timeout" };
    }
    return { ns, rc: code, out: await reading, err: null };
  }

  private prepare(c: Case, workdir: string): { argv: string[]; env: Record<string, string> } {
    mkdirSync(workdir, { recursive: true });
    for (const [rel, content] of c.files) {
      const dest = join(workdir, rel.replaceAll("{work}", workdir));
      mkdirSync(dirname(dest) || workdir, { recursive: true });
      writeFileSync(dest, materialize(content));
    }
    let scriptPath: string | null = null;
    if (c.kind === "loop" || c.kind === "script" || c.argv.includes("{script}")) {
      scriptPath = join(workdir, "case.sh");
      writeFileSync(scriptPath, renderScript(c));
    }
    const argv = c.kind === "process" ? [...this.shell, ...renderArgv(c, scriptPath, workdir)] : [...this.shell, scriptPath!];
    const env: Record<string, string> = { ...(Bun.env as Record<string, string>) };
    env.LC_ALL ??= "C";
    for (const [k, v] of c.env) env[k] = v.replaceAll("{work}", workdir);
    return { argv, env };
  }

  private verifyLaunch(c: Case, res: CaseResult, l: Launch): boolean {
    if (l.err) {
      res.status = l.err;
      res.error = `verify run ${l.err}`;
      return false;
    }
    res.verified = true;
    if (l.rc !== c.expect_rc) {
      res.status = "verify-failed";
      res.error = `rc=${l.rc} expected ${c.expect_rc}`;
      return false;
    }
    // In Python a trailing dollar sign also matches before a final newline: try the output with it stripped too.
    if (c.expect_out && !new RegExp(c.expect_out).test(l.out) && !new RegExp(c.expect_out).test(l.out.replace(/\n$/, ""))) {
      res.status = "verify-failed";
      res.error = `output does not match ${JSON.stringify(c.expect_out)}`;
      return false;
    }
    return true;
  }

  /** Verify run (untimed, captured), then autorange, warmup and timed repetitions. A fast wrong run is not data. */
  async runCase(c: Case): Promise<CaseResult> {
    const workdir = join(this.root, c.id.replaceAll("/", "_"));
    const res = newResult(c);
    let prepared: { argv: string[]; env: Record<string, string> };
    try {
      prepared = this.prepare(c, workdir);
    } catch (e) {
      res.status = "error";
      res.error = `prepare: ${(e as Error).message}`;
      return res;
    }
    if (!this.verifyLaunch(c, res, await this.launch(prepared.argv, workdir, prepared.env, c.timeout, true))) return res;
    return this.time(c, prepared.argv, prepared.env, workdir, res);
  }

  /** One captured run, no timing: corpus hygiene check. */
  async verifyCase(c: Case): Promise<CaseResult> {
    const workdir = join(this.root, c.id.replaceAll("/", "_"));
    const res = newResult(c);
    try {
      const { argv, env } = this.prepare(c, workdir);
      if (this.verifyLaunch(c, res, await this.launch(argv, workdir, env, c.timeout, true))) res.status = "ok";
    } catch (e) {
      res.status = "error";
      res.error = `prepare: ${(e as Error).message}`;
    }
    return res;
  }

  private async time(c: Case, argv: string[], env: Record<string, string>, workdir: string, res: CaseResult): Promise<CaseResult> {
    if (c.kind === "loop" && c.autorange) {
      const probe = await this.launch(argv, workdir, env, c.timeout);
      if (probe.err) {
        res.status = probe.err;
        res.error = `probe run ${probe.err}`;
        return res;
      }
      if (probe.ns && probe.ns < TARGET_RUN_NS) {
        const factor = Math.min(MAX_AUTORANGE_FACTOR, Math.max(1, Math.floor(TARGET_RUN_NS / Math.max(probe.ns, 1))));
        if (factor > 1) {
          c = { ...c, iters: c.iters * factor };
          res.iters = c.iters;
          ({ argv, env } = this.prepare(c, workdir));
        }
      }
    }
    for (let i = 0; i < this.warmup; i++) {
      const w = await this.launch(argv, workdir, env, c.timeout);
      if (w.err) {
        res.status = w.err;
        res.error = `warmup ${w.err}`;
        return res;
      }
    }
    for (let i = 0; i < this.reps; i++) {
      const r = await this.launch(argv, workdir, env, c.timeout);
      if (r.err) {
        res.status = r.err;
        res.error = `rep ${r.err}`;
        res.runs_ns = [];
        return res;
      }
      if (r.rc !== c.expect_rc) {
        res.status = "verify-failed";
        res.error = `timed run rc=${r.rc}`;
        res.runs_ns = [];
        return res;
      }
      res.runs_ns.push(r.ns!);
    }
    return res;
  }
}

export async function shellVersion(shell: string[]): Promise<string> {
  try {
    const p = Bun.spawn([...shell, "--version"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const out = (await new Response(p.stdout).text()) + (await new Response(p.stderr).text());
    await p.exited;
    return out.split("\n")[0]?.trim() || "unknown";
  } catch (e) {
    return `unknown (${(e as Error).message})`;
  }
}

export async function hostMeta(): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = { platform: `${platform()}-${arch()}`, machine: arch(), bun: Bun.version, cpu_count: cpus().length };
  try {
    meta.loadavg_at_start = (await Bun.file("/proc/loadavg").text()).trim();
  } catch {}
  return meta;
}

// ---- report -----------------------------------------------------------------------------------------------------------

export interface RunFile {
  meta: Record<string, unknown>;
  results: ResultRow[];
}

export const dumpJson = (meta: Record<string, unknown>, results: CaseResult[]) => JSON.stringify({ meta, results: results.map(toRow) }, null, 1);

const num = (x: number | null) => (x === null ? "" : Number.isInteger(x) ? String(x) : x.toFixed(1));
const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function dumpCsv(results: CaseResult[]): string {
  const rows = [["id", "category", "title", "kind", "iters", "status", "min_ns", "median_ns", "p95_ns", "ns_per_op", "ops_per_s"]];
  for (const r of results.map(toRow)) rows.push([r.id, r.category, r.title, r.kind, String(r.iters), r.status, num(r.min_ns), num(r.median_ns), num(r.p95_ns), num(r.ns_per_op), num(r.ops_per_s)]);
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function fmtNs(ns: number | null): string {
  if (ns === null || Number.isNaN(ns)) return "-";
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(2)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(2)} us`;
  return `${ns.toFixed(0)} ns`;
}

export function dumpMarkdown(meta: Record<string, unknown>, results: CaseResult[]): string {
  const lines = ["# benchsuite run", ""];
  for (const k of ["shell", "shell_version", "started", "platform", "reps", "warmup", "loadavg_at_start"]) if (k in meta) lines.push(`- ${k}: ${meta[k]}`);
  lines.push("");
  const byCat = new Map<string, ResultRow[]>();
  for (const d of results.map(toRow)) byCat.set(d.category, [...(byCat.get(d.category) ?? []), d]);
  for (const cat of [...byCat.keys()].sort()) {
    lines.push(`## ${cat}`, "", "| case | kind | iters | median | p95 | per-op | ops/s | status |", "|---|---|---|---|---|---|---|---|");
    for (const d of byCat.get(cat)!.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      lines.push(`| ${d.id} | ${d.kind} | ${d.iters} | ${fmtNs(d.median_ns)} | ${fmtNs(d.p95_ns)} | ${fmtNs(d.ns_per_op)} | ${d.ops_per_s === null ? "-" : d.ops_per_s.toFixed(0)} | ${d.status} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export interface CompareRow {
  id: string;
  category: string;
  new_ns: number | null;
  base_ns: number | null;
  new_status: string;
  base_status: string;
  ratio: number | null;
  delta_pct: number | null;
  flag?: string;
}

/** One row per case present in either run, keyed on ns/op medians. */
export function compare(next: RunFile, base: RunFile): CompareRow[] {
  const nmap = new Map(next.results.map((r) => [r.id, r]));
  const bmap = new Map(base.results.map((r) => [r.id, r]));
  return [...new Set([...nmap.keys(), ...bmap.keys()])].sort().map((id) => {
    const n = nmap.get(id);
    const b = bmap.get(id);
    const row: CompareRow = { id, category: (n ?? b)!.category, new_ns: n?.ns_per_op ?? null, base_ns: b?.ns_per_op ?? null, new_status: n?.status ?? "missing", base_status: b?.status ?? "missing", ratio: null, delta_pct: null };
    if (n && b && n.status === "ok" && b.status === "ok" && n.ns_per_op && b.ns_per_op) {
      row.ratio = n.ns_per_op / b.ns_per_op;
      row.delta_pct = (row.ratio - 1) * 100;
    }
    return row;
  });
}

export function flagRows(rows: CompareRow[], thresholdPct = 5): CompareRow[] {
  for (const r of rows) r.flag = r.delta_pct === null ? "n/a" : r.delta_pct > thresholdPct ? "REGRESSION" : r.delta_pct < -thresholdPct ? "IMPROVED" : "same";
  return rows;
}

/** Tiered gap table: ratio = subject time / reference time, below 1 means the subject is faster. */
export function gapTiers(rows: CompareRow[], subject: string, reference: string, lead = 0.98, close = 1.1): string {
  const buckets: Record<"lead" | "close" | "behind" | "na", CompareRow[]> = { lead: [], close: [], behind: [], na: [] };
  for (const r of rows) (r.ratio === null ? buckets.na : r.ratio <= lead ? buckets.lead : r.ratio <= close ? buckets.close : buckets.behind).push(r);
  const total = rows.filter((r) => r.ratio !== null).length;
  const lines = [
    `# Gap table: ${subject} vs ${reference}`, "",
    `ratio = ${subject} time / ${reference} time (per-op median). <1.00 = ${subject} faster.`, "",
    `- **leading** (ratio <= ${lead.toFixed(2)}): ${buckets.lead.length}`,
    `- **close** (${lead.toFixed(2)} < ratio <= ${close.toFixed(2)}): ${buckets.close.length}`,
    `- **behind** (ratio > ${close.toFixed(2)}): ${buckets.behind.length}`,
    `- compared cases: ${total}, unmeasurable: ${buckets.na.length}`, "",
  ];
  const byCat = new Map<string, number[]>();
  for (const r of rows) if (r.ratio !== null) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r.ratio]);
  lines.push("## By category (median ratio)", "", "| category | cases | median ratio | reading |", "|---|---|---|---|");
  for (const cat of [...byCat.keys()].sort()) {
    const m = median(byCat.get(cat)!);
    lines.push(`| ${cat} | ${byCat.get(cat)!.length} | ${m.toFixed(3)} | ${m <= lead ? "leading" : m <= close ? "close" : "behind"} |`);
  }
  lines.push("");
  for (const [name, title] of [["behind", "Behind (worst first)"], ["close", "Close"], ["lead", "Leading (best first)"]] as const) {
    const items = [...buckets[name]].sort((a, b) => (name === "lead" ? a.ratio! - b.ratio! : b.ratio! - a.ratio!));
    lines.push(`## ${title}`, "", `| case | category | ${subject} | ${reference} | ratio |`, "|---|---|---|---|---|");
    for (const r of items) lines.push(`| ${r.id} | ${r.category} | ${fmtNs(r.new_ns)} | ${fmtNs(r.base_ns)} | ${r.ratio!.toFixed(3)} |`);
    lines.push("");
  }
  if (buckets.na.length) {
    lines.push("## Unmeasurable", "");
    for (const r of buckets.na) lines.push(`- ${r.id} (${subject}: ${r.new_status} / ${reference}: ${r.base_status})`);
    lines.push("");
  }
  return lines.join("\n");
}
