// Outbox sender: first job type of the worker. At-least-once delivery; the receiver
// deduplicates by event id (signed body and x-auto-evenement header).
import { livrer, type Webhook } from "@auto/services";
import { infoSecret } from "@auto/services/webhooks";
import { JOB_LIVRAISON, JOB_WEBHOOK, lireEvenement, lireWebhook, noterLivraison, type Sql } from "@auto/store";
import { dechiffrer } from "@auto/tenancy";
import type { Traitements } from "./worker";

const id = (payload: Record<string, unknown>) => String(payload.evenementId);

/** Operator delivery (the operator's n8n): the delivery state is carried by the event. */
export function expediteur(sql: Sql, w: Webhook): Traitements {
  return {
    [JOB_LIVRAISON]: {
      async executer(job, signal) {
        const e = await lireEvenement(sql, id(job.payload));
        if (!e || e.statut === "livre") return;
        try {
          await livrer(w, e.id, e.corps, signal);
        } catch (err) {
          await noterLivraison(sql, e.id, err instanceof Error ? err.message : String(err));
          throw err;
        }
        await noterLivraison(sql, e.id, null);
      },
      async echec(job, erreur) {
        await noterLivraison(sql, id(job.payload), erreur, true);
      },
    },
  };
}

/**
 * Tenant webhook subscriptions: same signed body, secret specific to the subscription (decrypted on each
 * send); the delivery state is the job's. Active even without operator delivery.
 */
export function abonnementsTenants(sql: Sql): Traitements {
  return {
    [JOB_WEBHOOK]: {
      async executer(job, signal) {
        const [e, w] = await Promise.all([
          lireEvenement(sql, id(job.payload)),
          lireWebhook(sql, String(job.payload.webhookId)),
        ]);
        if (!e || !w || !w.actif || w.tenantId !== e.tenantId) return;
        const secret = new TextDecoder().decode(await dechiffrer(infoSecret(w.tenantId), w.secretChiffre));
        await livrer({ url: w.url, secret }, e.id, e.corps, signal);
      },
    },
  };
}
