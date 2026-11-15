// Translator core without file access (safe in a browser bundle); `createTranslator` in i18n.ts adds the config defaults.
import { getAdapter, type MessageAdapter, type MessageArgs } from "./adapter.ts";
import { isRtl } from "./mf2.ts";
import { matchLocale } from "./match.ts";

export type Catalog = Readonly<Record<string, string>>;
export type Catalogs = Readonly<Partial<Record<string, Catalog>>>;

export interface Translator {
  readonly locale: string;
  /** Translate `key`; missing in the locale falls back to its base language, then the source locale, then the key itself. */
  t(key: string, args?: MessageArgs): string;
  has(key: string): boolean;
  /** Writing direction of the locale. */
  readonly dir: "ltr" | "rtl";
}

export interface TranslatorOptions {
  /** Source locale; default from i18n.config.json. */
  source?: string;
  /** Message format adapter or id; default from the config, else detected from the catalogs, else mf2. */
  format?: string | MessageAdapter;
}

/** Translator with an explicit source locale and message format (no config lookup). */
export function createTranslatorCore(
  catalogs: Catalogs,
  locale: string,
  source: string,
  format: string | MessageAdapter = "mf2",
): Translator {
  const known = Object.keys(catalogs);
  const resolved = matchLocale(locale, known) ?? source;
  const base = new Intl.Locale(resolved).language;
  const chain = [...new Set([resolved, base, source])];
  const adapter = typeof format === "object" ? format : getAdapter(format);
  const find = (key: string): { text: string; from: string } | undefined => {
    for (const l of chain) {
      const text = catalogs[l]?.[key];
      if (text !== undefined) return { text, from: l };
    }
    return undefined;
  };
  return {
    locale: resolved,
    dir: isRtl(resolved) ? "rtl" : "ltr",
    has: (key) => find(key) !== undefined,
    t(key, args) {
      const hit = find(key);
      if (!hit) return key;
      return adapter.compile(hit.text, hit.from).format(args);
    },
  };
}
