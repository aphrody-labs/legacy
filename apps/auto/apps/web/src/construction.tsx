// Production build of the front, in memory at server start: `Bun.build` of the HTML pages with code splitting
// (impossible with the HTML imports of `Bun.serve`), then for the landing page: build-time React prerender (content and
// <h1> before JavaScript; only the islands script ships to the browser) and inlined CSS (no blocking stylesheet).
// Every page is then localized once per shipped locale. In development, serveur.ts keeps the HTML imports and HMR.
import type { BunPlugin } from "bun";
import { renderToString } from "react-dom/server";
import { greffonPolices } from "./polices";
import { SOURCE_LOCALE } from "@auto/i18n";
import { LANGUES, traducteur } from "./i18n";
import { Accueil } from "./site/accueil";

export const PAGES = {
  accueil: "index.html",
  tarifs: "tarifs.html",
  telechargements: "telechargements.html",
  mentions: "mentions-legales.html",
  confidentialite: "confidentialite.html",
  devis: "devis.html",
  facture: "facture.html",
  app: "app.html",
} as const;
export type NomPage = keyof typeof PAGES;

export interface Ressource {
  corps: Uint8Array<ArrayBuffer>;
  type: string;
}
export interface Site {
  /** Pages in the source locale. */
  pages: Record<NomPage, string>;
  /** Prerendered landing page per shipped locale (one catalog = one entry); `pages.accueil` is the source-locale one. */
  accueil: Record<string, string>;
  /** Every other page per shipped locale: `localisees[locale][page]`. */
  localisees: Record<string, Record<NomPage, string>>;
  /** Hashed files (`/chunk-….js`, `/chunk-….css`…), served with an immutable cache. */
  ressources: Map<string, Ressource>;
}

const RACINE = /<div id="racine">[\s\S]*?<\/div>/;
const SCRIPT_MODULE = /<script type="module"[^>]*src="\/[^"]+\.js"[^>]*><\/script>/;

const echapper = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Replace the `%%key%%` tokens of a page template with the catalog text of the locale (HTML-escaped), `%%html:key%%`
 * with the catalog markup as is (authored text only), and set the `lang` attribute of the document.
 */
export function localiserTete(html: string, locale: string): string {
  const t = traducteur(locale);
  return html
    .replace(/%%(html:)?([\w.:]+)%%/g, (_, brut: string | undefined, cle: string) =>
      cle === "og:locale"
        ? new Intl.Locale(t.locale).maximize().toString().replace("-", "_")
        : brut
          ? t.t(cle)
          : echapper(t.t(cle)),
    )
    .replace(/<html lang="[^"]*"/, () => `<html lang="${t.locale}"`);
}

/**
 * Landing page: React content prerendered in #racine, CSS inlined (no blocking stylesheet) and, instead of the React
 * bundle, only the islands script (`script`, hashed path).
 */
export function finaliserAccueil(
  html: string,
  ressources: Map<string, Ressource>,
  script: string,
  locale?: string,
): string {
  if (!RACINE.test(html)) throw new Error("index.html: #racine not found");
  if (!SCRIPT_MODULE.test(html)) throw new Error("index.html: showcase script not found");
  const contenu = renderToString(<Accueil locale={locale} />);
  let sortie = (locale ? localiserTete(html, locale) : html).replace(
    RACINE,
    () => `<div id="racine" data-prerendu>${contenu}</div>`,
  );
  sortie = sortie.replace(SCRIPT_MODULE, () => `<script type="module" crossorigin src="${script}"></script>`);
  return incorporerCss(sortie, ressources);
}

/** Site stylesheets replaced by their content in a `<style>`: nothing blocks the first render. */
export function incorporerCss(html: string, ressources: Map<string, Ressource>): string {
  return html.replace(/<link rel="stylesheet"[^>]*href="(\/[^"]+\.css)"[^>]*>/g, (lien, href: string) => {
    const css = ressources.get(href);
    if (!css) return lien;
    const texte = new TextDecoder().decode(css.corps);
    return texte.includes("</style") ? lien : `<style>${texte}</style>`;
  });
}

export async function construireSite(): Promise<Site> {
  const dossier = Bun.fileURLToPath(new URL("../public/", import.meta.url));
  // Same plugin as bunfig `[serve.static]`; loaded dynamically so `bun check` does not typecheck its sources.
  const paquet = "@aphrody/bun-plugin-tailwind";
  const tailwind = ((await import(paquet)) as { default: BunPlugin }).default;
  const options: Omit<Bun.BuildConfig, "entrypoints"> = {
    splitting: true,
    minify: true,
    target: "browser",
    publicPath: "/",
    plugins: [tailwind, greffonPolices],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  };
  // One build per page: the landing page does not get the chunk shared with the application (React plus the common
  // code of every page), only what it imports. Content-hashed names do not overlap.
  const [ilots, ...resultats] = await Promise.all([
    Bun.build({
      ...options,
      entrypoints: [Bun.fileURLToPath(new URL("./site/accueil-ilots.ts", import.meta.url))],
      naming: { entry: "[name]-[hash].[ext]", chunk: "chunk-[hash].[ext]" },
    }),
    ...Object.values(PAGES).map((f) => Bun.build({ ...options, entrypoints: [`${dossier}${f}`] })),
  ]);
  const ressources = new Map<string, Ressource>();
  const html = new Map<string, string>();
  let scriptIlots = "";
  for (const resultat of [ilots!, ...resultats]) {
    if (!resultat.success) throw new AggregateError(resultat.logs, "Front build failed");
    for (const sortie of resultat.outputs) {
      const nom = sortie.path.replace(/^.*[\\/]/, "");
      if (nom.endsWith(".html")) html.set(nom, await sortie.text());
      else ressources.set(`/${nom}`, { corps: new Uint8Array(await sortie.arrayBuffer()), type: sortie.type });
      if (resultat === ilots && sortie.kind === "entry-point") scriptIlots = `/${nom}`;
    }
  }
  if (!scriptIlots) throw new Error("Islands script missing from the build");
  const modele = {} as Record<NomPage, string>;
  for (const [nom, fichier] of Object.entries(PAGES) as [NomPage, string][]) {
    const page = html.get(fichier);
    if (!page) throw new Error(`Page missing from the build: ${fichier}`);
    // Application (sign-in included) with its CSS inlined: no blocking stylesheet.
    modele[nom] = nom === "app" ? incorporerCss(page, ressources) : page;
  }
  const localiser = (locale: string) =>
    Object.fromEntries(
      (Object.keys(PAGES) as NomPage[]).map((nom) => [
        nom,
        nom === "accueil"
          ? finaliserAccueil(modele.accueil, ressources, scriptIlots, locale)
          : localiserTete(modele[nom], locale),
      ]),
    ) as Record<NomPage, string>;
  const localisees = Object.fromEntries(LANGUES.map((l) => [l, localiser(l)]));
  return {
    pages: localisees[SOURCE_LOCALE] ?? localiser(SOURCE_LOCALE),
    accueil: Object.fromEntries(LANGUES.map((l) => [l, localisees[l]!.accueil])),
    localisees,
    ressources,
  };
}
