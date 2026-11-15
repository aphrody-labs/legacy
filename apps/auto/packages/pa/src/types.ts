// Contract of an approved platform (PA) as seen by a compatible solution.

/**
 * Lifecycle statuses (standard XP Z12-012, annex of the external specifications file):
 * 200 Submitted, 210 Refused, 212 Paid and 213 Rejected are mandatory; the others are optional.
 */
export const STATUTS = {
  deposee: 200,
  emise: 201,
  recue: 202,
  mise_a_disposition: 203,
  prise_en_charge: 204,
  approuvee: 205,
  approuvee_partiellement: 206,
  en_litige: 207,
  suspendue: 208,
  completee: 209,
  refusee: 210,
  paiement_transmis: 211,
  encaissee: 212,
  rejetee: 213,
  visee: 214,
} as const;

export type StatutCycle = keyof typeof STATUTS;

export const OBLIGATOIRES: readonly StatutCycle[] = ["deposee", "refusee", "encaissee", "rejetee"];

export const estStatut = (s: unknown): s is StatutCycle => typeof s === "string" && Object.hasOwn(STATUTS, s);

export const PLATEFORMES = ["mock", "b2brouter"] as const;
export type NomPlateforme = (typeof PLATEFORMES)[number];

export interface EvenementStatut {
  idPa: string;
  statut: StatutCycle;
  date: string;
  motif?: string;
}

/** Normalized event taken from a PA webhook. */
export type EvenementPa = ({ type: "statut" } & EvenementStatut) | { type: "recue"; idPa: string; date: string };

export interface Depot {
  /** Frozen Factur-X copy (PDF/A-3b). */
  facturx: Uint8Array;
  numero: string;
  /** Recipient SIREN, for addressing through the directory. */
  destinataireSiren?: string | null;
}

export interface Entrante {
  idPa: string;
  date: string;
}

export interface EntreeAnnuaire {
  siren: string;
  nom?: string;
  /** Receiving PA declared in the directory, if the queried PA reports it. */
  plateforme: string | null;
}

/** E-reporting of operations outside e-invoicing: B2C sales and international operations. */
export interface Ereporting {
  nature: "b2c" | "international";
  /** Declared period, YYYY-MM. */
  periode: string;
  lignes: { tva: number; htCents: number; tvaCents: number; pays?: string }[];
}

/** Mandate given by the customer company to the compatible solution to act with its PA. */
export interface Mandat {
  siren: string;
  signataire: string;
  qualite: string;
  /** Date de signature, AAAA-MM-JJ. */
  date: string;
  perimetre: ("emission" | "reception" | "ereporting")[];
}

export interface Plateforme {
  readonly nom: NomPlateforme;
  /** Submits an issued invoice; returns the id assigned by the PA and the first status. */
  deposer(d: Depot): Promise<{ idPa: string; statut: StatutCycle; motif?: string }>;
  /** Known history of a submitted invoice's statuses. */
  statuts(idPa: string): Promise<EvenementStatut[]>;
  /** Status set by the company (e.g. paid, entered by the seller). */
  signaler(idPa: string, statut: StatutCycle, motif?: string): Promise<void>;
  /** Incoming invoices made available since a date (ISO). */
  entrantes(depuis?: string): Promise<Entrante[]>;
  /** File of the incoming invoice, as received. */
  telecharger(idPa: string): Promise<Uint8Array>;
  /** Directory: SIREN → receiving platform; null if not registered. */
  annuaire(siren: string): Promise<EntreeAnnuaire | null>;
  ereporting(e: Ereporting): Promise<{ idPa: string; statut: StatutCycle }>;
  mandater(m: Mandat): Promise<{ reference: string }>;
  /** Incoming webhook: normalized events, or null if the signature is invalid. */
  webhook(corps: string, entetes: Headers): Promise<EvenementPa[] | null>;
}

export class ErreurPa extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
