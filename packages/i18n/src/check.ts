import type { MessageAdapter } from "./adapter.ts";
import type { Catalog } from "./i18n.ts";
import { mf2Adapter } from "./mf2.ts";

export interface LocaleReport {
  locale: string;
  missing: string[];
  extra: string[];
  /** keys whose placeholder names differ from the source */
  placeholders: string[];
  /** keys that do not parse */
  syntax: string[];
}

function safeArgs(
  a: MessageAdapter,
  v: string,
  locale: string,
): string[] | undefined {
  try {
    return a.compile(v, locale).argNames();
  } catch {
    return undefined;
  }
}

export function checkCatalogs(
  source: Catalog,
  others: Readonly<Record<string, Catalog>>,
  adapter: MessageAdapter = mf2Adapter,
  sourceLocale = "en",
): LocaleReport[] {
  const reports: LocaleReport[] = [];
  const srcArgs = new Map(
    Object.entries(source).map(([k, v]) => [
      k,
      safeArgs(adapter, v, sourceLocale),
    ]),
  );
  for (const [locale, cat] of Object.entries(others)) {
    const r: LocaleReport = {
      locale,
      missing: [],
      extra: [],
      placeholders: [],
      syntax: [],
    };
    for (const k of Object.keys(source)) if (!(k in cat)) r.missing.push(k);
    for (const [k, v] of Object.entries(cat)) {
      if (!(k in source)) {
        r.extra.push(k);
        continue;
      }
      const got = safeArgs(adapter, v, locale);
      if (!got) {
        r.syntax.push(k);
        continue;
      }
      const want = srcArgs.get(k);
      if (want && want.join() !== got.join()) r.placeholders.push(k);
    }
    reports.push(r);
  }
  return reports;
}

export const reportOk = (r: LocaleReport) =>
  !r.missing.length &&
  !r.extra.length &&
  !r.placeholders.length &&
  !r.syntax.length;

const CALL = /\bt\(\s*(["'`])((?:\\.|(?!\1).)+)\1/g;

/** Static `t("key") call sites in source text. */
export function extractKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(CALL)) keys.add(m[2]!);
  return [...keys].sort();
}
