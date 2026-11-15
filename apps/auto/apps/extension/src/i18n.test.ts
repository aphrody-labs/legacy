import { SOURCE_LOCALE } from "@auto/i18n";
import { expect, test } from "bun:test";
import { catalogs } from "./i18n";

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

test("every key used in the sources and the popup exists", async () => {
  const source = catalogs[SOURCE_LOCALE]!;
  const dir = Bun.fileURLToPath(new URL("..", import.meta.url));
  const texts = [
    ...[...new Bun.Glob("src/*.ts").scanSync(dir)].filter((f) => !f.endsWith(".test.ts")),
    "static/popup.html",
  ];
  for (const f of texts) {
    const text = await Bun.file(`${dir}/${f}`).text();
    for (const m of text.matchAll(/["'](ext\.[\w.]+)["']/g)) expect(source[m[1]!], `${f}: ${m[1]}`).toBeDefined();
  }
});
