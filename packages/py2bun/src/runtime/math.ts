// Python `math` subset.
import { ValueError, int, floordiv } from "./index";
export const pi = Math.PI;
export const e = Math.E;
export const tau = 2 * Math.PI;
export const inf = Infinity;
export const nan = NaN;
export const sqrt = (x: number) => {
  if (x < 0) throw new ValueError("math domain error");
  return Math.sqrt(x);
};
export const floor = (x: number) => Math.floor(x);
export const ceil = (x: number) => Math.ceil(x);
export const trunc = (x: number) => Math.trunc(x);
export const fabs = Math.abs;
export const exp = Math.exp;
export const log = (x: number, b?: number) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b));
export const log2 = Math.log2;
export const log10 = Math.log10;
export const sin = Math.sin;
export const cos = Math.cos;
export const tan = Math.tan;
export const asin = Math.asin;
export const acos = Math.acos;
export const atan = Math.atan;
export const atan2 = Math.atan2;
export const sinh = Math.sinh;
export const cosh = Math.cosh;
export const tanh = Math.tanh;
export const pow = Math.pow;
export const hypot = Math.hypot;
export const degrees = (x: number) => (x * 180) / Math.PI;
export const radians = (x: number) => (x * Math.PI) / 180;
export const isnan = Number.isNaN;
export const isinf = (x: number) => x === Infinity || x === -Infinity;
export const isfinite = Number.isFinite;
export function gcd(...a: any[]): number {
  let g = 0;
  for (let x of a) {
    x = Math.abs(int(x));
    while (x) [g, x] = [x, g % x];
    // eslint-disable-next-line no-self-assign
    g = g;
  }
  return g;
}
export const factorial = (n: number): any => {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : r;
};
export const copysign = (x: number, y: number) => (Math.sign(y) < 0 || Object.is(y, -0) ? -Math.abs(x) : Math.abs(x));
export const fmod = (a: number, b: number) => a % b;
export const isqrt = (n: number) => Math.floor(Math.sqrt(n));
void floordiv;
