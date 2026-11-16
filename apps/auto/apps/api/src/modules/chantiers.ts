import { ErreurApi } from "../i18n";
import {
  affectationAchat,
  affectationDocument,
  affecterAchat,
  affecterDocument,
  dossierChantier,
  dossierFournisseur,
  enregistrerChantier,
  enregistrerFournisseur,
  enregistrerPiece,
  identifiant,
  lireFournisseur,
  listerChantiers,
  listerFournisseurs,
  listerPieces,
  rechercherGestion,
  withTenant,
} from "@auto/store";
import type { BunRequest } from "bun";
import type { Module, Chemins } from "../modules";
import { avecId, brut, cents, date, enumere, liste, objet, op, ref, str, uuid } from "../openapi-outils";
import { classeurGestion, rapportGestion } from "@auto/services/gestion";
import { writeXlsx } from "@auto/native";
import { segmentsDe, accesSegment, type Auth } from "@auto/tenancy";
const segmentPiece = (type: string) => (type === "bon_livraison" ? "livraisons" : "commandes");
function dossierPermis<T extends { documents: unknown[]; achats: unknown[]; pieces: { type: string }[] }>(
  d: T,
  a: Auth,
): T {
  return {
    ...d,
    documents: accesSegment(a, "clients") ? d.documents : [],
    achats: accesSegment(a, "fournisseurs") ? d.achats : [],
    pieces: d.pieces.filter((p) => accesSegment(a, segmentPiece(p.type))),
  };
}
export const routes: Module = ({ sql, auth }) => ({
  "/v1/exports/gestion.xlsx": {
    GET: auth(
      "lire",
      async (_req, a) =>
        new Response(
          new Uint8Array(writeXlsx(await withTenant(sql, a.tenantId, (tx) => classeurGestion(tx, segmentsDe(a))))),
          {
            headers: {
              "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "content-disposition": 'attachment; filename="gestion-auto.xlsx"',
            },
          },
        ),
    ),
  },
  "/v1/exports/gestion.pdf": {
    GET: auth(
      "lire",
      async (_req, a) =>
        new Response(rapportGestion(await withTenant(sql, a.tenantId, (tx) => classeurGestion(tx, segmentsDe(a)))), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="gestion-auto.pdf"',
          },
        }),
    ),
  },
  "/v1/recherche-gestion": {
    GET: auth("lire", async (req, a) =>
      Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          rechercherGestion(tx, new URL(req.url).searchParams.get("q"), segmentsDe(a)),
        ),
      ),
    ),
  },
  "/v1/fournisseurs": {
    GET: auth("lire", async (_req, a) => {
      const f = await withTenant(sql, a.tenantId, listerFournisseurs);
      return Response.json(
        accesSegment(a, "fournisseurs") ? f : f.map(({ id, nom, archive }) => ({ id, nom, archive })),
      );
    }),
    POST: auth("ecrire", async (req, a) => {
      const b = await req.json();
      return Response.json(await withTenant(sql, a.tenantId, (tx) => enregistrerFournisseur(tx, a.userId, b)), {
        status: 201,
      });
    }),
  },
  "/v1/fournisseurs/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/fournisseurs/:id">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => lireFournisseur(tx, req.params.id))),
    ),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/fournisseurs/:id">, a) => {
      const b = await req.json();
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) => enregistrerFournisseur(tx, a.userId, b, req.params.id)),
      );
    }),
  },
  "/v1/fournisseurs/:id/dossier": {
    GET: auth("lire", async (req: BunRequest<"/v1/fournisseurs/:id/dossier">, a) =>
      Response.json(
        await withTenant(sql, a.tenantId, async (tx) => {
          const d = await dossierFournisseur(tx, req.params.id);
          return { ...d, pieces: d.pieces.filter((p) => accesSegment(a, segmentPiece(p.type))) };
        }),
      ),
    ),
  },
  "/v1/chantiers": {
    GET: auth("lire", async (_req, a) => {
      const c = await withTenant(sql, a.tenantId, listerChantiers);
      return Response.json(
        accesSegment(a, "chantiers")
          ? c
          : c.map(({ id, nom, code, adresse, archive, clientId }) => ({ id, nom, code, adresse, archive, clientId })),
      );
    }),
    POST: auth("ecrire", async (req, a) => {
      const b = await req.json();
      return Response.json(await withTenant(sql, a.tenantId, (tx) => enregistrerChantier(tx, a.userId, b)), {
        status: 201,
      });
    }),
  },
  "/v1/chantiers/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/chantiers/:id">, a) =>
      Response.json(dossierPermis(await withTenant(sql, a.tenantId, (tx) => dossierChantier(tx, req.params.id)), a)),
    ),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/chantiers/:id">, a) => {
      const b = await req.json();
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) => enregistrerChantier(tx, a.userId, b, req.params.id)),
      );
    }),
  },
  "/v1/documents/:id/chantier": {
    GET: auth("lire", async (req: BunRequest<"/v1/documents/:id/chantier">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => affectationDocument(tx, req.params.id))),
    ),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/documents/:id/chantier">, a) => {
      const b = (await req.json()) as { chantierId?: unknown };
      const id = b?.chantierId === null ? null : identifiant(b?.chantierId);
      await withTenant(sql, a.tenantId, (tx) => affecterDocument(tx, a.userId, req.params.id, id));
      return Response.json({ chantierId: id });
    }),
  },
  "/v1/factures-recues/:id/affectation": {
    GET: auth("lire", async (req: BunRequest<"/v1/factures-recues/:id/affectation">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => affectationAchat(tx, req.params.id))),
    ),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/factures-recues/:id/affectation">, a) => {
      const b = (await req.json()) as { fournisseurId?: unknown; chantierId?: unknown };
      const fournisseurId = identifiant(b?.fournisseurId);
      const chantierId = b?.chantierId == null ? null : identifiant(b.chantierId);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          affecterAchat(tx, a.userId, req.params.id, fournisseurId, chantierId),
        ),
      );
    }),
  },
  "/v1/pieces-chantier": {
    GET: auth("lire", async (_req, a) =>
      Response.json(
        (await withTenant(sql, a.tenantId, listerPieces)).filter((p) => accesSegment(a, segmentPiece(p.type))),
      ),
    ),
    POST: auth("ecrire", async (req, a) => {
      const b = await req.json();
      if (!accesSegment(a, segmentPiece(b?.type))) throw new ErreurApi("document_kind_forbidden", [], 403);
      if (b?.recueId && !accesSegment(a, "fournisseurs"))
        throw new ErreurApi("suppliers_access_match", [], 403);
      return Response.json(await withTenant(sql, a.tenantId, (tx) => enregistrerPiece(tx, a.userId, b)), {
        status: 201,
      });
    }),
  },
  "/v1/pieces-chantier/:id": {
    PUT: auth("ecrire", async (req: BunRequest<"/v1/pieces-chantier/:id">, a) => {
      const b = await req.json();
      if (!accesSegment(a, segmentPiece(b?.type))) throw new ErreurApi("document_kind_forbidden", [], 403);
      return Response.json(
        await withTenant(sql, a.tenantId, async (tx) => {
          const avant = (await listerPieces(tx)).find((p) => p.id === req.params.id);
          if (!avant || !accesSegment(a, segmentPiece(avant.type)))
            throw new ErreurApi("attachment_not_found", [], 404);
          if ((b?.recueId ?? null) !== avant.recueId && !accesSegment(a, "fournisseurs"))
            throw new ErreurApi("suppliers_access_edit_match", [], 403);
          return enregistrerPiece(tx, a.userId, b, req.params.id);
        }),
      );
    }),
  },
});
const archive = { type: "boolean" };
const fournisseur = objet(
  { nom: str, adresse: str, siret: str, email: str, telephone: str, contact: str, notes: str, archive },
  ["nom"],
);
const chantier = objet(
  {
    nom: str,
    code: str,
    clientId: uuid,
    adresse: str,
    budgetHtCents: cents,
    avancement: { type: "integer", minimum: 0, maximum: 100 },
    statut: enumere("planifie", "en_cours", "termine", "en_pause"),
    debut: { type: ["string", "null"], format: "date" },
    fin: { type: ["string", "null"], format: "date" },
    notes: str,
    archive,
  },
  ["nom", "code", "clientId", "budgetHtCents", "avancement", "statut"],
);
const piece = objet(
  {
    type: enumere("bon_livraison", "confirmation_commande"),
    reference: str,
    fournisseurId: uuid,
    chantierId: uuid,
    recueId: { type: ["string", "null"], format: "uuid" },
    date,
    statut: enumere("a_verifier", "valide", "annule"),
    lignes: liste(ref("Ligne")),
    notes: str,
    archive,
  },
  ["type", "reference", "fournisseurId", "chantierId", "date", "statut", "lignes"],
);
const operation = (resume: string, droit: "lire" | "ecrire", corps?: Record<string, unknown>, creation = false) =>
  op({
    resume,
    tag: "Worksites and suppliers",
    droit,
    corps,
    succes: { [creation ? 201 : 200]: objet({}) },
    erreurs: [404, 409, 422],
  });
export const openapi: Chemins = {
  "/v1/exports/gestion.xlsx": {
    get: op({
      resume: "Complete management workbook: suppliers, clients, analytics, deliveries, orders",
      tag: "Worksites and suppliers",
      droit: "lire",
      succes: { 200: brut("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") },
    }),
  },
  "/v1/exports/gestion.pdf": {
    get: op({
      resume: "PDF report of the five spaces, data and archives included",
      tag: "Worksites and suppliers",
      droit: "lire",
      succes: { 200: brut("application/pdf") },
      erreurs: [413],
    }),
  },
  "/v1/recherche-gestion": {
    get: op({
      resume: "Search the recorded documents, archives included (100 results at most, total returned)",
      tag: "Worksites and suppliers",
      droit: "lire",
      requete: [{ nom: "q", schema: str, description: "2 to 200 characters" }],
      succes: { 200: objet({}) },
      erreurs: [422],
    }),
  },
  "/v1/fournisseurs/{id}/dossier": avecId({
    get: operation("Supplier file: filed invoices and matched documents", "lire"),
  }),
  "/v1/fournisseurs": {
    get: op({
      resume: "Supplier directory",
      tag: "Worksites and suppliers",
      droit: "lire",
      succes: { 200: liste(fournisseur) },
    }),
    post: operation("Create a supplier", "ecrire", fournisseur, true),
  },
  "/v1/fournisseurs/{id}": avecId({
    get: operation("Read a supplier", "lire"),
    put: operation("Edit or archive a supplier", "ecrire", fournisseur),
  }),
  "/v1/chantiers": {
    get: op({
      resume: "List of worksites",
      tag: "Worksites and suppliers",
      droit: "lire",
      succes: { 200: liste(chantier) },
    }),
    post: operation("Create a worksite", "ecrire", chantier, true),
  },
  "/v1/chantiers/{id}": avecId({
    get: operation("File and analytics: issued sales, validated purchases in EUR, uninvoiced orders", "lire"),
    put: operation("Edit or archive a worksite", "ecrire", chantier),
  }),
  "/v1/documents/{id}/chantier": avecId({
    get: operation("Analytical assignment of a document", "lire"),
    put: operation(
      "Assign a document to its client's worksite (null to remove)",
      "ecrire",
      objet({ chantierId: { type: ["string", "null"], format: "uuid" } }, ["chantierId"]),
    ),
  }),
  "/v1/factures-recues/{id}/affectation": avecId({
    get: operation("Assignment of a received purchase", "lire"),
    put: operation(
      "File a purchase by supplier and worksite",
      "ecrire",
      objet({ fournisseurId: uuid, chantierId: { type: ["string", "null"], format: "uuid" } }, ["fournisseurId"]),
    ),
  }),
  "/v1/pieces-chantier": {
    get: op({
      resume: "Delivery notes and order confirmations, archives included",
      tag: "Worksites and suppliers",
      droit: "lire",
      succes: { 200: liste(piece) },
    }),
    post: operation("Create a worksite document", "ecrire", piece, true),
  },
  "/v1/pieces-chantier/{id}": avecId({ put: operation("Edit, match or archive a document", "ecrire", piece) }),
};
