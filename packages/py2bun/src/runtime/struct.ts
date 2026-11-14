// Python `struct` subset: <, >, =, @ prefixes; b B h H i I l L q Q f d x s ?
import { ValueError } from "./index";
const SIZES: Record<string, number> = { b: 1, B: 1, h: 2, H: 2, i: 4, I: 4, l: 4, L: 4, q: 8, Q: 8, f: 4, d: 8, x: 1, s: 1, "?": 1, c: 1 };
function parse(fmt: string): { le: boolean; items: [string, number][] } {
  let le = true;
  let i = 0;
  if ("<>=@!".includes(fmt[0])) {
    le = fmt[0] !== ">" && fmt[0] !== "!";
    i = 1;
  }
  const items: [string, number][] = [];
  const re = /(\d*)([a-zA-Z?])/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(fmt))) {
    if (!(m[2] in SIZES)) throw new ValueError(`bad char in struct format: ${m[2]}`);
    items.push([m[2], m[1] ? +m[1] : 1]);
  }
  return { le, items };
}
export function calcsize(fmt: string) {
  return parse(fmt).items.reduce((a, [c, n]) => a + SIZES[c] * n, 0);
}
export function pack(fmt: string, ...vals: any[]) {
  const { le, items } = parse(fmt);
  const dv = new DataView(new ArrayBuffer(calcsize(fmt)));
  let o = 0;
  let vi = 0;
  for (const [c, n] of items) {
    if (c === "s") {
      const b = vals[vi++] as Uint8Array;
      for (let k = 0; k < n; k++) dv.setUint8(o + k, b[k] ?? 0);
      o += n;
      continue;
    }
    for (let k = 0; k < n; k++) {
      if (c === "x") {
        o += 1;
        continue;
      }
      const v = vals[vi++];
      switch (c) {
        case "b": dv.setInt8(o, v); break;
        case "B": case "c": case "?": dv.setUint8(o, typeof v === "boolean" ? +v : v); break;
        case "h": dv.setInt16(o, v, le); break;
        case "H": dv.setUint16(o, v, le); break;
        case "i": case "l": dv.setInt32(o, v, le); break;
        case "I": case "L": dv.setUint32(o, v, le); break;
        case "q": dv.setBigInt64(o, BigInt(v), le); break;
        case "Q": dv.setBigUint64(o, BigInt(v), le); break;
        case "f": dv.setFloat32(o, v, le); break;
        case "d": dv.setFloat64(o, v, le); break;
      }
      o += SIZES[c];
    }
  }
  return new Uint8Array(dv.buffer);
}
export function unpack(fmt: string, buf: Uint8Array) {
  const { le, items } = parse(fmt);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: any[] = [];
  let o = 0;
  for (const [c, n] of items) {
    if (c === "s") {
      out.push(buf.slice(o, o + n));
      o += n;
      continue;
    }
    for (let k = 0; k < n; k++) {
      if (c === "x") {
        o += 1;
        continue;
      }
      let v: any;
      switch (c) {
        case "b": v = dv.getInt8(o); break;
        case "B": case "c": v = dv.getUint8(o); break;
        case "?": v = !!dv.getUint8(o); break;
        case "h": v = dv.getInt16(o, le); break;
        case "H": v = dv.getUint16(o, le); break;
        case "i": case "l": v = dv.getInt32(o, le); break;
        case "I": case "L": v = dv.getUint32(o, le); break;
        case "q": { const b = dv.getBigInt64(o, le); v = b >= -9007199254740991n && b <= 9007199254740991n ? Number(b) : b; break; }
        case "Q": { const b = dv.getBigUint64(o, le); v = b <= 9007199254740991n ? Number(b) : b; break; }
        case "f": v = dv.getFloat32(o, le); break;
        case "d": v = dv.getFloat64(o, le); break;
      }
      out.push(v);
      o += SIZES[c];
    }
  }
  return out;
}
