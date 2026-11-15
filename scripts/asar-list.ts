// Read-only ASAR header listing: bun scripts/asar-list.ts <app.asar> [grep-regex-on-js]
import { openSync, readSync, closeSync } from "node:fs";
const [, , p, pat] = process.argv;
const fd = openSync(p, "r");
const h = Buffer.alloc(16);
readSync(fd, h, 0, 16, 0);
const hdrLen = h.readUInt32LE(12);
const buf = Buffer.alloc(hdrLen);
readSync(fd, buf, 0, hdrLen, 16);
const hdr = JSON.parse(buf.toString("utf8"));
const base = 16 + h.readUInt32LE(4) - 4 + 4 - 4; // data starts after header pickle
const dataStart = 8 + h.readUInt32LE(4);
const files: { path: string; size: number; offset: number; unpacked?: boolean }[] = [];
const walk = (n: any, pre: string) => {
  for (const [k, v] of Object.entries<any>(n.files ?? {})) {
    if (v.files) walk(v, `${pre}${k}/`);
    else files.push({ path: pre + k, size: v.size, offset: Number(v.offset ?? 0), unpacked: v.unpacked });
  }
};
walk(hdr, "");
console.log(`files=${files.length} totalBytes=${files.reduce((a, f) => a + f.size, 0)}`);
const top = new Map<string, number>();
for (const f of files) top.set(f.path.split("/")[0], (top.get(f.path.split("/")[0]) ?? 0) + 1);
console.log([...top].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}:${v}`).join(" "));
if (pat) {
  const re = new RegExp(pat, "g");
  const out = new Map<string, Set<string>>();
  for (const f of files) {
    if (f.unpacked || !/\.(js|cjs|mjs|json)$/.test(f.path) || f.size > 8_000_000) continue;
    const b = Buffer.alloc(f.size);
    readSync(fd, b, 0, f.size, dataStart + f.offset);
    const t = b.toString("utf8");
    for (const m of t.matchAll(re)) {
      if (!out.has(f.path)) out.set(f.path, new Set());
      out.get(f.path)!.add(m[0].slice(0, 120));
    }
  }
  for (const [k, v] of out) console.log(k, [...v].slice(0, 25).join(" | "));
}
closeSync(fd);
