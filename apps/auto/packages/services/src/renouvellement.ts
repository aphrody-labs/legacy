// Pre-renewal reminder: seven days before the end of the paid period (or trial), the company receives
// an `abonnement.renouvellement_proche` event and its owners an e-mail with the date, the price excl. tax and the
// link to change plan or cancel. No renewal should come as a surprise (docs/recon/avis.md).
import { PLANS } from "@auto/billing";
import type { EnvoyeurMail } from "@auto/mail";
import { lireAbonnement, withTenant, type Sql } from "@auto/store";
import { outbox, type Emetteur } from "./evenements";
import { traducteur } from "./i18n";

/** Reminder delay, in days before the due date. */
export const DELAI_RAPPEL_JOURS = 7;

const TZ = "Europe/Paris";
const jourParis = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Day (YYYY-MM-DD, Paris) `n` days after `jour`. */
export const jourPlus = (jour: string, n: number) =>
  new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface Rappel {
  plan: string;
  periodicite: string;
  echeance: string;
  essai: boolean;
  montantHtCents: number;
}

/**
 * Reminder of the day for a tenant: null if nothing falls due in exactly `DELAI_RAPPEL_JOURS` days
 * (free plan, scheduled cancellation, inactive subscription). Called once a day per tenant.
 */
export async function rappelerRenouvellement(
  sql: Sql,
  tenantId: string,
  jour: string,
  o: { envoyeur?: EnvoyeurMail | null; urlApp?: string; publier?: Emetteur } = {},
): Promise<Rappel | null> {
  const publier = o.publier ?? outbox;
  const r = await withTenant(sql, tenantId, async (tx) => {
    const a = await lireAbonnement(tx);
    if (a.plan === "gratuit" || a.annulationFinPeriode) return null;
    const essai = a.statut === "trialing";
    if (!essai && a.statut !== "active") return null;
    const fin = essai ? a.essaiFin : a.periodeFin;
    if (!fin || jourParis(new Date(fin)) !== jourPlus(jour, DELAI_RAPPEL_JOURS)) return null;
    const periodicite = a.periodicite ?? "mensuel";
    const rappel: Rappel = {
      plan: a.plan,
      periodicite,
      echeance: fin,
      essai,
      montantHtCents: PLANS[a.plan].prixHtCents[periodicite],
    };
    await publier(tx, "abonnement.renouvellement_proche", rappel);
    return rappel;
  });
  if (!r || !o.envoyeur) return r;
  // Accounts and roles: outside RLS (application role has no access to membership), like the accounts module.
  const proprietaires = await sql<{ email: string }[]>`
    SELECT u.email FROM membership m JOIN app_user u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenantId} AND m.role = 'owner' ORDER BY u.email`;
  if (proprietaires.length)
    await o.envoyeur.envoyer({ a: proprietaires.map((p) => p.email), ...texteRappel(r, o.urlApp) });
  return r;
}

export function texteRappel(r: Rappel, urlApp = "https://auto.aphrody.com", locale?: string | null) {
  const i = traducteur(locale);
  const offer = `${PLANS[r.plan as keyof typeof PLANS].nom} (${r.periodicite})`;
  const date = i.date(new Date(r.echeance), { timeZone: TZ, dateStyle: "long" });
  const price = i.t("price.excl", { amount: i.currency(r.montantHtCents / 100, "EUR") });
  const args = { offer, date, price, link: `${urlApp}/app/parametres` };
  const k = r.essai ? "renewal.trial" : "renewal.active";
  return { sujet: i.t(`${k}.subject`, args), texte: i.t(`${k}.text`, args) };
}
