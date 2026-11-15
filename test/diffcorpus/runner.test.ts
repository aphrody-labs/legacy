import { describe, expect, test } from "bun:test";
import { loadCases, normalize, runCorpus, runOne, same, summary, KNOWN_STABLE } from "./runner.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("corpus", () => {
  test("306 cases in 29 domains, unique ids, three string fields", () => {
    const cases = loadCases(false);
    expect(cases.length).toBe(306);
    expect(new Set(cases.map((c) => c[0])).size).toBe(306);
    expect(new Set(cases.map((c) => c[1])).size).toBeGreaterThanOrEqual(25);
    for (const c of cases) expect(c.every((x) => typeof x === "string")).toBe(true);
  });

  test("the GNU pilot cases load on request", () => {
    expect(loadCases(true).length).toBeGreaterThan(306);
  });

  test("normalization hides the shell, scratch directories, timings and two-decimal numbers", () => {
    const out = normalize("/usr/bin/rubash: line 1: x\n/tmp/case-ab12/f 0m1.234s 3.14 ay-sh: bash", ["/usr/bin/rubash"], "/tmp/case-ab12");
    expect(out).toBe("SHELL: line 1: x\nTMP/f TIME NUM SHELL: SHELL");
  });

  test("known-stable set", () => {
    expect([...KNOWN_STABLE].sort()).toEqual(["gl08", "ms10"]);
  });
});

// The runner against a real POSIX shell as both sides (the oracle self-check): POSIX hosts only.
describe.skipIf(process.platform === "win32" || !Bun.which("bash"))("runner mechanics", () => {
  const bash = [Bun.which("bash")!];

  test("identical shells agree on a slice of the corpus", async () => {
    const cases = loadCases(false).filter(([id]) => id.startsWith("ts0") || id.startsWith("un0"));
    expect(cases.length).toBeGreaterThan(5);
    const results = await runCorpus(cases, bash, bash, 4);
    expect(summary(results)).toMatchObject({ fail: 0, pass: cases.length });
  });

  test("a differing shell is reported as a failure, a hang as a timeout", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "dc-test-"));
    try {
      const a = await runOne(bash, "echo one", tmp);
      const b = await runOne(bash, "echo two", tmp);
      expect(same(a, b)).toBe(false);
      expect(a).toMatchObject({ stdout: "one\n", exit: 0, timeout: false });
      const sleepy = await runOne(["sh"], "exit 3", tmp);
      expect(sleepy.exit).toBe(3);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// End to end on the embedded engine: `RUBASH=<target>/debug/rubash bun test test/diffcorpus` on a POSIX host.
// Three cases depend on the oracle build rather than on the engine: en02 (compiled-in default PATH), en04 (BASH_VERSINFO
// patch level) and ps06 (a `wait -n` timing race).
const ORACLE_DEPENDENT = new Set(["en02", "en04", "ps06"]);
describe.skipIf(!Bun.env.RUBASH || process.platform === "win32")("rubash against the GNU oracle", () => {
  test("the whole corpus: no failure outside the oracle-dependent cases", async () => {
    const oracle = [Bun.env.GNU_BASH ?? Bun.which("bash")!];
    const results = await runCorpus(loadCases(false), oracle, [Bun.env.RUBASH!], 6);
    const s = summary(results);
    expect(s.total).toBe(306);
    expect(s.fresh.filter((id) => !ORACLE_DEPENDENT.has(id))).toEqual([]);
  }, 600_000);
});
