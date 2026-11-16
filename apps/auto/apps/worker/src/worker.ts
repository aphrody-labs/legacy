// Worker loop: takes Postgres jobs (SKIP LOCKED, lease), runs, completes or defers.
import { delaiNouvelEssai, prendreJobs, reporterJob, terminerJob, type Job, type Sql } from "@auto/store";

export interface Traitement {
  /** Runs the job; an exception (or exceeding the lease) triggers a new attempt. */
  executer(job: Job, signal: AbortSignal): Promise<void>;
  /** Called once the attempts are exhausted. */
  echec?(job: Job, erreur: string): Promise<void>;
}

export type Traitements = Record<string, Traitement>;

export interface OptionsWorker {
  /** Jobs taken per round. */
  lot?: number;
  /** Lease duration: beyond it, the job is abandoned here and taken again by another round. */
  bailMs?: number;
  /** Wait between two rounds without a job. */
  intervalleMs?: number;
  /** Delay before the next attempt, depending on the number of attempts already made. */
  delai?: (essais: number) => number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function creerWorker(sql: Sql, traitements: Traitements, o: OptionsWorker = {}) {
  const { lot = 10, bailMs = 60_000, intervalleMs = 1_000, delai = (n: number) => delaiNouvelEssai(n) } = o;
  const types = Object.keys(traitements);

  async function executer(job: Job) {
    const t = traitements[job.type]!;
    // Margin on the lease: the job is abandoned before another worker can take it again.
    const signal = AbortSignal.timeout(Math.max(1, bailMs - Math.min(1_000, bailMs / 10)));
    try {
      await Promise.race([
        t.executer(job, signal),
        new Promise<never>((_, rejeter) =>
          signal.addEventListener("abort", () => rejeter(new Error(`timeout exceeded (${bailMs} ms)`)), { once: true }),
        ),
      ]);
      await terminerJob(sql, job.id);
    } catch (e) {
      const erreur = message(e);
      if ((await reporterJob(sql, job, erreur, delai(job.essais))) === "echec") {
        console.error(`job ${job.type} ${job.id} failed after ${job.essais} attempts: ${erreur}`);
        await t.echec?.(job, erreur);
      }
    }
  }

  /** One round: takes at most `lot` jobs and processes them in parallel; returns the number processed. */
  async function traiterLot(): Promise<number> {
    const jobs = await prendreJobs(sql, types, lot, bailMs);
    await Promise.all(jobs.map(executer));
    return jobs.length;
  }

  let actif = false;
  let boucle: Promise<void> | null = null;
  let reveil: (() => void) | null = null;

  return {
    traiterLot,
    /** Processes until no job is runnable right now. */
    async vider(): Promise<number> {
      let total = 0;
      for (let n = await traiterLot(); n > 0; n = await traiterLot()) total += n;
      return total;
    },
    demarrer() {
      if (actif) return;
      actif = true;
      boucle = (async () => {
        while (actif) {
          let n = 0;
          try {
            n = await traiterLot();
          } catch (e) {
            console.error(`worker: ${message(e)}`);
          }
          if (n === 0 && actif)
            await new Promise<void>((r) => {
              reveil = r;
              setTimeout(r, intervalleMs);
            });
        }
      })();
    },
    /** Clean stop: the current round finishes. */
    async arreter() {
      actif = false;
      reveil?.();
      await boucle;
    },
  };
}

export type Worker = ReturnType<typeof creerWorker>;
