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

test("mail text follows the request language, plural included, and falls back to the source locale", () => {
  const other = Object.keys(catalogs).find((l) => l !== SOURCE_LOCALE)!;
  const demande = (l: string) => new Request("http://x", { headers: { "accept-language": l } });
  const args = { organization: "ACME", role: "member", days: 1, url: "https://x/i" };
  const a = traducteur(null).t("auth.mail.invite.text", args);
  const b = traducteur(demande(other)).t("auth.mail.invite.text", args);
  expect(a).toContain("1 day:");
  expect(a).toContain("https://x/i");
  expect(b).not.toBe(a);
  expect(traducteur(demande("zz")).t("auth.mail.invite.text", { ...args, days: 7 })).toContain("7 days:");
});
