import { readConfig } from "./config.ts";

/** Source locale of the project, from i18n.config.json (default en). */
export const sourceLocale = (): string => readConfig().sourceLocale;

/** Parse an Accept-Language header into tags ordered by q (stable for ties); q=0 entries are dropped. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p))
        .find(Boolean);
      return { tag: tag.trim(), q: q ? Number(q[1]) : 1, index };
    })
    .filter((e) => e.tag && e.q > 0 && !Number.isNaN(e.q))
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((e) => e.tag);
}

function parse(tag: string): Intl.Locale | undefined {
  try {
    return new Intl.Locale(tag.replace(/_/g, "-").split(/[.@]/)[0]!);
  } catch {
    return undefined;
  }
}

/**
 * Closest supported locale for one requested tag, in the order of the ECMA-402 lookup extended with
 * likely subtags: exact, same language+script+region, same language+script, same language.
 * (zh-Hans-CN matches zh-CN; zh-TW has no Hant catalog and falls back to the zh one.)
 */
export function matchLocale<T extends string>(
  tag: string,
  supported: readonly T[],
): T | undefined {
  const want = parse(tag);
  if (!want) return undefined;
  const full = want.maximize();
  const cands = supported.flatMap((s) => {
    const l = parse(s);
    return l ? [{ s, l, full: l.maximize() }] : [];
  });
  const exact = cands.find((c) => c.l.toString() === want.toString());
  if (exact) return exact.s;
  const byLang = cands.filter((c) => c.l.language === want.language);
  return (
    byLang.find(
      (c) => c.full.script === full.script && c.full.region === full.region,
    )?.s ??
    byLang.find((c) => c.full.script === full.script)?.s ??
    byLang.find((c) => !c.l.script && !c.l.region)?.s ??
    byLang[0]?.s
  );
}

/** Pick a supported locale from an Accept-Language header; falls back to `fallback`. */
export function negotiate<T extends string>(
  acceptLanguage: string | null | undefined,
  supported: readonly T[],
  fallback: T,
): T {
  if (!acceptLanguage) return fallback;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    if (tag === "*") return fallback;
    const m = matchLocale(tag, supported);
    if (m) return m;
  }
  return fallback;
}
