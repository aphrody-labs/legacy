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
  const i = traducteur(locale);
  const t = (k: string) => i.t(`export.${k}`);
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
    { titre: t("col.reference"), largeur: 24 },
    { titre: t("col.supplier"), largeur: 30 },
    { titre: t("col.project"), largeur: 30 },
    { titre: t("col.analyticCode") },
    { titre: t("col.date"), type: "date" },
    { titre: t("col.status") },
    { titre: t("col.excl"), type: "euros" },
    { titre: t("col.vat"), type: "euros" },
    { titre: t("col.incl"), type: "euros" },
    { titre: t("col.linkedInvoice"), largeur: 24 },
    { titre: t("col.archived") },
    { titre: t("col.notes"), largeur: 48 },
  ];
  const feuilles: Classeur["feuilles"] = [
    {
      nom: t("sheet.suppliers"),
      colonnes: [
        { titre: t("col.reference"), largeur: 24 },
        { titre: t("col.supplier"), largeur: 30 },
        { titre: t("col.analyticCode") },
        { titre: t("col.project"), largeur: 30 },
        { titre: t("col.date"), type: "date" },
        { titre: t("col.status") },
        { titre: t("col.type") },
        { titre: t("col.currency") },
        { titre: t("col.exclEur"), type: "euros" },
        { titre: t("col.vatEur"), type: "euros" },
        { titre: t("col.inclEur"), type: "euros" },
        { titre: t("col.filing") },
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
          l ? t("filing.filed") : t("filing.toFile"),
        ];
      }),
    },
    {
      nom: t("sheet.customers"),
      colonnes: [
        { titre: t("col.reference"), largeur: 24 },
        { titre: t("col.type") },
        { titre: t("col.customer"), largeur: 30 },
        { titre: t("col.analyticCode") },
        { titre: t("col.project"), largeur: 30 },
        { titre: t("col.date"), type: "date" },
        { titre: t("col.status") },
        { titre: t("col.excl"), type: "euros" },
        { titre: t("col.vat"), type: "euros" },
        { titre: t("col.incl"), type: "euros" },
      ],
      lignes: documents.map((d) => {
        const c = chantier(docChantier(d)),
          s = signe(d.type);
        return [
          d.numero || t("draft"),
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
      nom: t("sheet.analytics"),
      colonnes: [
        { titre: t("col.analyticCode") },
        { titre: t("col.project"), largeur: 30 },
        { titre: t("col.budget"), type: "euros" },
        { titre: t("col.sales"), type: "euros" },
        { titre: t("col.purchases"), type: "euros" },
        { titre: t("col.balance"), type: "euros" },
        { titre: t("col.openOrders"), type: "euros" },
        { titre: t("col.unpriced"), type: "nombre" },
        { titre: t("col.progress"), type: "pourcent" },
        { titre: t("col.status") },
        { titre: t("col.archived") },
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
          c.archive ? t("yes") : t("no"),
        ];
      }),
    },
    ...(["bon_livraison", "confirmation_commande"] as const).map((type) => ({
      nom: t(type === "bon_livraison" ? "sheet.deliveries" : "sheet.orders"),
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
            p.archive ? t("yes") : t("no"),
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
  const parNom = new Map(Object.keys(acces).map((k) => [t(k), acces[k]!]));
  return { feuilles: feuilles.filter((f) => segments.includes(parNom.get(f.nom)!)) };
}

/** Printable report of the workbook data; does not alter the accounting copies of the invoices. */
export function rapportGestion(classeur: Classeur, locale?: string | null): Uint8Array<ArrayBuffer> {
  const i = traducteur(locale);
  if (classeur.feuilles.reduce((s, f) => s + f.lignes.length, 0) > 10000)
    throw new ErreurMetier("rapport PDF limité à 10 000 lignes ; utilisez le classeur Excel", [], 413);
  const paragraphes: DocumentSimple["paragraphes"] = [
    { texte: i.t("export.report.title"), style: "titre" },
    {
      texte: i.t("export.report.intro"),
    },
  ];
  for (const f of classeur.feuilles) {
    paragraphes.push({ texte: f.nom, style: "titre1" });
    if (!f.lignes.length) paragraphes.push({ texte: i.t("export.report.empty") });
    for (const row of f.lignes) {
      const texte = row
        .map((v, i) => {
          const c = f.colonnes[i]!;
          const valeur =
            typeof v === "number" && c.type === "euros"
              ? i.currency(v / 100, "EUR")
              : typeof v === "number" && c.type === "pourcent"
                ? i.number(v / 10000, { style: "percent", maximumFractionDigits: 2 })
                : (v ?? "—");
          return i.t("export.report.field", { title: c.titre, value: String(valeur) });
        })
        .join(" · ");
      paragraphes.push({ texte });
    }
  }
  return docxEnPdf(creerDocx({ paragraphes }));
}
