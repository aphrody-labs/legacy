import { SOURCE_LOCALE } from "@auto/i18n";
import { expect, test } from "bun:test";
import { catalogs, langueDocuments, traducteur } from "./i18n";
import { texteRelance } from "./mail";
import { texteRappel } from "./renouvellement";

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

test("documents language: environment, French by default; explicit tags win", () => {
  expect(langueDocuments({})).toBe("fr");
  expect(langueDocuments({ AUTO_LOCALE_DOCUMENTS: "en" })).toBe("en");
  expect(traducteur("en").locale).toBe("en");
});

test("dunning text follows the language, with plural and Intl formats", () => {
  const r = { numero: "F-1", echeance: "2026-09-30", joursRetard: 1, niveau: 1 as const, resteCents: 123456 };
  const en = texteRelance(r, "Alpha", "en");
  expect(en.sujet).toBe("Reminder: invoice F-1 — Alpha");
  expect(en.message).toContain("1 day late");
  expect(en.message).toContain("€1,234.56 incl. tax");
  expect(texteRelance({ ...r, joursRetard: 5, niveau: 3 }, "Alpha", "en").message).toContain("Our invoice F-1");
  expect(texteRelance(r, "Alpha", "fr").message).toContain("1 jour de retard");
});

test("renewal reminder follows the language", () => {
  const r = { plan: "pro", periodicite: "mensuel", echeance: "2026-10-30T10:00:00Z", essai: false, montantHtCents: 1400 };
  expect(texteRappel(r, "https://x", "en").sujet).toBe("Your auto subscription renews on October 30, 2026");
  expect(texteRappel(r, "https://x", "fr").sujet).toBe("Votre abonnement auto sera renouvelé le 30 octobre 2026");
});
