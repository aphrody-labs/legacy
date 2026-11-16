// Workflow execution by the worker: triggered by an outbox event (job queued in the
// event transaction) or by their cron (minute task, one job per due workflow, keyed by minute).
// A workflow error is recorded in its run and does not retry the job: effects already produced
// (mail, message) must not be repeated. Only an infrastructure failure causes a new attempt.
import { lancer } from "@auto/services/automatisations";
import {
  automatisationsPlanifiees,
  avecWorker,
  enfiler,
  ErreurMetier,
  JOB_AUTOMATISATION,
  type ChargeExecution,
  type Job,
  type Sql,
} from "@auto/store";
import type { Traitements } from "./worker";

/** Does the cron fall on this minute (start of minute, workflow time zone)? */
export function estDue(cron: string, minute: Date, fuseau: string): boolean {
  try {
    return Bun.cron.parse(cron, new Date(minute.getTime() - 1000), { tz: fuseau })?.getTime() === minute.getTime();
  } catch {
    return false;
  }
}

export const debutMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/** Queues the scheduled workflows due at this minute; returns the number queued. */
export async function planifierAutomatisations(sql: Sql, minute: Date): Promise<number> {
  const dus = (await automatisationsPlanifiees(sql)).filter((a) => estDue(a.cron, minute, a.fuseau));
  const iso = minute.toISOString().slice(0, 16);
  await avecWorker(sql, async (tx) => {
    for (const a of dus) {
      const charge: ChargeExecution = {
        automatisationId: a.id,
        origine: `planifie:${iso}`,
        entree: [{ json: { minute: minute.toISOString(), cron: a.cron, fuseau: a.fuseau } }],
      };
      await enfiler(tx, JOB_AUTOMATISATION, charge, {
        cle: `automatisation:${a.id}:${iso}`,
        tenantId: a.tenantId,
        maxEssais: 3,
      });
    }
  });
  return dus.length;
}

export function automatisations(sql: Sql): Traitements {
  return {
    "automatisations.planifier": {
      async executer(job: Job) {
        await planifierAutomatisations(sql, new Date(String(job.payload.minute)));
      },
    },
    [JOB_AUTOMATISATION]: {
      async executer(job: Job, signal: AbortSignal) {
        if (!job.tenantId) throw new Error("run without tenant");
        const c = job.payload as unknown as ChargeExecution;
        try {
          await lancer(sql, {
            tenantId: job.tenantId,
            automatisationId: c.automatisationId,
            origine: c.origine,
            entree: c.entree,
            signal,
          });
        } catch (e) {
          // Workflow deleted between queuing and execution: nothing to do.
          if (e instanceof ErreurMetier && e.status === 404) return;
          throw e;
        }
      },
    },
  };
}
