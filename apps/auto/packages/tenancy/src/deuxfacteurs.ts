// TOTP two-factor authentication through Better Auth's twoFactor plugin (facades of the /v1/2fa routes).
// The front end calls /api/auth/two-factor/* directly; these functions serve the API, the CLI and the tests.
import { ErreurMetier, type Sql } from "@auto/store";
import { authDe } from "./auth";
import { ba } from "./erreurs";
import { auNomDe, lireCookie, type Auth } from "./index";

/** Base32 secret of the otpauth URI (manual entry in the authenticator application). */
const secretDe = (uri: string) => new URL(uri).searchParams.get("secret") ?? "";

/** Enrollment (password required): secret, otpauth URI and backup codes; inactive until confirmed. */
export async function enrolerTotp(sql: Sql, auth: Auth, motDePasse: string) {
  const r = await auNomDe(sql, auth, (headers) =>
    ba(authDe(sql).api.enableTwoFactor({ headers, body: { password: String(motDePasse ?? ""), method: "totp" } })),
  );
  if (r.method !== "totp") throw new ErreurMetier("enrôlement TOTP impossible", [], 500);
  return { secret: secretDe(r.totpURI), uri: r.totpURI, codesSecours: r.backupCodes };
}

/** Session that Better Auth recreates when enabling 2FA: it is never handed out, so we delete it. */
async function oublierSessions(sql: Sql, cookies: string[]) {
  const nom = (await authDe(sql).$context).authCookies.sessionToken.name;
  const v = lireCookie(cookies, nom);
  if (v) await sql`DELETE FROM session WHERE token = ${decodeURIComponent(v).split(".")[0]!}`;
}

/** Confirmation with a first code: 2FA becomes active. */
export async function confirmerTotp(sql: Sql, auth: Auth, code: string) {
  const { headers } = await auNomDe(sql, auth, (h) =>
    ba(authDe(sql).api.verifyTOTP({ headers: h, body: { code: String(code ?? "") }, returnHeaders: true })),
  );
  await oublierSessions(sql, headers.getSetCookie());
  return { actif: true };
}

export async function totpActif(sql: Sql, userId: string): Promise<boolean> {
  const [u] = await sql<{ two_factor_enabled: boolean | null }[]>`
    SELECT two_factor_enabled FROM app_user WHERE id = ${userId}`;
  return u?.two_factor_enabled ?? false;
}

/** Deactivation: password and code (TOTP) required. */
export async function desactiverTotp(sql: Sql, auth: Auth, motDePasse: string, code: string) {
  if (!(await totpActif(sql, auth.userId))) throw new ErreurMetier("double authentification inactive", [], 409);
  const api = authDe(sql).api;
  await auNomDe(sql, auth, async (headers) => {
    await ba(api.verifyTOTP({ headers, body: { code: String(code ?? "") } }));
    const { headers: h } = await ba(
      api.disableTwoFactor({ headers, body: { password: String(motDePasse ?? "") }, returnHeaders: true }),
    );
    await oublierSessions(sql, h.getSetCookie());
  });
}

/** New backup codes (the old ones are invalidated); password required. */
export async function regenererCodesSecours(sql: Sql, auth: Auth, motDePasse: string) {
  if (!(await totpActif(sql, auth.userId))) throw new ErreurMetier("double authentification inactive", [], 409);
  const r = await auNomDe(sql, auth, (headers) =>
    ba(authDe(sql).api.generateBackupCodes({ headers, body: { password: String(motDePasse ?? "") } })),
  );
  return { codesSecours: r.backupCodes };
}
