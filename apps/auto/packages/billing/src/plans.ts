// Plans, prices excl. tax and quotas (pricing rationale: docs/TARIFS.md).

export type PlanId = "gratuit" | "pro" | "business";
export type Periodicite = "mensuel" | "annuel";

/** Limited resources: per-period counters (invoices, LLM calls) or instantaneous gauges. */
export type Ressource = "factures" | "employes" | "stockage" | "appels_llm" | "boites_mail";

/** Counters reset every month; the other resources are gauges (current state). */
export const MENSUELLES: readonly Ressource[] = ["factures", "appels_llm"];

export interface Plan {
  id: PlanId;
  nom: string;
  /** Price excl. tax in cents; yearly is ten months (two months free). */
  prixHtCents: Record<Periodicite, number>;
  /** Free trial days on first subscription (0: none). */
  essaiJours: number;
  /** `null`: unlimited. Storage in bytes. */
  quotas: Record<Ressource, number | null>;
}

const Go = 1_000_000_000;

export const PLANS: Record<PlanId, Plan> = {
  gratuit: {
    id: "gratuit",
    nom: "Gratuit",
    prixHtCents: { mensuel: 0, annuel: 0 },
    essaiJours: 0,
    quotas: { factures: 10, employes: 2, stockage: 1 * Go, appels_llm: 20, boites_mail: 0 },
  },
  pro: {
    id: "pro",
    nom: "Pro",
    prixHtCents: { mensuel: 1400, annuel: 14000 },
    essaiJours: 30,
    quotas: { factures: 200, employes: 10, stockage: 20 * Go, appels_llm: 500, boites_mail: 2 },
  },
  business: {
    id: "business",
    nom: "Business",
    prixHtCents: { mensuel: 3900, annuel: 39000 },
    essaiJours: 0,
    quotas: { factures: null, employes: 50, stockage: 200 * Go, appels_llm: 5000, boites_mail: 10 },
  },
};

export const PAYANTS: readonly PlanId[] = ["pro", "business"];

export const LIBELLES: Record<Ressource, string> = {
  factures: "factures émises par mois",
  employes: "employés",
  stockage: "octets de stockage",
  appels_llm: "appels LLM par mois",
  boites_mail: "boîtes mail",
};

/** Stripe statuses that open the subscribed plan's quotas; `past_due` keeps the plan during Stripe dunning. */
const OUVERTS = new Set(["trialing", "active", "past_due"]);

/** Plan whose quotas apply: the subscribed plan while the subscription is active, otherwise Free. */
export function planEffectif(a: { plan: PlanId; statut: string }): Plan {
  return OUVERTS.has(a.statut) ? PLANS[a.plan] : PLANS.gratuit;
}

export function estPlan(x: unknown): x is PlanId {
  return typeof x === "string" && x in PLANS;
}

export function estPeriodicite(x: unknown): x is Periodicite {
  return x === "mensuel" || x === "annuel";
}

/** Counting period `YYYY-MM`, in the Paris time zone. */
export function periode(d = new Date()): string {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => ((acc[x.type] = x.value), acc), {});
  return `${p.year}-${p.month}`;
}

/** Date `AAAA-MM-JJ` au fuseau de Paris. */
export function jourParis(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
}
