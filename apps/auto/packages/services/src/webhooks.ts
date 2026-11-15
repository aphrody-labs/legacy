// Per-tenant webhook subscriptions: each company receives its own signed events (its n8n, its
// automation tool), in addition to the operator delivery. Same format and same signature as the outbox.
import { ErreurMetier } from "@auto/store";

/** Derivation info of the signing secret key: specific to the tenant. */
export const infoSecret = (tenantId: string) => `webhook:${tenantId}`;

export const PRIVE = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd]/i,
];

/**
 * Destination URL: https required and no private address in production (no request to the
 * operator's internal network). In dev, `http://localhost` is allowed for trials.
 */
export function verifierUrl(brute: string, production = Bun.env.NODE_ENV === "production"): string {
  let u: URL;
  try {
    u = new URL(brute);
  } catch {
    throw new ErreurMetier("URL invalide");
  }
  const hote = u.hostname.toLowerCase();
  const local = hote === "localhost" || PRIVE.some((r) => r.test(hote));
  if (production && (u.protocol !== "https:" || local || hote.endsWith(".internal")))
    throw new ErreurMetier("URL https publique exigée");
  if (!production && u.protocol !== "https:" && !local)
    throw new ErreurMetier("URL https exigée (http : localhost seulement)");
  if (u.username || u.password) throw new ErreurMetier("identifiants interdits dans l'URL");
  return u.toString();
}

export const TYPE = /^[a-z_]+\.[a-z_]+$/;
