import { describe, expect, test } from "bun:test";
import * as py from "../src/runtime/index";
import { findBinary } from "../src/index";
import * as math from "../src/runtime/math";
import * as json from "../src/runtime/json";
import * as struct from "../src/runtime/struct";

describe("operators", () => {
  test("floordiv/mod follow Python sign rules", () => {
    expect(py.floordiv(-7, 2)).toBe(-4);
    expect(py.mod(-7, 3)).toBe(2);
    expect(py.mod(7, -3)).toBe(-2);
    expect(() => py.floordiv(1, 0)).toThrow(py.ZeroDivisionError);
  });
  test("add/mul on sequences", () => {
    expect(py.add([1], [2])).toEqual([1, 2]);
    expect(py.mul("ab", 2)).toBe("abab");
    expect(py.mul([0], 3)).toEqual([0, 0, 0]);
  });
  test("bit ops beyond 32 bits", () => {
    expect(py.band(0xffffffffff, 0xff00)).toBe(0xff00);
    expect(py.shl(1, 40)).toBe(2 ** 40);
    expect(py.shr(2 ** 40, 8)).toBe(2 ** 32);
    expect(py.bor(-1, 0)).toBe(-1);
  });
  test("eq deep, contains", () => {
    expect(py.eq([1, [2]], [1, [2]])).toBe(true);
    expect(py.contains("abc", "bc")).toBe(true);
    expect(py.contains([1, 2], 2)).toBe(true);
  });
});

describe("indexing", () => {
  test("negative index and slices", () => {
    expect(py.getitem([1, 2, 3], -1)).toBe(3);
    expect(py.getitem("hello", py.slice(1, 3))).toBe("el");
    expect(py.getitem([1, 2, 3, 4], py.slice(null, null, -1))).toEqual([4, 3, 2, 1]);
    expect(() => py.getitem([1], 5)).toThrow(py.IndexError);
  });
  test("dict KeyError", () => {
    const d = py.dict(py.kw({ a: 1 }));
    expect(py.getitem(d, "a")).toBe(1);
    expect(() => py.getitem(d, "z")).toThrow(py.KeyError);
  });
});

describe("builtins", () => {
  test("str/repr/format", () => {
    expect(py.str(null)).toBe("None");
    expect(py.str(true)).toBe("True");
    expect(py.repr("it's")).toBe('"it\'s"');
    expect(py.repr([1, "a", null])).toBe("[1, 'a', None]");
    expect(py.format(255, "04x")).toBe("00ff");
    expect(py.format(3.14159, ".2f")).toBe("3.14");
    expect(py.format("ab", ">5")).toBe("   ab");
    expect(py.format(1234567, ",")).toBe("1,234,567");
  });
  test("percent formatting", () => {
    expect(py.mod("%s @ %08x", ["f", 255])).toBe("f @ 000000ff");
    expect(py.mod("%5.1f%%", 12.34)).toBe(" 12.3%");
    expect(py.mod("%-4d|", 7)).toBe("7   |");
  });
  test("int/hex/round", () => {
    expect(py.int("0x1f", 16)).toBe(31);
    expect(py.int("ff", 16)).toBe(255);
    expect(() => py.int("zz")).toThrow(py.ValueError);
    expect(py.hex(-255)).toBe("-0xff");
    expect(py.round(2.5)).toBe(2);
    expect(py.round(3.5)).toBe(4);
  });
  test("sorted/min/max/sum/enumerate/zip/range", () => {
    expect(py.sorted([3, 1, 2], py.kw({ reverse: true }))).toEqual([3, 2, 1]);
    expect(py.sorted(["bb", "a"], py.kw({ key: (s: string) => s.length }))).toEqual(["a", "bb"]);
    expect(py.max([1, 5, 2])).toBe(5);
    expect(py.min(3, 1, 2)).toBe(1);
    expect(py.sum([1, 2, 3])).toBe(6);
    expect([...py.enumerate(["a", "b"], 1)]).toEqual([[1, "a"], [2, "b"]]);
    expect([...py.zip([1, 2], "ab")]).toEqual([[1, "a"], [2, "b"]]);
    expect(py.list(py.range(5, 0, -2))).toEqual([5, 3, 1]);
    expect(py.len([1, 2, 3])).toBe(3);
    expect(py.len(py.range(10))).toBe(10);
  });
  test("isinstance", () => {
    expect(py.isinstance(3, py.int)).toBe(true);
    expect(py.isinstance("a", [py.int, py.str])).toBe(true);
    expect(py.isinstance([], py.dict)).toBe(false);
  });
});

describe("methods", () => {
  test("string methods", () => {
    expect(py.m.join(",", ["a", "b"])).toBe("a,b");
    expect(py.m.split("a  b c")).toEqual(["a", "b", "c"]);
    expect(py.m.split("a,b,c", ",", 1)).toEqual(["a", "b,c"]);
    expect(py.m.strip("  x ")).toBe("x");
    expect(py.m.replace("aaa", "a", "b", 2)).toBe("bba");
    expect(py.m.startswith("abc", ["x", "ab"])).toBe(true);
    expect(py.m.format("{} {:>3} {k}", 1, 2, py.kw({ k: "z" }))).toBe("1   2 z");
    expect(py.m.zfill("-5", 4)).toBe("-005");
  });
  test("list/dict methods and native fallback", () => {
    const l = [3, 1, 2];
    py.m.append(l, 0);
    py.m.sort(l);
    expect(l).toEqual([0, 1, 2, 3]);
    expect(py.m.pop(l)).toBe(3);
    const d = py.dict();
    expect(py.m.get(d, "k", 9)).toBe(9);
    py.m.setdefault(d, "k", 1);
    expect(py.m.items(d)).toEqual([["k", 1]]);
    // non-Python receiver: dispatches to the native method (e.g. Java StringBuilder via the proxy)
    const sb = { parts: [] as string[], append(x: string) { this.parts.push(x); return this; } };
    py.m.append(sb, "z");
    expect(sb.parts).toEqual(["z"]);
  });
});

describe("exceptions & context", () => {
  test("catches", () => {
    expect(py.catches(new py.KeyError("k"), py.LookupError)).toBe(true);
    expect(py.catches(new Error("x"), py.Exception)).toBe(true);
    expect(py.catches(new py.ValueError("x"), [py.KeyError, py.ValueError])).toBe(true);
    expect(py.catches(new py.ValueError("x"), py.KeyError)).toBe(false);
  });
  test("ctx manager", () => {
    const log: string[] = [];
    const cm = { __enter__: () => (log.push("in"), 7), __exit__: () => log.push("out") };
    expect(py.ctxEnter(cm)).toBe(7);
    py.ctxExit(cm);
    expect(log).toEqual(["in", "out"]);
  });
  test("short-circuit values", () => {
    expect(py.or(() => 0, () => "x")).toBe("x");
    expect(py.and(() => 1, () => [])).toEqual([]);
  });
});

describe("stdlib", () => {
  test("math/json/struct", () => {
    expect(math.sqrt(9)).toBe(3);
    expect(math.gcd(12, 18)).toBe(6);
    expect(json.dumps(py.dict(py.kw({ a: [1, 2] })))).toBe('{"a": [1, 2]}');
    expect(py.getitem(json.loads('{"a": 1}'), "a")).toBe(1);
    expect(struct.unpack("<IH", struct.pack("<IH", 0xdeadbeef, 513))).toEqual([0xdeadbeef, 513]);
  });
});

describe("review fixes", () => {
  test("json.dumps leaves separators inside strings untouched", () => {
    expect(json.dumps(new Map([["a,b", "x:1,2"]]))).toBe('{"a,b": "x:1,2"}');
    expect(json.dumps([1, 2])).toBe("[1, 2]");
  });
  (findBinary() ? test : test.skip)("cli accepts a script without -o", () => {
    const { writeFileSync, mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const d = mkdtempSync(tmpdir() + "/p2b-");
    writeFileSync(d + "/s.py", "print(1)\n");
    const r = Bun.spawnSync([process.execPath, import.meta.dir + "/../src/cli.ts", d + "/s.py"], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("print");
  });
});
