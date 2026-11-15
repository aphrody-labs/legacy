import { SOURCE_LOCALE } from "@auto/i18n";
import { expect, test } from "bun:test";
import { catalogs, traducteur } from "./i18n";

const names = (s: string) =>
  [...s.matchAll(/\{\$(\w+)/g)]
    .map((m) => m[1])
    .sort()
    .join();

test("every catalog has the keys and placeholders of the source catalog", () => {
  const source = catalogs[SOURCE_LOCALE]!;
  for (const [locale, cat] of Object.entries(catalogs)) {
    expect(Object.keys(cat).sort(), locale).toEqual(Object.keys(source).sort());
    for (const [k, v] of Object.entries(cat)) expect(names(v), `${locale}:${k}`).toBe(names(source[k]!));
  }
});

test("client messages follow the language and fall back to the source locale", () => {
  expect(traducteur("en").t("api.import.refused", { status: 413 })).toContain("413");
  expect(traducteur("fr-FR").t("api.unreachable")).toContain("injoignable");
  expect(traducteur("zz").t("api.unreachable")).toBe(catalogs[SOURCE_LOCALE]!["api.unreachable"]);
});
