import { SOURCE_LOCALE } from "@auto/i18n";
import { expect, test } from "bun:test";
import { fournisseursPour, FOURNISSEURS } from "./fournisseurs";
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

test("provider notes follow the language and fall back to the source locale", () => {
  const en = FOURNISSEURS.find((f) => f.id === "google")!.note;
  const fr = fournisseursPour("fr-FR").find((f) => f.id === "google")!.note;
  expect(en).toContain("app password");
  expect(fr).toContain("Mot de passe d'application");
  expect(fournisseursPour("zz").find((f) => f.id === "google")!.note).toBe(en);
  expect(traducteur("fr").locale).toBe("fr");
});
