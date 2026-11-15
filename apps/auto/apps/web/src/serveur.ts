// Front server: imported HTML pages (Bun native bundling, HMR in development) and same-origin proxy of `/v1`,
// `/api/auth`, `/.well-known` and `/mcp` to the API. The front stays stateless, without database or native library:
// it deploys on its own.
import app from "../public/app.html";
import accueil from "../public/index.html";
import mentions from "../public/mentions-legales.html";
import confidentialite from "../public/confidentialite.html";
import tarifs from "../public/tarifs.html";
import telechargements from "../public/telechargements.html";
import devis from "../public/devis.html";
import facture from "../public/facture.html";
import { proxifier } from "@auto/client/proxy";
import { palettes } from "@auto/ui";
import { icone } from "@auto/ui/icone";
import { TRACES } from "@auto/ui/traces";
import { ressourcesCraft } from "./craft";
import { fichierPublic } from "./fichier-public";
import { routePolice } from "./polices";
import { construireSite, type NomPage } from "./construction";
import { langueDemandee, texte, traducteur } from "./i18n";
import { POINT_RAPPORT, reponsePage, routeRapportCsp, routesReferencement } from "./securite";
import { routesDistributions } from "./distributions";

export { proxifier };

export interface OptionsWeb {
  /** API base URL (`AUTO_API_URL`). */
  api: string | URL;
  /** Development (HMR): pages served as is, without in-memory copy or CSP. */
  development?: boolean;
}

/** Installable application (PWA): opened on /app, fullscreen, on mobile and desktop. */
export function manifeste(locale: string) {
  const t = traducteur(locale);
  return {
    name: t.t("manifest.name"),
    short_name: "auto",
    description: t.t("manifest.description"),
    lang: t.locale,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    theme_color: palettes.clair.primaire,
    background_color: palettes.clair.surface,
    icons: [192, 512].map((t) => ({ src: `/icones/${t}.png`, sizes: `${t}x${t}`, type: "image/png" })),
  };
}

/** Icons drawn on first request then kept in memory (192 and 512 for the manifest, 180 for iOS). */
const icones = new Map<number, Uint8Array<ArrayBuffer>>();
function reponseIcone(t: number) {
  if (!icones.has(t)) icones.set(t, new Uint8Array(icone(t)));
  return new Response(icones.get(t)!, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}

function routeIcone(req: Request & { params: { taille: string } }) {
  const t = Number(req.params.taille.replace(/\.png$/, ""));
  if (![180, 192, 512].includes(t)) return texte(req, "server.not_found", 404);
  return reponseIcone(t);
}

/** Material Symbols icon sheet (one `<symbol>` per icon): `<svg><use href="/icones/symboles.svg#Name"/></svg>`. */
const PLANCHE = `<svg xmlns="http://www.w3.org/2000/svg">${Object.entries(TRACES)
  .map(([nom, d]) => `<symbol id="${nom}" viewBox="0 -960 960 960"><path d="${d}"/></symbol>`)
  .join("")}</svg>`;

/** Showcase app captures (`bun run vitrine`): .webp files of the public/img folder, never any other path. */
function routeImage(req: Request & { params: { fichier: string } }) {
  const m = /^[a-z0-9-]+\.(webp|jpg)$/.exec(req.params.fichier);
  if (!m || (m[1] === "jpg" && req.params.fichier !== "og-auto.jpg")) return texte(req, "server.not_found", 404);
  const publicDir = Bun.env.AUTO_PUBLIC_DIR
    ? Bun.pathToFileURL(`${Bun.env.AUTO_PUBLIC_DIR.replace(/[\\/]+$/, "")}/`)
    : new URL("../public/", import.meta.url);
  const f = Bun.file(new URL(`img/${req.params.fichier}`, publicDir));
  const type = m[1] === "jpg" ? "image/jpeg" : "image/webp";
  return f
    .exists()
    .then((ok) =>
      ok
        ? new Response(f, { headers: { "content-type": type, "cache-control": "public, max-age=604800" } })
        : texte(req, "server.not_found", 404),
    );
}

/** Hashed responsive variants (scripts/images.ts): `/img/v/<name>-<width>-<hash>.avif|webp`, immutable. */
const empreintesImages = new Map<string, boolean>();
async function routeImageVariante(req: Request & { params: { fichier: string } }) {
  const m = /^[a-z0-9-]+-\d+-([a-f0-9]{10})\.(avif|webp)$/.exec(req.params.fichier);
  if (!m) return texte(req, "server.not_found", 404);
  const publicDir = Bun.env.AUTO_PUBLIC_DIR
    ? Bun.pathToFileURL(`${Bun.env.AUTO_PUBLIC_DIR.replace(/[\\/]+$/, "")}/`)
    : new URL("../public/", import.meta.url);
  const f = Bun.file(new URL(`img/v/${req.params.fichier}`, publicDir));
  if (!(await f.exists())) return texte(req, "server.not_found", 404);
  let valide = empreintesImages.get(req.params.fichier);
  if (valide === undefined) {
    valide = new Bun.CryptoHasher("sha256")
      .update(await f.bytes())
      .digest("hex")
      .startsWith(m[1]!);
    empreintesImages.set(req.params.fichier, valide);
  }
  if (!valide) return texte(req, "server.not_found", 404);
  return new Response(f, {
    headers: {
      "content-type": `image/${m[2]}`,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

async function routeMarque(req: Request & { params: { fichier: string } }) {
  if (!["google.svg", "microsoft.svg"].includes(req.params.fichier)) return texte(req, "server.not_found", 404);
  const publicDir = Bun.env.AUTO_PUBLIC_DIR
    ? Bun.pathToFileURL(`${Bun.env.AUTO_PUBLIC_DIR.replace(/[\\/]+$/, "")}/`)
    : new URL("../public/", import.meta.url);
  const fichier = Bun.file(new URL(`brands/${req.params.fichier}`, publicDir));
  return (await fichier.exists())
    ? new Response(fichier, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } })
    : texte(req, "server.not_found", 404);
}

function videoPublique(req: Request) {
  if (!["GET", "HEAD"].includes(req.method))
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  if (Bun.env.AUTO_MEDIA_URL) {
    try {
      const url = new URL(Bun.env.AUTO_MEDIA_URL);
      if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash)
        return new Response(null, {
          status: 302,
          headers: { location: url.href, "cache-control": "public, max-age=60" },
        });
    } catch {
      // Invalid configuration: never redirect to an arbitrary address.
    }
    return texte(req, "server.video_unavailable", 503, { "cache-control": "no-store" });
  }
  return Bun.env.AUTO_MEDIA_DIR
    ? fichierPublic(req, `${Bun.env.AUTO_MEDIA_DIR.replace(/[\\/]+$/, "")}/lancement-btp.mp4`, { type: "video/mp4" })
    : texte(req, "server.video_unavailable", 404, { "cache-control": "no-store" });
}

const HTML = { accueil, tarifs, telechargements, mentions, confidentialite, devis, facture, app } as const;

/**
 * HTML pages and resources of the front. Development: `Bun.serve` HTML imports (HMR). Production: in-memory build at
 * start (construction.tsx: code splitting, landing page prerendered, every page localized once per shipped locale),
 * pages served with their security headers, hashed resources with an immutable cache.
 */
function front(development: boolean) {
  if (development)
    return { page: (nom: NomPage) => HTML[nom], ressource: async () => undefined as Response | undefined };
  const site = construireSite();
  site.catch((e) => console.error("Front build failed", e));
  const page = (nom: NomPage) => async (req: Request) => {
    try {
      const s = await site;
      // One document per shipped locale, chosen by ?lang= then Accept-Language.
      const r = reponsePage(req, s.localisees[langueDemandee(req)]?.[nom] ?? s.pages[nom]);
      r.headers.set("vary", "Accept-Language");
      return r;
    } catch {
      return texte(req, "server.page_unavailable", 503, { "cache-control": "no-store" });
    }
  };
  const ressource = async (req: Request) => {
    const r = await site.then((s) => s.ressources.get(new URL(req.url).pathname)).catch(() => undefined);
    if (!r) return undefined;
    return new Response(r.corps, {
      headers: {
        "content-type": r.type,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  };
  return { page, ressource };
}

/** `Bun.serve` routes of the front. */
export function routesWeb(o: OptionsWeb, f = front(o.development ?? false)) {
  const proxy = proxifier(o.api);
  return {
    ...ressourcesCraft(Bun.env.AUTO_PUBLIC_DIR),
    ...routesDistributions(),
    ...routesReferencement(),
    [POINT_RAPPORT]: routeRapportCsp(),
    "/": f.page("accueil"),
    "/tarifs": f.page("tarifs"),
    "/telechargements": f.page("telechargements"),
    "/download": () => Response.redirect("https://auto.aphrody.com/telechargements", 302),
    "/media/lancement-btp.mp4": videoPublique,
    "/mentions-legales": f.page("mentions"),
    "/confidentialite": f.page("confidentialite"),
    "/devis/:jeton": f.page("devis"),
    "/facture/:jeton": f.page("facture"),
    "/app": f.page("app"),
    "/app/*": f.page("app"),
    "/manifest.webmanifest": (req: Request) =>
      Response.json(manifeste(langueDemandee(req)), {
        headers: { "content-type": "application/manifest+json", vary: "Accept-Language" },
      }),
    "/img/:fichier": routeImage,
    "/img/v/:fichier": routeImageVariante,
    "/polices/:fichier": routePolice,
    "/brands/:fichier": routeMarque,
    "/icones/symboles.svg": new Response(PLANCHE, {
      headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
    }),
    "/icones/:taille": routeIcone,
    // Requested by browsers unprompted: 32 px PNG (accepted under this name by every current browser).
    "/favicon.ico": () => reponseIcone(32),
    "/v1/*": proxy,
    "/health": proxy,
    // Better Auth (sessions, OAuth of MCP clients) and remote MCP server: served by the API.
    "/api/auth/*": proxy,
    "/.well-known/*": proxy,
    "/mcp": proxy,
    // Old invitation links (`/invitation#<token>`): the fragment follows the redirect.
    "/invitation": () => new Response(null, { status: 302, headers: { location: "/app/invitation" } }),
  };
}

export function demarrerWeb(o: OptionsWeb & { port?: number; hostname?: string; development?: boolean }) {
  const f = front(o.development ?? false);
  return Bun.serve({
    port: o.port ?? 0,
    hostname: o.hostname,
    development: o.development ?? false,
    routes: routesWeb(o, f),
    fetch: async (req) => (await f.ressource(req)) ?? texte(req, "server.page_not_found", 404),
  });
}
