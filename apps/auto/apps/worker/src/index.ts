// Worker: Postgres job queue (event outbox, scheduled tasks). Usage: bun run worker
import { webhookDepuisEnv } from "@auto/services";
import { connect } from "@auto/store";
import { automatisations } from "./automatisations";
import { abonnementsTenants, expediteur } from "./expediteur";
import { declencher, planifier, TACHES, tachesPlanifiees } from "./planification";
import { creerWorker } from "./worker";

const sql = connect();
const webhook = webhookDepuisEnv();
const planifies = tachesPlanifiees(sql);
const sourcesWorker = creerWorker(
  sql,
  { "sources.tenant": planifies["sources.tenant"]! },
  { bailMs: 15 * 60_000, lot: 1 },
);
delete planifies["sources.tenant"];
const courrierWorker = creerWorker(
  sql,
  { "courrier.compte": planifies["courrier.compte"]! },
  { bailMs: 10 * 60_000, lot: 1 },
);
delete planifies["courrier.compte"];
// Without a webhook, events stay in the outbox until a configured worker delivers them.
const worker = creerWorker(sql, {
  ...(webhook ? expediteur(sql, webhook) : {}),
  ...abonnementsTenants(sql),
  ...planifies,
  ...automatisations(sql),
});
// Serverless jobs trigger an explicit task or drain a bounded number of batches.
const commande = process.argv[2];
if (commande === "--schedule") {
  const tache = TACHES.find((t) => t.nom === process.argv[3]);
  if (!tache) throw new Error(`Unknown task: ${process.argv[3] ?? ""}`);
  try {
    await declencher(sql, tache);
  } finally {
    await sql.close();
  }
} else if (commande === "--once") {
  try {
    // Go over the three queues again: a system task may create jobs in another queue.
    for (let tour = 0; tour < 100; tour++) {
      const nombres = await Promise.all([worker.traiterLot(), sourcesWorker.traiterLot(), courrierWorker.traiterLot()]);
      if (nombres.every((n) => n === 0)) break;
    }
  } finally {
    await sql.close();
  }
} else if (commande) {
  throw new Error(`Unknown worker option: ${commande}`);
} else {
  const crons = Bun.env.AUTO_PLANIFICATION === "0" ? [] : planifier(sql);

  worker.demarrer();
  sourcesWorker.demarrer();
  courrierWorker.demarrer();
  console.log(
    `auto worker: delivery ${webhook ? webhook.url : "disabled (N8N_WEBHOOK_URL missing)"}, ` +
      `${crons.length} scheduled tasks`,
  );

  async function arreter() {
    for (const c of crons) c.stop();
    await worker.arreter();
    await sourcesWorker.arreter();
    await courrierWorker.arreter();
    await sql.close();
    process.exit(0);
  }
  process.on("SIGINT", arreter);
  process.on("SIGTERM", arreter);
}
