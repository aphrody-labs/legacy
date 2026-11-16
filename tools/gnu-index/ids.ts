// Shared by merge.ts (inventory) and scripts/gnu-packages.ts (system/gnu/packages.toml).

/** Inventory name (gnu-packages.json) -> GSRC id (pkg/gnu directory), where they differ. */
export const GSRC_ID: Record<string, string> = { libc: "glibc", gcc: "gcc16" };
export const gsrcId = (name: string) => GSRC_ID[name] ?? name;
/** GSRC id -> inventory name. */
export const inventoryName = (id: string) => Object.entries(GSRC_ID).find(([, v]) => v === id)?.[0] ?? id;

/** Version compare on dotted numeric parts (letters sort after digits): > 0 when a is newer. */
export function cmpVer(a: string, b: string): number {
  const p = (v: string) => v.split(/[.\-_]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [u, v] = [x[i] ?? 0, y[i] ?? 0];
    if (u === v) continue;
    if (typeof u === "number" && typeof v === "number") return u - v;
    return String(u) < String(v) ? -1 : 1;
  }
  return 0;
}
