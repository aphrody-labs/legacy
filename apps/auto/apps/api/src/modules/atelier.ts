import { ErreurApi } from "../i18n";
import {
  creerAtelier,
  lireAtelier,
  listerAtelier,
  fichierAtelier,
  sauverAtelier,
  versionsAtelier,
  classerAtelier,
  fichierIndexe,
  withTenant,
  identifiant,
  type FormatAtelier,
} from "@auto/store";
import { segmentsDe, accesSegment } from "@auto/tenancy";
import { deposerDevis } from "@auto/services/devis-recus";
import {
  MIMES_ATELIER,
  nomAtelier,
  formatAtelier,
  decoderAtelier,
  inspecterAtelier,
  nouveauAtelier,
  modifierAtelier,
  exporterAtelierPdf,
  type OperationAtelier,
} from "@auto/services/atelier";
import type { BunRequest } from "bun";
import type { Module, Chemins } from "../modules";
import { avecId, brut, enumere, liste, objet, op, str, uuid, type Schema } from "../openapi-outils";
function segment(s: unknown, permis: readonly string[]): string {
  if (typeof s !== "string" || !permis.includes(s)) throw new ErreurApi("segment_forbidden", [], 403);
  return s;
}
function revision(v: unknown) {
  if (!Number.isSafeInteger(v) || Number(v) < 1) throw new ErreurApi("document_revision_required");
  return v as number;
}
function telecharger(contenu: Uint8Array, mime: string, nom: string, rev?: number) {
  return new Response(new Uint8Array(contenu), {
    headers: {
      "content-type": mime,
      "content-disposition": `attachment; filename="document.${nom.split(".").at(-1)}"; filename*=UTF-8''${encodeURIComponent(nom).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
      "cache-control": "private, no-store",
      ...(rev ? { etag: `"${rev}"` } : {}),
    },
  });
}
export const routes: Module = ({ sql, auth }) => ({
  "/v1/atelier/:id/extraire-devis": {
    POST: auth("ecrire", async (req: BunRequest<"/v1/atelier/:id/extraire-devis">, a) => {
      if (!accesSegment(a, "fournisseurs")) throw new ErreurApi("suppliers_segment_required", [], 403);
      const b = (await req.json()) as { revision: number };
      const rev = revision(b.revision);
      const f = await withTenant(sql, a.tenantId, (tx) =>
        fichierAtelier(tx, identifiant(req.params.id), segmentsDe(a)),
      );
      if (f.document.revision !== rev)
        throw new ErreurApi("document_changed_reload", [], 409);
      if (!["word", "pdf"].includes(f.document.format)) throw new ErreurApi("quote_word_pdf_expected");
      return Response.json(
        await deposerDevis(sql, a.tenantId, a.userId, {
          contenu: f.contenu,
          nom: f.document.nom,
          typeMime: MIMES_ATELIER[f.document.format],
          canal: "api",
        }),
      );
    }),
  },
  "/v1/atelier": {
    GET: auth("lire", async (_req, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => listerAtelier(tx, segmentsDe(a)))),
    ),
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as { nom?: string; format: FormatAtelier; segment: string };
      if (!["word", "excel"].includes(b?.format)) throw new ErreurApi("word_excel_expected");
      const s = segment(b.segment, segmentsDe(a));
      const nom = nomAtelier(b.nom ?? (b.format === "word" ? "Document.docx" : "Classeur.xlsx"), b.format);
      const contenu = nouveauAtelier(b.format);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          creerAtelier(
            tx,
            a.userId,
            { nom, format: b.format, segment: s },
            { nom, contenu, typeMime: MIMES_ATELIER[b.format], canal: "api" },
          ),
        ),
        { status: 201 },
      );
    }),
  },
  "/v1/atelier/importer": {
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as { nom?: string; fichier?: string; indexId?: string; segment: string };
      const s = segment(b?.segment, segmentsDe(a));
      const original = b.indexId
        ? await withTenant(sql, a.tenantId, (tx) => fichierIndexe(tx, identifiant(b.indexId), segmentsDe(a)))
        : null;
      const nom = nomAtelier(b.nom ?? original?.nom);
      const format = formatAtelier(nom),
        contenu = original?.contenu ?? decoderAtelier(b.fichier);
      inspecterAtelier(contenu, format);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          creerAtelier(
            tx,
            a.userId,
            { nom, format, segment: s },
            { nom, contenu, typeMime: MIMES_ATELIER[format], canal: "api" },
          ),
        ),
        { status: 201 },
      );
    }),
  },
  "/v1/atelier/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/atelier/:id">, a) => {
      const f = await withTenant(sql, a.tenantId, (tx) => fichierAtelier(tx, req.params.id, segmentsDe(a)));
      return Response.json({ document: f.document, inspection: inspecterAtelier(f.contenu, f.document.format) });
    }),
    PATCH: auth("ecrire", async (req: BunRequest<"/v1/atelier/:id">, a) => {
      const b = (await req.json()) as { archive: boolean };
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          classerAtelier(tx, a.userId, req.params.id, segmentsDe(a), b?.archive),
        ),
      );
    }),
  },
  "/v1/atelier/:id/fichier": {
    GET: auth("lire", async (req: BunRequest<"/v1/atelier/:id/fichier">, a) => {
      const r = new URL(req.url).searchParams.get("revision");
      const f = await withTenant(sql, a.tenantId, (tx) =>
        fichierAtelier(tx, req.params.id, segmentsDe(a), r === null ? undefined : revision(Number(r))),
      );
      return telecharger(f.contenu, f.typeMime, f.nom, f.revision);
    }),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/atelier/:id/fichier">, a) => {
      const b = (await req.json()) as { fichier: string; revision: number };
      const rev = revision(b?.revision),
        contenu = decoderAtelier(b?.fichier);
      const d = await withTenant(sql, a.tenantId, (tx) => lireAtelier(tx, req.params.id, segmentsDe(a)));
      inspecterAtelier(contenu, d.format);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          sauverAtelier(tx, a.userId, d.id, segmentsDe(a), rev, {
            nom: d.nom,
            contenu,
            typeMime: MIMES_ATELIER[d.format],
            canal: "api",
          }),
        ),
      );
    }),
  },
  "/v1/atelier/:id/versions": {
    GET: auth("lire", async (req: BunRequest<"/v1/atelier/:id/versions">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => versionsAtelier(tx, req.params.id, segmentsDe(a)))),
    ),
  },
  "/v1/atelier/:id/restaurer": {
    POST: auth("ecrire", async (req: BunRequest<"/v1/atelier/:id/restaurer">, a) => {
      const b = (await req.json()) as { revision: number; version: number };
      const rev = revision(b?.revision),
        version = revision(b?.version);
      return Response.json(
        await withTenant(sql, a.tenantId, async (tx) => {
          const f = await fichierAtelier(tx, req.params.id, segmentsDe(a), version);
          return sauverAtelier(tx, a.userId, req.params.id, segmentsDe(a), rev, {
            nom: f.document.nom,
            contenu: f.contenu,
            typeMime: f.typeMime,
            canal: "api",
          });
        }),
      );
    }),
  },
  "/v1/atelier/:id/operations": {
    POST: auth("ecrire", async (req: BunRequest<"/v1/atelier/:id/operations">, a) => {
      const b = (await req.json()) as { revision: number; operation: OperationAtelier };
      const rev = revision(b?.revision);
      const f = await withTenant(sql, a.tenantId, (tx) => fichierAtelier(tx, req.params.id, segmentsDe(a)));
      if (f.document.revision !== rev) throw new ErreurApi("document_changed", [], 409);
      if (!b.operation || typeof b.operation !== "object") throw new ErreurApi("operation_missing");
      const contenu = modifierAtelier(f.contenu, f.document.format, b.operation);
      inspecterAtelier(contenu, f.document.format);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          sauverAtelier(tx, a.userId, req.params.id, segmentsDe(a), rev, {
            nom: f.document.nom,
            contenu,
            typeMime: f.typeMime,
            canal: "api",
          }),
        ),
      );
    }),
  },
  "/v1/atelier/:id/export.pdf": {
    GET: auth("lire", async (req: BunRequest<"/v1/atelier/:id/export.pdf">, a) => {
      const f = await withTenant(sql, a.tenantId, (tx) => fichierAtelier(tx, req.params.id, segmentsDe(a)));
      return telecharger(
        exporterAtelierPdf(f.contenu, f.document.format),
        "application/pdf",
        f.document.nom.replace(/\.[^.]+$/, ".pdf"),
      );
    }),
  },
});
const doc = objet({
  id: uuid,
  nom: str,
  format: enumere("word", "excel", "pdf"),
  segment: str,
  revision: { type: "integer" },
  archive: { type: "boolean" },
  createdAt: str,
  updatedAt: str,
});
const operation = (resume: string, droit: "lire" | "ecrire", sortie: Schema, corps?: Schema, creation = false) =>
  op({
    resume,
    tag: "Craft workshop",
    droit,
    corps,
    succes: { [creation ? 201 : 200]: sortie },
    erreurs: [403, 404, 409, 413, 422],
  });
export const openapi: Chemins = {
  "/v1/atelier/{id}/extraire-devis": avecId({
    post: operation(
      "Extract a quote from the saved Word/PDF revision, without touching the original",
      "ecrire",
      objet({ devis: objet({}), doublon: { type: "boolean" } }),
      objet({ revision: { type: "integer", minimum: 1 } }, ["revision"]),
    ),
  }),
  "/v1/atelier": {
    get: operation("Working documents accessible by segment", "lire", liste(doc)),
    post: operation(
      "Create a Word document or an Excel workbook",
      "ecrire",
      doc,
      objet({ nom: str, format: enumere("word", "excel"), segment: str }, ["format", "segment"]),
      true,
    ),
  },
  "/v1/atelier/importer": {
    post: operation(
      "Import DOCX, XLSX or PDF, or copy an authorized indexed document",
      "ecrire",
      doc,
      objet({ nom: str, segment: str, fichier: { type: "string", contentEncoding: "base64" }, indexId: uuid }, [
        "segment",
      ]),
      true,
    ),
  },
  "/v1/atelier/{id}": avecId({
    get: operation("Metadata and native preview", "lire", objet({ document: doc, inspection: objet({}) })),
    patch: operation(
      "Archive or restore a working document",
      "ecrire",
      doc,
      objet({ archive: { type: "boolean" } }, ["archive"]),
    ),
  }),
  "/v1/atelier/{id}/fichier": avecId({
    get: op({
      resume: "Download an original version (current revision by default)",
      tag: "Craft workshop",
      droit: "lire",
      requete: [{ nom: "revision", schema: { type: "integer", minimum: 1 }, description: "Version historique" }],
      succes: { 200: brut("application/octet-stream") },
      erreurs: [404],
    }),
    put: operation(
      "Save without overwriting a concurrent change",
      "ecrire",
      doc,
      objet({ revision: { type: "integer" }, fichier: { type: "string", contentEncoding: "base64" } }, [
        "revision",
        "fichier",
      ]),
    ),
  }),
  "/v1/atelier/{id}/versions": avecId({
    get: operation(
      "History of the kept versions",
      "lire",
      liste(objet({ revision: { type: "integer" }, createdAt: str })),
    ),
  }),
  "/v1/atelier/{id}/restaurer": avecId({
    post: operation(
      "Restore an older version by creating a new revision",
      "ecrire",
      doc,
      objet({ revision: { type: "integer" }, version: { type: "integer" } }, ["revision", "version"]),
    ),
  }),
  "/v1/atelier/{id}/operations": avecId({
    post: operation(
      "Edit Excel cells/formulas, Word text/fields or PDF page order through the Rust libraries",
      "ecrire",
      doc,
      objet(
        {
          revision: { type: "integer" },
          operation: objet(
            {
              type: enumere("cellules", "remplacer", "champs", "pages"),
              editions: liste(
                objet({
                  feuille: str,
                  ligne: { type: "integer", minimum: 1 },
                  colonne: { type: "integer", minimum: 1 },
                  valeur: {},
                  formule: str,
                }),
              ),
              remplacements: liste(objet({ chercher: str, remplacer: str })),
              valeurs: { type: "object", additionalProperties: str },
              pages: liste({ type: "integer", minimum: 1 }),
            },
            ["type"],
          ),
        },
        ["revision", "operation"],
      ),
    ),
  }),
  "/v1/atelier/{id}/export.pdf": avecId({
    get: op({
      resume: "Export Word to PDF with Wordcraft, or download a PDF",
      tag: "Craft workshop",
      droit: "lire",
      succes: { 200: brut("application/pdf") },
      erreurs: [404, 422],
    }),
  }),
};
