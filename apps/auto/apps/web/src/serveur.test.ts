import { afterAll, beforeAll, expect, test } from "bun:test";
import { PLANS } from "@auto/billing";
import { LOCALES, SOURCE_LOCALE, createTranslator } from "@auto/i18n";
import { palettes } from "@auto/ui";
import { LANGUES, traducteur } from "./i18n";
import { demarrerWeb } from "./serveur";
import { PAGES_PUBLIQUES, empreintesScripts, empreintesStyles, routeRapportCsp } from "./securite";
import { IMAGES } from "./site/images.gen";
import { srcsetAvif } from "./site/medias";

let api: ReturnType<typeof Bun.serve>;
let web: ReturnType<typeof demarrerWeb>;
const recues: { chemin: string; methode: string; entetes: Headers; corps: string }[] = [];

beforeAll(() => {
  api = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url);
      recues.push({
        chemin: u.pathname + u.search,
        methode: req.method,
        entetes: req.headers,
        corps: await req.text(),
      });
      if (u.pathname === "/v1/moi") return Response.json({ erreur: "non authentifié" }, { status: 401 });
      return Response.json({ ok: true }, { headers: { "set-cookie": "auto_session=abc; HttpOnly; Secure; Path=/" } });
    },
  });
  web = demarrerWeb({ api: api.url });
});

afterAll(async () => {
  await web.stop(true);
  await api.stop(true);
});

const page = async (chemin: string) => {
  const r = await fetch(new URL(chemin, web.url));
  return { status: r.status, type: r.headers.get("content-type") ?? "", texte: await r.text() };
};

test("public pages: pricing and legal notice, contact in the footer, source locale by default", async () => {
  for (const c of ["/tarifs", "/mentions-legales"]) {
    const p = await page(c);
    expect(p.status).toBe(200);
    expect(p.type).toContain("text/html");
    expect(p.texte).toContain(`lang="${SOURCE_LOCALE}"`);
    expect(p.texte).not.toContain("%%");
    expect(p.texte).toContain("mailto:contact@aphrody.com");
    expect(p.texte).toContain('href="#contenu"');
  }
});

// Every page is localized once per shipped locale from the apps/web and shared catalogs.
test("public pages: localized per locale (?lang= and Accept-Language), no token left", async () => {
  for (const l of LANGUES) {
    const t = traducteur(l);
    for (const c of ["/tarifs", "/mentions-legales", "/confidentialite", "/telechargements", "/devis/abc"]) {
      for (const r of [
        await fetch(new URL(c, web.url), { headers: { "accept-language": l } }),
        await fetch(new URL(`${c}?lang=${l}`, web.url)),
      ]) {
        const texte = await r.text();
        expect(r.headers.get("vary")).toBe("Accept-Language");
        expect(texte).toContain(`lang="${l}"`);
        expect(texte).not.toContain("%%");
        expect(texte).toContain(t.t("site.skip"));
      }
    }
    const m = (await (await fetch(new URL(`/manifest.webmanifest?lang=${l}`, web.url))).json()) as {
      lang: string;
      name: string;
    };
    expect(m).toMatchObject({ lang: l, name: t.t("manifest.name") });
  }
});

// Every shipped catalog gets its own prerendered landing page, chosen by ?lang= or Accept-Language.
test("landing page: one prerendered page per shipped locale, negotiated", async () => {
  for (const l of LOCALES) {
    const t = createTranslator(l);
    for (const r of [
      await fetch(new URL("/", web.url), { headers: { "accept-language": l } }),
      await fetch(new URL(`/?lang=${l}`, web.url)),
    ]) {
      const texte = await r.text();
      expect(r.headers.get("vary")).toBe("Accept-Language");
      expect(texte).toContain(`lang="${l}"`);
      expect(texte).toContain(`<h1 id="titre">${t.t("home.hero.line1")}`);
      expect(texte).toContain(`<title>${t.t("home.meta.title")}</title>`);
    }
  }
});

// The first call of "/" compiles the React showcase: wider timeout under load.
test("landing page: prerendered content (h1 before JavaScript), inline CSS, hashed script served", async () => {
  const p = await page("/");
  expect(p.status).toBe(200);
  expect(p.type).toContain("text/html");
  expect(p.texte).toContain(`lang="${SOURCE_LOCALE}"`);
  expect(p.texte).toContain('<div id="racine" data-prerendu');
  expect(p.texte).toContain(`<h1 id="titre">${createTranslator(SOURCE_LOCALE).t("home.hero.line1")}`);
  expect(p.texte).not.toContain("%%");
  expect(p.texte).toContain('href="/app/inscription"');
  expect(p.texte).not.toContain('<link rel="stylesheet"');
  expect(p.texte).toContain("<style>");
  const script = /<script type="module"[^>]*src="([^"]+)"/.exec(p.texte)?.[1];
  expect(script).toBeTruthy();
  const r = await fetch(new URL(script!, web.url));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  // Prerendered page: only the islands (theme, tabs, film) ship to the browser, not React.
  expect((await r.clone().text()).length).toBeLessThan(20_000);
  expect(p.texte).toContain('role="tablist"');
  expect(p.texte).toContain('<template id="modele-film">');
  expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  // Images and film poster: hashed variants (the original only remains as an "Enlarge" link).
  expect(p.texte).not.toMatch(/(src|poster)="\/img\/btp-analytique\.webp"/);
  // Film: neither poster nor source before the click; the poster is a lazy <picture> (variants of the capture).
  const film = /<template id="modele-film">([\s\S]*?)<\/template>/.exec(p.texte)![1]!;
  expect(film).not.toContain("poster=");
  expect(film).not.toContain("lancement-btp.mp4");
  expect(film).toContain('loading="lazy"');
  expect(film).toContain("btp-heros-film-affiche");
}, 30_000);

test("downloads: places reserved for the catalog cards and the notes (no layout shift)", async () => {
  const html = (await page("/telechargements")).texte;
  expect(html.match(/distribution-attente/g)?.length).toBe(4);
  expect(html).toContain('id="notes-distributions"');
});

test("application: inline CSS, screens split into chunks loaded on demand", async () => {
  const html = (await page("/app")).texte;
  expect(html).not.toContain('<link rel="stylesheet"');
  expect(html).toContain("<style>");
  const script = /<script type="module"[^>]*src="([^"]+)"/.exec(html)![1]!;
  const entree = await (await fetch(new URL(script, web.url))).text();
  const morceaux = [
    ...new Set([...entree.matchAll(/import\(["']((?:\.|)\/chunk-[^"']+\.js)["']\)/g)].map((m) => m[1]!)),
  ];
  expect(morceaux.length).toBeGreaterThan(10);
  const base = new URL(script, web.url);
  for (const m of morceaux.slice(0, 3)) expect((await fetch(new URL(m, base))).status).toBe(200);
}, 30_000);

/** CSS of a page: linked stylesheet, or inline `<style>` for the landing page. */
async function cssPage(html: string) {
  const lien = /<link rel="stylesheet"[^>]*href="([^"]+)"/.exec(html)?.[1];
  if (!lien) return /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
  const r = await fetch(new URL(lien, web.url));
  expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  return r.text();
}

// Fonts out of the blocking CSS (audit AU-1): hashed WOFF2, immutable cache, consistent preloads.
test("fonts: CSS without base64, hashed /polices files with an immutable cache, preloads served", async () => {
  for (const chemin of ["/", "/app"]) {
    const html = (await page(chemin)).texte;
    const texte = await cssPage(html);
    expect(texte).not.toContain("data:font");
    expect(texte).not.toContain("data:image");
    expect(texte.length).toBeLessThan(200_000);
    const urls = new Set([...texte.matchAll(/url\((\/polices\/[^)]+\.woff2)\)/g)].map((m) => m[1]!));
    expect(urls.size).toBeGreaterThan(10);
    expect(texte).toContain("font-display:swap");
    expect(texte).toContain("unicode-range");
    const precharges = [...html.matchAll(/<link\s+rel="preload"\s+as="font"[^>]*href="([^"]+)"/g)].map((m) => m[1]!);
    // The landing page no longer uses the icon font (inline SVG); the application keeps it (dynamic icons).
    expect(texte.includes("material-symbols-rounded")).toBe(chemin === "/app");
    expect(precharges.length).toBeGreaterThanOrEqual(1);
    expect(precharges.length).toBeLessThanOrEqual(2);
    for (const p of precharges) {
      expect(urls.has(p)).toBe(true);
      const f = await fetch(new URL(p, web.url));
      expect(f.status).toBe(200);
      expect(f.headers.get("content-type")).toBe("font/woff2");
      expect(f.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(new Uint8Array(await f.arrayBuffer()).slice(0, 4)).toEqual(new TextEncoder().encode("wOF2"));
    }
  }
  for (const refus of [
    "/polices/inter-latin-400-normal-0000000000.woff2",
    "/polices/roboto-latin-400-normal-8909904ab6.woff2",
    "/polices/..%2Fpackage.json",
  ])
    expect((await fetch(new URL(refus, web.url))).status).toBe(404);
  const accueil = (await page("/")).texte;
  expect(accueil).toContain("plus-jakarta-sans-latin-700-normal-");
}, 30_000);

test("hero: background preloaded as AVIF (fetchpriority=high), hashed variants with an immutable cache", async () => {
  const html = (await page("/")).texte;
  const pre = /<link\s+rel="preload"\s+as="image"[^>]*>/.exec(html)?.[0] ?? "";
  expect(pre).toContain('fetchpriority="high"');
  expect(pre).toContain('type="image/avif"');
  expect(pre).toContain(`imagesrcset="${srcsetAvif("btp-plan")}"`);
  for (const i of Object.values(IMAGES))
    for (const [url] of [...i.avif, ...i.webp]) {
      const r = await fetch(new URL(url, web.url));
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe(url.endsWith(".avif") ? "image/avif" : "image/webp");
      expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
  expect((await fetch(new URL("/img/v/btp-plan-768-0000000000.avif", web.url))).status).toBe(404);
  const og = await fetch(new URL("/img/og-auto.jpg", web.url));
  expect(og.status).toBe(200);
  expect(og.headers.get("content-type")).toBe("image/jpeg");
});

test("SEO: sitemap, robots.txt, security.txt, canonical and Open Graph of the public pages", async () => {
  const plan = await fetch(new URL("/sitemap.xml", web.url));
  expect(plan.status).toBe(200);
  expect(plan.headers.get("content-type")).toContain("application/xml");
  const xml = await plan.text();
  for (const p of PAGES_PUBLIQUES) {
    expect(xml).toContain(`<loc>https://auto.aphrody.com${p}</loc>`);
    const html = (await page(p)).texte;
    expect(html).toContain(`<link rel="canonical" href="https://auto.aphrody.com${p}"`);
    expect(html).toContain(`<meta property="og:url" content="https://auto.aphrody.com${p}"`);
    expect(html).toContain('<meta property="og:image" content="https://auto.aphrody.com/img/og-auto.jpg"');
  }
  const robots = await (await fetch(new URL("/robots.txt", web.url))).text();
  expect(robots).toContain("Sitemap: https://auto.aphrody.com/sitemap.xml");
  const security = await fetch(new URL("/.well-known/security.txt", web.url));
  expect(security.status).toBe(200);
  const s = await security.text();
  expect(s).toContain("Contact: mailto:contact@aphrody.com");
  const expire = new Date(/^Expires: (.+)$/m.exec(s)![1]!);
  expect(expire.getTime()).toBeGreaterThan(Date.now());
  expect(expire.getTime()).toBeLessThan(Date.now() + 366 * 86_400_000);
});

test("HTML pages: CSP enforced (default-src, scripts by hash), reports, frame denied, policies", async () => {
  for (const chemin of ["/", "/tarifs", "/app", "/app/factures", "/devis/abc"]) {
    const r = await fetch(new URL(chemin, web.url));
    expect(r.status).toBe(200);
    const html = await r.text();
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    const script = /script-src ([^;]+)/.exec(csp)![1]!;
    expect(script).toStartWith("'self'");
    expect(script).not.toContain("unsafe");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("report-to csp");
    const empreintes = empreintesScripts(html);
    expect(empreintes.length).toBeGreaterThan(0);
    for (const e of empreintes) expect(script).toContain(e);
    const observee = r.headers.get("content-security-policy-report-only") ?? "";
    expect(observee).toContain("form-action 'self'");
    expect(/style-src ([^;]+)/.exec(observee)![1]).not.toContain("unsafe");
    for (const e of empreintesStyles(html)) expect(observee).toContain(e);
    expect(r.headers.get("reporting-endpoints")).toBe('csp="/csp-rapport"');
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("permissions-policy")).toContain("camera=()");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    const etag = r.headers.get("etag")!;
    expect((await fetch(new URL(chemin, web.url), { headers: { "if-none-match": etag } })).status).toBe(304);
  }
});

test("CSP reports: one reduced line per violation, no personal data, rate limited", async () => {
  const lignes: string[] = [];
  const route = routeRapportCsp(2, (l) => lignes.push(l));
  const rapport = (n: number) =>
    new Request("http://x/csp-rapport", {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: JSON.stringify(
        Array.from({ length: n }, () => ({
          type: "csp-violation",
          url: "https://auto.aphrody.com/app/clients?email=jean@example.fr",
          body: {
            documentURL: "https://auto.aphrody.com/app/clients?email=jean@example.fr",
            blockedURL: "https://tracker.example/pixel?id=42",
            effectiveDirective: "img-src",
            disposition: "report",
          },
        })),
      ),
    });
  expect((await route.POST(rapport(3))).status).toBe(204);
  expect(lignes).toEqual([
    "csp violation directive=img-src blocked=https://tracker.example document=/app/clients mode=report",
    "csp violation directive=img-src blocked=https://tracker.example document=/app/clients mode=report",
  ]);
  expect(lignes.join()).not.toContain("jean@");
  const legacy = await route.POST(
    new Request("http://x/csp-rapport", { method: "POST", body: '{"csp-report":{"blocked-uri":"inline"}}' }),
  );
  expect(legacy.status).toBe(204);
  expect(lignes.length).toBe(2);
  expect((await route.POST(new Request("http://x", { method: "POST", body: "not json" }))).status).toBe(400);
  const r = await fetch(new URL("/csp-rapport", web.url), {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: '{"csp-report":{"violated-directive":"style-src","blocked-uri":"inline","document-uri":"https://auto.aphrody.com/"}}',
  });
  expect(r.status).toBe(204);
});

test("showcase captures: /img/*.webp served as an image, other paths refused", async () => {
  const noms = [...new Bun.Glob("*.webp").scanSync({ cwd: `${import.meta.dir}/../public/img` })];
  expect(noms.length).toBeGreaterThanOrEqual(10);
  const r = await fetch(new URL(`/img/${noms[0]}`, web.url));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("image/webp");
  expect((await fetch(new URL("/img/absente.webp", web.url))).status).toBe(404);
  expect((await fetch(new URL("/img/x.png", web.url))).status).toBe(404);
  const s = await fetch(new URL("/icones/symboles.svg", web.url));
  expect(s.status).toBe(200);
  expect(s.headers.get("content-type")).toBe("image/svg+xml");
});

test("pricing page aligned with the plans of @auto/billing", async () => {
  for (const l of LANGUES) {
    const t = traducteur(l);
    const p = (await page(`/tarifs?lang=${l}`)).texte;
    const prix = (euros: number) => t.currency(euros, "EUR", { maximumFractionDigits: 0 });
    for (const plan of Object.values(PLANS)) {
      expect(p).toContain(`data-plan="${plan.id}"`);
      expect(p).toContain(`data-prix="${plan.prixHtCents.mensuel / 100}"`);
      if (plan.prixHtCents.annuel) expect(p).toContain(prix(plan.prixHtCents.annuel / 100));
    }
    expect(t.t("pricing.pro.badge")).toContain(String(PLANS.pro.essaiJours));
  }
});

test("application: every /app route serves the HTML shell (deep links)", async () => {
  for (const c of ["/app", "/app/factures", "/app/documents/123", "/app/inscription"]) {
    const p = await page(c);
    expect(p.status).toBe(200);
    expect(p.texte).toContain('id="racine"');
  }
  expect((await page("/inconnue")).status).toBe(404);
});

test("/v1 proxy: same origin, method, body, cookie and Content-Type forwarded, hop headers removed", async () => {
  const r = await fetch(new URL("/v1/documents?type=devis", web.url), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "auto_session=xyz" },
    body: JSON.stringify({ a: 1 }),
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("auto_session=abc");
  const q = recues.at(-1)!;
  expect(q).toMatchObject({ chemin: "/v1/documents?type=devis", methode: "POST", corps: '{"a":1}' });
  expect(q.entetes.get("cookie")).toBe("auto_session=xyz");
  expect(q.entetes.get("content-type")).toBe("application/json");
  expect(q.entetes.get("host")).toBe(new URL(api.url).host);

  const moi = await fetch(new URL("/v1/moi", web.url));
  expect(moi.status).toBe(401);
});

test("proxy: unreachable API gives a JSON 502", async () => {
  const w = demarrerWeb({ api: "http://127.0.0.1:9" });
  try {
    const r = await fetch(new URL("/v1/moi", w.url));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erreur: "API injoignable" });
  } finally {
    await w.stop(true);
  }
});

test("video hosted in the cloud: HTTPS redirect and refusal of an invalid URL", async () => {
  const ancienne = Bun.env.AUTO_MEDIA_URL;
  try {
    Bun.env.AUTO_MEDIA_URL = "https://storage.example/media/lancement-btp.mp4";
    const r = await fetch(new URL("/media/lancement-btp.mp4", web.url), { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(Bun.env.AUTO_MEDIA_URL);
    Bun.env.AUTO_MEDIA_URL = "http://storage.example/video.mp4";
    expect((await fetch(new URL("/media/lancement-btp.mp4", web.url), { redirect: "manual" })).status).toBe(503);
  } finally {
    if (ancienne === undefined) delete Bun.env.AUTO_MEDIA_URL;
    else Bun.env.AUTO_MEDIA_URL = ancienne;
  }
});

test("installable application: manifest, icons and theme color aligned with the tokens", async () => {
  const m = await fetch(new URL("/manifest.webmanifest", web.url));
  expect(m.headers.get("content-type")).toContain("application/manifest+json");
  const manifeste = (await m.json()) as { start_url: string; display: string; icons: { src: string }[] };
  expect(manifeste).toMatchObject({ start_url: "/app", display: "standalone" });
  for (const { src } of [...manifeste.icons, { src: "/icones/180.png" }]) {
    const r = await fetch(new URL(src, web.url));
    expect(r.headers.get("content-type")).toBe("image/png");
    const v = new DataView(await r.arrayBuffer());
    const taille = Number(/\/(\d+)\.png$/.exec(src)![1]);
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([taille, taille]);
  }
  expect((await fetch(new URL("/icones/64.png", web.url))).status).toBe(404);
  expect((await fetch(new URL("/favicon.ico", web.url))).headers.get("content-type")).toBe("image/png");
  for (const page of ["/", "/app"]) {
    const html = await (await fetch(new URL(page, web.url))).text();
    expect(html).toContain('"/manifest.webmanifest"');
    expect(html).toContain(`<meta name="theme-color" content="${palettes.clair.primaire}"`);
  }
});
