// Periodic tasks through Bun.cron (in process). Each trigger only adds one system job with a unique
// key (several scheduled workers: a single job), then split into one job per tenant, replayable alone.
import {
  aRelancer,
  lireBoite,
  ajouterEvenement,
  avecWorker,
  enfiler,
  marquerRelance,
  withTenant,
  type Job,
  type Sql,
  sourcesFichiers,
} from "@auto/store";
import type { Traitements } from "./worker";
import { outbox } from "@auto/services";
import { synchroniser, tenantsConnectes } from "@auto/services/pa";
import { envoyerDocument, relever, tenantsAvecBoite, texteRelance } from "@auto/services/mail";
import { synchroniserCourrier } from "@auto/services/courrier";
import { rappelerRenouvellement } from "@auto/services/renouvellement";
import { envoyeurDepuisEnv, type EnvoyeurMail } from "@auto/mail";
import { entreprise } from "@auto/tenancy";
import { synchroniserSource, preparerArrivages } from "@auto/services/sources-fichiers";

export const TZ = "Europe/Paris";

export interface Tache {
  nom: string;
  /** Cron expression (5 fields), interpreted in the `TZ` time zone. */
  cron: string;
  job(date: Date, tz: string): { type: string; cle: string; payload: Record<string, string> };
}

/** YYYY-MM-DD in the given time zone. */
export const jourLocal = (d: Date, tz = TZ) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** YYYY-MM of the month preceding the given day. */
export const moisPrecedent = (jour: string) => {
  const [a, m] = jour.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
};

export const TACHES: Tache[] = [
  {
    nom: "courrier-unifie",
    cron: "*/5 * * * *",
    job: (d) => ({ type: "courrier.planifier", cle: `courrier:${Math.floor(d.getTime() / 300000)}`, payload: {} }),
  },
  {
    nom: "sources-fichiers",
    cron: "*/5 * * * *",
    job: (d) => ({ type: "sources.planifier", cle: "sources:" + Math.floor(d.getTime() / 300000), payload: {} }),
  },
  {
    // D+7, D+30 (and D+60) levels of PALIERS: the reminder goes out through n8n (relance.a_envoyer event).
    nom: "relances",
    cron: "0 8 * * *",
    job: (d, tz) => {
      const jour = jourLocal(d, tz);
      return { type: "relances.planifier", cle: `relances:${jour}`, payload: { jour } };
    },
  },
  {
    // Seven days before a renewal or a trial end: reminder to the owner (services/renouvellement.ts).
    nom: "renouvellements",
    cron: "0 9 * * *",
    job: (d, tz) => {
      const jour = jourLocal(d, tz);
      return { type: "renouvellements.planifier", cle: `renouvellements:${jour}`, payload: { jour } };
    },
  },
  {
    nom: "export-mensuel",
    cron: "0 6 1 * *",
    job: (d, tz) => {
      const mois = moisPrecedent(jourLocal(d, tz));
      return { type: "export.planifier", cle: `export:${mois}`, payload: { mois } };
    },
  },
  {
    // Statuses of PA submissions and incoming invoices, for tenants without webhook.
    nom: "mail-releve",
    cron: "*/5 * * * *",
    job: (d) => {
      const tranche = new Date(Math.floor(d.getTime() / 300_000) * 300_000).toISOString().slice(0, 16);
      return { type: "mail.planifier", cle: `mail:${tranche}`, payload: { tranche } };
    },
  },
  {
    // Company scheduled workflows (automatisations.ts): each according to its cron and time zone.
    nom: "automatisations",
    cron: "* * * * *",
    job: (d) => {
      const minute = new Date(Math.floor(d.getTime() / 60_000) * 60_000).toISOString();
      return { type: "automatisations.planifier", cle: `automatisations:${minute.slice(0, 16)}`, payload: { minute } };
    },
  },
  {
    nom: "pa-synchro",
    cron: "*/15 * * * *",
    job: (d) => {
      const quart = new Date(Math.floor(d.getTime() / 900_000) * 900_000).toISOString().slice(0, 16);
      return { type: "pa.planifier", cle: `pa:${quart}`, payload: { quart } };
    },
  },
];

/** Adds the system job of a task; null if already added for this period. */
export function declencher(sql: Sql, t: Tache, date = new Date(), tz = TZ): Promise<string | null> {
  const j = t.job(date, tz);
  return avecWorker(sql, (tx) => enfiler(tx, j.type, j.payload, { cle: j.cle, tenantId: null }));
}

/** Registers the tasks in Bun.cron; `.stop()` on each CronJob to stop. */
export function planifier(sql: Sql, taches = TACHES, tz = TZ): Bun.CronJob[] {
  return taches.map((t) =>
    Bun.cron(
      t.cron,
      async () => {
        try {
          await declencher(sql, t, new Date(), tz);
        } catch (e) {
          console.error(`task ${t.nom}: ${e instanceof Error ? e.message : e}`);
        }
      },
      { tz },
    ),
  );
}

/** Overdue invoices of a tenant: reminder recorded and relance.a_envoyer event, one transaction per invoice. */
export async function relancer(sql: Sql, tenantId: string, jour: string): Promise<number> {
  const liste = await withTenant(sql, tenantId, (tx) => aRelancer(tx, jour));
  let n = 0;
  for (const r of liste) {
    const fait = await withTenant(sql, tenantId, async (tx) => {
      // Lock on the invoice: two workers do not chase the same level twice.
      await tx`SELECT 1 FROM document WHERE id = ${r.documentId} FOR UPDATE`;
      const [deja] = await tx`SELECT 1 FROM relance WHERE document_id = ${r.documentId} AND niveau >= ${r.niveau}`;
      if (deja) return false;
      await marquerRelance(tx, null, r.documentId, r.niveau, "mail");
      return true;
    });
    if (!fait) continue;
    n++;
    // Direct send from the company's mailbox if it has one and the client has an address; otherwise
    // the event leaves n8n (or the user) to handle it. A send failure does not cancel the recorded reminder.
    let envoyeParMail = false;
    if (r.client.email && (await withTenant(sql, tenantId, (tx) => lireBoite(tx)))) {
      try {
        const e = await entreprise(sql, tenantId);
        await envoyerDocument(sql, outbox, tenantId, null, r.documentId, texteRelance(r, e.nom));
        envoyeParMail = true;
      } catch (err) {
        console.error(`reminder ${r.numero} (${tenantId}): ${err instanceof Error ? err.message : err}`);
      }
    }
    await withTenant(sql, tenantId, (tx) => ajouterEvenement(tx, "relance.a_envoyer", { ...r, jour, envoyeParMail }));
  }
  return n;
}

/** Summary of the documents issued over the month (YYYY-MM): export.mensuel event, if there are any. */
export async function exporterMois(sql: Sql, tenantId: string, mois: string): Promise<boolean> {
  return withTenant(sql, tenantId, async (tx) => {
    const rows = await tx<{ type: string; nombre: number; ht: string; tva: string; ttc: string }[]>`
      SELECT type, count(*)::int AS nombre, sum(ht_cents) AS ht, sum(tva_cents) AS tva, sum(ttc_cents) AS ttc
      FROM document
      WHERE statut <> 'brouillon' AND emis_at >= ${`${mois}-01`}::date AND emis_at < ${`${mois}-01`}::date + interval '1 month'
      GROUP BY type ORDER BY type`;
    if (!rows.length) return false;
    await ajouterEvenement(tx, "export.mensuel", {
      mois,
      parType: rows.map((r) => ({
        type: r.type,
        nombre: r.nombre,
        htCents: Number(r.ht),
        tvaCents: Number(r.tva),
        ttcCents: Number(r.ttc),
      })),
    });
    return true;
  });
}

/** System job → one job per tenant, keyed `<system key>:<tenant>`. */
function eclater(sql: Sql, typeTenant: string): Traitements[string] {
  return {
    async executer(job: Job) {
      const tenants = await sql<{ id: string }[]>`SELECT id FROM tenant ORDER BY id`;
      await avecWorker(sql, async (tx) => {
        for (const { id } of tenants)
          await enfiler(tx, typeTenant, job.payload, { cle: `${job.cle ?? job.id}:${id}`, tenantId: id });
      });
    },
  };
}

const parTenant = (fn: (tenantId: string, p: Record<string, string>) => Promise<unknown>): Traitements[string] => ({
  async executer(job: Job) {
    if (!job.tenantId) throw new Error(`job ${job.type} without tenant`);
    await fn(job.tenantId, job.payload as Record<string, string>);
  },
});

/** Operator SMTP relay; without a configured relay (production included), the reminder goes out only as an event. */
function relais(): EnvoyeurMail | null {
  try {
    return envoyeurDepuisEnv();
  } catch {
    return null;
  }
}

export function tachesPlanifiees(sql: Sql, envoyeur: EnvoyeurMail | null = relais()): Traitements {
  return {
    "courrier.planifier": {
      async executer(job) {
        const comptes = await sql`SELECT id,user_id FROM courrier_compte WHERE actif`;
        await avecWorker(sql, async (tx) => {
          for (const c of comptes)
            await enfiler(
              tx,
              "courrier.compte",
              { compte: c.id, user: c.user_id },
              { cle: `${job.cle ?? job.id}:${c.id}`, tenantId: null },
            );
        });
      },
    },
    "courrier.compte": {
      async executer(job, signal) {
        const p = job.payload as { compte: string; user: string };
        const [c] = await sql`SELECT id FROM courrier_compte WHERE id=${p.compte} AND user_id=${p.user} AND actif`;
        if (c) {
          const r = await synchroniserCourrier(
            sql,
            { tenantId: p.user, userId: p.user, role: "owner" },
            p.compte,
            signal,
          );
          if (r.suite)
            await avecWorker(sql, (tx) =>
              enfiler(tx, "courrier.compte", p, { cle: `courrier-suite:${job.id}`, tenantId: null }),
            );
        }
      },
    },
    "sources.planifier": {
      async executer(job, signal) {
        await preparerArrivages(sql);
        await eclater(sql, "sources.tenant").executer(job, signal);
      },
    },
    "sources.tenant": {
      async executer(job, signal) {
        if (!job.tenantId) throw new Error("source without tenant");
        const [t] =
          await sql`SELECT id FROM tenant WHERE id=${job.tenantId} AND supprime_at IS NULL AND suspendu_at IS NULL`;
        if (!t) return;
        let echecs = 0;
        for (const s of await withTenant(sql, job.tenantId, sourcesFichiers))
          if (s.actif) {
            try {
              await synchroniserSource(sql, job.tenantId, s.id, null, signal);
            } catch {
              signal.throwIfAborted();
              echecs++;
            }
          }
        if (echecs) throw new Error(`${echecs} source(s) unreachable`);
      },
    },
    "renouvellements.planifier": eclater(sql, "renouvellements.tenant"),
    "renouvellements.tenant": parTenant((t, p) =>
      rappelerRenouvellement(sql, t, p.jour!, { envoyeur, urlApp: Bun.env.AUTO_URL_APP }),
    ),
    "relances.planifier": eclater(sql, "relances.tenant"),
    "relances.tenant": parTenant((t, p) => relancer(sql, t, p.jour!)),
    "export.planifier": eclater(sql, "export.tenant"),
    "export.tenant": parTenant((t, p) => exporterMois(sql, t, p.mois!)),
    "pa.planifier": {
      async executer(job: Job) {
        const tenants = await tenantsConnectes(sql);
        await avecWorker(sql, async (tx) => {
          for (const id of tenants)
            await enfiler(tx, "pa.tenant", job.payload, { cle: `${job.cle ?? job.id}:${id}`, tenantId: id });
        });
      },
    },
    "pa.tenant": parTenant((t) => synchroniser(sql, outbox, t)),
    "mail.planifier": {
      async executer(job: Job) {
        const tenants = await tenantsAvecBoite(sql);
        await avecWorker(sql, async (tx) => {
          for (const id of tenants)
            await enfiler(tx, "mail.tenant", job.payload, { cle: `${job.cle ?? job.id}:${id}`, tenantId: id });
        });
      },
    },
    "mail.tenant": parTenant((t) => relever(sql, t, outbox)),
  };
}
