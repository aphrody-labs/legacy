// Exports of the five spaces from the persisted data, with the existing spreadsheet/PDF engine; texts from the catalogs.
import { totaux } from "@auto/domain";
import {
  calculerAnalytique,
  documentsGestion,
  listerChantiers,
  listerFournisseurs,
  listerPieces,
  listerRecues,
  ErreurMetier,
  type Tx,
} from "@auto/store";
import { traducteur } from "./i18n";
import { creerDocx, docxEnPdf, type Classeur, type DocumentSimple } from "@auto/native";
export async function classeurGestion(
  tx: Tx,
  segments: readonly string[] = ["clients", "fournisseurs", "chantiers", "livraisons", "commandes"],
  locale?: string | null,
): Promise<Classeur> {
  const tr = traducteur(locale);
  const lib = (k: string) => tr.t(`export.${k}`);
  const documents = await documentsGestion(tx),
    chantiers = await listerChantiers(tx),
    fournisseurs = await listerFournisseurs(tx),
    pieces = await listerPieces(tx),
    achats = await listerRecues(tx);
  const liens = await tx<
    { document_id: string; chantier_id: string }[]
  >`SELECT document_id,chantier_id FROM chantier_document`;
  const affectations = await tx<
    { recue_id: string; fournisseur_id: string; chantier_id: string | null }[]
  >`SELECT recue_id,fournisseur_id,chantier_id FROM achat_affectation`;
  const liensParDocument = new Map(liens.map((l) => [l.document_id, l.chantier_id]));
  const documentsParNumero = new Map(documents.filter((d) => d.numero).map((d) => [d.numero!, d.id]));
  const affectationsParAchat = new Map(affectations.map((a) => [a.recue_id, a]));
  const chantiersParId = new Map(chantiers.map((c) => [c.id, c]));
  const fournisseursParId = new Map(fournisseurs.map((f) => [f.id, f]));
  const achatsParId = new Map(achats.map((a) => [a.id, a]));
  const docChantier = (d: (typeof documents)[number]) =>
    d.type === "avoir"
      ? liensParDocument.get(documentsParNumero.get(d.data.origine || "") || "")
      : liensParDocument.get(d.id);
  const chantier = (id: string | undefined | null) => chantiersParId.get(id || "");
  const signe = (type: string) => (type === "avoir" ? -1 : 1);
  const colonnesPiece: Classeur["feuilles"][number]["colonnes"] = [
    { titre: lib("col.reference"), largeur: 24 },
    { titre: lib("col.supplier"), largeur: 30 },
    { titre: lib("col.project"), largeur: 30 },
    { titre: lib("col.analyticCode") },
    { titre: lib("col.date"), type: "date" },
    { titre: lib("col.status") },
    { titre: lib("col.excl"), type: "euros" },
    { titre: lib("col.vat"), type: "euros" },
    { titre: lib("col.incl"), type: "euros" },
    { titre: lib("col.linkedInvoice"), largeur: 24 },
    { titre: lib("col.archived") },
    { titre: lib("col.notes"), largeur: 48 },
  ];
  const feuilles: Classeur["feuilles"] = [
    {
      nom: lib("sheet.suppliers"),
      colonnes: [
        { titre: lib("col.reference"), largeur: 24 },
        { titre: lib("col.supplier"), largeur: 30 },
        { titre: lib("col.analyticCode") },
        { titre: lib("col.project"), largeur: 30 },
        { titre: lib("col.date"), type: "date" },
        { titre: lib("col.status") },
        { titre: lib("col.type") },
        { titre: lib("col.currency") },
        { titre: lib("col.exclEur"), type: "euros" },
        { titre: lib("col.vatEur"), type: "euros" },
        { titre: lib("col.inclEur"), type: "euros" },
        { titre: lib("col.filing") },
      ],
      lignes: achats.map((a) => {
        const l = affectationsParAchat.get(a.id),
          c = chantier(l?.chantier_id),
          f = a.facture,
          euro = f?.devise === "EUR",
          s = signe(f?.type || "");
        return [
          a.numero,
          fournisseursParId.get(l?.fournisseur_id || "")?.nom || a.fournisseur,
          c?.code || "",
          c?.nom || "",
          a.date,
          a.statut,
          f?.type || "",
          f?.devise || "",
          euro ? s * f!.totaux.htCents : null,
          euro ? s * f!.totaux.tvaCents : null,
          euro ? s * f!.totaux.ttcCents : null,
          l ? lib("filing.filed") : lib("filing.toFile"),
        ];
      }),
    },
    {
      nom: lib("sheet.customers"),
      colonnes: [
        { titre: lib("col.reference"), largeur: 24 },
        { titre: lib("col.type") },
        { titre: lib("col.customer"), largeur: 30 },
        { titre: lib("col.analyticCode") },
        { titre: lib("col.project"), largeur: 30 },
        { titre: lib("col.date"), type: "date" },
        { titre: lib("col.status") },
        { titre: lib("col.excl"), type: "euros" },
        { titre: lib("col.vat"), type: "euros" },
        { titre: lib("col.incl"), type: "euros" },
      ],
      lignes: documents.map((d) => {
        const c = chantier(docChantier(d)),
          s = signe(d.type);
        return [
          d.numero || lib("draft"),
          d.type,
          d.data.client.nom,
          c?.code || "",
          c?.nom || "",
          d.data.date,
          d.statut,
          s * d.htCents,
          s * d.tvaCents,
          s * d.ttcCents,
        ];
      }),
    },
    {
      nom: lib("sheet.analytics"),
      colonnes: [
        { titre: lib("col.analyticCode") },
        { titre: lib("col.project"), largeur: 30 },
        { titre: lib("col.budget"), type: "euros" },
        { titre: lib("col.sales"), type: "euros" },
        { titre: lib("col.purchases"), type: "euros" },
        { titre: lib("col.balance"), type: "euros" },
        { titre: lib("col.openOrders"), type: "euros" },
        { titre: lib("col.unpriced"), type: "nombre" },
        { titre: lib("col.progress"), type: "pourcent" },
        { titre: lib("col.status") },
        { titre: lib("col.archived") },
      ],
      lignes: chantiers.map((c) => {
        const a = calculerAnalytique(
          documents.filter((d) => docChantier(d) === c.id),
          achats.filter((r) => affectationsParAchat.get(r.id)?.chantier_id === c.id),
          pieces.filter((p) => p.chantierId === c.id),
        );
        return [
          c.code,
          c.nom,
          c.budgetHtCents,
          a.ventesHtCents,
          a.achatsHtCents,
          a.soldeHtCents,
          a.commandesHtCents,
          a.achatsNonChiffres,
          c.avancement * 100,
          c.statut,
          c.archive ? lib("yes") : lib("no"),
        ];
      }),
    },
    ...(["bon_livraison", "confirmation_commande"] as const).map((type) => ({
      nom: lib(type === "bon_livraison" ? "sheet.deliveries" : "sheet.orders"),
      colonnes: colonnesPiece,
      lignes: pieces
        .filter((p) => p.type === type)
        .map((p) => {
          const c = chantier(p.chantierId),
            t = totaux(p.lignes);
          return [
            p.reference,
            fournisseursParId.get(p.fournisseurId)?.nom || "",
            c?.nom || "",
            c?.code || "",
            p.date,
            p.statut,
            t.htCents,
            t.tvaCents,
            t.ttcCents,
            achatsParId.get(p.recueId || "")?.numero || "",
            p.archive ? lib("yes") : lib("no"),
            p.notes,
          ];
        }),
    })),
  ];
  const acces: Record<string, string> = {
    "sheet.suppliers": "fournisseurs",
    "sheet.customers": "clients",
    "sheet.analytics": "chantiers",
    "sheet.deliveries": "livraisons",
    "sheet.orders": "commandes",
  };
  const parNom = new Map(Object.keys(acces).map((k) => [lib(k), acces[k]!]));
  return { feuilles: feuilles.filter((f) => segments.includes(parNom.get(f.nom)!)) };
}

/** Printable report of the workbook data; does not alter the accounting copies of the invoices. */
export function rapportGestion(classeur: Classeur, locale?: string | null): Uint8Array<ArrayBuffer> {
  const tr = traducteur(locale);
  if (classeur.feuilles.reduce((s, f) => s + f.lignes.length, 0) > 10000)
    throw new ErreurMetier("rapport PDF limité à 10 000 lignes ; utilisez le classeur Excel", [], 413);
  const paragraphes: DocumentSimple["paragraphes"] = [
    { texte: tr.t("export.report.title"), style: "titre" },
    {
      texte: tr.t("export.report.intro"),
    },
  ];
  for (const f of classeur.feuilles) {
    paragraphes.push({ texte: f.nom, style: "titre1" });
    if (!f.lignes.length) paragraphes.push({ texte: tr.t("export.report.empty") });
    for (const row of f.lignes) {
      const texte = row
        .map((v, i) => {
          const c = f.colonnes[i]!;
          const valeur =
            typeof v === "number" && c.type === "euros"
              ? tr.currency(v / 100, "EUR")
              : typeof v === "number" && c.type === "pourcent"
                ? tr.number(v / 10000, { style: "percent", maximumFractionDigits: 2 })
                : (v ?? "—");
          return tr.t("export.report.field", { title: c.titre, value: String(valeur) });
        })
        .join(" · ");
      paragraphes.push({ texte });
    }
  }
  return docxEnPdf(creerDocx({ paragraphes }));
}
