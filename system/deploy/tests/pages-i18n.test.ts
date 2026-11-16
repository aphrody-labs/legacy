import { describe, expect, test } from "bun:test";
import { catalogs } from "@aphrody/i18n";
import {
  esc,
  insightsHtml,
  LOCALES,
  logPage,
  pickLocale,
  projectPage,
} from "../src/pages.ts";
import type { Registry } from "../src/state.ts";
import worker, { type Env } from "../src/worker.ts";

const bucket = { get: async () => null, put: async () => {} };
const env = { BUCKET: bucket, DEPLOY_TOKEN: "t" } as unknown as Env;
const get = async (path: string, lang?: string, headers: HeadersInit = {}) => {
  const r = await worker.fetch(
    new Request(`https://aphrody.app${path}`, {
      headers: { ...(lang ? { "accept-language": lang } : {}), ...headers },
    }),
    env,
  );
  return { r, html: await r.text() };
};
/** Page text as written in the catalog: HTML-escaped, French narrow no-break spaces read as plain spaces. */
const seen = (html: string) => html.replaceAll("\u202f", " ");
const reg: Registry = {
  generatedAt: "",
  commit: "",
  projects: [],
  inventory: [],
  labs: [],
  css: "",
  mark: "",
};

describe("locales", () => {
  test("come from the catalogs and negotiate from Accept-Language", () => {
    expect([...LOCALES].sort()).toEqual(Object.keys(catalogs).sort());
    expect(pickLocale("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
    expect(pickLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(pickLocale("tlh, tlh-x;q=0.5")).toBe("en");
    expect(pickLocale(null)).toBe("en");
  });
});

describe("public pages", () => {
  test("the landing page follows Accept-Language", async () => {
    const fr = await get("/", "fr-FR,fr;q=0.9");
    const en = await get("/", "en-US,en;q=0.9");
    expect(fr.r.headers.get("vary")).toContain("accept-language");
    expect(fr.html).toContain('<html lang="fr"');
    expect(seen(fr.html)).toContain(esc(catalogs.fr!["launch.h1"]!));
    expect(en.html).toContain('<html lang="en"');
    expect(seen(en.html)).toContain(esc(catalogs.en!["launch.h1"]!));
    expect(seen(en.html)).not.toContain(esc(catalogs.fr!["launch.h1"]!));
  });
  test("an explicit locale prefix wins over the header", async () => {
    const { html } = await get("/fr/platform", "en");
    expect(html).toContain('<html lang="fr"');
    expect(seen(html)).toContain(esc(catalogs.fr!["plat.h1"]!));
  });
  test("an unsupported language falls back to the source locale", async () => {
    const { html } = await get("/", "tlh");
    expect(html).toContain('<html lang="en"');
  });
  test("not found is localized", async () => {
    const { r, html } = await get("/nope", "fr");
    expect(r.status).toBe(404);
    expect(seen(html)).toContain(esc(catalogs.fr!["plat.notfound"]!));
  });
  test("llms.txt is English", async () => {
    const { html } = await get("/llms.txt", "fr");
    expect(html).toContain("Aphrody's publishing platform");
    expect(html).toContain("Contact: contact@aphrody.com");
  });
});

describe("dashboard", () => {
  test("access error and pages follow Accept-Language", async () => {
    const denied = await get("/dashboard", "fr");
    expect(denied.r.status).toBe(401);
    expect(denied.html).toContain("Accès réservé");
    const ok = await get("/dashboard", "en", { authorization: "Bearer t" });
    expect(ok.r.status).toBe(200);
    expect(ok.html).toContain("<h1>Dashboard</h1>");
    const fr = await get("/dashboard", "fr", { authorization: "Bearer t" });
    expect(fr.html).toContain("<h1>Tableau de bord</h1>");
  });
  test("insights, project and log pages render in both languages", () => {
    const s = {
      days: 7,
      views: 3,
      paths: [{ key: "/", n: 3 }],
      referrers: [{ key: "", n: 1 }],
      countries: [],
      devices: [],
      vitals: { LCP: { p75: 1200, n: 1 } },
    } as never;
    expect(insightsHtml(s, "en")).toContain("Analytics (7 days)");
    expect(insightsHtml(s, "fr")).toContain("Analytics (7 jours)");
    expect(insightsHtml(s, "en")).toContain("1 visit<");
    expect(insightsHtml(null, "fr")).toContain("non branchées");
    const p = {
      name: "site",
      path: "apps/site",
      build: "bun run build",
      out: "dist",
      domains: [],
      watch: [],
      env: [],
      exclude: [],
      production: "auto",
    } as never;
    const dep = {
      sha: "a".repeat(40),
      branch: "main",
      message: "m",
      state: "ready",
      files: 2,
      bytes: 4096,
      createdAt: "2026-11-15T10:00:00Z",
    } as never;
    expect(projectPage(reg, p, null, [dep], null, {}, "en")).toContain(
      "2 files, 4 KiB",
    );
    expect(projectPage(reg, p, null, [dep], null, {}, "fr")).toContain(
      "2 fichiers, 4 Kio",
    );
    expect(logPage(reg, "site", "a".repeat(40), "x", "fr")).toContain(
      "Journal de site@<code>aaaaaaa</code>",
    );
  });
});
