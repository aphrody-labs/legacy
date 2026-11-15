import { MessageFormat } from "messageformat";
import { SOURCE_LOCALE, catalogs } from "../locales/registry";

export { SOURCE_LOCALE, catalogs };
export type Locale = string;
export type Catalog = Readonly<Record<string, string>>;
export type MessageArgs = Readonly<Record<string, unknown>>;

/** Locales shipped with the app: whatever catalogs the registry holds. */
export const LOCALES: readonly Locale[] = Object.keys(catalogs);

export interface Translator {
  readonly locale: Locale;
  /** Translate a key (Unicode MessageFormat 2 source). Falls back to the source locale, then to the key. */
  t(key: string, args?: MessageArgs): string;
  has(key: string): boolean;
  /** Locale-aware formatting through Intl, never hand-written formats. */
  number(value: number, options?: Intl.NumberFormatOptions): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
}

/** Best shipped locale for a BCP 47 tag or an Accept-Language header (quality order); the source locale if none match. */
export function matchLocale(input: string | null | undefined, available: readonly Locale[] = LOCALES): Locale {
  const ranked = (input ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const exact = available.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split("-")[0]!;
    const near = available.find((l) => l.toLowerCase() === base || l.toLowerCase().split("-")[0] === base);
    if (near) return near;
  }
  return SOURCE_LOCALE;
}

const compiled = new Map<string, MessageFormat>();

function render(locale: Locale, key: string, source: string, args?: MessageArgs): string {
  if (!/[{}\\]/.test(source) && !source.startsWith(".")) return source;
  const id = `${locale}\0${key}`;
  let mf = compiled.get(id);
  if (!mf) {
    mf = new MessageFormat(locale, source, { bidiIsolation: "none" });
    compiled.set(id, mf);
  }
  return mf.format(args as Record<string, unknown> | undefined);
}

export function createTranslator(
  locale: string | null | undefined,
  extra?: Readonly<Record<Locale, Catalog>>,
): Translator {
  const resolved = matchLocale(locale, extra ? [...new Set([...LOCALES, ...Object.keys(extra)])] : LOCALES);
  const order = resolved === SOURCE_LOCALE ? [SOURCE_LOCALE] : [resolved, SOURCE_LOCALE];
  const find = (key: string): { text: string; from: Locale } | undefined => {
    for (const l of order) {
      const text = extra?.[l]?.[key] ?? catalogs[l]?.[key];
      if (text !== undefined) return { text, from: l };
    }
    return undefined;
  };
  return {
    locale: resolved,
    has: (key) => find(key) !== undefined,
    t(key, args) {
      const hit = find(key);
      return hit ? render(hit.from, key, hit.text, args) : key;
    },
    number: (value, options) => new Intl.NumberFormat(resolved, options).format(value),
    currency: (value, currency, options) =>
      new Intl.NumberFormat(resolved, { style: "currency", currency, ...options }).format(value),
    date: (value, options) =>
      new Intl.DateTimeFormat(resolved, options ?? { dateStyle: "medium" }).format(new Date(value)),
  };
}
