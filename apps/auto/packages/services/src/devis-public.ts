// Public link of a quote: the customer views it, downloads the PDF and accepts or refuses it without an account.
// Stateless token: `<base64url payload>.<base64url HMAC-SHA256>`, key derived (HKDF) from the master key with a
// dedicated usage; the payload carries the company, the quote and the expiry. Revoked in effect as soon as the quote leaves
// the "issued" or "sent" statuses (the decision is no longer possible).
import { cleMaitre } from "@auto/tenancy";

/** Validity of a link (beyond it, the issuer generates a new one). */
export const DUREE_LIEN_MS = 30 * 24 * 3600 * 1000;

export interface ChargeLien {
  /** Issuing company. */
  t: string;
  /** Devis. */
  d: string;
  /** Expiry (ms since the epoch). */
  e: number;
}

const b64 = (o: Uint8Array) => o.toBase64({ alphabet: "base64url", omitPadding: true });

async function cle(maitre: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", maitre, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("auto/devis-public/v1"),
      info: new TextEncoder().encode("devis-public"),
    },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export async function signerLien(c: ChargeLien, maitre = cleMaitre()): Promise<string> {
  const charge = b64(new TextEncoder().encode(JSON.stringify(c)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await cle(maitre), new TextEncoder().encode(charge)));
  return `${charge}.${b64(sig)}`;
}

/** Token payload if the signature is valid and the link not expired, otherwise null. */
export async function verifierLien(jeton: string, maitre = cleMaitre(), maintenant = Date.now()) {
  const [charge, sig, ...reste] = jeton.split(".");
  if (!charge || !sig || reste.length) return null;
  let octets: Uint8Array<ArrayBuffer>;
  try {
    octets = Uint8Array.fromBase64(sig, { alphabet: "base64url" });
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await cle(maitre), octets, new TextEncoder().encode(charge));
  if (!ok) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(charge, { alphabet: "base64url" })));
    if (typeof c?.t !== "string" || typeof c?.d !== "string" || typeof c?.e !== "number") return null;
    return c.e > maintenant ? (c as ChargeLien) : null;
  } catch {
    return null;
  }
}
