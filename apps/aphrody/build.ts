// Site generator of aphrody.com: the home page and the catalog page in every locale of packages/i18n/catalogs/site.
// Content is read, never typed here: texts from the i18n catalogs, counts and entries from public/catalog.json (written by
// scripts/catalog.ts), colors and type from packages/design/tokens/tokens.css, the logo is public/favicon.png.
//
//   bun apps/aphrody/build.ts            write public/index.html, public/<locale>/index.html, public/catalog/..., public/tokens.css
//   bun apps/aphrody/build.ts --check    exit 1 listing the outputs that differ
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..", "..").replaceAll("\\", "/");
const pub = join(import.meta.dir, "public").replaceAll("\\", "/");
const check = Bun.argv.includes("--check");

const origin = "https://aphrody.com";
const slug = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).repository?.url ?? "").match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
if (!slug) throw new Error("package.json repository.url: no GitHub slug");
const repo = `https://github.com/${slug}`;

// i18n: the catalogs of packages/i18n, resolved the way @aphrody/i18n does (exact tag, language, source locale).
const i18n = join(root, "packages/i18n");
const source: string = JSON.parse(readFileSync(join(i18n, "i18n.config.json"), "utf8")).sourceLocale;
const dir = join(i18n, "catalogs/site");
const catalogs: Record<string, Record<string, string>> = Object.fromEntries(
  readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), "utf8"))]),
);
const locales = [source, ...Object.keys(catalogs).filter((l) => l !== source).sort()];
const prefix = (l: string) => (l === source ? "" : `/${l}`);

const all = JSON.parse(readFileSync(join(pub, "catalog.json"), "utf8")) as {
  types: { id: string; name: string; description: string; entries: { name: string; description: string; path: string }[] }[];
};

const data = { types: all.types.filter((k) => k.entries.length > 0) };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/`/g, "").replace(/\s+/g, " ").trim();
const short = (s: string) => {
  const one = oneLine(s);
  return one.match(/^(.{1,140}?[.!?])(\s|$)/)?.[1] ?? (one.length > 140 ? `${one.slice(0, 137).trimEnd()}...` : one);
};

const css = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:var(--md-sys-typescale-body-large-weight) var(--md-sys-typescale-body-large-size)/var(--md-sys-typescale-body-large-line-height) var(--md-ref-typeface-plain)}
a{color:var(--md-sys-color-primary)}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--md-sys-color-secondary);outline-offset:2px}
.skip{position:absolute;left:-999px;top:0;padding:12px 16px;background:var(--md-sys-color-inverse-surface);color:var(--md-sys-color-inverse-on-surface);z-index:3}
.skip:focus{left:8px;top:8px}
.bar{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 16px;color:var(--md-sys-color-on-surface)}
.bar a{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:var(--md-sys-shape-corner-full);color:inherit;text-decoration:none;font:var(--md-sys-typescale-title-medium-weight) var(--md-sys-typescale-title-medium-size)/1 var(--md-sys-typescale-title-medium-font)}
.bar a:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
.bar .home{gap:12px;padding-left:4px}
.bar .home,.bar .first{margin-right:auto}
.bar .home img{width:40px;height:40px;border-radius:var(--md-sys-shape-corner-full)}
.hero{position:relative;isolation:isolate;overflow:hidden;min-height:min(86svh,720px);display:flex;flex-direction:column;justify-content:flex-end;padding:112px 24px 56px;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface)}
.hero.short{min-height:320px;padding-bottom:32px}
.hero .bg{position:absolute;inset:0;z-index:-2}
.hero .bg img{width:100%;height:100%;object-fit:cover;opacity:.55;filter:blur(10px) saturate(1.2);animation:drift 48s var(--md-sys-motion-easing-standard) infinite alternate}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,var(--md-sys-color-surface) 6%,transparent 70%)}
@keyframes drift{from{transform:scale(1.04) translate3d(0,0,0)}to{transform:scale(1.14) translate3d(-2%,-1.5%,0)}}
.wrap{max-width:1040px;width:100%;margin:0 auto}
.hero .logo{width:112px;height:112px;border-radius:var(--md-sys-shape-corner-extra-large);display:block;margin-bottom:24px}
h1{margin:0;font:var(--md-sys-typescale-display-large-weight) var(--md-sys-typescale-display-large-size)/var(--md-sys-typescale-display-large-line-height) var(--md-sys-typescale-display-large-font);letter-spacing:var(--md-sys-typescale-display-large-tracking)}
.lead{max-width:40ch;margin:12px 0 28px;font:var(--md-sys-typescale-headline-medium-weight) var(--md-sys-typescale-headline-medium-size)/var(--md-sys-typescale-headline-medium-line-height) var(--md-sys-typescale-headline-medium-font)}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 24px;border-radius:var(--md-sys-shape-corner-full);text-decoration:none;font:var(--md-sys-typescale-title-medium-weight) var(--md-sys-typescale-title-medium-size)/1 var(--md-sys-typescale-title-medium-font);transition:background-color .2s var(--md-sys-motion-easing-standard)}
.btn.filled{background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
.btn.tonal{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.btn:hover{filter:brightness(1.08)}
main{max-width:1040px;margin:0 auto;padding:16px 24px 64px}
h2{margin:56px 0 24px;font:var(--md-sys-typescale-headline-large-weight) var(--md-sys-typescale-headline-large-size)/var(--md-sys-typescale-headline-large-line-height) var(--md-sys-typescale-headline-large-font)}
.demo{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;margin:0 0 40px}
.demo:nth-of-type(even) figure{order:2}
.demo figure{margin:0;overflow:hidden;border-radius:var(--md-sys-shape-corner-extra-large);border:1px solid var(--md-sys-color-outline-variant);background:var(--md-sys-color-surface-container)}
.demo img{display:block;width:100%;height:auto;transition:transform .6s var(--md-sys-motion-easing-emphasized-decelerate)}
.demo:hover img{transform:scale(1.04)}
.demo h3{margin:0 0 8px;font:var(--md-sys-typescale-title-large-weight) var(--md-sys-typescale-title-large-size)/var(--md-sys-typescale-title-large-line-height) var(--md-sys-typescale-title-large-font)}
.demo p{margin:0 0 16px;color:var(--md-sys-color-on-surface-variant)}
.inside{list-style:none;margin:0;padding:0}
.inside li{border-top:1px solid var(--md-sys-color-outline-variant)}
.inside a{display:flex;justify-content:space-between;align-items:center;min-height:56px;padding:8px 4px;color:var(--md-sys-color-on-surface);text-decoration:none;font:var(--md-sys-typescale-title-large-weight) var(--md-sys-typescale-title-large-size)/var(--md-sys-typescale-title-large-line-height) var(--md-sys-typescale-title-large-font)}
.inside a:hover{color:var(--md-sys-color-primary)}
.inside span{color:var(--md-sys-color-on-surface-variant);font-variant-numeric:tabular-nums}
section.type{margin:0 0 24px}
section.type h2{margin:40px 0 8px}
section.type p{margin:0 0 12px;color:var(--md-sys-color-on-surface-variant)}
summary{cursor:pointer;min-height:48px;display:flex;align-items:center}
.entries{list-style:none;margin:0;padding:0}
.entries li{display:flex;flex-direction:column;padding:8px 0;border-top:1px solid var(--md-sys-color-outline-variant)}
.entries span{color:var(--md-sys-color-on-surface-variant);font-size:var(--md-sys-typescale-body-medium-size)}
footer{border-top:1px solid var(--md-sys-color-outline-variant);padding:24px;color:var(--md-sys-color-on-surface-variant)}
footer .wrap{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;justify-content:space-between}
footer a{display:inline-flex;align-items:center;min-height:48px}
@media (max-width:720px){.demo{grid-template-columns:1fr}.demo:nth-of-type(even) figure{order:0}.hero{padding-top:96px}.bar .nav-source{display:none}}
@media (prefers-reduced-motion:reduce){.hero .bg img{animation:none;transform:scale(1.04)}.demo img,.btn{transition:none}.demo:hover img{transform:none}}
`.replace(/\s*\n\s*/g, "");

const fontLink = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=optional">';

function page(locale: string, kind: "home" | "catalog"): string {
  const chain = [catalogs[locale], catalogs[locale.split("-")[0]!], catalogs[source]];
  const t = (k: string): string => {
    const hit = chain.map((c) => c?.[k]).find((m) => m !== undefined);
    if (hit === undefined) throw new Error(`site message missing: ${k} (${dir}/${source}.json)`);
    return hit;
  };
  const here = `${prefix(locale)}${kind === "catalog" ? "/catalog" : ""}/`;
  const alternates = locales.map((l) => `<link rel="alternate" hreflang="${l}" href="${origin}${prefix(l)}${kind === "catalog" ? "/catalog" : ""}/">`).join("");
  const title = kind === "home" ? "Aphrody" : `${t("catalog_title")} - Aphrody`;
  const description = kind === "home" ? t("description") : t("catalog_intro");
  const langs = locales.filter((l) => l !== locale).map((l) => `<a href="${prefix(l)}${kind === "catalog" ? "/catalog" : ""}/" hreflang="${l}" lang="${l}" aria-label="${esc(t("lang"))}">${l.toUpperCase()}</a>`).join("");
  const bar = `<header class="bar">${kind === "catalog" ? `<a class="home" href="${prefix(locale) || "/"}" aria-label="Aphrody"><img src="/favicon.png" width="40" height="40" alt="">Aphrody</a>` : ""}<a${kind === "home" ? ` class="first"` : ""} href="${prefix(locale)}/catalog/">${esc(t("nav_catalog"))}</a><a class="nav-source" href="${repo}">${esc(t("nav_source"))}</a>${langs}</header>`;
  const bg = '<div class="bg"><img src="/shots/desktop.webp" width="638" height="373" alt="" fetchpriority="high" decoding="async"></div>';
  let body: string;
  if (kind === "home") {
    const demo = (id: string, href: string, img: string, w: number, h: number) =>
      `<div class="demo"><figure><a href="${href}" tabindex="-1" aria-hidden="true"><img src="/shots/${img}.webp" width="${w}" height="${h}" alt="${esc(t(`demo_${id}`))}" loading="lazy" decoding="async"></a></figure><div><h3>${esc(t(`demo_${id}`))}</h3><p>${esc(t(`demo_${id}_text`))}</p><a class="btn tonal" href="${href}">${esc(t(`demo_${id}_cta`))}</a></div></div>`;
    body = `<section class="hero" data-theme="dark">${bg}<div class="wrap"><img class="logo" src="/favicon.png" width="112" height="112" alt="Aphrody"><h1>Aphrody</h1><p class="lead">${esc(t("description"))}</p><div class="actions"><a class="btn filled" href="${prefix(locale)}/catalog/">${esc(t("cta_catalog"))}</a><a class="btn tonal" href="${repo}">${esc(t("cta_source"))}</a></div></div></section>` +
      `<main id="main"><h2>${esc(t("demos"))}</h2>${demo("term", "/term/", "terminal", 1280, 800)}${demo("desktop", "/wayland/", "desktop", 638, 373)}${demo("studio", "/m3/", "studio", 720, 261)}` +
      `<h2>${esc(t("inside"))}</h2><ul class="inside">${data.types.map((k) => `<li><a href="${prefix(locale)}/catalog/#${k.id}">${esc(t(`type_${k.id}`))}<span>${k.entries.length}</span></a></li>`).join("")}</ul></main>`;
  } else {
    const sections = data.types.map((k) => `<section class="type" id="${k.id}"><h2>${esc(t(`type_${k.id}`))}</h2><details><summary>${esc(t("catalog_entries"))} (${k.entries.length})</summary><ul class="entries">${k.entries.map((e) => `<li><a href="${repo}/tree/main/${esc(e.path)}">${esc(e.name)}</a>${e.description ? `<span>${esc(short(e.description))}</span>` : ""}</li>`).join("")}</ul></details></section>`);
    body = `<section class="hero short" data-theme="dark">${bg}<div class="wrap"><h1>${esc(t("catalog_title"))}</h1><p class="lead">${esc(t("catalog_intro"))}</p></div></section><main id="main">${sections.join("")}</main>`;
  }
  const ld = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "Aphrody", url: `${origin}/`, logo: `${origin}/favicon.png`, sameAs: [repo.replace(/\/[^/]+$/, "")] }, { "@type": "WebSite", name: "Aphrody", url: `${origin}/`, inLanguage: locale }] });
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${origin}${here}">${alternates}<link rel="alternate" hreflang="x-default" href="${origin}${kind === "catalog" ? "/catalog" : ""}/"><meta property="og:type" content="website"><meta property="og:site_name" content="Aphrody"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin}${here}"><meta property="og:image" content="${origin}/favicon.png"><meta name="twitter:card" content="summary"><meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"><link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/favicon.png"><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/tokens.css">${fontLink}<style>${css}</style><script type="application/ld+json">${ld}</script></head><body><a class="skip" href="#main">${esc(t("skip"))}</a>${bar}${body}<footer><div class="wrap"><span>${esc(t("footer"))}</span><a href="${repo}">${esc(t("cta_source"))}</a></div></footer></body></html>\n`;
}

const out = new Map<string, string>();
for (const l of locales) {
  out.set(`${prefix(l)}/index.html`.replace(/^\//, ""), page(l, "home"));
  out.set(`${prefix(l)}/catalog/index.html`.replace(/^\//, ""), page(l, "catalog"));
}
const tokens = readFileSync(join(root, "packages/design/tokens/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};,])\s*/g, "$1").trim() + "\n";
out.set("tokens.css", tokens);
const alt = (path: string) => locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${origin}${prefix(l)}${path}"/>`).join("");
out.set("sitemap-core.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  [...locales.flatMap((l) => ["/", "/catalog/"].map((p) => `  <url><loc>${origin}${prefix(l)}${p}</loc>${alt(p)}</url>`)), ...["/term/", "/wayland/", "/m3/"].map((p) => `  <url><loc>${origin}${p}</loc></url>`)].join("\n") + "\n</urlset>\n");
out.set("site.webmanifest", JSON.stringify({ name: "Aphrody", short_name: "Aphrody", description: catalogs[source]!.description, icons: [{ src: "/favicon.png", sizes: "256x256", type: "image/png" }], display: "standalone" }, null, 2) + "\n");

let stale = 0;
// The favicon is the logo file itself.
const logo = new Uint8Array(readFileSync(join(root, "docs/logo/aphrody.png")));
const favicon = join(pub, "favicon.png");
if (!existsSync(favicon) || Buffer.compare(readFileSync(favicon), logo) !== 0) {
  stale++;
  console.log(`${check ? "differs" : "written"}: apps/aphrody/public/favicon.png`);
  if (!check) writeFileSync(favicon, logo);
}
for (const [rel, body] of out) {
  const file = join(pub, rel);
  const cur = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (cur === body) continue;
  stale++;
  console.log(`${check ? "differs" : "written"}: apps/aphrody/public/${rel}`);
  if (!check) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
}
if (check && stale) process.exit(1);
