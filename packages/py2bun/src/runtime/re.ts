// Python `re` subset on JS RegExp.
export const IGNORECASE = 2, I = 2, MULTILINE = 8, M = 8, DOTALL = 16, S = 16, VERBOSE = 64, X = 64;
const conv = (p: string) => p.replace(/\(\?P<(\w+)>/g, "(?<$1>").replace(/\(\?P=(\w+)\)/g, "\\k<$1>").replace(/\\Z/g, "$").replace(/\\A/g, "^");
const mk = (p: string, f = 0, g = false) => new RegExp(conv(p), (g ? "g" : "") + (f & 2 ? "i" : "") + (f & 8 ? "m" : "") + (f & 16 ? "s" : "") + "u");
class Match {
  constructor(private m: RegExpExecArray) {}
  group(...a: (number | string)[]) {
    const g = (k: any) => (k === 0 || k === undefined ? this.m[0] : typeof k === "number" ? this.m[k] ?? null : this.m.groups?.[k] ?? null);
    return a.length > 1 ? a.map(g) : g(a[0]);
  }
  groups() {
    return this.m.slice(1).map((x) => x ?? null);
  }
  groupdict() {
    return new Map(Object.entries(this.m.groups ?? {}));
  }
  start() {
    return this.m.index;
  }
  end() {
    return this.m.index + this.m[0].length;
  }
  span() {
    return [this.start(), this.end()];
  }
}
const wrap = (m: RegExpExecArray | null) => (m ? new Match(m) : null);
class Pattern {
  constructor(public pattern: string, public flags = 0) {}
  match(s: string) {
    const m = new RegExp("^(?:" + conv(this.pattern) + ")", mk(this.pattern, this.flags).flags).exec(s);
    return wrap(m);
  }
  fullmatch(s: string) {
    return wrap(new RegExp("^(?:" + conv(this.pattern) + ")$", mk(this.pattern, this.flags).flags).exec(s));
  }
  search(s: string) {
    return wrap(mk(this.pattern, this.flags).exec(s));
  }
  findall(s: string) {
    const out: any[] = [];
    for (const m of s.matchAll(mk(this.pattern, this.flags, true))) out.push(m.length > 2 ? m.slice(1) : m.length === 2 ? m[1] : m[0]);
    return out;
  }
  finditer(s: string) {
    return [...s.matchAll(mk(this.pattern, this.flags, true))].map((m) => new Match(m as RegExpExecArray));
  }
  sub(r: any, s: string, count = 0) {
    let n = 0;
    return s.replace(mk(this.pattern, this.flags, true), (...a: any[]) => {
      if (count && n >= count) return a[0];
      n++;
      if (typeof r === "function") return r(new Match(Object.assign(a.slice(0, a.findIndex((x) => typeof x === "number")), { index: a.find((x) => typeof x === "number"), groups: undefined }) as any));
      return r.replace(/\\(\d+)/g, (_m: string, i: string) => a[+i] ?? "");
    });
  }
  split(s: string, maxsplit = 0) {
    const out: any[] = [];
    let last = 0;
    let n = 0;
    for (const m of s.matchAll(mk(this.pattern, this.flags, true))) {
      if (maxsplit > 0 && n >= maxsplit) break;
      if (m[0] === "" && (m.index === 0 || m.index === s.length)) continue;
      out.push(s.slice(last, m.index));
      for (const g of m.slice(1)) out.push(g === undefined ? null : g);
      last = m.index! + m[0].length;
      n++;
    }
    out.push(s.slice(last));
    return out;
  }
}
export const compile = (p: string, f = 0) => new Pattern(p, f);
export const match = (p: string, s: string, f = 0) => new Pattern(p, f).match(s);
export const fullmatch = (p: string, s: string, f = 0) => new Pattern(p, f).fullmatch(s);
export const search = (p: string, s: string, f = 0) => new Pattern(p, f).search(s);
export const findall = (p: string, s: string, f = 0) => new Pattern(p, f).findall(s);
export const finditer = (p: string, s: string, f = 0) => new Pattern(p, f).finditer(s);
export const sub = (p: string, r: any, s: string, count = 0, f = 0) => new Pattern(p, f).sub(r, s, count);
export const split = (p: string, s: string, maxsplit = 0, f = 0) => new Pattern(p, f).split(s, maxsplit);
export const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
