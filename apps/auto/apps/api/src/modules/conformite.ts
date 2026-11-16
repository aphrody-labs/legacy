// Compliance batch: GDPR export, company deletion, object archiving (see modules.ts).
import { ErreurApi, refus } from "../i18n";
import {
  annulerSuppression,
  archiverFichiers,
  demanderSuppression,
  etatSuppression,
  exporterTenant,
  s3DepuisEnv,
} from "@auto/store";
import { entreprise, verifierMotDePasse, type Auth } from "@auto/tenancy";
import type { Module } from ".";
import { brut, objet, op, str } from "../openapi-outils";
import type { Chemins } from ".";

const owner = (a: Auth) => {
  if (a.role !== "owner") throw new ErreurApi("owner_only", [], 403);
};

export const routes: Module = ({ sql, auth }) => ({
  "/v1/conformite/export": {
    GET: auth("parametres", async (req, a) => {
      const archive = await exporterTenant(sql, a.tenantId);
      const jour = new Date().toISOString().slice(0, 10);
      return new Response(archive, {
        headers: {
          "content-type": "application/gzip",
          "content-disposition": `attachment; filename="auto-export-${jour}.tar.gz"`,
          "cache-control": "no-store",
        },
      });
    }),
  },

  // Deletion: owner, exact company name and password; executed after the grace period.
  "/v1/conformite/suppression": {
    GET: auth("lire", async (req, a) => Response.json(await etatSuppression(sql, a.tenantId))),
    POST: auth("parametres", async (req, a) => {
      owner(a);
      const { confirmation, motDePasse } = ((await req.json()) ?? {}) as { confirmation?: string; motDePasse?: string };
      const e = await entreprise(sql, a.tenantId);
      if (confirmation?.trim() !== e.nom)
        throw new ErreurApi("confirmation_company_name", [e.nom]);
      await verifierMotDePasse(sql, a.userId, motDePasse ?? "");
      return Response.json(await demanderSuppression(sql, a.tenantId, a.userId), { status: 202 });
    }),
    DELETE: auth("parametres", async (req, a) => {
      owner(a);
      return Response.json(await annulerSuppression(sql, a.tenantId, a.userId));
    }),
  },

  "/v1/conformite/archivage": {
    POST: auth("parametres", async (req, a) => {
      const s3 = s3DepuisEnv();
      if (!s3)
        return refus(req, "object_storage_missing", 503);
      return Response.json({ archives: await archiverFichiers(sql, a.tenantId, s3, a.userId) });
    }),
  },
});

/** OpenAPI description of the batch routes. */
export const openapi: Chemins = {
  "/v1/conformite/export": {
    get: op({
      resume: "Full export of the tenant data (tar.gz, without secrets)",
      tag: "Compliance",
      droit: "parametres",
      succes: { 200: brut("application/gzip") },
    }),
  },
  "/v1/conformite/suppression": {
    get: op({
      resume: "Status of a tenant deletion request",
      tag: "Compliance",
      droit: "lire",
      succes: { 200: objet({}) },
    }),
    post: op({
      resume: "Request the tenant deletion (owner, 30-day grace, accounting documents kept 10 years)",
      tag: "Compliance",
      droit: "parametres",
      corps: objet({ nomEntreprise: str, motDePasse: str }, ["nomEntreprise", "motDePasse"]),
      succes: { 202: objet({}) },
      erreurs: [401, 409, 422],
    }),
    delete: op({
      resume: "Cancel the deletion request",
      tag: "Compliance",
      droit: "parametres",
      succes: { 204: null },
      erreurs: [404],
    }),
  },
  "/v1/conformite/archivage": {
    post: op({
      resume: "Archive the frozen copies into locked object storage",
      tag: "Compliance",
      droit: "parametres",
      succes: { 200: objet({}) },
      erreurs: [503],
    }),
  },
};
