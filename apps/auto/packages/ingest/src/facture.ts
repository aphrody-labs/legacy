// Received supplier invoice, in the normalized format shared by Factur-X and OCR + LLM.
import { sirenValide, siretValide, tvaIntracomFr } from "@auto/domain";

export interface LigneRecue {
  designation: string;
  quantite: number;
  prixUnitaireHtCents: number;
  /** VAT rate in tenths of a percent: 200 = 20%. */
  tauxTva: number;
  htCents: number;
}

export interface FactureRecue {
  type: "facture" | "avoir" | "acompte";
  numero: string;
  /** Dates ISO AAAA-MM-JJ. */
  date: string;
  echeance?: string;
  datePrestation?: string;
  devise: string;
  fournisseur: { nom: string; siren?: string; siret?: string; tvaIntracom?: string; adresse?: string };
  acheteur?: { nom: string; siren?: string };
  lignes: LigneRecue[];
  totaux: { htCents: number; tvaCents: number; ttcCents: number };
}

export type Source = "facturx" | "ocr";

const texte = { type: "string", minLength: 1 };
const texteNul = { type: ["string", "null"] };
// Explicit classes: also understood by the JSON Schema grammars of llama.cpp.
const dateIso = { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" };
const dateNulle = { type: ["string", "null"], pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" };
const centimes = { type: "integer" };

/** JSON Schema imposed on the LLM (strict mode: all fields present, `null` if absent). */
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "numero",
    "date",
    "echeance",
    "datePrestation",
    "devise",
    "fournisseur",
    "acheteur",
    "lignes",
    "totaux",
  ],
  properties: {
    type: { type: "string", enum: ["facture", "avoir", "acompte"] },
    numero: texte,
    date: dateIso,
    echeance: dateNulle,
    datePrestation: dateNulle,
    devise: { type: "string", pattern: "^[A-Z]{3}$" },
    fournisseur: {
      type: "object",
      additionalProperties: false,
      required: ["nom", "siren", "siret", "tvaIntracom", "adresse"],
      properties: {
        nom: texte,
        siren: { type: ["string", "null"], pattern: "^[0-9]{9}$" },
        siret: { type: ["string", "null"], pattern: "^[0-9]{14}$" },
        tvaIntracom: texteNul,
        adresse: texteNul,
      },
    },
    acheteur: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["nom", "siren"],
      properties: { nom: texte, siren: { type: ["string", "null"], pattern: "^[0-9]{9}$" } },
    },
    lignes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["designation", "quantite", "prixUnitaireHtCents", "tauxTva", "htCents"],
        properties: {
          designation: texte,
          quantite: { type: "number" },
          prixUnitaireHtCents: centimes,
          tauxTva: { type: "integer", minimum: 0, maximum: 1000 },
          htCents: centimes,
        },
      },
    },
    totaux: {
      type: "object",
      additionalProperties: false,
      required: ["htCents", "tvaCents", "ttcCents"],
      properties: { htCents: centimes, tvaCents: centimes, ttcCents: centimes },
    },
  },
} as const;

type Schema = {
  type?: string | readonly string[];
  enum?: readonly unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  required?: readonly string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
};

function typeDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

/** JSON Schema subset enough for SCHEMA: returns the deviations (empty = conformant). */
export function conforme(s: Schema, v: unknown, chemin = "$"): string[] {
  const t = typeDe(v);
  if (s.type) {
    const types = typeof s.type === "string" ? [s.type] : s.type;
    if (!types.includes(t) && !(t === "integer" && types.includes("number")))
      return [`${chemin}: ${t} instead of ${types.join("|")}`];
  }
  if (v === null) return [];
  const e: string[] = [];
  if (s.enum && !s.enum.includes(v)) e.push(`${chemin}: value not in ${s.enum.join(", ")}`);
  if (typeof v === "string") {
    if (s.minLength && v.length < s.minLength) e.push(`${chemin}: empty`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) e.push(`${chemin}: invalid format`);
  }
  if (typeof v === "number") {
    if (s.minimum !== undefined && v < s.minimum) e.push(`${chemin} : < ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) e.push(`${chemin} : > ${s.maximum}`);
  }
  if (t === "object") {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) e.push(`${chemin}.${k}: missing`);
    for (const [k, x] of Object.entries(o)) {
      const sp = s.properties?.[k];
      if (sp) e.push(...conforme(sp, x, `${chemin}.${k}`));
      else if (s.additionalProperties === false) e.push(`${chemin}.${k}: unexpected property`);
    }
  }
  if (t === "array" && s.items) (v as unknown[]).forEach((x, i) => e.push(...conforme(s.items!, x, `${chemin}[${i}]`)));
  return e;
}

/** Removes the `null`s (absent fields) from an output conformant to SCHEMA. */
export function sansNuls<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sansNuls) as T;
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== null)
        .map(([k, x]) => [k, sansNuls(x)]),
    ) as T;
  return v;
}

function dateValide(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Amount in cents shown in euros in the anomalies (read by the user). */
const eur = (c: number) => new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(c / 100);

const jourPlus = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

/**
 * Consistency checks: identifiers (SIREN, SIRET, VAT), dates, totals. Empty = the invoice can be validated
 * without intervention; otherwise it goes to the "to check" queue.
 */
export function valider(f: FactureRecue, aujourdhui = new Date().toISOString().slice(0, 10)): string[] {
  const e: string[] = [];
  if (!f.numero?.trim()) e.push("missing number");
  if (!f.fournisseur?.nom?.trim()) e.push("missing supplier");

  const { siren, siret, tvaIntracom } = f.fournisseur ?? {};
  if (siren && !sirenValide(siren)) e.push(`invalid SIREN ${siren}`);
  if (siret && !siretValide(siret)) e.push(`invalid SIRET ${siret}`);
  if (siret && siren && !siret.startsWith(siren)) e.push("SIRET and SIREN do not match");
  const s = siren ?? siret?.slice(0, 9);
  if (tvaIntracom?.startsWith("FR") && s && sirenValide(s) && tvaIntracomFr(s) !== tvaIntracom.replace(/\s/g, ""))
    e.push(`VAT number ${tvaIntracom} does not match SIREN ${s}`);
  if (!s && !tvaIntracom) e.push("no supplier identifier (SIREN, SIRET or VAT number)");

  if (!dateValide(f.date)) e.push(`invalid date ${f.date}`);
  else if (f.date > jourPlus(aujourdhui, 1)) e.push(`date ${f.date} is in the future`);
  for (const [nom, d] of [
    ["due date", f.echeance],
    ["service date", f.datePrestation],
  ] as const)
    if (d !== undefined && !dateValide(d)) e.push(`invalid ${nom} ${d}`);
  if (f.echeance && dateValide(f.echeance) && dateValide(f.date) && f.echeance < f.date)
    e.push("due date before the invoice date");

  const t = f.totaux;
  if (!t) return [...e, "missing totals"];
  if (t.htCents + t.tvaCents !== t.ttcCents)
    e.push(`excl. VAT + VAT ≠ gross (${eur(t.htCents)} + ${eur(t.tvaCents)} ≠ ${eur(t.ttcCents)})`);
  if (!f.lignes?.length) return [...e, "no lines"];

  const n = f.lignes.length;
  f.lignes.forEach((l, i) => {
    const attendu = Math.round(l.quantite * l.prixUnitaireHtCents);
    // A line discount is possible: the line total excluding VAT does not exceed the gross (to the cent).
    if (l.htCents > attendu + 1 || l.htCents < 0 !== attendu < 0)
      e.push(`line ${i + 1}: excl. VAT ${eur(l.htCents)} inconsistent with ${l.quantite} × ${eur(l.prixUnitaireHtCents)}`);
  });
  const somme = f.lignes.reduce((a, l) => a + l.htCents, 0);
  if (Math.abs(somme - t.htCents) > n) e.push(`sum of lines ${eur(somme)} ≠ excl. VAT ${eur(t.htCents)}`);
  const parTaux = new Map<number, number>();
  for (const l of f.lignes) parTaux.set(l.tauxTva, (parTaux.get(l.tauxTva) ?? 0) + l.htCents);
  const tva = [...parTaux].reduce((a, [taux, base]) => a + Math.round((base * taux) / 1000), 0);
  if (Math.abs(tva - t.tvaCents) > parTaux.size) e.push(`recomputed VAT ${eur(tva)} ≠ VAT ${eur(t.tvaCents)}`);
  return e;
}
