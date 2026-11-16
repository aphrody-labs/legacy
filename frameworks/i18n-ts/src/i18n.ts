import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAdapter, type CatalogFile } from "./adapter.ts";
import { defaultLocalesDir, readConfig } from "./config.ts";
import {
  createTranslatorCore,
  type Catalog,
  type Catalogs,
  type Translator,
  type TranslatorOptions,
} from "./translator.ts";

export type { Catalog, Catalogs, Translator, TranslatorOptions };

export function createTranslator(
  catalogs: Catalogs,
  locale: string,
  opts: TranslatorOptions | string = {},
): Translator {
  const o: TranslatorOptions =
    typeof opts === "string" ? { source: opts } : opts;
  const source = o.source ?? readConfig().sourceLocale;
  const adapter =
    typeof o.format === "object"
      ? o.format
      : o.format
        ? o.format
        : resolveAdapter(readConfig().format, sampleFiles(catalogs));
  return createTranslatorCore(catalogs, locale, source, adapter);
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

/** Load the catalogs of a directory (default frameworks/i18n-ts/locales). */
export async function loadCatalogs(
  dir: string = defaultLocalesDir,
): Promise<Record<string, Catalog>> {
  const out: Record<string, Catalog> = {};
  for (const l of discoverLocales(dir))
    out[l] = (await Bun.file(join(dir, `${l}.json`)).json()) as Catalog;
  return out;
}
