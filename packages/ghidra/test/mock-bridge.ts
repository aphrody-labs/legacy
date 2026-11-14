// Minimal protocol-compatible mock of bridge/Bridge.java for local tests (no JVM needed).
import { createInterface } from "node:readline";
const objs = new Map<number, any>();
let n = 1;
const enc = (v: any): any => {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return { $long: v.toString() };
  if (Array.isArray(v)) return v.map(enc);
  const id = n++;
  objs.set(id, v);
  return { $h: id, c: v.constructor?.name ?? "Object" };
};
const dec = (v: any): any => (v && typeof v === "object" && "$h" in v ? objs.get(v.$h) : v && typeof v === "object" && "$long" in v ? BigInt(v.$long) : v);
class Addr { constructor(public off: number) {} toString() { return this.off.toString(16); } getOffset() { return this.off; } }
class Func { constructor(public nm: string, public a: Addr) {} getName() { return this.nm; } getEntryPoint() { return this.a; } }
class FlatMock {
  fns = [new Func("main", new Addr(0x1000)), new Func("helper", new Addr(0x2000))];
  getFirstFunction() { return this.fns[0]; }
  getFunctionAt(a: Addr) { return this.fns.find((f) => f.a.off === a.off) ?? null; }
  toAddr(x: number) { return new Addr(x); }
  getFunctions() { return this.fns; }
  big() { return 2n ** 60n; }
  boom() { throw Object.assign(new Error("kaboom"), { type: "java.lang.IllegalStateException" }); }
}
const classes: Record<string, any> = { "mock.Flat": FlatMock, "java.lang.Math": { max: Math.max } };
const run = (r: any): any => {
  const a = (r.a ?? []).map(dec);
  if (r.op === "ping") return "pong";
  if (r.op === "static") return enc(classes[r.c][r.m](...a));
  throw new Error("op " + r.op);
};
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const r = JSON.parse(line);
  const out = (res: any) => console.log(JSON.stringify({ id: r.id, result: res }));
  try {
    const a = (r.a ?? []).map(dec);
    switch (r.op) {
      case "ping": out("pong"); break;
      case "batch": out(r.reqs.map((q: any) => { try { return { id: q.id, result: run(q) }; } catch (e: any) { return { id: q.id, error: { type: "Error", message: e.message, trace: "" } }; } })); break;
      case "new": out(enc(new classes[r.c](...a))); break;
      case "static": out(enc(classes[r.c][r.m](...a))); break;
      case "call": out(enc(objs.get(r.h)[r.m](...a))); break;
      case "list": out(objs.get(r.h).map(enc)); break;
      case "str": out(String(objs.get(r.h))); break;
      case "release": for (const h of r.hs) objs.delete(h); out(null); break;
      default: throw new Error("op " + r.op);
    }
  } catch (e: any) {
    console.log(JSON.stringify({ id: r.id, error: { type: e.type ?? "Error", message: e.message, trace: "" } }));
  }
}
