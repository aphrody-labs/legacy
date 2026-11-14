// Python `json` subset (dict -> Map).
import { ValueError, Kw } from "./index";

function plain(x: any): any {
  if (x instanceof Map) return Object.fromEntries([...x].map(([k, v]) => [String(k), plain(v)]));
  if (x instanceof Set) return [...x].map(plain);
  if (Array.isArray(x)) return x.map(plain);
  if (typeof x === "bigint") return Number(x);
  return x;
}
function revive(x: any): any {
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === "object") return new Map(Object.entries(x).map(([k, v]) => [k, revive(v)]));
  return x;
}
export function dumps(o: any, ...a: any[]): string {
  const k = a.find((x) => x instanceof Kw)?.o ?? {};
  const ind = k.indent ?? undefined;
  let s = JSON.stringify(plain(o), null, ind);
  if (ind === undefined) s = s.replace(/([,:])(?=["\[{\d\-tfn])/g, "$1 ");
  return s;
}
export function loads(s: string): any {
  try {
    return revive(JSON.parse(s));
  } catch (e: any) {
    throw new ValueError(`json: ${e.message}`);
  }
}
export const dump = (o: any, f: any, ...a: any[]) => f.write(dumps(o, ...a));
export const load = (f: any) => loads(f.read());
