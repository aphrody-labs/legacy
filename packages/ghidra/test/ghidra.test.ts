import { describe, expect, test } from "bun:test";
import { Session, JavaError } from "../src/rpc.ts";
import { createFlat, FLAT_PROGRAM_API, GHIDRA_SCRIPT_EXTRA, LOCAL_METHODS, sprintf, CancelledError } from "../src/flat.ts";
import { parseSpecifier, renderModule } from "../src/plugin.ts";
import { ApplicationInfo, ProgramTypeError, started } from "../src/api.ts";
import * as script from "../src/script.ts";

const mock = () => Session.fromProcess(["bun", new URL("./mock-bridge.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")]);

describe("rpc client (mock bridge)", () => {
  test("handles, calls, lists, longs, errors", async () => {
    const s = mock();
    expect(await s.ping()).toBe("pong");
    const flat = await s.newObject("mock.Flat");
    const f = await flat.getFirstFunction();
    expect(await f.getName()).toBe("main");
    const ep = await f.getEntryPoint();
    expect(await ep.$str()).toBe("1000");
    expect((await flat.getFunctionAt(await flat.toAddr(0x2000))).$c).toBe("Func");
    expect(await flat.getFunctionAt(await flat.toAddr(1))).toBeNull();
    expect(await s.cls("java.lang.Math").max(3, 9)).toBe(9);
    expect(await flat.big()).toBe(2n ** 60n);
    expect((await flat.getFunctions()).length).toBe(2); // arrays are inlined
    await expect(flat.boom()).rejects.toBeInstanceOf(JavaError);
    await s.close();
  });
  test("batch", async () => {
    const s = mock();
    const r = await s.batch([{ op: "ping" }, { op: "static", c: "java.lang.Math", m: "max", a: [1, 2] }]);
    expect(r).toEqual(["pong", 2]);
    await s.close();
  });
});

describe("flat api", () => {
  test("export list covers FlatProgramAPI and GhidraScript", () => {
    expect(FLAT_PROGRAM_API).toContain("getFunctionAt");
    expect(FLAT_PROGRAM_API).toContain("toAddr");
    expect(GHIDRA_SCRIPT_EXTRA).toContain("println");
    expect(GHIDRA_SCRIPT_EXTRA).toContain("askYesNo");
    for (const n of [...FLAT_PROGRAM_API, ...GHIDRA_SCRIPT_EXTRA]) expect(typeof (script as any)[n]).toBe("function");
  });
  test("local methods run without backend; others forward", async () => {
    const calls: string[] = [];
    let out = "";
    const flat = createFlat({ callFlat: async (m, a) => (calls.push(m), a[0]) }, { out: (s) => (out += s) });
    await flat.println("hi");
    await flat.printf("%s=%d%n", "x", 4);
    expect(out).toBe("hi\nx=4\n");
    expect(calls).toEqual([]);
    expect(await flat.getFunctionAt(7)).toBe(7);
    expect(calls).toEqual(["getFunctionAt"]);
    expect(LOCAL_METHODS.has("println")).toBe(true);
  });
  test("ask* without preset is cancelled, env presets answer", async () => {
    const flat = createFlat({ callFlat: async () => null });
    await expect(flat.askString("t", "m")).rejects.toBeInstanceOf(CancelledError);
    process.env.GHIDRA_ASK_STRING = "abc";
    expect(await flat.askString("t", "m")).toBe("abc");
    delete process.env.GHIDRA_ASK_STRING;
    expect(await flat.askYesNo("t", "m")).toBe(true);
  });
  test("sprintf", () => {
    expect(sprintf("%5d|%-4s|%x|%.2f|%%", [42, "ab", 255, 1.005])).toBe("   42|ab  |ff|1.00|%");
  });
  test("script context bindings are live", async () => {
    const { setContext, clearContext } = await import("../src/context.ts");
    expect(script.currentProgram).toBeUndefined();
    setContext({ session: undefined as any, flat: createFlat({ callFlat: async (m) => m }), currentProgram: { tag: 1 } as any });
    expect((script.currentProgram as any).tag).toBe(1);
    expect(await script.getFunctionAt(1)).toBe("getFunctionAt");
    clearContext();
    expect(script.currentProgram).toBeUndefined();
  });
});

describe("plugin + api helpers", () => {
  test("specifier parsing", () => {
    expect(parseSpecifier("./a.exe?ghidra")).toEqual({ file: "./a.exe", backend: undefined });
    expect(parseSpecifier("./a.exe?ghidra=native")).toEqual({ file: "./a.exe", backend: "native" });
    expect(parseSpecifier("ghidra:./a.exe")).toEqual({ file: "./a.exe" });
    expect(parseSpecifier("./a.ts")).toBeNull();
  });
  test("renderModule is valid JS with named exports", async () => {
    const code = renderModule({ name: "x", functions: [{ name: "f" }], blocks: [] });
    const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
    const m = await import(url);
    expect(m.default.name).toBe("x");
    expect(m.functions[0].name).toBe("f");
    expect(m.functionCount).toBe(1);
  });
  test("ApplicationInfo parses application.properties", async () => {
    const p = `${process.env.TEMP ?? "/tmp"}/app-${Date.now()}.properties`;
    await Bun.write(p, "application.name=Ghidra\napplication.version=12.2\napplication.release.name=PUBLIC\napplication.java.min=25\n");
    const a = ApplicationInfo.fromFile(p);
    expect([a.name, a.version, a.release_name, a.java_min]).toEqual(["Ghidra", "12.2", "PUBLIC", "25"]);
  });
  test("misc", () => {
    expect(started()).toBe(false);
    expect(new ProgramTypeError("x")).toBeInstanceOf(TypeError);
  });
});

describe("bridge review fixes", () => {
  test("Bridge.java inlines only InlineList and encodes string ids", async () => {
    const src = await Bun.file(import.meta.dir + "/../bridge/Bridge.java").text();
    expect(src).not.toContain("isRawList");
    expect(src).toContain("v instanceof InlineList");
    expect(src).toContain("static String idJson");
    expect(src).not.toContain("Math.abs(l)");
  });
});

describe("flat review fixes", () => {
  test("sprintf zero flag, bigint and negative hex", () => {
    expect(sprintf("%08x|%d|%x|%+d", [255, 12345678901234567890n, -1, 5])).toBe("000000ff|12345678901234567890|ffffffff|+5");
  });
  test("askInt returns a number and askYesNo honours env", async () => {
    process.env.GHIDRA_ASK_INT = "42";
    process.env.GHIDRA_ASK_YESNO = "false";
    const f: any = createFlat({ callFlat: async () => undefined }, { out: () => {} });
    expect(await f.askInt("t", "m")).toBe(42);
    expect(await f.askYesNo("t", "m")).toBe(false);
    delete process.env.GHIDRA_ASK_INT;
    delete process.env.GHIDRA_ASK_YESNO;
  });
});
