// Async-aware variants used by py2bun in async mode (Ghidra scripts: every call crosses to the JVM).
// JObject proxies (packages/ghidra) expose `$list()` / `$str()`; anything else behaves as in the sync runtime.
import * as py from "./index";

const isJ = (x: any) => x != null && typeof x === "object" && typeof x.$list === "function";

/** Resolve promises and turn Java iterables / async iterables into arrays; other values pass through. */
export async function materialize(x: any): Promise<any> {
  x = await x;
  if (isJ(x)) return await x.$list();
  if (x != null && typeof x === "object" && typeof x[Symbol.asyncIterator] === "function") {
    const out: any[] = [];
    for await (const v of x) out.push(v);
    return out;
  }
  return x;
}

export async function* aiter(x: any): AsyncGenerator<any> {
  x = await x;
  if (x != null && typeof x === "object" && typeof x[Symbol.asyncIterator] === "function") {
    yield* x;
    return;
  }
  yield* py.iter(isJ(x) ? await x.$list() : x);
}

export async function a_str(x: any): Promise<string> {
  x = await x;
  if (isJ(x) && typeof x.$str === "function") return await x.$str();
  if (x != null && typeof x === "object" && typeof x.toString === "function" && !Array.isArray(x) && x.constructor === Object) return py.str(x);
  return py.str(x);
}

export async function a_len(x: any) {
  return py.len(await materialize(x));
}
export const a_list = async (x?: any) => py.list(x === undefined ? undefined : await materialize(x));
export const a_tuple = a_list;
export const a_set = async (x?: any) => py.set(x === undefined ? undefined : await materialize(x));
export const a_frozenset = a_set;
export async function a_sorted(it: any, ...rest: any[]) {
  return py.sorted(await materialize(it), ...rest);
}
export const a_sum = async (it: any, start?: any) => py.sum(await materialize(it), start);
export async function a_min(...a: any[]) {
  return py.min(...(await Promise.all(a.map((x, i) => (i === 0 && a.length === 1 ? materialize(x) : x)))));
}
export async function a_max(...a: any[]) {
  return py.max(...(await Promise.all(a.map((x, i) => (i === 0 && a.length === 1 ? materialize(x) : x)))));
}
export const a_any = async (it: any) => py.any(await materialize(it));
export const a_all = async (it: any) => py.all(await materialize(it));
export const a_reversed = async (it: any) => py.reversed(await materialize(it));
export async function a_dict(...a: any[]) {
  return py.dict(...(await Promise.all(a.map((x) => (x instanceof py.Kw ? x : materialize(x))))));
}

export async function* a_enumerate(it: any, ...a: any[]) {
  const [pos, k] = a[a.length - 1] instanceof py.Kw ? [a.slice(0, -1), a[a.length - 1].o] : [a, {}];
  let i = pos[0] ?? k.start ?? 0;
  for await (const v of aiter(it)) yield [i++, v];
}
export async function* a_zip(...its: any[]) {
  const arrs = await Promise.all(its.filter((x) => !(x instanceof py.Kw)).map(materialize));
  yield* py.zip(...arrs);
}
export async function* a_map(f: any, ...its: any[]) {
  const arrs = await Promise.all(its.map(materialize));
  for (const v of py.map(f, ...arrs)) yield await v;
}
export async function* a_filter(f: any, it: any) {
  for await (const v of aiter(it)) if (f == null ? py.truth(v) : py.truth(await f(v))) yield v;
}

/** "fmt" % args with Java objects rendered through `$str()`. */
export async function a_mod(fmt: any, args: any): Promise<any> {
  fmt = await fmt;
  if (typeof fmt !== "string") return py.mod(fmt, await args);
  const conv = async (v: any) => (isJ(await v) ? await a_str(v) : await v);
  if (Array.isArray(args)) return py.mod(fmt, await Promise.all(args.map(conv)));
  return py.mod(fmt, await conv(args));
}

export async function a_contains(c: any, x: any): Promise<boolean> {
  c = await c;
  x = await x;
  if (isJ(c) && typeof c.contains === "function") return !!(await c.contains(x));
  return py.contains(c, x);
}

export async function a_eq(a: any, b: any): Promise<boolean> {
  a = await a;
  b = await b;
  if (isJ(a) && typeof a.equals === "function") return !!(await a.equals(b));
  return py.eq(a, b);
}

export async function a_and(...ts: (() => Promise<any>)[]) {
  let v: any = true;
  for (const t of ts) {
    v = await t();
    if (!py.truth(v)) return v;
  }
  return v;
}
export async function a_or(...ts: (() => Promise<any>)[]) {
  let v: any = false;
  for (const t of ts) {
    v = await t();
    if (py.truth(v)) return v;
  }
  return v;
}
