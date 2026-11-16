// Ingest batch: received supplier invoices (upload, list, file, manual validation).
import { ErreurApi, refus } from "../i18n";
import { valider, type FactureRecue, type StatutRecue } from "@auto/ingest";
import {
  deciderRecue,
  ErreurMetier,
  lireFichierRecu,
  lireRecue,
  listerRecues,
  withTenant,
  type Decision,
} from "@auto/store";
import type { BunRequest } from "bun";
import type { Module, Chemins } from ".";
import { avecId, brut, enumere, liste, objet, op, str } from "../openapi-outils";
import { STATUTS, deposer, lireDepot } from "@auto/services/ingest";

export const routes: Module = ({ sql, auth }) => ({
  "/v1/factures-recues": {
    GET: auth("lire", async (req, a) => {
      const s = new URL(req.url).searchParams.get("statut") as StatutRecue | null;
      if (s && !STATUTS.includes(s)) throw new ErreurApi("status_expected_one_of", [], 422, { values: STATUTS.join(", ") });
      return Response.json(await withTenant(sql, a.tenantId, (tx) => listerRecues(tx, { statut: s ?? undefined })));
    }),
    POST: auth("ecrire", async (req, a) => {
      const { recue, doublon } = await deposer(sql, a.tenantId, a.userId, { ...(await lireDepot(req)), canal: "api" });
      return Response.json({ ...recue, doublon }, { status: doublon ? 200 : 201 });
    }),
  },

  "/v1/factures-recues/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/factures-recues/:id">, a) => {
      const r = await withTenant(sql, a.tenantId, (tx) => lireRecue(tx, req.params.id));
      return r ? Response.json(r) : refus(req, "not_found", 404);
    }),
  },

  "/v1/factures-recues/:id/fichier": {
    GET: auth("lire", async (req: BunRequest<"/v1/factures-recues/:id/fichier">, a) => {
      const f = await withTenant(sql, a.tenantId, (tx) => lireFichierRecu(tx, req.params.id));
      if (!f) return refus(req, "not_found", 404);
      const nom = (f.nom ?? "facture").replace(/["\\\r\n]/g, "_");
      return new Response(f.contenu, {
        headers: {
          "content-type": f.typeMime,
          "content-disposition": `inline; filename="${nom}"`,
          etag: `"${f.sha256}"`,
        },
      });
    }),
  },

  "/v1/factures-recues/:id/decision": {
    POST: auth("ecrire", async (req: BunRequest<"/v1/factures-recues/:id/decision">, a) => {
      const b = (await req.json()) as { statut: Decision["statut"]; facture?: FactureRecue; motif?: string };
      if (b.statut !== "validee" && b.statut !== "rejetee")
        throw new ErreurApi("status_validated_or_rejected");
      if (b.facture && (typeof b.facture !== "object" || !Array.isArray(b.facture.lignes) || !b.facture.totaux))
        throw new ErreurApi("corrected_invoice_invalid");
      // A correction is re-checked; manual validation remains possible with remaining anomalies.
      const d: Decision = {
        statut: b.statut,
        facture: b.facture,
        motif: b.motif,
        anomalies: b.facture && valider(b.facture),
      };
      return Response.json(await withTenant(sql, a.tenantId, (tx) => deciderRecue(tx, a.userId, req.params.id, d)));
    }),
  },
});

/** OpenAPI description of the batch routes. */
export const openapi: Chemins = {
  "/v1/factures-recues": {
    get: op({
      resume: "Received supplier invoices",
      tag: "Received invoices",
      droit: "lire",
      requete: [
        { nom: "statut", schema: enumere("a_verifier", "validee", "rejetee"), description: "Status filter" },
      ],
      succes: { 200: liste(objet({})) },
    }),
    post: op({
      resume: "Upload a received invoice (binary body: Factur-X, PDF or CII XML; Bearer token)",
      tag: "Received invoices",
      droit: "ecrire",
      succes: { 201: objet({}), 200: objet({}) },
      erreurs: [413, 422],
    }),
  },
  "/v1/factures-recues/{id}": avecId({
    get: op({
      resume: "Read a received invoice",
      tag: "Received invoices",
      droit: "lire",
      succes: { 200: objet({}) },
      erreurs: [404],
    }),
  }),
  "/v1/factures-recues/{id}/fichier": avecId({
    get: op({
      resume: "Fichier d'origine",
      tag: "Received invoices",
      droit: "lire",
      succes: { 200: brut("application/octet-stream") },
      erreurs: [404],
    }),
  }),
  "/v1/factures-recues/{id}/decision": avecId({
    post: op({
      resume: "Validate (with possible correction) or reject an invoice to check",
      tag: "Received invoices",
      droit: "ecrire",
      corps: objet({ decision: enumere("validee", "rejetee"), corrections: objet({}), motif: str }, ["decision"]),
      succes: { 200: objet({}) },
      erreurs: [404, 409, 422],
    }),
  }),
};
