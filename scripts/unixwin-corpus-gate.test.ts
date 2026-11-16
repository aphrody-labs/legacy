import { expect, test } from "bun:test";
import { failedIds, judge } from "./unixwin-corpus-gate.ts";

const out = "FAIL date-zone-t: expected={} actual={}\nFAIL printf-float80: expected={}\nCases: 13; differences: 2\n";
const cases = [{ id: "date-zone-t", command: "date" }, { id: "printf-float80", command: "printf" }, { id: "x", command: "nolist" }];
const providers = { date: { provider: "winux" }, printf: { provider: "uutils" } };

test("failed ids come from the FAIL lines only", () => {
  expect(failedIds(out)).toEqual(["date-zone-t", "printf-float80"]);
});

test("a difference gates when the applet is provided by the WinuxCmd library, not when uutils provides it", () => {
  const v = judge(out, cases, providers);
  expect(v.map((x) => [x.id, x.provider, x.gates])).toEqual([["date-zone-t", "winux", true], ["printf-float80", "uutils", false]]);
  expect(judge("FAIL x: e\n", cases, providers)[0]).toMatchObject({ provider: "unlisted", gates: true });
});
