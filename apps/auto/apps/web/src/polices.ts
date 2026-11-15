// Self-hosted fonts (Fontsource) served as separate files named by content hash, instead of being inlined as base64
// in the blocking CSS (Bun's bundler inlines every `url()` under 128 KiB).
// The bundler plugin (bunfig `[serve.static]`) rewrites each `url(.../@fontsource/<family>/files/<f>.woff2)`
// to `/polices/<f>-<hash>.woff2`, left external; `routePolice` serves those files with an immutable cache.
// Fontsource @font-face rules keep `font-display: swap` and their `unicode-range` subsets.
import type { BunPlugin } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const PREFIXE_POLICES = "/polices/";
/** Families served: the only ones whose `url()` may be rewritten and whose file may be read. */
const FAMILLES = ["inter", "plus-jakarta-sans", "material-symbols-rounded"] as const;
const FICHIER_FONTSOURCE = /[\\/]@fontsource[\\/]([a-z0-9-]+)[\\/]files[\\/]([a-z0-9-]+\.woff2?)$/;
const NOM_PUBLIE = /^([a-z0-9-]+)-([a-f0-9]{10})\.(woff2?)$/;

const empreintes = new Map<string, string>();
/** SHA-256 hash (10 hexadecimal characters) of the content of a font file. */
function empreinte(chemin: string): string {
  let e = empreintes.get(chemin);
  if (!e) {
    const octets = readFileSync(chemin);
    e = new Bun.CryptoHasher("sha256").update(octets).digest("hex").slice(0, 10);
    empreintes.set(chemin, e);
  }
  return e;
}

/** Public URL of a Fontsource file (absolute path), or `undefined` if it is not of a served family. */
export function urlPolice(chemin: string): string | undefined {
  const m = FICHIER_FONTSOURCE.exec(chemin);
  if (!m || !(FAMILLES as readonly string[]).includes(m[1]!)) return undefined;
  const [, , fichier] = m;
  const point = fichier!.lastIndexOf(".");
  return `${PREFIXE_POLICES}${fichier!.slice(0, point)}-${empreinte(chemin)}${fichier!.slice(point)}`;
}

/** `files/` folder of a family, resolved from apps/web (where the packages are declared). */
const dossiers = new Map<string, string>();
function dossierFamille(famille: string): string {
  let d = dossiers.get(famille);
  if (!d) {
    d = `${dirname(Bun.resolveSync(`@fontsource/${famille}/package.json`, import.meta.dir))}/files`;
    dossiers.set(famille, d);
  }
  return d;
}

/** Path of the file served under `/polices/<name>`, only if the hash matches the current content. */
export function cheminPolice(nom: string): string | undefined {
  const m = NOM_PUBLIE.exec(nom);
  if (!m) return undefined;
  const [, base, attendue, ext] = m;
  const famille = FAMILLES.find((f) => base!.startsWith(`${f}-`));
  if (!famille) return undefined;
  const chemin = `${dossierFamille(famille)}/${base}.${ext}`;
  if (!existsSync(chemin)) return undefined;
  return empreinte(chemin) === attendue ? chemin : undefined;
}

/** `GET /polices/:fichier`: hashed WOFF2/WOFF, immutable one-year cache (the URL changes with the content). */
export function routePolice(req: Request & { params: { fichier: string } }): Response {
  const chemin = cheminPolice(req.params.fichier);
  if (!chemin) return new Response("Font not found", { status: 404, headers: { "cache-control": "no-store" } });
  const ext = chemin.endsWith(".woff2") ? "woff2" : "woff";
  return new Response(Bun.file(chemin), {
    headers: {
      "content-type": `font/${ext}`,
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Path served by the front (preloaded `/polices/...`, `/img/...` of `routeImage`), which `Bun.serve` may have
 * prefixed with the project root: to leave external, never to inline. */
const CHEMIN_SERVI = /(?:^|[\\/])(polices[\\/][a-z0-9-]+-[a-f0-9]{10}\.woff2?|img[\\/][a-z0-9-]+\.webp)$/;

/**
 * Bundler plugin: Fontsource `url()` to external `/polices/...`; the served `/polices/...` paths (preload) and
 * `/img/...` stay as they are. The `url()` of Fontsource stylesheets not compiled by Tailwind arrive relative
 * (`./files/...`): the absolute path is rebuilt from `resolveDir`.
 */
export const greffonPolices: BunPlugin = {
  name: "auto-polices",
  setup(build) {
    build.onResolve({ filter: /\.(?:woff2?|webp)$/ }, (args) => {
      const servi = CHEMIN_SERVI.exec(args.path);
      if (servi && (args.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(args.path)) && !existsSync(args.path))
        return { path: `/${servi[1]!.replaceAll("\\", "/")}`, external: true };
      if (args.path.endsWith(".webp")) return undefined;
      const absolu = resolve(args.resolveDir || dirname(args.importer), args.path);
      const url = urlPolice(absolu);
      return url ? { path: url, external: true } : undefined;
    });
  },
};

export default greffonPolices;
