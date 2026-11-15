import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getAdapter,
  resolveAdapter,
  type CatalogFile,
  type MessageAdapter,
  type MessageArgs,
} from "./adapter.ts";
import { defaultLocalesDir, readConfig } from "./config.ts";
import { isRtl } from "./mf2.ts";
import { matchLocale } from "./negotiate.ts";

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

export function createTranslator(
  catalogs: Catalogs,
  locale: string,
  opts: TranslatorOptions | string = {},
): Translator {
  const o: TranslatorOptions =
    typeof opts === "string" ? { source: opts } : opts;
  const source = o.source ?? readConfig().sourceLocale;
  const known = Object.keys(catalogs);
  const resolved = matchLocale(locale, known) ?? source;
  const base = new Intl.Locale(resolved).language;
  const chain = [...new Set([resolved, base, source])];
  const adapter =
    typeof o.format === "object"
      ? o.format
      : o.format
        ? getAdapter(o.format)
        : resolveAdapter(readConfig().format, sampleFiles(catalogs));
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

function sampleFiles(catalogs: Catalogs): CatalogFile[] {
  return Object.entries(catalogs).map(([l, c]) => ({
    name: `${l}.json`,
    text: JSON.stringify(c ?? {}),
  }));
}

/** Locales present in a catalog directory: every `<bcp47>.json` file (a catalog dropped there is supported). */
export function discoverLocales(dir: string = defaultLocalesDir): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .filter((l) => {
      try {
        return Intl.getCanonicalLocales(l)[0] === l;
      } catch {
        return false;
      }
    })
    .sort();
}

/** Read every catalog of a directory, synchronously (bundled defaults need it at import time). */
export function loadCatalogsSync(
  dir: string = defaultLocalesDir,
): Record<string, Catalog> {
  const out: Record<string, Catalog> = {};
  for (const l of discoverLocales(dir))
    out[l] = JSON.parse(
      readFileSync(join(dir, `${l}.json`), "utf8"),
    ) as Catalog;
  return out;
}

/** Load the catalogs of a directory (default packages/i18n/locales). */
export async function loadCatalogs(
  dir: string = defaultLocalesDir,
): Promise<Record<string, Catalog>> {
  const out: Record<string, Catalog> = {};
  for (const l of discoverLocales(dir))
    out[l] = (await Bun.file(join(dir, `${l}.json`)).json()) as Catalog;
  return out;
}
