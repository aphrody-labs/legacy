// Event outbox and Postgres job queue (migration 005).
//
// API side: `ajouterEvenement` within the business transaction (withTenant). Worker side: `avecWorker`
// (role auto_worker, all tenants) to take, complete or postpone jobs.
import type { Sql, Tx } from "./db";
import { enfilerWebhooks } from "./webhooks";
import { enfilerAutomatisations } from "./automatisations";

/** Job delivering an outbox event to the webhook. */
export const JOB_LIVRAISON = "evenement.livrer";

export type StatutEvenement = "a_livrer" | "livre" | "echec";

export interface EvenementStocke {
  id: string;
  tenantId: string;
  type: string;
  /** Exact JSON body, signed at each attempt. */
  corps: string;
  statut: StatutEvenement;
  essais: number;
  derniereErreur: string | null;
  livreAt: string | null;
  createdAt: string;
}

interface EvenementRow {
  id: string;
  tenant_id: string;
  type: string;
  corps: string;
  statut: StatutEvenement;
  essais: number;
  derniere_erreur: string | null;
  livre_at: Date | null;
  created_at: Date;
}

const evenement = (r: EvenementRow): EvenementStocke => ({
  id: r.id,
  tenantId: r.tenant_id,
  type: r.type,
  corps: r.corps,
  statut: r.statut,
  essais: r.essais,
  derniereErreur: r.derniere_erreur,
  livreAt: r.livre_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});

export type StatutJob = "en_attente" | "en_cours" | "fait" | "echec";

export interface Job<P = Record<string, unknown>> {
  id: string;
  tenantId: string | null;
  type: string;
  payload: P;
  cle: string | null;
  statut: StatutJob;
  /** Attempts started, the current one included. */
  essais: number;
  maxEssais: number;
  derniereErreur: string | null;
}

interface JobRow {
  id: string;
  tenant_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  cle: string | null;
  statut: StatutJob;
  essais: number;
  max_essais: number;
  derniere_erreur: string | null;
}

const job = (r: JobRow): Job => ({
  id: r.id,
  tenantId: r.tenant_id,
  type: r.type,
  payload: r.payload,
  cle: r.cle,
  statut: r.statut,
  essais: r.essais,
  maxEssais: r.max_essais,
  derniereErreur: r.derniere_erreur,
});

/** Worker transaction: role auto_worker, the only one allowed to read the outbox and the jobs of all tenants. */
export function avecWorker<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE auto_worker`;
    return fn(tx);
  });
}

export interface OptionsJob {
  /** Deduplication key: an existing job with the same key makes the addition a no-op. */
  cle?: string;
  executerApres?: Date;
  maxEssais?: number;
  /** Explicit tenant (worker); defaults to the transaction's (`app.tenant`), NULL outside a tenant. */
  tenantId?: string | null;
}

/** Adds a job; returns its id, or null if the key already existed. */
export async function enfiler(tx: Tx, type: string, payload: object = {}, o: OptionsJob = {}): Promise<string | null> {
  const [r] = await tx<{ id: string }[]>`
    INSERT INTO job (tenant_id, type, payload, cle, executer_apres, max_essais)
    VALUES (coalesce(${o.tenantId ?? null}::uuid, CASE WHEN ${o.tenantId === undefined} THEN app_tenant() END),
      ${type}, ${payload}, ${o.cle ?? null}, ${o.executerApres ?? new Date()}, ${o.maxEssais ?? 10})
    ON CONFLICT (cle) DO NOTHING RETURNING id`;
  return r?.id ?? null;
}

/**
 * Adds an event to the outbox with its delivery job, within the business transaction: the event
 * exists if and only if the action is committed. Body `{ id, type, tenantId, date, data }`, frozen here.
 */
export async function ajouterEvenement(
  tx: Tx,
  type: string,
  data: unknown,
  maxEssais = 15,
): Promise<{ id: string; corps: string }> {
  const [r] = await tx<{ tenant: string | null }[]>`SELECT app_tenant() AS tenant`;
  if (!r?.tenant) throw new Error("ajouterEvenement: transaction without a tenant (withTenant required)");
  const id = Bun.randomUUIDv7();
  const corps = JSON.stringify({ id, type, tenantId: r.tenant, date: new Date().toISOString(), data });
  await tx`INSERT INTO evenement (id, type, corps) VALUES (${id}, ${type}, ${corps})`;
  await enfiler(tx, JOB_LIVRAISON, { evenementId: id }, { maxEssais });
  await enfilerWebhooks(tx, id, type);
  await enfilerAutomatisations(tx, id, type, corps);
  return { id, corps };
}

/** Events of the current tenant (withTenant), most recent first. */
export async function listerEvenements(tx: Tx, statut?: StatutEvenement, limite = 100): Promise<EvenementStocke[]> {
  const rows = statut
    ? await tx<
        EvenementRow[]
      >`SELECT * FROM evenement WHERE statut = ${statut} ORDER BY created_at DESC LIMIT ${limite}`
    : await tx<EvenementRow[]>`SELECT * FROM evenement ORDER BY created_at DESC LIMIT ${limite}`;
  return rows.map(evenement);
}

export async function lireEvenement(sql: Sql, id: string): Promise<EvenementStocke | null> {
  const [r] = await avecWorker(sql, (tx) => tx<EvenementRow[]>`SELECT * FROM evenement WHERE id = ${id}`);
  return r ? evenement(r) : null;
}

/** Result of a delivery attempt: delivered (error null), temporary failure or permanent failure. */
export async function noterLivraison(sql: Sql, id: string, erreur: string | null, definitif = false): Promise<void> {
  await avecWorker(sql, async (tx) => {
    if (erreur === null)
      await tx`UPDATE evenement SET statut = 'livre', essais = essais + 1, livre_at = now(), derniere_erreur = NULL
        WHERE id = ${id}`;
    else if (definitif)
      await tx`UPDATE evenement SET statut = 'echec', derniere_erreur = ${erreur}
        WHERE id = ${id} AND statut <> 'livre'`;
    else await tx`UPDATE evenement SET essais = essais + 1, derniere_erreur = ${erreur} WHERE id = ${id}`;
  });
}

/**
 * Takes up to `limite` runnable jobs (FOR UPDATE SKIP LOCKED: several workers never take
 * the same one) and leases them for `bailMs`. A job whose lease expired (worker stopped mid-run) is taken again;
 * if it has exhausted its attempts, it fails.
 */
export async function prendreJobs(sql: Sql, types: string[], limite = 10, bailMs = 60_000): Promise<Job[]> {
  if (!types.length) return [];
  return avecWorker(sql, async (tx) => {
    await tx`UPDATE job SET statut = 'echec', derniere_erreur = coalesce(derniere_erreur || ' ; ', '') || 'bail expiré',
        bail_jusqua = NULL, updated_at = now()
      WHERE statut = 'en_cours' AND bail_jusqua < now() AND essais >= max_essais`;
    const rows = await tx<JobRow[]>`
      UPDATE job j SET statut = 'en_cours', essais = j.essais + 1,
        bail_jusqua = now() + ${bailMs} * interval '1 millisecond', updated_at = now()
      FROM (
        SELECT id FROM job
        WHERE type IN ${tx(types)}
          AND ((statut = 'en_attente' AND executer_apres <= now()) OR (statut = 'en_cours' AND bail_jusqua < now()))
        ORDER BY executer_apres
        LIMIT ${limite}
        FOR UPDATE SKIP LOCKED
      ) s
      WHERE j.id = s.id
      RETURNING j.*`;
    return rows.map(job);
  });
}

export async function terminerJob(sql: Sql, id: string): Promise<void> {
  await avecWorker(
    sql,
    (tx) => tx`UPDATE job SET statut = 'fait', bail_jusqua = NULL, derniere_erreur = NULL, updated_at = now()
      WHERE id = ${id}`,
  );
}

/** After a failed attempt: new attempt in `delaiMs`, or permanent failure if attempts are exhausted. */
export async function reporterJob(sql: Sql, j: Job, erreur: string, delaiMs: number): Promise<"reporte" | "echec"> {
  const definitif = j.essais >= j.maxEssais;
  await avecWorker(sql, (tx) =>
    definitif
      ? tx`UPDATE job SET statut = 'echec', bail_jusqua = NULL, derniere_erreur = ${erreur}, updated_at = now()
          WHERE id = ${j.id}`
      : tx`UPDATE job SET statut = 'en_attente', bail_jusqua = NULL, derniere_erreur = ${erreur},
          executer_apres = now() + ${delaiMs} * interval '1 millisecond', updated_at = now()
          WHERE id = ${j.id}`,
  );
  return definitif ? "echec" : "reporte";
}

export async function lireJob(sql: Sql, id: string): Promise<Job | null> {
  const [r] = await avecWorker(sql, (tx) => tx<JobRow[]>`SELECT * FROM job WHERE id = ${id}`);
  return r ? job(r) : null;
}

/** Exponential delay before the next attempt: base × 2^(attempts − 1), capped. */
export const delaiNouvelEssai = (essais: number, baseMs = 2_000, maxMs = 3_600_000) =>
  Math.min(maxMs, baseMs * 2 ** Math.max(0, essais - 1));
