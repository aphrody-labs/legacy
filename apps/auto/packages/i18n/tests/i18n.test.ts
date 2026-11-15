import { expect, test } from "bun:test";
import { Glob } from "bun";
import { LOCALES, SOURCE_LOCALE, catalogs, createTranslator, matchLocale } from "../src/index";

test("registry lists every catalog file in locales/", () => {
  const files = [...new Glob("*.json").scanSync(Bun.fileURLToPath(new URL("../locales/", import.meta.url)))]
    .filter((f) => f !== "config.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  expect([...LOCALES].sort()).toEqual(files);
});

test("every key of every catalog exists in the source catalog; placeholders match", () => {
  const source = catalogs[SOURCE_LOCALE]!;
  const names = (s: string) =>
    [...s.matchAll(/\{\$(\w+)/g)]
      .map((m) => m[1])
      .sort()
      .join();
  for (const [locale, cat] of Object.entries(catalogs))
    for (const [key, text] of Object.entries(cat)) {
      expect(source[key], `${locale}:${key} missing from source`).toBeDefined();
      expect(names(text), `${locale}:${key} placeholders`).toBe(names(source[key]!));
    }
});

test("negotiation honours quality and falls back to the source locale", () => {
  expect(matchLocale(null)).toBe(SOURCE_LOCALE);
  expect(matchLocale("xx-YY")).toBe(SOURCE_LOCALE);
  const other = LOCALES.find((l) => l !== SOURCE_LOCALE)!;
  expect(matchLocale(`zz;q=0.2, ${other}-XX;q=0.9`)).toBe(other);
});

test("MF2 plurals and Intl formatting follow the locale", () => {
  const t = createTranslator("fr", {
    en: { n: ".input {$n :number}\n.match $n\none {{{$n} item}}\n* {{{$n} items}}" },
  });
  expect(t.number(1234.5, { minimumFractionDigits: 2 })).toBe(
    new Intl.NumberFormat(t.locale, { minimumFractionDigits: 2 }).format(1234.5),
  );
  expect(
    createTranslator(SOURCE_LOCALE, {
      [SOURCE_LOCALE]: { n: ".input {$n :number}\n.match $n\none {{{$n} item}}\n* {{{$n} items}}" },
    }).t("n", { n: 2 }),
  ).toBe("2 items");
  expect(t.t("missing.key")).toBe("missing.key");
});
