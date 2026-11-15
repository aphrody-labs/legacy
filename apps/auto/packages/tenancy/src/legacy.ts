// Takeover of two-factor authentication from the former accounts layer (before Better Auth).
//
// Better Auth derives the TOTP HMAC key from the UTF-8 bytes of a text secret: the old secrets
// (20 random bytes, encrypted by the master key) cannot be expressed that way. The migration therefore writes into
// `two_factor.secret` the text `legacy:<base32>` (encrypted by Better Auth), and this hook, before
// `/two-factor/verify-totp`, checks the code against the old secret then replaces it with the code Better
// Auth expects for that text. Already enrolled authenticator applications keep working.
//
// Backup codes: only their SHA-256 was kept. The migration puts into Better Auth a sentinel code
// `legacy-<first 16 characters of the hash>` per unused code; the hook, before
// `/two-factor/verify-backup-code`, recognizes the old code and replaces it with its sentinel.
import type { Sql } from "@auto/store";
import { createOTP } from "@better-auth/utils/otp";
import { getSessionFromCtx } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import type { AuthAuto } from "./auth";
import { dechiffrer } from "./chiffrement";
import { hash } from "./commun";
import { base32, depuisBase32, verifierTotp } from "./totp";

const PREFIXE = "legacy:";

// Context of a Better Auth endpoint, reduced to what the hook reads.
interface Ctx {
  path?: string;
  body?: Record<string, unknown>;
  context: {
    secret: string;
    secretConfig: Parameters<typeof symmetricDecrypt>[0]["key"];
    createAuthCookie: (nom: string) => { name: string };
    internalAdapter: { findVerificationValue: (id: string) => Promise<{ value: string } | null> };
    adapter: {
      findOne: <T>(q: { model: string; where: { field: string; value: string }[] }) => Promise<T | null>;
    };
  };
  getSignedCookie: (nom: string, secret: string) => Promise<string | null>;
}

/** User of the session, otherwise of the pending 2FA challenge (signed `two_factor` cookie), as Better Auth does. */
async function utilisateur(ctx: Ctx): Promise<string | null> {
  const s = await getSessionFromCtx(ctx as never).catch(() => null);
  if (s) return s.user.id;
  const c = await ctx.getSignedCookie(ctx.context.createAuthCookie("two_factor").name, ctx.context.secret);
  return c ? ((await ctx.context.internalAdapter.findVerificationValue(c))?.value ?? null) : null;
}

export async function reprendreDeuxFacteurs(c: unknown, sql: Sql) {
  const ctx = c as Ctx;
  const totpVoulu = ctx.path === "/two-factor/verify-totp";
  if (!totpVoulu && ctx.path !== "/two-factor/verify-backup-code") return;
  const code = String(ctx.body?.code ?? "");
  const userId = await utilisateur(ctx);
  if (!userId) return;
  if (totpVoulu) {
    const tf = await ctx.context.adapter.findOne<{ secret: string }>({
      model: "twoFactor",
      where: [{ field: "userId", value: userId }],
    });
    if (!tf) return;
    const secret = await symmetricDecrypt({ key: ctx.context.secretConfig, data: tf.secret });
    if (!secret.startsWith(PREFIXE)) return;
    if ((await verifierTotp(depuisBase32(secret.slice(PREFIXE.length)), code)) === null) return;
    return { context: { ...ctx, body: { ...ctx.body, code: await createOTP(secret).totp() } } };
  }
  const propre = code.trim().toLowerCase().replace(/[\s-]/g, "");
  if (!/^[a-z2-7]{10}$/.test(propre)) return;
  const h = hash(propre);
  const r = await sql`UPDATE code_secours SET utilise_at = now()
    WHERE user_id = ${userId} AND hash = ${h} AND utilise_at IS NULL RETURNING user_id`;
  if (!r.length) return;
  return { context: { ...ctx, body: { ...ctx.body, code: sentinelle(h) } } };
}

const sentinelle = (h: string) => `legacy-${h.slice(0, 16)}`;

/**
 * Idempotent migration of the active TOTP secrets and unused backup codes to `two_factor`.
 * Run at API startup (after the SQL migrations) and by `bun scripts/migrer-auth.ts`.
 */
export async function migrerDeuxFacteurs(sql: Sql, auth: AuthAuto): Promise<number> {
  const { secretConfig } = await auth.$context;
  const aMigrer = await sql<{ id: string; totp_secret: Uint8Array }[]>`
    SELECT u.id, u.totp_secret FROM app_user u
    WHERE u.totp_actif AND u.totp_secret IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM two_factor t WHERE t.user_id = u.id)`;
  for (const u of aMigrer) {
    const brut = await dechiffrer(`totp:${u.id}`, new Uint8Array(u.totp_secret));
    const codes = await sql<{ hash: string }[]>`
      SELECT hash FROM code_secours WHERE user_id = ${u.id} AND utilise_at IS NULL`;
    const secret = await symmetricEncrypt({ key: secretConfig, data: `${PREFIXE}${base32(brut)}` });
    const secours = await symmetricEncrypt({
      key: secretConfig,
      data: JSON.stringify(codes.map((c) => sentinelle(c.hash))),
    });
    await sql.begin(async (tx) => {
      await tx`INSERT INTO two_factor (id, user_id, secret, backup_codes, verified)
        VALUES (gen_random_uuid(), ${u.id}, ${secret}, ${secours}, true) ON CONFLICT DO NOTHING`;
      await tx`UPDATE app_user SET two_factor_enabled = true WHERE id = ${u.id}`;
    });
  }
  return aMigrer.length;
}
