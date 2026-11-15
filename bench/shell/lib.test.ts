import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runner, compare, dumpCsv, dumpJson, dumpMarkdown, flagRows, fmtNs, gapTiers, generate, loadCases, medianNs, newResult, nsPerOp, p95Ns, renderArgv, renderScript, type Case, type RunFile } from "./lib.ts";

const base = (over: Partial<Case>): Case => ({ id: "t.x", title: "t", category: "t", body: "", kind: "loop", setup: "", epilogue: "", iters: 3, argv: [], env: [], files: [], tags: [], timeout: 10, expect_rc: 0, expect_out: "", autorange: false, ...over });

describe("corpus", () => {
  test("779 unique cases, every kind known, v2 cases carry their capability tags", async () => {
    const cases = await loadCases();
    expect(cases.length).toBe(779);
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(["loop", "process", "script"]));
    expect(cases.some((c) => c.tags.includes("cap:posix-signals"))).toBe(true);
  });
});

describe("compile", () => {
  test("loop wraps the body in a counting loop with setup before and epilogue after", () => {
    expect(renderScript(base({ setup: "a=1\n", body: "x=$a\n", epilogue: "echo done" }))).toBe("a=1\nfor ((__bs_i=0; __bs_i<3; __bs_i++)); do\nx=$a\ndone\nunset __bs_i\necho done\n");
  });
  test("script kind has no loop and substitutes {iters}", () => {
    expect(renderScript(base({ kind: "script", body: "echo {iters}" }))).toBe("echo 3\n");
  });
  test("argv templates substitute {work}, {script} and {iters}", () => {
    expect(renderArgv(base({ kind: "process", argv: ["-c", "cd {work}; echo {iters}", "{script}"] }), "/s/case.sh", "/w")).toEqual(["-c", "cd /w; echo 3", "/s/case.sh"]);
  });
});

describe("fixtures", () => {
  test("generators are deterministic and sized", () => {
    expect(generate("@gen:lines:2")).toBe("line 0 lorem ipsum dolor sit amet 0\nline 1 lorem ipsum dolor sit amet 7\n");
    expect(generate("@gen:kv:2")).toBe("key0=value0\nkey1=value1\n");
    expect(generate("@gen:csv:1")).toBe("0,field0,3.14,item-0,active,0\n");
    expect(generate("@gen:path:1")).toBe("dir0/sub0/file_0.txt\n");
    expect(generate("@gen:words:1").split(" ").length).toBe(8);
    expect(() => generate("@gen:nope:1")).toThrow("unknown fixture generator");
  });
});

describe("statistics and reports", () => {
  const r = { ...newResult(base({ iters: 10 })), runs_ns: [100, 200, 300, 400, 1000] };
  test("median, p95 and per-op", () => {
    expect(medianNs(r)).toBe(300);
    expect(p95Ns(r)).toBe(1000);
    expect(nsPerOp(r)).toBe(30);
    expect(nsPerOp({ ...r, kind: "process" })).toBe(300);
  });
  test("formats", () => {
    expect(fmtNs(1500)).toBe("1.50 us");
    expect(fmtNs(2_500_000)).toBe("2.50 ms");
    expect(fmtNs(null)).toBe("-");
    expect(dumpCsv([r]).split("\r\n")[1]).toBe("t.x,t,t,loop,10,ok,100,300,1000,30,33333333.3");
    expect(dumpMarkdown({ shell: "sh" }, [r])).toContain("| t.x | loop | 10 | 300 ns | 1.00 us | 30 ns | 33333333 | ok |");
    expect(JSON.parse(dumpJson({ a: 1 }, [r])).results[0].ns_per_op).toBe(30);
  });
  const run = (rows: [string, string, number, string?][]): RunFile => ({ meta: {}, results: rows.map(([id, category, ns, status]) => ({ id, title: id, category, kind: "loop", iters: 1, status: status ?? "ok", error: "", verified: true, runs_ns: [ns], min_ns: ns, median_ns: ns, p95_ns: ns, ns_per_op: ns, ops_per_s: 1e9 / ns })) });
  test("compare flags regressions and improvements beyond the threshold", () => {
    const rows = flagRows(compare(run([["a", "x", 110], ["b", "x", 90], ["c", "x", 100], ["d", "x", 100, "error"]]), run([["a", "x", 100], ["b", "x", 100], ["c", "x", 102], ["d", "x", 100]])), 5);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.flag]))).toEqual({ a: "REGRESSION", b: "IMPROVED", c: "same", d: "n/a" });
  });
  test("gap table buckets by ratio", () => {
    const rows = compare(run([["lead", "x", 90], ["close", "x", 105], ["behind", "x", 200]]), run([["lead", "x", 100], ["close", "x", 100], ["behind", "x", 100]]));
    const text = gapTiers(rows, "rubash", "bash");
    expect(text).toContain("- **leading** (ratio <= 0.98): 1");
    expect(text).toContain("- **close** (0.98 < ratio <= 1.10): 1");
    expect(text).toContain("- **behind** (ratio > 1.10): 1");
    expect(text).toContain("| behind | x | 200 ns | 100 ns | 2.000 |");
  });
});

describe.skipIf(process.platform === "win32" || !Bun.which("bash"))("runner on a real shell", () => {
  const root = mkdtempSync(join(tmpdir(), "sb-test-"));
  const runner = new Runner([Bun.which("bash")!], 2, 1, root);

  test("a loop case is verified, autoranged and timed", async () => {
    const r = await runner.runCase(base({ id: "ok.loop", body: ": $((1+1))", iters: 100, autorange: true, expect_out: "" }));
    expect(r.status).toBe("ok");
    expect(r.verified).toBe(true);
    expect(r.runs_ns.length).toBe(2);
    expect(r.iters).toBeGreaterThan(100);
  });

  test("a wrong exit status is verify-failed and never timed", async () => {
    const r = await runner.runCase(base({ id: "bad.rc", body: "false; exit 3", iters: 1 }));
    expect(r).toMatchObject({ status: "verify-failed", runs_ns: [] });
    expect(r.error).toBe("rc=3 expected 0");
  });

  test("an output regex is checked on the verify run", async () => {
    const miss = await runner.runCase(base({ id: "bad.out", kind: "script", body: "echo nope", expect_out: "^yes$" }));
    expect(miss.status).toBe("verify-failed");
    const hit = await runner.verifyCase(base({ id: "good.out", kind: "script", body: "echo yes", expect_out: "^yes$" }));
    expect(hit.status).toBe("ok");
  });

  test("fixtures are written before timing and visible to the script", async () => {
    const r = await runner.verifyCase(base({ id: "fx", kind: "script", body: "wc -l < in.txt", files: [["in.txt", "@gen:lines:7"]], expect_out: "^\\s*7$" }));
    expect(r.status).toBe("ok");
  });

  test("a hang is reported as a timeout", async () => {
    const r = await runner.verifyCase(base({ id: "hang", kind: "script", body: "sleep 5", timeout: 0.3 }));
    expect(r.status).toBe("timeout");
  });

  test("cleanup", () => rmSync(root, { recursive: true, force: true }));
});
