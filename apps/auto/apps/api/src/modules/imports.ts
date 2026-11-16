// Batch L3: spreadsheet imports (preview and guided mapping) and accounting exports (xlsx, FEC).
import { ErreurApi } from "../i18n";
import { desequilibres, ecritureEncaissement, ecritureVente, fec, latin9, nomFec } from "@auto/domain";
import {
  CHAMPS_CLIENT,
  CHAMPS_PRODUIT,
  creances,
  encaissements,
  importerClients,
  importerProduits,
  piecesVente,
  proposerCorrespondance,
  withTenant,
  type Cellule,
  type ChampClient,
  type ChampProduit,
} from "@auto/store";
import { entreprise } from "@auto/tenancy";
import { writeXlsx, lireTableur } from "@auto/native";
import type { Module } from "../modules";
import { brut, date, liste, objet, op, str } from "../openapi-outils";
import type { Chemins } from "../modules";

/** Maximum size of an imported file (the spreadsheet is decoded in memory). */
const MAX_OCTETS = 10 * 1024 * 1024;

interface CorpsImport {
  /** Fichier en base64 (xlsx, xls, xlsb, ods, csv). */
  fichier: string;
  feuille?: number;
  /** Index of the header row (0 by default); the data follow. */
  entete?: number;
}

function decoder(b: CorpsImport) {
  if (typeof b?.fichier !== "string") throw new ErreurApi("file_missing");
  const octets = Uint8Array.fromBase64(b.fichier);
  if (octets.length > MAX_OCTETS) throw new ErreurApi("file_too_large_10mb", [], 413);
  const lecture = lireTableur(octets);
  const f = lecture.feuilles[b.feuille ?? 0];
  if (!f) throw new ErreurApi("sheet_not_found");
  const entete = b.entete ?? 0;
  return {
    lecture,
    feuille: f,
    entete: (f.lignes[entete] ?? []) as Cellule[],
    donnees: f.lignes.slice(entete + 1) as Cellule[][],
    ligne1: entete + 2,
  };
}

const periode = (req: Request) => {
  const q = new URL(req.url).searchParams;
  const annee = q.get("annee") ?? new Date().toISOString().slice(0, 4);
  const du = q.get("du") ?? `${annee}-01-01`;
  const au = q.get("au") ?? `${annee}-12-31`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au) || au < du)
    throw new ErreurApi("invalid_period");
  return { du, au };
};

const fichier = (octets: Uint8Array<ArrayBuffer>, nom: string, type: string) =>
  new Response(octets, {
    headers: { "content-type": type, "content-disposition": `attachment; filename="${nom}"` },
  });

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const routes: Module = ({ sql, auth }) => ({
  "/v1/imports/apercu": {
    POST: auth("ecrire", async (req) => {
      const { lecture, feuille, entete, donnees } = decoder((await req.json()) as CorpsImport);
      return Response.json({
        format: lecture.format,
        feuilles: lecture.feuilles.map((f) => ({ nom: f.nom, lignes: f.lignes.length })),
        entete,
        apercu: donnees.slice(0, 10),
        lignes: donnees.length,
        avertissements: lecture.avertissements,
        nomFeuille: feuille.nom,
        correspondance: {
          clients: proposerCorrespondance(entete, CHAMPS_CLIENT),
          produits: proposerCorrespondance(entete, CHAMPS_PRODUIT),
        },
      });
    }),
  },
  "/v1/imports/clients": {
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as CorpsImport & { correspondance: Partial<Record<ChampClient, number>> };
      const { donnees, ligne1 } = decoder(b);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          importerClients(tx, a.userId, donnees, b.correspondance ?? {}, ligne1),
        ),
      );
    }),
  },
  "/v1/imports/produits": {
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as CorpsImport & { correspondance: Partial<Record<ChampProduit, number>> };
      const { donnees, ligne1 } = decoder(b);
      return Response.json(
        await withTenant(sql, a.tenantId, (tx) =>
          importerProduits(tx, a.userId, donnees, b.correspondance ?? {}, ligne1),
        ),
      );
    }),
  },

  "/v1/exports/ventes.xlsx": {
    GET: auth("lire", async (req, a) => {
      const { du, au } = periode(req);
      const pieces = await withTenant(sql, a.tenantId, (tx) => piecesVente(tx, du, au));
      const signe = (t: string) => (t === "avoir" ? -1 : 1);
      const xlsx = writeXlsx({
        feuilles: [
          {
            nom: "Journal des ventes",
            colonnes: [
              { titre: "Date", type: "date" },
              { titre: "Numéro" },
              { titre: "Type" },
              { titre: "Client", largeur: 32 },
              { titre: "HT", type: "euros" },
              { titre: "TVA", type: "euros" },
              { titre: "TTC", type: "euros" },
            ],
            lignes: pieces.map((p) => [
              p.date,
              p.numero,
              p.type,
              p.client.nom,
              signe(p.type) * p.totaux.htCents,
              signe(p.type) * p.totaux.tvaCents,
              signe(p.type) * p.totaux.ttcCents,
            ]),
          },
        ],
      });
      return fichier(new Uint8Array(xlsx), `journal-ventes-${du}-${au}.xlsx`, XLSX);
    }),
  },
  "/v1/exports/creances.xlsx": {
    GET: auth("lire", async (req, a) => {
      const au = new URL(req.url).searchParams.get("au") ?? undefined;
      const liste = await withTenant(sql, a.tenantId, (tx) => creances(tx, au));
      const xlsx = writeXlsx({
        feuilles: [
          {
            nom: "Créances",
            colonnes: [
              { titre: "Numéro" },
              { titre: "Client", largeur: 32 },
              { titre: "Date", type: "date" },
              { titre: "Échéance", type: "date" },
              { titre: "TTC", type: "euros" },
              { titre: "Reste dû", type: "euros" },
              { titre: "Retard (jours)", type: "nombre" },
            ],
            lignes: liste.map((c) => [c.numero, c.client, c.date, c.echeance, c.ttcCents, c.resteCents, c.retardJours]),
          },
        ],
      });
      return fichier(new Uint8Array(xlsx), "creances.xlsx", XLSX);
    }),
  },
  "/v1/exports/fec": {
    GET: auth("lire", async (req, a) => {
      const { du, au } = periode(req);
      const { ventes, banque } = await withTenant(sql, a.tenantId, async (tx) => ({
        ventes: await piecesVente(tx, du, au),
        banque: await encaissements(tx, du, au),
      }));
      const lignes = [...ventes.flatMap((p) => ecritureVente(p)), ...banque.flatMap(ecritureEncaissement)];
      const ecarts = desequilibres(lignes);
      if (ecarts.length) throw new ErreurApi("entries_unbalanced", ecarts, 500);
      const e = await entreprise(sql, a.tenantId);
      return fichier(latin9(fec(lignes)), nomFec(e.siret.slice(0, 9), au), "text/plain; charset=iso-8859-15");
    }),
  },
});

const PERIODE = [
  { nom: "annee", schema: str, description: "Calendar year (current year by default)" },
  { nom: "du", schema: date, description: "Start of period" },
  { nom: "au", schema: date, description: "End of period" },
];
const CORPS_IMPORT = objet(
  {
    fichier: { type: "string", contentEncoding: "base64" },
    feuille: { type: "integer" },
    entete: { type: "integer" },
    correspondance: objet({}),
  },
  ["fichier", "correspondance"],
);
const RESULTAT = objet({
  crees: { type: "integer" },
  ignores: { type: "integer" },
  erreurs: liste(objet({ ligne: { type: "integer" }, message: str })),
});

/** OpenAPI description of the batch routes. */
export const openapi: Chemins = {
  "/v1/imports/apercu": {
    post: op({
      resume: "Preview of a spreadsheet (xlsx, xls, xlsb, ods, csv) and proposed column mapping",
      tag: "Imports",
      droit: "ecrire",
      corps: objet(
        {
          fichier: { type: "string", contentEncoding: "base64" },
          feuille: { type: "integer" },
          entete: { type: "integer" },
        },
        ["fichier"],
      ),
      succes: {
        200: objet({
          format: str,
          entete: liste({}),
          apercu: liste(liste({})),
          lignes: { type: "integer" },
          correspondance: objet({ clients: objet({}), produits: objet({}) }),
        }),
      },
      erreurs: [413, 422],
    }),
  },
  "/v1/imports/clients": {
    post: op({
      resume: "Import clients (already known SIRET ignored, invalid line reported)",
      tag: "Imports",
      droit: "ecrire",
      corps: CORPS_IMPORT,
      succes: { 200: RESULTAT },
      erreurs: [413, 422],
    }),
  },
  "/v1/imports/produits": {
    post: op({
      resume: "Import products (prices excl. VAT and VAT rates read in French format)",
      tag: "Imports",
      droit: "ecrire",
      corps: CORPS_IMPORT,
      succes: { 200: RESULTAT },
      erreurs: [413, 422],
    }),
  },
  "/v1/exports/ventes.xlsx": {
    get: op({
      resume: "Sales journal (xlsx)",
      tag: "Exports",
      droit: "lire",
      requete: PERIODE,
      succes: { 200: brut(XLSX) },
      erreurs: [422],
    }),
  },
  "/v1/exports/creances.xlsx": {
    get: op({
      resume: "Unsettled client receivables with delay (xlsx)",
      tag: "Exports",
      droit: "lire",
      requete: [{ nom: "au", schema: date, description: "Cut-off date (today by default)" }],
      succes: { 200: brut(XLSX) },
    }),
  },
  "/v1/exports/fec": {
    get: op({
      resume: "File of accounting entries (A47 A-1 LPF, ISO 8859-15)",
      tag: "Exports",
      droit: "lire",
      requete: PERIODE,
      succes: { 200: brut("text/plain") },
      erreurs: [422],
    }),
  },
};
