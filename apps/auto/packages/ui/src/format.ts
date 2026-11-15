// Display formatting and calculations of the front end (pure, tested): amounts, dates, VAT, discounts, statuses,
// indicators. Text and number formats follow the UI locale (see i18n.ts); function names keep the French domain terms.
import { htLigne, type Statut, type Tva, type Type } from "@auto/domain";
import type { StatutVisuel } from "@auto/ui";
import { t, translator } from "./i18n";

/** Cents → "€1,234.56" or "1 234,56 €" (Intl, UI locale). */
export const eur = (cents: number) => translator().currency(cents / 100, "EUR");

/** YYYY-MM-DD → "22/10/2026" (UI locale, no time zone shift); empty when absent. */
export const dateFr = (iso?: string | null) =>
  iso
    ? translator().date(new Date(`${iso.slice(0, 10)}T00:00:00Z`), {
        timeZone: "UTC",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

/** YYYY-MM-DD → "October 2026" (UI locale). */
export const moisFr = (iso: string) =>
  translator().date(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`), { timeZone: "UTC", month: "long", year: "numeric" });

export const nombre = (n: number) => translator().number(n, { maximumFractionDigits: 2 });

/** VAT rates allowed, in tenths of a percent. */
export const TAUX_TVA: Tva[] = [200, 100, 55, 21, 0];

/** 200 → "20 %" (fr) or "20%" (en), 55 → "5,5 %" or "5.5%". */
export const tauxTva = (t: number) => translator().number(t / 1000, { style: "percent", maximumFractionDigits: 2 });

/**
 * Amount typed in euros ("1 234,56", "1234.5", "12 €") → integer cents; `null` when invalid.
 * Two decimals at most, no negative amount. Input accepts a comma or a point as decimal separator.
 */
export function versCentimes(saisie: string): number | null {
  const s = saisie.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [ent, dec = ""] = s.split(".");
  return Number(ent) * 100 + Number(dec.padEnd(2, "0"));
}

/** Cents → field value "1234,56" (no symbol, for editing; `versCentimes` reads it back). */
export const depuisCentimes = (cents: number) => {
  const e = Math.trunc(cents / 100);
  const c = Math.abs(cents % 100);
  return c ? `${e},${String(c).padStart(2, "0")}` : String(e);
};

/** Discount typed in % ("10", "12,5") → basis points; `null` outside 0 to 100%. */
export function versPointsDeBase(saisie: string): number | null {
  const s = saisie.replace(/[\s%]/g, "").replace(",", ".");
  if (s === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp <= 10000 ? bp : null;
}

export const pourcentDepuisBp = (bp?: number) => (bp ? nombre(bp / 100) : "");

/** Quantity typed ("1,5") → strictly positive number; `null` otherwise. */
export function versQuantite(saisie: string): number | null {
  const s = saisie.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** Local date of the machine as YYYY-MM-DD. */
export function aujourdhui(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ajouterJours(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First and last day of the month of `iso`. */
export function bornesMois(iso: string): { du: string; au: string } {
  const [a, m] = iso.split("-").map(Number) as [number, number];
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { du: `${a}-${p(m)}-01`, au: `${a}-${p(m)}-${p(dernier)}` };
}

/** Read-only record of labels resolved at access time, in the UI locale: `libelles("type", ["devis"])["devis"]`. */
function libelles<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const own = new Set<string>(keys);
  return new Proxy({} as Record<K, string>, {
    get: (_, k) => (typeof k === "string" && own.has(k) ? t(`${prefix}.${k}`) : undefined),
    has: (_, k) => typeof k === "string" && own.has(k),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: (_, k) =>
      typeof k === "string" && own.has(k)
        ? { enumerable: true, configurable: true, value: t(`${prefix}.${k}`) }
        : undefined,
  });
}

export const LIBELLE_TYPE: Record<Type, string> = libelles("type", ["devis", "facture", "acompte", "avoir"]);

/** Statuses for which an invoice is still to be collected. */
const NON_SOLDES: Statut[] = ["emis", "envoye", "accepte", "depose"];

export interface DocResume {
  type: Type;
  statut: Statut;
  numero: string | null;
  ttcCents: number;
  htCents: number;
  tvaCents: number;
  data: { date: string; echeance?: string; origine?: string; client: { nom: string } };
}

export const estFactureVente = (t: Type) => t === "facture" || t === "acompte";

/** Displayed status: "overdue" is derived (invoice past due and not settled), never stored. */
export function statutVisuel(d: Pick<DocResume, "type" | "statut" | "data">, jour = aujourdhui()): StatutVisuel {
  if (estFactureVente(d.type) && NON_SOLDES.includes(d.statut) && d.data.echeance && d.data.echeance < jour)
    return "en_retard";
  return d.statut;
}

/** Agreed labels (grammatical gender in French): a quote is "émis", an invoice "émise". */
export const libelleStatut = (s: StatutVisuel, type: Type) => {
  const masculin = type === "devis" || type === "acompte" || type === "avoir";
  return masculin && translator().has(`status.${s}.masc`) ? t(`status.${s}.masc`) : t(`status.${s}`);
};

export interface Indicateurs {
  /** Month revenue excluding VAT: issued invoices and down payments, minus issued credit notes. */
  caMoisHtCents: number;
  /** VAT collected in the month, credit notes deducted. */
  tvaMoisCents: number;
  /** Issued invoices not settled: gross total minus credit notes (and payments when provided). */
  impayesCents: number;
  impayes: number;
  enRetardCents: number;
  enRetard: number;
  devisEnAttente: number;
}

/**
 * Dashboard indicators from the document list. `restes` (id → amount still due) refines the unpaid
 * figures with partial payments when they are known.
 */
export function indicateurs(
  docs: (DocResume & { id: string })[],
  jour = aujourdhui(),
  restes: Record<string, number> = {},
): Indicateurs {
  const { du, au } = bornesMois(jour);
  const dansMois = (d: DocResume) => d.data.date >= du && d.data.date <= au;
  const emis = docs.filter((d) => d.statut !== "brouillon");
  const avoirsPar = new Map<string, number>();
  let caMoisHtCents = 0;
  let tvaMoisCents = 0;
  for (const d of emis) {
    if (d.type === "avoir" && d.data.origine)
      avoirsPar.set(d.data.origine, (avoirsPar.get(d.data.origine) ?? 0) + d.ttcCents);
    if (!dansMois(d) || d.type === "devis") continue;
    const signe = d.type === "avoir" ? -1 : 1;
    caMoisHtCents += signe * d.htCents;
    tvaMoisCents += signe * d.tvaCents;
  }
  const r: Indicateurs = {
    caMoisHtCents,
    tvaMoisCents,
    impayesCents: 0,
    impayes: 0,
    enRetardCents: 0,
    enRetard: 0,
    devisEnAttente: emis.filter((d) => d.type === "devis" && (d.statut === "emis" || d.statut === "envoye")).length,
  };
  for (const d of emis) {
    if (!estFactureVente(d.type) || !NON_SOLDES.includes(d.statut)) continue;
    const reste = restes[d.id] ?? d.ttcCents - (avoirsPar.get(d.numero ?? "") ?? 0);
    if (reste <= 0) continue;
    r.impayes++;
    r.impayesCents += reste;
    if (statutVisuel(d, jour) === "en_retard") {
      r.enRetard++;
      r.enRetardCents += reste;
    }
  }
  return r;
}

export const emailValide = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/** Digits only of a SIREN or SIRET typed with spaces. */
export const chiffres = (s: string) => s.replace(/\D/g, "");

/** SIRET (or SIREN) grouped for display: "732 829 320 00074". */
export function grouperSiret(s: string): string {
  const c = chiffres(s);
  return [c.slice(0, 3), c.slice(3, 6), c.slice(6, 9), c.slice(9, 14)].filter(Boolean).join(" ");
}

/** A document line as typed in the editor; `versLigne` converts it to a domain line (`null` if invalid). */
export interface SaisieLigne {
  designation: string;
  quantite: string;
  unite: string;
  prix: string;
  remise: string;
  tva: Tva;
}

export function versLigne(s: SaisieLigne) {
  const quantite = versQuantite(s.quantite);
  const prixUnitaireHtCents = versCentimes(s.prix);
  const remiseBp = versPointsDeBase(s.remise);
  if (quantite === null || prixUnitaireHtCents === null || remiseBp === null) return null;
  return {
    designation: s.designation.trim(),
    quantite,
    prixUnitaireHtCents,
    tva: s.tva,
    ...(remiseBp ? { remiseBp } : {}),
    ...(s.unite.trim() ? { unite: s.unite.trim() } : {}),
  };
}

/** Net amount excluding VAT of a line being typed (0 while incomplete), by the @auto/domain rule. */
export function htLigneSaisie(s: SaisieLigne): number {
  const l = versLigne(s);
  return l ? htLigne(l) : 0;
}

/** Errors of a line being typed, per field (shown under the field). */
export function erreursLigne(s: SaisieLigne): Partial<Record<keyof SaisieLigne, string>> {
  const e: Partial<Record<keyof SaisieLigne, string>> = {};
  if (!s.designation.trim()) e.designation = t("line.designation");
  if (versQuantite(s.quantite) === null) e.quantite = t("line.quantity");
  if (versCentimes(s.prix) === null) e.prix = t("line.price");
  if (versPointsDeBase(s.remise) === null) e.remise = t("line.discount");
  return e;
}

const ABSENCES = ["conges_payes", "rtt", "maladie", "sans_solde", "evenement_familial", "autre"] as const;
export const LIBELLE_ABSENCE: Record<string, string> = libelles("absence", ABSENCES);

export const LIBELLE_STATUT_ABSENCE: Record<string, string> = libelles("absence.status", [
  "demandee",
  "validee",
  "refusee",
  "annulee",
]);

export const LIBELLE_CONTRAT: Record<string, string> = libelles("contract", [
  "cdi",
  "cdd",
  "apprentissage",
  "professionnalisation",
  "stage",
  "interim",
]);

export const LIBELLE_MODE: Record<string, string> = libelles("payment", [
  "virement",
  "carte",
  "cheque",
  "especes",
  "prelevement",
  "autre",
]);

/** Bytes (decimal units, like the quotas): "1.5 GB", "20 GB", "350 MB" (fr: "1,5 Go"). */
export function octets(n: number): string {
  const u = [
    [1e9, "unit.gb"],
    [1e6, "unit.mb"],
    [1e3, "unit.kb"],
  ] as const;
  for (const [v, s] of u) if (n >= v) return `${nombre(Math.round((n / v) * 10) / 10)} ${t(s)}`;
  return `${nombre(n)} ${t("unit.b")}`;
}

/** Count with its noun, singular per the plural rules of the UI locale (French: 0 and 1): "1 created", "3 created". */
export const pluriel = (n: number, singulier: string, pl = `${singulier}s`) =>
  `${nombre(n)} ${new Intl.PluralRules(translator().locale).select(Math.abs(n)) === "one" ? singulier : pl}`;

/** (Working) days: "1 day", "2.5 days". */
export const jours = (n: number) => t("ui.days", { n });

/** Bytes → base64 (body of the imports). */
export function enBase64(octets: Uint8Array): string {
  const u = octets as Uint8Array & { toBase64?: () => string };
  if (typeof u.toBase64 === "function") return u.toBase64();
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
