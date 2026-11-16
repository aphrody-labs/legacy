import { SOURCE_LOCALE } from "@auto/i18n";
import { expect, test } from "bun:test";
import { Glob } from "bun";
import { catalogs, ErreurApi, refus, reponseErreur } from "./i18n";

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

test("every error code raised by the API has a catalog entry", async () => {
  const codes = new Set<string>();
  for await (const f of new Glob("**/*.ts").scan({ cwd: import.meta.dir })) {
    if (f.endsWith(".test.ts")) continue;
    const src = await Bun.file(`${import.meta.dir}/${f}`).text();
    for (const m of src.matchAll(/(?:ErreurApi\(|refus\(req, )"([a-z0-9_]+)"/g)) codes.add(m[1]!);
  }
  const source = catalogs[SOURCE_LOCALE]!;
  expect(codes.size).toBeGreaterThan(50);
  for (const c of codes) expect(source[`error.${c}`], c).toBeDefined();
});

test("error answers carry a stable code and a message in the caller's language", async () => {
  const demande = (l?: string) => new Request("http://x", l ? { headers: { "accept-language": l } } : undefined);
  const autre = Object.keys(catalogs).find((l) => l !== SOURCE_LOCALE)!;
  const erreur = new ErreurApi("stripe_price_unconfigured", [], 503, { plan: "pro", interval: "mensuel" });
  const a = reponseErreur(erreur, demande());
  expect(a.status).toBe(503);
  expect(await a.json()).toEqual({
    code: "stripe_price_unconfigured",
    erreur: "Stripe price not configured for pro mensuel",
    details: [],
  });
  const b = (await reponseErreur(erreur, demande(autre)).json()) as { code: string; erreur: string };
  expect(b.code).toBe("stripe_price_unconfigured");
  expect(b.erreur).toContain("pro mensuel");
  expect(b.erreur).not.toBe("Stripe price not configured for pro mensuel");
  expect(await refus(demande("zz"), "not_found", 404).json()).toEqual({ code: "not_found", erreur: "Not found" });
  expect((await reponseErreur(new SyntaxError("x"), demande()).json()) as { code: string }).toEqual({
    code: "invalid_json",
    erreur: "Invalid JSON",
  });
});
