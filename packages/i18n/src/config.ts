import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface I18nConfig {
  /** Language every other catalog is translated from; the text written in the code base. */
  sourceLocale: string;
  /** Message format id (see adapter.ts); detected from the catalogs when absent. */
  format?: string;
}

/** Package root: i18n.config.json and locales/ live here. */
export const packageRoot = join(import.meta.dir, "..");
export const defaultLocalesDir = join(packageRoot, "locales");
export const DEFAULT_SOURCE_LOCALE = "en";

/** Read `i18n.config.json` (next to the locales dir, or in `root`); `APHRODY_I18N_SOURCE` overrides the source locale. */
export function readConfig(root: string = packageRoot): I18nConfig {
  const file = join(root, "i18n.config.json");
  const raw = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Partial<I18nConfig>)
    : {};
  const sourceLocale =
    Bun.env.APHRODY_I18N_SOURCE || raw.sourceLocale || DEFAULT_SOURCE_LOCALE;
  return { ...raw, sourceLocale: canonicalTag(sourceLocale) };
}

/** BCP 47 canonical form; throws a RangeError naming the bad tag. */
export function canonicalTag(tag: string): string {
  return Intl.getCanonicalLocales(tag.replace(/_/g, "-"))[0]!;
}

export const isValidTag = (tag: string): boolean => {
  try {
    canonicalTag(tag);
    return true;
  } catch {
    return false;
  }
};
