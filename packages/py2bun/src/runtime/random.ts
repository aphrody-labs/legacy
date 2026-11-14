// Python `random` subset (non-reproducible vs CPython).
import { IndexError, iter } from "./index";
export const seed = (_: any) => {};
export const random = () => Math.random();
export const randint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const randrange = (a: number, b?: number) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a)));
export const uniform = (a: number, b: number) => a + Math.random() * (b - a);
export function choice(s: any) {
  const a = Array.from(iter(s));
  if (!a.length) throw new IndexError("Cannot choose from an empty sequence");
  return a[Math.floor(Math.random() * a.length)];
}
export function shuffle(a: any[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
