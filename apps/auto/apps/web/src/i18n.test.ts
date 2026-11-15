import { SOURCE_LOCALE, createTranslator } from "@auto/i18n";
import { expect, test } from "bun:test";
import { catalogs, choisirLangue, traducteur } from "./i18n";

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

test("every message compiles and formats in every locale", () => {
  for (const locale of Object.keys(catalogs)) {
    const tr = traducteur(locale);
    for (const [k, v] of Object.entries(catalogs[locale]!)) {
      const args = Object.fromEntries([...v.matchAll(/\{\$(\w+)/g)].map((m) => [m[1]!, 2]));
      expect(() => tr.t(k, args), `${locale}:${k}`).not.toThrow();
    }
  }
});

test("every key used by the sources and the public pages exists", async () => {
  const source = catalogs[SOURCE_LOCALE]!;
  const dir = Bun.fileURLToPath(new URL("..", import.meta.url));
  const files = [
    ...new Bun.Glob("src/**/*.{ts,tsx}").scanSync(dir),
    ...new Bun.Glob("public/*.html").scanSync(dir),
  ].filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".gen.ts"));
  for (const f of files) {
    const text = await Bun.file(`${dir}/${f}`).text();
    const keys = [
      ...text.matchAll(/\bt\(\s*"([a-z][\w.]*\.[\w.]+)"/g),
      ...text.matchAll(/%%(?:html:)?([a-z][\w.]*\.[\w.]+)%%/g),
    ];
    for (const m of keys) if (!m[1]!.startsWith("home.")) expect(source[m[1]!], `${f}: ${m[1]}`).toBeDefined();
  }
});

test("locale negotiation uses the catalogs shipped", () => {
  expect(choisirLangue("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  expect(choisirLangue("de")).toBe(SOURCE_LOCALE);
  expect(createTranslator("fr").locale).toBe("fr");
});
