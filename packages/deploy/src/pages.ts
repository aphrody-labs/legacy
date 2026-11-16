// Server-rendered HTML of aphrody.app (landing, labs, dashboard). Design system: packages/design (tokens.css in the
// registry, M3 buttons in native HTML styled by the tokens, Google Sans Flex). Only M3 tokens are referenced in CSS.
// Pages read without JavaScript: links, buttons, lists and chips are native HTML that already carry their text.
import {
  catalogs,
  createTranslator,
  negotiate,
  sourceLocale,
  type MessageArgs,
  type Translator,
} from "@aphrody/i18n";
import { FONT_LINK, NATIVE_CSS, m3List, type } from "./m3.ts";
import { UI_CSS, themeButton } from "./ui.ts";
import { METRICS, rating, type Summary } from "./runtime.ts";
import {
  previewUrl,
  type Deployment,
  type Project,
  type ProjectState,
  type Registry,
} from "./state.ts";

const HTML_ENT: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ENT[c]!);

/** Locales with a catalog in packages/i18n/locales (a catalog dropped there is served without a code change). */
export const LOCALES: readonly string[] = Object.keys(catalogs);
export type Locale = string;
/** Locale of a request: best match of its Accept-Language header, else the source locale. */
export const pickLocale = (acceptLanguage: string | null | undefined): Locale =>
  negotiate(acceptLanguage, LOCALES, sourceLocale());
const nativeName = (l: Locale): string => {
  const n = new Intl.DisplayNames([l], { type: "language" }).of(l) ?? l;
  return n.charAt(0).toLocaleUpperCase(l) + n.slice(1);
};
const ogLocale = (l: Locale): string => {
  const m = new Intl.Locale(l).maximize();
  return `${m.language}_${m.region}`;
};
/** Public path of the landing page in a locale; `/` itself is negotiated from Accept-Language. */
export const localePath = (l: Locale) => `/${l}`;
const translators = new Map<string, Translator>();
const translator = (l: Locale): Translator => {
  let t = translators.get(l);
  if (!t) translators.set(l, (t = createTranslator(catalogs, l)));
  return t;
};
/** Writing direction of a locale. */
export const dirOf = (l: Locale) => translator(l).dir;
/**
 * Text of a packages/i18n key in a locale (MF2). Plain text unless the message carries trusted markup, in which
 * case every argument must already be escaped HTML. Language typography (French narrow no-break spaces) lives in the catalogs.
 */
export const tr = (
  l: Locale,
  key: string,
  args?: MessageArgs,
): string => {
  const t = translator(l);
  if (!t.has(key)) throw new Error(`i18n key ${key} missing in ${l}`);
  return t.t(key, args);
};

const HERO_CSS = `
.hero-art{position:relative;overflow:hidden;min-height:min(78svh,720px);display:flex;align-items:center;background:linear-gradient(180deg,var(--md-sys-color-primary-container),var(--md-sys-color-tertiary-container) 85%)}
.hero-art [data-hero-stage]{position:absolute;inset:0;--h1:color-mix(in srgb,var(--md-sys-color-tertiary) 35%,var(--md-sys-color-primary-container));--h2:color-mix(in srgb,var(--md-sys-color-tertiary) 55%,var(--md-sys-color-surface));--h3:color-mix(in srgb,var(--md-sys-color-tertiary) 75%,var(--md-sys-color-surface-container-lowest));--h4:var(--md-sys-color-tertiary)}
.hero-art .sun-css{position:absolute;right:14%;top:14%;width:min(26vw,260px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFD36A,#FFB300 55%,#C98200);box-shadow:0 0 120px 40px color-mix(in srgb,#FFB300 35%,transparent)}
.hero-art .hills-css{position:absolute;inset:auto 0 0 0;height:46%;background:var(--h2);clip-path:polygon(0 55%,18% 30%,36% 48%,58% 18%,78% 42%,100% 24%,100% 100%,0 100%)}
.hero-art .hills-css.near{height:30%;background:var(--h4);clip-path:polygon(0 40%,24% 62%,46% 28%,70% 58%,100% 34%,100% 100%,0 100%)}
.hero-copy{position:relative;z-index:1;width:100%;max-width:1200px;margin:0 auto;padding:clamp(48px,10vh,120px) 16px clamp(64px,12vh,140px)}
.hero-copy h1{${type("display-large")};margin:0 0 16px;max-width:16ch;font-weight:800;letter-spacing:-.03em;color:var(--md-sys-color-on-primary-container)}
.hero-copy .lead{${type("headline-small")};max-width:34ch;margin:0 0 28px;color:var(--md-sys-color-on-primary-container)}
@media (max-width:599px){.hero-copy h1{${type("display-small")}}.hero-copy .lead{${type("title-medium")}}}
.langs{display:flex;gap:4px;flex-wrap:wrap}
.langs a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:var(--md-sys-shape-corner-full);color:var(--md-sys-color-on-surface);text-decoration:none;${type("label-large")}}
.langs a:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
.langs a[aria-current]{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.top-app-bar .langs{margin-left:auto}
@media (max-width:719px){.top-app-bar{flex-wrap:wrap;gap:4px 8px}.top-app-bar .theme-btn{order:1;margin-left:auto}.top-app-bar nav,.top-app-bar .langs{order:2;flex:1 1 100%;margin-left:0}.langs a{padding:0 8px;min-height:40px}}
.card{border-radius:var(--md-sys-shape-corner-extra-large)}.card .head{display:flex;align-items:center;gap:16px}.card .head>div{display:flex;flex-direction:column;gap:4px}.pico{flex:none;object-fit:contain;padding:8px;border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-surface-container-high)}
`;

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);${type("body-large")}}
a{color:var(--md-sys-color-primary)}
.top-app-bar{display:flex;align-items:center;gap:16px;min-height:64px;padding:8px 16px;background:var(--md-sys-color-surface-container);position:sticky;top:0;z-index:1}
.top-app-bar .logo{display:flex;align-items:center;gap:12px;color:var(--md-sys-color-on-surface);text-decoration:none;${type("title-large")}}
.top-app-bar .logo img{width:32px;height:32px}
.top-app-bar nav{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{${type("display-small")};margin:32px 0 8px}
h2{${type("headline-small")};margin:40px 0 16px}
.title{${type("title-medium")};margin:0}
.support{${type("body-medium")};color:var(--md-sys-color-on-surface-variant);margin:4px 0 0}
.lead{${type("body-large")};max-width:60ch;color:var(--md-sys-color-on-surface-variant)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.card{border:1px solid var(--md-sys-color-outline-variant);border-radius:var(--md-sys-shape-corner-medium);background:var(--md-sys-color-surface-container-low);padding:16px;display:flex;flex-direction:column;gap:8px}
.card a.title{color:var(--md-sys-color-on-surface);text-decoration:none}
.card a.title:hover{text-decoration:underline}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ok{color:var(--md-sys-color-primary)}.err{color:var(--md-sys-color-error)}
.good{color:var(--md-sys-color-primary)}.ni{color:var(--md-sys-color-tertiary)}.poor{color:var(--md-sys-color-error)}
.kpi{${type("display-small")};margin:0}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--md-sys-color-outline-variant);${type("body-medium")}}th{${type("label-large")};color:var(--md-sys-color-on-surface-variant)}
code{font-family:var(--md-ref-typeface-code)}
form{display:inline}
pre{white-space:pre-wrap;word-break:break-word;background:var(--md-sys-color-surface-container);padding:16px;border-radius:var(--md-sys-shape-corner-medium);font-family:var(--md-ref-typeface-code);${type("body-small").replace(/font:[^;]*;/, "")}}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:16px;z-index:2;background:var(--md-sys-color-surface-container-highest);padding:8px 16px;border-radius:var(--md-sys-shape-corner-small)}
ul.grid{list-style:none;padding:0;margin:0}
.hero{padding:clamp(24px,6vw,72px) 0 8px}
.hero h1{${type("display-medium")};max-width:18ch;margin:0 0 16px}
@media (max-width:599px){.hero h1{${type("headline-large")}}}
.card h3.title a{color:var(--md-sys-color-on-surface)}
@view-transition{navigation:auto}
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){.card{animation:rise linear both;animation-timeline:view();animation-range:entry 0% entry 40%}}}
@keyframes rise{from{transform:translateY(24px)}to{transform:none}}
footer{max-width:1200px;margin:0 auto;padding:24px 16px;color:var(--md-sys-color-on-surface-variant);${type("body-medium")}}
`;

type Tab = "home" | "platform" | "labs" | "dashboard";

/** Public path of a page: the launcher entry (home) and the publishing platform, per locale. */
export const pagePath = (tab: Tab, l: Locale): string =>
  tab === "home"
    ? localePath(l)
    : tab === "platform"
      ? `/${l}/platform`
      : `/${tab}`;

const ORG = {
  "@type": "Organization",
  "@id": "https://aphrody.com/#org",
  name: "Aphrody",
  url: "https://aphrody.com/",
  logo: "https://aphrody.com/favicon.png",
  email: "contact@aphrody.com",
};

export interface LayoutOpts {
  l?: Locale;
  ld?: object[];
  /** Full-bleed hero markup placed between the app bar and <main>. */
  hero?: string;
  desc?: string;
}

// Public pages: no code, repository, package or command is named (owner order, 2026-11-13). The dashboard,
// behind Cloudflare Access, keeps its technical detail; its text comes from the same catalogs.
export function layout(
  reg: Pick<Registry, "css" | "mark">,
  title: string,
  tab: Tab,
  body: string,
  o: LayoutOpts = {},
): string {
  const l = o.l ?? sourceLocale();
  const desc = o.desc ?? "";
  const ld = o.ld ?? [];
  const t = (k: string) => tr(l, k);
  const path = pagePath(tab, l);
  const url = `https://aphrody.app${path}`;
  const nav = (x: Tab, href: string, label: string) =>
    x === tab
      ? `<a class="btn btn-tonal" href="${href}" aria-current="page">${label}</a>`
      : `<a class="btn btn-text" href="${href}">${label}</a>`;
  const graph = ld.length
    ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [ORG, ...ld] }).replace(/</g, "\\u003c")}</script>`
    : "";
  const alt =
    tab === "home" || tab === "platform"
      ? LOCALES.map(
          (x) =>
            `<link rel="alternate" hreflang="${x}" href="https://aphrody.app${pagePath(tab, x)}">`,
        ).join("") +
        `<link rel="alternate" hreflang="x-default" href="https://aphrody.app/">`
      : `<link rel="alternate" hreflang="${l}" href="${url}">`;
  const langs =
    tab === "home" || tab === "platform"
      ? `<nav class="langs" aria-label="${esc(t("home.lang"))}">${LOCALES.map((x) => `<a href="${pagePath(tab, x)}" hreflang="${x}" lang="${x}"${x === l ? ' aria-current="page"' : ""}>${esc(nativeName(x))}</a>`).join("")}</nav>`
      : "";
  return `<!doctype html><html lang="${l}" dir="${dirOf(l)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${desc ? `<meta name="description" content="${esc(desc)}">` : ""}<meta name="color-scheme" content="light dark"><link rel="canonical" href="${url}">${alt}<link rel="icon" href="https://aphrody.com/favicon.png" type="image/png"><link rel="apple-touch-icon" href="https://aphrody.com/favicon.png"><meta property="og:type" content="website"><meta property="og:site_name" content="aphrody.app"><meta property="og:locale" content="${ogLocale(l)}"><meta property="og:title" content="${esc(title)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ""}<meta property="og:url" content="${url}"><meta property="og:image" content="https://aphrody.com/favicon.png"><meta name="twitter:card" content="summary">${tab === "dashboard" ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}${FONT_LINK}<style>${reg.css}${NATIVE_CSS}${BASE_CSS}${UI_CSS}${HERO_CSS}</style><script src="/_/theme.js"></script><script src="/_/hero.js" defer></script><script src="/_aphrody/insights.js" defer></script>${graph}</head><body><a class="skip" href="#main">${esc(t("plat.skip"))}</a><header class="top-app-bar"><a class="logo" href="${localePath(l)}">${reg.mark}<span>aphrody.app</span></a><nav aria-label="${esc(t("plat.nav.label"))}">${nav("home", localePath(l), esc(t("plat.nav.home")))}${nav("platform", pagePath("platform", l), esc(t("plat.nav.platform")))}${nav("dashboard", "/dashboard", esc(t("plat.nav.dash")))}</nav>${langs}${themeButton(t("home.theme"))}</header>${o.hero ?? ""}<main id="main">${body}</main><footer><p>Aphrody. <a href="mailto:contact@aphrody.com">contact@aphrody.com</a>. ${esc(t("plat.footer"))} <a href="https://aphrody.com/">aphrody.com</a>.</p></footer></body></html>`;
}

const when = (iso: string | undefined, l: Locale) =>
  iso
    ? `<time datetime="${esc(iso)}">${esc(iso.slice(0, 16).replace("T", " "))} UTC</time>`
    : esc(tr(l, "dep.never"));
const state = (d: Deployment) =>
  `<span class="${d.state === "ready" ? "ok" : d.state === "error" ? "err" : ""}">${esc(d.state)}</span>`;
const code = (x: string) => `<code>${esc(x)}</code>`;

export interface ProjectView {
  project: Project;
  state: ProjectState | null;
  latest: Deployment | null;
}

const FEATURE_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

export function platform(
  reg: Registry,
  views: ProjectView[],
  l: Locale = sourceLocale(),
): string {
  const t = (k: string) => tr(l, k);
  const sites = views
    .filter(({ project: p }) => p.domains.length)
    .map(({ project: p, state: s }) => {
      const d = p.domains[0]!;
      return `<li class="card"><h3 class="title"><a href="https://${esc(d)}">${esc(d)}</a></h3><p class="support">${esc(s?.production ? t("plat.live") : t("plat.prep"))}</p></li>`;
    })
    .join("");
  const features = FEATURE_IDS.map(
    (i) =>
      `<li class="card"><h3 class="title">${esc(t(`plat.f${i}.t`))}</h3><p class="support">${esc(t(`plat.f${i}.d`))}</p></li>`,
  ).join("");
  const hero = `<section class="hero-art" aria-labelledby="h"><div data-hero-stage><div class="bg sun-css"></div><div class="bg hills-css"></div><div class="bg hills-css near"></div></div><div class="hero-copy"><h1 id="h">${esc(t("plat.h1"))}</h1><p class="lead">${esc(t("plat.lead"))}</p><div class="actions"><a class="btn btn-filled" href="#f">${esc(t("plat.features"))}</a><a class="btn btn-outlined" href="https://aphrody.com/">aphrody.com</a></div></div></section>`;
  const body = `<section aria-labelledby="f"><h2 id="f">${esc(t("plat.features"))}</h2><ul class="grid" role="list">${features}</ul></section><section aria-labelledby="s"><h2 id="s">${esc(t("plat.sites"))}</h2><ul class="grid" role="list">${sites || `<li class="support">${esc(t("plat.none"))}</li>`}</ul></section><section aria-labelledby="c"><h2 id="c">${esc(t("plat.contact"))}</h2><p>${esc(t("plat.contact.p"))} <a href="mailto:contact@aphrody.com">contact@aphrody.com</a>.</p></section>`;
  const desc = t("plat.desc");
  return layout(reg, t("plat.title"), "platform", body, {
    l,
    desc,
    hero,
    ld: [
      {
        "@type": "WebSite",
        "@id": "https://aphrody.app/#site",
        url: "https://aphrody.app/",
        name: "aphrody.app",
        inLanguage: l,
        publisher: { "@id": "https://aphrody.com/#org" },
      },
      {
        "@type": "Product",
        name: "aphrody.app",
        url: "https://aphrody.app/",
        description: desc,
        image: "https://aphrody.com/favicon.png",
        brand: { "@id": "https://aphrody.com/#org" },
        category: t("plat.category"),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Aphrody",
            item: "https://aphrody.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "aphrody.app",
            item: `https://aphrody.app${pagePath("platform", l)}`,
          },
        ],
      },
    ],
  });
}

const LAUNCH_CARDS: {
  id: string;
  icon: string;
  state: "built" | "partial" | "planned";
  url: string;
}[] = [
  { id: "app", icon: "app.png", state: "partial", url: "" },
  {
    id: "play",
    icon: "play.png",
    state: "partial",
    url: "https://aphrody.com/play",
  },
  { id: "os", icon: "os.svg", state: "built", url: "https://aphrody.com/os" },
  {
    id: "craft",
    icon: "craft.png",
    state: "planned",
    url: "https://aphrody.com/craft",
  },
];

/** aphrody.app home: entry of the Aphrody launcher (fullscreen, controller-first shell). Only what exists is linked. */
export function landing(reg: Registry, l: Locale = sourceLocale()): string {
  const t = (k: string) => tr(l, k);
  const cards = LAUNCH_CARDS.map(
    (c) =>
      `<li class="card"><div class="head"><img class="pico" src="https://aphrody.com/icons/${c.icon}" alt="" width="56" height="56"><div><h3 class="title">${esc(t(`home.p.${c.id}.name`))}</h3><span class="support">${esc(t(`home.state.${c.state}`))}</span></div></div><p class="support">${esc(t(`home.p.${c.id}.text`))}</p>${c.url ? `<div class="actions"><a class="btn btn-outlined" href="${c.url}">${esc(t("home.open"))}</a></div>` : ""}</li>`,
  ).join("");
  const platformCard = `<li class="card"><h3 class="title">${esc(t("launch.platform.name"))}</h3><p class="support">${esc(t("launch.platform.text"))}</p><div class="actions"><a class="btn btn-outlined" href="${pagePath("platform", l)}">${esc(t("home.open"))}</a></div></li>`;
  const hero = `<section class="hero-art" aria-labelledby="h"><div data-hero-stage><div class="bg sun-css"></div><div class="bg hills-css"></div><div class="bg hills-css near"></div></div><div class="hero-copy"><h1 id="h">${esc(t("launch.h1"))}</h1><p class="lead">${esc(t("launch.lead"))}</p><div class="actions"><a class="btn btn-filled" href="https://aphrody.com/play">${esc(t("launch.cta.play"))}</a><a class="btn btn-outlined" href="https://aphrody.com/os">${esc(t("launch.cta.os"))}</a></div></div></section>`;
  const body = `<section aria-labelledby="w"><h2 id="w">${esc(t("launch.sec"))}</h2><ul class="grid" role="list">${cards}${platformCard}</ul><p class="support">${esc(t("launch.status"))}</p></section><section aria-labelledby="c"><h2 id="c">${esc(t("plat.contact"))}</h2><p>${esc(t("plat.contact.p"))} <a href="mailto:contact@aphrody.com">contact@aphrody.com</a>.</p></section>`;
  const desc = t("launch.desc");
  return layout(reg, t("launch.title"), "home", body, {
    l,
    desc,
    hero,
    ld: [
      {
        "@type": "WebSite",
        "@id": "https://aphrody.app/#site",
        url: "https://aphrody.app/",
        name: "aphrody.app",
        inLanguage: l,
        publisher: { "@id": "https://aphrody.com/#org" },
      },
      {
        "@type": "SoftwareApplication",
        name: "Aphrody Launcher",
        url: "https://aphrody.app/",
        description: desc,
        applicationCategory: "GameApplication",
        operatingSystem: "Web, Windows, Linux",
        brand: { "@id": "https://aphrody.com/#org" },
      },
    ],
  });
}

const fmt = (m: string, v: number) =>
  m === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`;

/** Web Analytics and Speed Insights of one project (Durable Object Insights, last `s.days` days). */
export function insightsHtml(
  s: Summary | null,
  l: Locale = sourceLocale(),
): string {
  const t = (k: string, a?: MessageArgs) => esc(tr(l, k, a));
  if (!s) return `<p class="support">${t("dep.ins.off")}</p>`;
  const top = (title: string, rows: { key: string; n: number }[]) =>
    `<section class="card"><h3 class="title">${title}</h3>${rows.length ? `<table><thead><tr><th scope="col">${t("dep.ins.value")}</th><th scope="col">${t("dep.ins.views")}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.key ? esc(r.key) : t("dep.ins.direct")}</td><td>${r.n}</td></tr>`).join("")}</tbody></table>` : `<p class="support">${t("dep.ins.nodata")}</p>`}</section>`;
  const vit = METRICS.map((m) => {
    const x = s.vitals[m];
    return `<section class="card"><h3 class="title">${t(m === "INP" ? "dep.ins.inp" : "dep.ins.p75", { metric: m })}</h3>${x ? `<p class="kpi ${rating(m, x.p75)}">${fmt(m, x.p75)}</p><p class="support">${t("dep.ins.visits", { n: x.n })}</p>` : `<p class="support">${t("dep.ins.nomeasure")}</p>`}</section>`;
  }).join("");
  return `<h2>${t("dep.ins.h2", { days: s.days })}</h2><div class="grid"><section class="card"><h3 class="title">${t("dep.ins.pageviews")}</h3><p class="kpi">${s.views}</p><p class="support">${t("dep.ins.nocookie")}</p></section>${top(t("dep.ins.pages"), s.paths)}${top(t("dep.ins.referrers"), s.referrers)}${top(t("dep.ins.countries"), s.countries)}${top(t("dep.ins.devices"), s.devices)}</div><h2>${t("dep.ins.speed")}</h2><p class="support">${t("dep.ins.speed.note")}</p><div class="grid">${vit}</div>`;
}

export function dashboard(
  reg: Registry,
  views: ProjectView[],
  who: string,
  platform: Summary | null = null,
  l: Locale = sourceLocale(),
): string {
  const t = (k: string, a?: MessageArgs) => esc(tr(l, k, a));
  const rows = m3List(
    views.map(({ project: p, state: s, latest: d }) => ({
      headline: esc(p.name),
      supporting: t("dep.proj.row", {
        domains: p.domains.join(", ") || tr(l, "dep.proj.nodomain"),
        prod: s?.production?.slice(0, 7) ?? "-",
        latest: d?.sha.slice(0, 7) ?? "-",
      }),
      trailing: d ? esc(d.state) : "",
      href: `/dashboard/${esc(p.name)}`,
    })),
  );
  return layout(
    reg,
    tr(l, "dep.dash.title"),
    "dashboard",
    `<h1>${t("dep.dash.h1")}</h1><p class="lead">${t("dep.dash.who", { who })}</p>${rows}<h2>${t("dep.dash.platform")}</h2>${insightsHtml(platform, l)}`,
    { l },
  );
}

export function projectPage(
  reg: Registry,
  p: Project,
  s: ProjectState | null,
  deps: Deployment[],
  ins: Summary | null = null,
  cfg: Record<string, unknown> = {},
  l: Locale = sourceLocale(),
): string {
  const t = (k: string, a?: MessageArgs) => esc(tr(l, k, a));
  // Messages that carry markup: their arguments are already escaped HTML.
  const h = (k: string, a: MessageArgs) => tr(l, k, a);
  const prod = s?.production;
  const prodIdx = prod ? deps.findIndex((x) => x.sha === prod) : -1;
  const items = deps
    .map((d, i) => {
      const live = d.sha === prod;
      const action =
        !live && d.state === "ready"
          ? `<form method="post" action="/dashboard/${esc(p.name)}/promote"><input type="hidden" name="sha" value="${esc(d.sha)}"><button class="btn btn-tonal" type="submit">${t(prodIdx >= 0 && i > prodIdx ? "dep.dep.rollback" : "dep.dep.promote")}</button></form>`
          : "";
      const size = d.files
        ? t("dep.dep.size", {
            files: d.files,
            kib: Math.round((d.bytes ?? 0) / 1024),
          })
        : "";
      return `<article class="card"><a class="title" href="${esc(previewUrl(p.name, d.sha))}"><code>${esc(d.sha.slice(0, 7))}</code>${live ? ` ${t("dep.dep.live")}` : ""}</a><p class="support">${esc(d.message)}</p><p class="support">${esc(d.branch)}, ${state(d)}, ${when(d.readyAt ?? d.createdAt, l)}${size}</p><div class="actions"><a class="btn btn-text" href="/dashboard/${esc(p.name)}/${esc(d.sha)}/log">${t("dep.dep.log")}</a>${d.run ? `<a class="btn btn-text" href="${esc(d.run)}">CI</a>` : ""}${action}</div></article>`;
    })
    .join("");
  const hist = m3List(
    (s?.history ?? [])
      .slice(-10)
      .reverse()
      .map((x) => ({
        headline: `<code>${esc(x.sha.slice(0, 7))}</code> ${esc(x.action)}`,
        supporting: h("dep.hist.by", {
          by: esc(x.by),
          when: when(x.at, l),
        }),
      })),
  );
  const none = t("dep.proj.none");
  const lead = `${h("dep.proj.lead", { path: code(p.path), build: code(p.build), out: code(p.out) })}${p.worker ? h("dep.proj.worker", { worker: code(p.worker) }) : ""}.`;
  const body = `<h1>${esc(p.name)}</h1><p class="lead">${lead}</p><div class="grid"><section class="card"><h2 class="title">${t("dep.proj.domains")}</h2><p class="support">${p.domains.map((x) => `<a href="https://${esc(x)}">${esc(x)}</a>`).join("<br>") || none}</p></section><section class="card"><h2 class="title">${t("dep.proj.vars")}</h2><p class="support">${p.env.length ? p.env.map(code).join(" ") : none}</p></section><section class="card"><h2 class="title">${t("dep.proj.prod")}</h2><p class="support">${prod ? `<a href="${esc(previewUrl(p.name, prod))}"><code>${esc(prod.slice(0, 7))}</code></a>` : none}</p></section></div><h2>${t("dep.proj.deploys")}</h2><div class="grid">${items || `<p class="support">${t("dep.proj.nodeploys")}</p>`}</div><h2>${t("dep.proj.history")}</h2>${s?.history?.length ? hist : `<p class="support">${t("dep.proj.empty")}</p>`}${insightsHtml(ins, l)}<h2>Edge Config</h2><p class="support">${h("dep.proj.config.p", { read: code("/_aphrody/config"), write: code(`PUT /api/projects/${p.name}/config`) })}</p><pre>${esc(JSON.stringify(cfg, null, 2))}</pre><h2>${t("dep.proj.img")}</h2><p class="support">${h("dep.proj.img.p", { url: code("/_aphrody/image?url=/path.png&w=640&q=75") })}</p>`;
  return layout(reg, tr(l, "dep.proj.title", { name: p.name }), "dashboard", body, {
    l,
  });
}

export function logPage(
  reg: Registry,
  p: string,
  sha: string,
  log: string,
  l: Locale = sourceLocale(),
): string {
  const ref = `${esc(p)}@<code>${esc(sha.slice(0, 7))}</code>`;
  return layout(
    reg,
    tr(l, "dep.log.title", { ref: `${p}@${sha.slice(0, 7)}` }),
    "dashboard",
    `<h1>${tr(l, "dep.log.h1", { ref })}</h1><div class="actions"><a class="btn btn-text" href="/dashboard/${esc(p)}">${esc(tr(l, "dep.log.back"))}</a></div><pre>${esc(log)}</pre>`,
    { l },
  );
}
