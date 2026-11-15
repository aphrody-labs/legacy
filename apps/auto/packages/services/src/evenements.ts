import { ajouterEvenement, type Tx } from "@auto/store";

/** Business events pushed to the automation (n8n) by the outbox. */
export type TypeEvenement =
  | "document.emis"
  | "document.statut"
  | "paiement.enregistre"
  | "absence.demandee"
  | "absence.decidee"
  | "relance.a_envoyer"
  | "export.mensuel"
  | "invitation.creee"
  // Types added by the other batches, of the form `<domain>.<fact>`.
  | `${string}.${string}`;

export type Evenement = { id: string; type: TypeEvenement; tenantId: string; date: string; data: unknown };

/**
 * Publication within the business transaction (withTenant): the event enters the outbox with the action
 * and will be delivered by the worker, with retries. Returns the event id.
 */
export type Emetteur = (tx: Tx, type: TypeEvenement, data: unknown) => Promise<{ id: string }>;

export const outbox: Emetteur = (tx, type, data) => ajouterEvenement(tx, type, data);

export const SIGNATURE = "x-auto-signature";
/** Event id (also present in the signed body): idempotency key of the receiver. */
export const EN_TETE_ID = "x-auto-evenement";

/** `sha256=<hex>` signature: HMAC-SHA256 of the raw body with the shared secret. */
export const signer = (secret: string, corps: string) =>
  `sha256=${new Bun.CryptoHasher("sha256", secret).update(corps).digest("hex")}`;

export interface Webhook {
  url: string;
  secret: string;
  timeoutMs?: number;
}

/** One delivery attempt: signed JSON POST; throws if the receiver does not answer 2xx. */
export async function livrer(w: Webhook, id: string, corps: string, signal?: AbortSignal): Promise<void> {
  const timeout = AbortSignal.timeout(w.timeoutMs ?? 10_000);
  const r = await fetch(w.url, {
    method: "POST",
    headers: { "content-type": "application/json", [SIGNATURE]: signer(w.secret, corps), [EN_TETE_ID]: id },
    body: corps,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

/** From the environment (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`); without a URL, no delivery. */
export function webhookDepuisEnv(env: Record<string, string | undefined> = Bun.env): Webhook | null {
  const url = env.N8N_WEBHOOK_URL;
  if (!url) return null;
  if (!env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET requis avec N8N_WEBHOOK_URL");
  return { url, secret: env.N8N_WEBHOOK_SECRET };
}
