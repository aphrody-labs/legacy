import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogs, checkCatalogsForTest } from "./helpers.ts";
import {
  argNames,
  createTranslator,
  detectFormat,
  discoverLocales,
  formatMessage,
  getAdapter,
  matchLocale,
  MessageSyntaxError,
  negotiate,
  parseAcceptLanguage,
  parseMessage,
  readConfig,
  resolveAdapter,
  UnsupportedFormatError,
} from "../src/index.ts";
import { extractKeys, reportOk } from "../src/check.ts";
import { detectLanguage, isNonSourceProse, proseOf } from "../src/detect.ts";
import {
  hashText,
  readSidecar,
  translateLocale,
  writeSidecar,
  type Ask,
} from "../src/translate.ts";
import fixtures from "./fixtures/format.json";

const PLURAL =
  ".input {$n :number}\n.match $n\n0 {{none}}\none {{{$n} item}}\n* {{{$n} items}}";

describe("mf2", () => {
  test("plural exact, category and number", () => {
    expect(formatMessage(PLURAL, "en", { n: 0 })).toBe("none");
    expect(formatMessage(PLURAL, "en", { n: 1 })).toBe("1 item");
    expect(formatMessage(PLURAL, "en", { n: 1234 })).toBe("1,234 items");
  });
  test("french treats 0 and 1 as one", () => {
    const m =
      ".input {$n :number}\n.match $n\none {{{$n} fichier}}\n* {{{$n} fichiers}}";
    expect(formatMessage(m, "fr", { n: 0 })).toBe("0 fichier");
    expect(formatMessage(m, "fr", { n: 2 })).toBe("2 fichiers");
  });
  test("select with catch-all", () => {
    const m = ".input {$g :string}\n.match $g\nf {{elle}}\n* {{iel}}";
    expect(formatMessage(m, "en", { g: "f" })).toBe("elle");
    expect(formatMessage(m, "en", { g: "q" })).toBe("iel");
  });
  test("missing argument falls back visibly", () => {
    expect(formatMessage("Hi {$name}", "en")).toBe("Hi {$name}");
  });
  test("escapes", () => {
    expect(formatMessage("it's \\{x\\}", "en")).toBe("it's {x}");
  });
  test("RTL isolates placeholders, LTR does not", () => {
    expect(formatMessage("a {$x} b", "en", { x: "Z" })).toBe("a Z b");
    expect(formatMessage("a {$x} b", "ar", { x: "Z" })).toContain("\u2068");
  });
  test("syntax errors", () => {
    for (const bad of [
      "{$n",
      "{$n :number",
      ".match $n\n* {{x}}\n",
      "a } b",
      ".input {$n}\n.match $n\none {{x}}",
    ])
      expect(() => formatMessage(bad, "en", { n: 1 }), bad).toThrow();
    expect(() => parseMessage("{$n")).toThrow(MessageSyntaxError);
  });
  test("argNames", () => {
    expect(argNames(PLURAL)).toEqual(["n"]);
    expect(argNames(".local $x = {$a}\n{{{$x} {$b}}}")).toEqual(["a", "b"]);
  });
});

describe("negotiation", () => {
  const supported = ["en", "fr", "zh-CN", "ja", "es", "pt-BR"] as const;
  test("q ordering", () => {
    expect(parseAcceptLanguage("fr;q=0.5, ja, en;q=0.1, de;q=0")).toEqual([
      "ja",
      "fr",
      "en",
    ]);
  });
  test("negotiate", () => {
    const n = (h: string | null) => negotiate(h, supported, "en");
    expect(n("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
    expect(n("zh-Hans-CN,zh;q=0.9")).toBe("zh-CN");
    expect(n("zh-TW")).toBe("zh-CN");
    expect(n("ja-JP")).toBe("ja");
    expect(n("de, es;q=0.5")).toBe("es");
    expect(n("pt-PT")).toBe("pt-BR");
    expect(n("de")).toBe("en");
    expect(n("*")).toBe("en");
    expect(n(null)).toBe("en");
    expect(n("es_MX.UTF-8")).toBe("es");
    expect(n("not a tag!!, fr")).toBe("fr");
  });
  test("matchLocale", () => {
    expect(matchLocale("ZH-cn", supported)).toBe("zh-CN");
    expect(matchLocale("xx", supported)).toBeUndefined();
  });
});

describe("translator", () => {
  test("fallback to source then key", () => {
    const t = createTranslator(
      { en: { a: "A", b: "B" }, fr: { a: "AA" } },
      "fr",
      { source: "en", format: "mf2" },
    );
    expect(t.t("a")).toBe("AA");
    expect(t.t("b")).toBe("B");
    expect(t.t("c")).toBe("c");
    expect(t.has("b")).toBe(true);
    expect(t.has("c")).toBe(false);
  });
  test("source locale is configurable", () => {
    const t = createTranslator({ fr: { a: "Salut" }, en: {} }, "de", {
      source: "fr",
      format: "mf2",
    });
    expect(t.locale).toBe("fr");
    expect(t.t("a")).toBe("Salut");
  });
  test("direction", () => {
    expect(createTranslator({ en: {}, ar: {} }, "ar").dir).toBe("rtl");
    expect(createTranslator(catalogs, "ja").dir).toBe("ltr");
  });
  test("shared fixtures", () => {
    for (const f of fixtures) {
      const t = createTranslator(catalogs, f.locale);
      expect(
        t.t(f.key, f.args as Record<string, string | number>),
        `${f.locale}/${f.key}`,
      ).toBe(f.out);
    }
  });
});

describe("catalogs", () => {
  test("locales are discovered, not listed", () => {
    expect(discoverLocales()).toEqual(Object.keys(catalogs).sort());
    const dir = mkdtempSync(join(tmpdir(), "i18n-"));
    try {
      writeFileSync(join(dir, "pt-BR.json"), "{}");
      writeFileSync(join(dir, "not_a_tag!.json"), "{}");
      expect(discoverLocales(dir)).toEqual(["pt-BR"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  test("config", () => {
    expect(readConfig().sourceLocale).toBe("en");
  });
  test("no locale has extra keys, broken syntax or drifting placeholders; coverage is reported", () => {
    const { en, ...others } = catalogs;
    for (const r of checkCatalogsForTest(en!, others)) {
      expect({ ...r, missing: [] }).toEqual({
        locale: r.locale,
        missing: [],
        extra: [],
        placeholders: [],
        syntax: [],
      });
      expect(r.missing.length).toBe(
        Object.keys(en!).length - Object.keys(others[r.locale]!).length,
      );
      expect(reportOk(r)).toBe(true);
    }
  });
  test("strict mode fails on missing keys", () => {
    const [r] = checkCatalogsForTest({ a: "A", b: "B" }, { fr: { a: "AA" } });
    expect(reportOk(r!)).toBe(true);
    expect(reportOk(r!, true)).toBe(false);
  });
  test("check detects drift", () => {
    const rs = checkCatalogsForTest(
      { a: "{$x}", b: "B" },
      { fr: { a: "{$y}", c: "C" }, es: { a: "{$x", b: "B" } },
    );
    expect(rs[0]).toEqual({
      locale: "fr",
      missing: ["b"],
      extra: ["c"],
      placeholders: ["a"],
      syntax: [],
    });
    expect(rs[1]!.syntax).toEqual(["a"]);
  });
  test("extract finds call sites", () => {
    const src = "t(\"a.b\"); i18n.t('c', {x: 1}); const set = 1; t(`d`)";
    expect(extractKeys(src)).toEqual(["a.b", "c", "d"]);
  });
});

describe("format adapters", () => {
  const f = (name: string, text: string) => [{ name, text }];
  test("detection by file and by syntax", () => {
    expect(detectFormat(f("en.ftl", "a = b"))).toBe("fluent");
    expect(detectFormat(f("messages.po", ""))).toBe("gettext");
    expect(detectFormat(f("app_en.arb", "{}"))).toBe("arb");
    expect(detectFormat(f("en.json", '{"a":"Hello {$name}"}'))).toBe("mf2");
    expect(
      detectFormat(f("en.json", '{"a":"{n, plural, one {x} other {y}}"}')),
    ).toBe("icu-mf1");
    expect(detectFormat(f("en.json", '{"a":"Hello {{name}}"}'))).toBe(
      "i18next",
    );
    expect(detectFormat(f("en.json", '{"a":"Hello"}'))).toBeUndefined();
  });
  test("implemented: mf2; the rest is rejected with a clear error", () => {
    expect(getAdapter("mf2").id).toBe("mf2");
    expect(resolveAdapter(undefined, f("en.json", '{"a":"Hello"}')).id).toBe(
      "mf2",
    );
    expect(() => resolveAdapter(undefined, f("en.ftl", "a = b"))).toThrow(
      UnsupportedFormatError,
    );
    expect(() => getAdapter("icu-mf1")).toThrow(/no adapter/);
  });
});

describe("machine translation", () => {
  const source = {
    greeting: "Hello, {$name}",
    "files.count": PLURAL,
    plain: "Save",
  };
  const mf2 = getAdapter("mf2");
  const run = (
    ask: Ask,
    target: Record<string, string>,
    sidecar = {},
    refreshStale = false,
    src = source,
  ) =>
    translateLocale({
      source: src,
      sourceLocale: "en",
      target,
      sidecar,
      locale: "fr",
      adapter: mf2,
      adapterName: "Unicode MessageFormat 2",
      ask,
      model: "test/model",
      refreshStale,
    });

  test("fills missing keys only, records machine output, keeps human keys", async () => {
    const asked: string[] = [];
    const ask: Ask = async (prompt) => {
      asked.push(prompt);
      return JSON.stringify({
        greeting: "Bonjour, {$name}",
        "files.count":
          ".input {$n :number}\n.match $n\none {{{$n} objet}}\n* {{{$n} objets}}",
      });
    };
    const r = await run(ask, { plain: "Enregistrer" });
    expect(r.report.failed).toEqual([]);
    expect(r.report.translated.sort()).toEqual(["files.count", "greeting"]);
    expect(r.catalog.plain).toBe("Enregistrer");
    expect(Object.keys(r.sidecar).sort()).toEqual(["files.count", "greeting"]);
    expect(asked[0]).not.toContain("Save");
    expect(Object.keys(r.catalog)).toEqual([
      "greeting",
      "files.count",
      "plain",
    ]);
  });
  test("rejects output that breaks placeholders or syntax, retries once, then reports", async () => {
    let calls = 0;
    const ask: Ask = async () => {
      calls++;
      return JSON.stringify({
        greeting: calls === 1 ? "Bonjour, {$nom}" : "Bonjour, {$name",
        "files.count": "x",
        plain: "Sauver",
      });
    };
    const r = await run(ask, {});
    expect(r.catalog.plain).toBe("Sauver");
    expect(r.catalog.greeting).toBeUndefined();
    expect(r.report.failed.map((x) => x.key).sort()).toEqual([
      "files.count",
      "greeting",
    ]);
    expect(r.report.failed.find((x) => x.key === "greeting")!.reason).toMatch(
      /parse/,
    );
    expect(r.sidecar.greeting).toBeUndefined();
  });
  test("stale machine keys are redone only on request; human keys never", async () => {
    const ask: Ask = async () =>
      JSON.stringify({ greeting: "Salut, {$name}", plain: "NE PAS TOUCHER" });
    const stale = { greeting: { from: "old", model: "m" } };
    const target = {
      greeting: "Bonjour, {$name}",
      plain: "Enregistrer",
      "files.count": PLURAL,
    };
    const off = await run(ask, target, stale, false);
    expect(off.catalog.greeting).toBe("Bonjour, {$name}");
    const on = await run(ask, target, stale, true);
    expect(on.catalog.greeting).toBe("Salut, {$name}");
    expect(on.catalog.plain).toBe("Enregistrer");
    expect(on.sidecar.greeting!.from).toBe(hashText(source.greeting));
  });
  test("sidecar round trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "i18n-"));
    try {
      mkdirSync(dir, { recursive: true });
      await writeSidecar(dir, "fr", { a: { from: "x", model: "m" } });
      expect(await readSidecar(dir, "fr")).toEqual({
        a: { from: "x", model: "m" },
      });
      await writeSidecar(dir, "fr", {});
      expect(await readSidecar(dir, "fr")).toEqual({});
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("language detection", () => {
  test("detects English and French prose", () => {
    expect(
      detectLanguage(
        "The quick brown fox jumps over the lazy dog near the river",
      ).language,
    ).toBe("en");
    expect(
      detectLanguage("Les fichiers sont dans le dossier de sortie, sinon rien.")
        .language,
    ).toBe("fr");
  });
  test("non-source prose rule", () => {
    expect(
      isNonSourceProse(
        "// Les fichiers sont copiés dans le dossier de sortie avant le build",
        true,
        "en",
      ),
    ).toBe(true);
    expect(
      isNonSourceProse(
        "// Copies the files into the output folder before the build starts",
        true,
        "en",
      ),
    ).toBe(false);
    expect(
      isNonSourceProse(
        "Les fichiers sont copiés dans le dossier de sortie avant le build.",
        false,
        "fr",
      ),
    ).toBe(false);
    expect(
      isNonSourceProse("const x = computeSomething(a, b);", true, "en"),
    ).toBe(false);
    expect(
      proseOf(
        "See `bun test` at https://example.com/a/b for the details of the run",
        false,
      ),
    ).toBe("See at for the details of the run");
  });
});
