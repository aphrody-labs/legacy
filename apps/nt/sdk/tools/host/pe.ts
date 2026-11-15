// PE/COFF reading (Learn "PE Format"): headers, sections, data directories, exports, imports, resources.
// Shared by pe-icon.ts (icons) and ntmap.ts (Windows NT map of this machine).

export type Pe = {
  view: DataView;
  machine: number;
  timestamp: number;
  subsystem: number;
  dir: (i: number) => { rva: number; size: number };
  off: (rva: number) => number;
  cstr: (rva: number) => string;
};

const ascii = new TextDecoder("latin1");

export function parsePe(buf: ArrayBuffer): Pe | null {
  const b = new DataView(buf);
  if (b.byteLength < 64 || b.getUint16(0, true) !== 0x5a4d) return null;
  const pe = b.getUint32(60, true);
  if (pe + 24 > b.byteLength || b.getUint32(pe, true) !== 0x4550) return null;
  const nsec = b.getUint16(pe + 6, true);
  const optSize = b.getUint16(pe + 20, true);
  const opt = pe + 24;
  const plus = b.getUint16(opt, true) === 0x20b;
  const dd = opt + (plus ? 112 : 96);
  const ndirs = b.getUint32(opt + (plus ? 108 : 92), true);
  const secs = opt + optSize;
  const off = (rva: number) => {
    for (let i = 0; i < nsec; i++) {
      const s = secs + i * 40;
      const va = b.getUint32(s + 12, true);
      const size = Math.max(
        b.getUint32(s + 8, true),
        b.getUint32(s + 16, true),
      );
      if (rva >= va && rva < va + size)
        return rva - va + b.getUint32(s + 20, true);
    }
    return -1;
  };
  const cstr = (rva: number) => {
    const o = off(rva);
    if (o < 0) return "";
    let e = o;
    while (e < b.byteLength && b.getUint8(e)) e++;
    return ascii.decode(new Uint8Array(buf, o, e - o));
  };
  return {
    view: b,
    machine: b.getUint16(pe + 4, true),
    timestamp: b.getUint32(pe + 8, true),
    subsystem: b.getUint16(opt + 68, true),
    dir: (i) =>
      i < ndirs
        ? {
            rva: b.getUint32(dd + i * 8, true),
            size: b.getUint32(dd + i * 8 + 4, true),
          }
        : { rva: 0, size: 0 },
    off,
    cstr,
  };
}

/** Exported names (IMAGE_EXPORT_DIRECTORY, directory 0). */
export function exportsOf(p: Pe): string[] {
  const d = p.dir(0);
  const o = d.rva ? p.off(d.rva) : -1;
  if (o < 0) return [];
  const b = p.view;
  const n = b.getUint32(o + 24, true);
  const names = p.off(b.getUint32(o + 32, true));
  if (names < 0) return [];
  return Array.from({ length: n }, (_, i) =>
    p.cstr(b.getUint32(names + i * 4, true)),
  );
}

export type ExportEntry = {
  name: string;
  ordinal: number;
  rva: number;
  forwarder?: string;
};

/** Complete export table: name, ordinal, RVA; an RVA inside the export directory is a forwarder ("dll.name"). */
export function exportTable(p: Pe): ExportEntry[] {
  const d = p.dir(0);
  const o = d.rva ? p.off(d.rva) : -1;
  if (o < 0) return [];
  const b = p.view;
  const base = b.getUint32(o + 16, true);
  const nNames = b.getUint32(o + 24, true);
  const funcs = p.off(b.getUint32(o + 28, true));
  const names = p.off(b.getUint32(o + 32, true));
  const ords = p.off(b.getUint32(o + 36, true));
  if (funcs < 0 || names < 0 || ords < 0) return [];
  return Array.from({ length: nNames }, (_, i) => {
    const idx = b.getUint16(ords + i * 2, true);
    const rva = b.getUint32(funcs + idx * 4, true);
    const fwd = rva >= d.rva && rva < d.rva + d.size;
    return {
      name: p.cstr(b.getUint32(names + i * 4, true)),
      ordinal: base + idx,
      rva,
      ...(fwd ? { forwarder: p.cstr(rva) } : {}),
    };
  });
}

/** Functions imported per DLL (thunks by name; "#n" for an import by ordinal), PE32 and PE32+. */
export function importFunctions(p: Pe): { dll: string; name: string }[] {
  const d = p.dir(1);
  let o = d.rva ? p.off(d.rva) : -1;
  const b = p.view;
  const plus =
    (b.getUint16(b.getUint32(60, true) + 24, true) & 0xffff) === 0x20b;
  const out: { dll: string; name: string }[] = [];
  while (o >= 0 && o + 20 <= b.byteLength) {
    const nameRva = b.getUint32(o + 12, true);
    if (!nameRva) break;
    const dll = p.cstr(nameRva).toLowerCase();
    let t = p.off(b.getUint32(o, true) || b.getUint32(o + 16, true));
    while (t >= 0 && t + (plus ? 8 : 4) <= b.byteLength) {
      const v = plus ? b.getBigUint64(t, true) : BigInt(b.getUint32(t, true));
      if (!v) break;
      const byOrd = plus ? v >> 63n === 1n : (v & 0x80000000n) !== 0n;
      out.push({
        dll,
        name: byOrd
          ? `#${Number(v & 0xffffn)}`
          : p.cstr(Number(v & 0x7fffffffn) + 2),
      });
      t += plus ? 8 : 4;
    }
    o += 20;
  }
  return out;
}

/** Imported DLLs (IMAGE_IMPORT_DESCRIPTOR, directory 1, 20 bytes per entry, ended by a null entry). */
export function importsOf(p: Pe): string[] {
  const d = p.dir(1);
  let o = d.rva ? p.off(d.rva) : -1;
  const out: string[] = [];
  while (o >= 0 && o + 20 <= p.view.byteLength) {
    const name = p.view.getUint32(o + 12, true);
    if (!name) break;
    out.push(p.cstr(name).toLowerCase());
    o += 20;
  }
  return out;
}

/** Entries of an IMAGE_RESOURCE_DIRECTORY (directory 2): id or name, offset (bit 31 = subdirectory). */
export function resourceEntries(p: Pe, dirOff: number) {
  const b = p.view;
  const n = b.getUint16(dirOff + 12, true) + b.getUint16(dirOff + 14, true);
  return Array.from({ length: n }, (_, i) => ({
    id: b.getUint32(dirOff + 16 + i * 8, true),
    off: b.getUint32(dirOff + 20 + i * 8, true),
  }));
}
