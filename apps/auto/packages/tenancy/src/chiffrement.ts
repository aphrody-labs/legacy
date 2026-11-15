// Encryption at rest: AES-256-GCM (crypto.subtle), key derived by HKDF-SHA256 from a master secret.
//
// Master secret: `AUTO_CLE_MAITRE` (32 bytes in base64, or any long string). Each usage derives
// its own key with a distinct `info` (`totp:<user>`, `sauvegarde`, …): a compromised derived key
// does not open the other data, and a ciphertext copied to another user does not
// decrypt (the info is also the authenticated data).
//
// Without `AUTO_CLE_MAITRE`, a fixed development key is used (CLE_DEV below); it is
// refused in production (`NODE_ENV=production`). Losing the master key makes the 2FA secrets and the backups
// unreadable: keep it outside the database, in the host's vault.

export const CLE_DEV = "auto-dev-cle-maitre-a-ne-jamais-utiliser-en-production";

const VERSION = 1;
const SEL = new TextEncoder().encode("auto/chiffrement/v1");

export function cleMaitre(env = Bun.env): Uint8Array<ArrayBuffer> {
  const v = env.AUTO_CLE_MAITRE;
  if (!v) {
    if (env.NODE_ENV === "production") throw new Error("AUTO_CLE_MAITRE required in production");
    return new TextEncoder().encode(CLE_DEV);
  }
  if (/^[A-Za-z0-9+/]{43}=$/.test(v)) return Uint8Array.fromBase64(v);
  if (v.length < 32) throw new Error("AUTO_CLE_MAITRE: 32 characters minimum (or 32 bytes in base64)");
  return new TextEncoder().encode(v);
}

async function deriver(info: string, maitre: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", maitre, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SEL, info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Format: version (1 byte) ‖ nonce (12 bytes) ‖ ciphertext + GCM tag. */
export async function chiffrer(info: string, clair: Uint8Array<ArrayBuffer>, maitre = cleMaitre()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await deriver(info, maitre);
  const c = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(info) }, cle, clair),
  );
  const sortie = new Uint8Array(1 + 12 + c.length);
  sortie[0] = VERSION;
  sortie.set(iv, 1);
  sortie.set(c, 13);
  return sortie;
}

export async function dechiffrer(info: string, blob: Uint8Array, maitre = cleMaitre()) {
  if (blob[0] !== VERSION || blob.length < 13 + 16) throw new Error("ciphertext: unknown format");
  const cle = await deriver(info, maitre);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.slice(1, 13), additionalData: new TextEncoder().encode(info) },
      cle,
      blob.slice(13),
    ),
  );
}
