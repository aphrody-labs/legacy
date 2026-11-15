// Accounting entries for sales and payments, and the Fichier des Écritures Comptables (FEC,
// art. A47 A-1 of the livre des procédures fiscales: 18 fields, header, YYYYMMDD dates, decimal-comma amounts).

import type { Totaux, Type } from "./index";

export interface LigneEcriture {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  /** AAAA-MM-JJ */
  ecritureDate: string;
  compteNum: string;
  compteLib: string;
  compAuxNum?: string;
  compAuxLib?: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debitCents: number;
  creditCents: number;
  validDate: string;
}

/** Chart of accounts used (PCG). */
export const COMPTES = {
  clients: { num: "411000", lib: "Clients" },
  ventes: { num: "706000", lib: "Prestations de services" },
  tva: { num: "445710", lib: "TVA collectée" },
  banque: { num: "512000", lib: "Banque" },
} as const;

const JOURNAUX = { VE: "Ventes", BQ: "Banque" } as const;

/** Stable customer auxiliary account: "C" + first 8 characters of the SIREN, otherwise of the name. */
export function compteClient(nom: string, siret?: string): string {
  const base = (siret?.replace(/\D/g, "").slice(0, 9) || nom.normalize("NFD").replace(/[^A-Za-z0-9]/g, ""))
    .toUpperCase()
    .slice(0, 9);
  return `C${base || "DIVERS"}`;
}

export interface PieceVente {
  type: Type;
  numero: string;
  date: string;
  client: { nom: string; siret?: string };
  totaux: Totaux;
}

/**
 * Sales entry: customer on the debit side (tax-inclusive), sales and VAT per rate on the credit side. A credit note reverses the sides.
 * Quotes are not booked.
 */
export function ecritureVente(p: PieceVente, validDate = p.date): LigneEcriture[] {
  if (p.type === "devis") return [];
  const signe = p.type === "avoir" ? -1 : 1;
  const base = {
    journalCode: "VE",
    journalLib: JOURNAUX.VE,
    ecritureNum: p.numero,
    ecritureDate: p.date,
    pieceRef: p.numero,
    pieceDate: p.date,
    ecritureLib: `${p.type === "avoir" ? "Avoir" : "Facture"} ${p.numero} ${p.client.nom}`.slice(0, 200),
    validDate,
  };
  const sens = (cents: number, debit: boolean) =>
    cents * signe >= 0 === debit
      ? { debitCents: Math.abs(cents), creditCents: 0 }
      : { debitCents: 0, creditCents: Math.abs(cents) };
  const aux = compteClient(p.client.nom, p.client.siret);
  const lignes: LigneEcriture[] = [
    {
      ...base,
      compteNum: COMPTES.clients.num,
      compteLib: COMPTES.clients.lib,
      compAuxNum: aux,
      compAuxLib: p.client.nom,
      ...sens(p.totaux.ttcCents, true),
    },
    { ...base, compteNum: COMPTES.ventes.num, compteLib: COMPTES.ventes.lib, ...sens(p.totaux.htCents, false) },
  ];
  for (const [taux, tva] of Object.entries(p.totaux.tvaParTaux)) {
    if (!tva) continue;
    lignes.push({
      ...base,
      compteNum: COMPTES.tva.num,
      compteLib: `${COMPTES.tva.lib} ${(Number(taux) / 10).toString().replace(".", ",")} %`,
      ...sens(tva, false),
    });
  }
  return lignes.filter((l) => l.debitCents || l.creditCents);
}

export interface Encaissement {
  numero: string;
  date: string;
  factureNumero: string;
  client: { nom: string; siret?: string };
  montantCents: number;
}

/** Payment: bank on the debit side, customer on the credit side. */
export function ecritureEncaissement(e: Encaissement): LigneEcriture[] {
  const base = {
    journalCode: "BQ",
    journalLib: JOURNAUX.BQ,
    ecritureNum: e.numero,
    ecritureDate: e.date,
    pieceRef: e.factureNumero,
    pieceDate: e.date,
    ecritureLib: `Règlement ${e.factureNumero} ${e.client.nom}`.slice(0, 200),
    validDate: e.date,
  };
  return [
    {
      ...base,
      compteNum: COMPTES.banque.num,
      compteLib: COMPTES.banque.lib,
      debitCents: e.montantCents,
      creditCents: 0,
    },
    {
      ...base,
      compteNum: COMPTES.clients.num,
      compteLib: COMPTES.clients.lib,
      compAuxNum: compteClient(e.client.nom, e.client.siret),
      compAuxLib: e.client.nom,
      debitCents: 0,
      creditCents: e.montantCents,
    },
  ];
}

/** Debit/credit gaps per entry (journal + number); empty when everything balances. */
export function desequilibres(lignes: LigneEcriture[]): string[] {
  const soldes = new Map<string, number>();
  for (const l of lignes) {
    const k = `${l.journalCode} ${l.ecritureNum}`;
    soldes.set(k, (soldes.get(k) ?? 0) + l.debitCents - l.creditCents);
  }
  return [...soldes].filter(([, s]) => s !== 0).map(([k, s]) => `${k} : écart ${s} centimes`);
}

export const CHAMPS_FEC = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

const dateFec = (d: string) => d.slice(0, 10).replaceAll("-", "");
const montantFec = (cents: number) => `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
/** The separator (tab) and line endings cannot appear in a field. */
const champ = (s = "") => s.replace(/[\t\r\n|]+/g, " ").trim();

/** FEC text, tabs and CRLF, lines sorted by date, journal and number. */
export function fec(lignes: LigneEcriture[]): string {
  const ecart = desequilibres(lignes);
  if (ecart.length) throw new Error(`FEC déséquilibré : ${ecart.join(" ; ")}`);
  const triees = [...lignes].sort(
    (a, b) =>
      a.ecritureDate.localeCompare(b.ecritureDate) ||
      a.journalCode.localeCompare(b.journalCode) ||
      a.ecritureNum.localeCompare(b.ecritureNum),
  );
  const rangs = triees.map((l) =>
    [
      l.journalCode,
      l.journalLib,
      l.ecritureNum,
      dateFec(l.ecritureDate),
      l.compteNum,
      l.compteLib,
      l.compAuxNum ?? "",
      l.compAuxLib ?? "",
      l.pieceRef,
      dateFec(l.pieceDate),
      l.ecritureLib,
      montantFec(l.debitCents),
      montantFec(l.creditCents),
      "",
      "",
      dateFec(l.validDate),
      "",
      "",
    ]
      .map(champ)
      .join("\t"),
  );
  return [CHAMPS_FEC.join("\t"), ...rangs].join("\r\n") + "\r\n";
}

/** Regulatory name: SIREN + "FEC" + closing date YYYYMMDD. */
export const nomFec = (siren: string, cloture: string) => `${siren}FEC${dateFec(cloture)}.txt`;

/** ISO 8859-15 encoding (character set allowed for the FEC); characters outside the set replaced by "?". */
export function latin9(s: string): Uint8Array<ArrayBuffer> {
  const speciaux: Record<string, number> = { "€": 0xa4, Š: 0xa6, š: 0xa8, Ž: 0xb4, ž: 0xb8, Œ: 0xbc, œ: 0xbd, Ÿ: 0xbe };
  const remplaces = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);
  const out = new Uint8Array(s.length);
  let i = 0;
  for (const c of s) {
    const code = c.codePointAt(0)!;
    out[i++] = speciaux[c] ?? (code < 0x100 && !remplaces.has(code) ? code : 0x3f);
  }
  return out.slice(0, i);
}
