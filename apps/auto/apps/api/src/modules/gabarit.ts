// Batch L4: per-tenant document template (accent color, logo, footer).
import { ErreurApi, refus } from "../i18n";
import { enregistrerGabarit, enregistrerLogo, ErreurMetier, lireGabarit, withTenant } from "@auto/store";
import type { Module } from ".";
import { brut, objet, op, str } from "../openapi-outils";
import type { Chemins } from ".";

/** Maximum width of the stored logo (pixels): enough for print at 48 pt high. */
const LARGEUR_LOGO = 600;
const MAX_OCTETS = 5 * 1024 * 1024;

/** Any image (PNG, JPEG, WebP...) → reduced RGB JPEG, ready to embed as is in the PDF. */
export async function preparerLogo(
  octets: Uint8Array,
): Promise<{ jpeg: Uint8Array; largeur: number; hauteur: number }> {
  if (octets.length > MAX_OCTETS) throw new ErreurApi("logo_too_large", [], 413);
  try {
    const source = new Bun.Image(octets.slice(), { maxPixels: 40_000_000 });
    const m = await source.metadata();
    const largeur = Math.min(LARGEUR_LOGO, m.width);
    const hauteur = Math.max(1, Math.round((m.height * largeur) / m.width));
    const jpeg = await new Bun.Image(octets.slice()).resize(largeur, hauteur).jpeg({ quality: 90 }).bytes();
    return { jpeg, largeur, hauteur };
  } catch (e) {
    if (e instanceof ErreurMetier) throw e;
    throw new ErreurApi("logo_unreadable");
  }
}

export const routes: Module = ({ sql, auth }) => ({
  "/v1/parametres/gabarit": {
    GET: auth("lire", async (req, a) => {
      const g = await withTenant(sql, a.tenantId, (tx) => lireGabarit(tx));
      return Response.json({
        couleur: g?.couleur ?? null,
        piedDePage: g?.piedDePage ?? null,
        logo: g?.logo ? { largeur: g.logo.largeur, hauteur: g.logo.hauteur } : null,
      });
    }),
    PUT: auth("parametres", async (req, a) => {
      const b = (await req.json()) as { couleur?: string | null; piedDePage?: string | null };
      await withTenant(sql, a.tenantId, (tx) => enregistrerGabarit(tx, a.userId, b));
      return new Response(null, { status: 204 });
    }),
  },
  "/v1/parametres/gabarit/logo": {
    GET: auth("lire", async (req, a) => {
      const g = await withTenant(sql, a.tenantId, (tx) => lireGabarit(tx));
      if (!g?.logo) return refus(req, "no_logo", 404);
      return new Response(Uint8Array.fromBase64(g.logo.jpeg), { headers: { "content-type": "image/jpeg" } });
    }),
    PUT: auth("parametres", async (req, a) => {
      const { image } = (await req.json()) as { image?: string };
      if (typeof image !== "string") throw new ErreurApi("image_missing");
      const logo = await preparerLogo(Uint8Array.fromBase64(image));
      await withTenant(sql, a.tenantId, (tx) => enregistrerLogo(tx, a.userId, logo));
      return Response.json({ largeur: logo.largeur, hauteur: logo.hauteur });
    }),
    DELETE: auth("parametres", async (req, a) => {
      await withTenant(sql, a.tenantId, (tx) => enregistrerLogo(tx, a.userId, null));
      return new Response(null, { status: 204 });
    }),
  },
});

/** OpenAPI description of the batch routes. */
export const openapi: Chemins = {
  "/v1/parametres/gabarit": {
    get: op({
      resume: "Document template (color, footer, logo dimensions)",
      tag: "Settings",
      droit: "lire",
      succes: {
        200: objet({
          couleur: str,
          piedDePage: str,
          logo: objet({ largeur: { type: "integer" }, hauteur: { type: "integer" } }),
        }),
      },
    }),
    put: op({
      resume: "Edit the accent color and the footer",
      tag: "Settings",
      droit: "parametres",
      corps: objet({
        couleur: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        piedDePage: { type: "string", maxLength: 200 },
      }),
      succes: { 204: null },
      erreurs: [422],
    }),
  },
  "/v1/parametres/gabarit/logo": {
    get: op({
      resume: "Logo (JPEG)",
      tag: "Settings",
      droit: "lire",
      succes: { 200: brut("image/jpeg") },
      erreurs: [404],
    }),
    put: op({
      resume: "Upload a logo (PNG, JPEG or WebP, converted to an RGB JPEG at most 600 px wide)",
      tag: "Settings",
      droit: "parametres",
      corps: objet({ image: { type: "string", contentEncoding: "base64" } }, ["image"]),
      succes: { 200: objet({ largeur: { type: "integer" }, hauteur: { type: "integer" } }) },
      erreurs: [413, 422],
    }),
    delete: op({ resume: "Remove the logo", tag: "Settings", droit: "parametres", succes: { 204: null } }),
  },
};
