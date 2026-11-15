// Better Auth server of auto: accounts, sessions, companies (organization plugin = tenant), 2FA,
// passkeys, API keys, magic link, operator console (admin), OAuth 2.1 for MCP clients.
//
// Database: the application's Postgres database through `Bun.SQL` (in-house Kysely dialect, kysely-bun.ts); Better Auth's
// camelCase identifiers become snake_case columns (CamelCasePlugin). The historical
// tables are taken over as is: user = app_user, organization = tenant, member = membership,
// invitation = invitation. The schema is versioned in packages/store/migrations (020_better_auth.sql):
// no automatic Better Auth migration.
import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { journaliser, type Sql } from "@auto/store";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import {
  admin,
  bearer,
  jwt,
  magicLink,
  openAPI,
  organization,
  twoFactor,
  deviceAuthorization,
} from "better-auth/plugins";
import { setSessionCookie } from "better-auth/cookies";
import { CamelCasePlugin, Kysely } from "kysely";
import { sociaux } from "./fournisseurs";
import { cleMaitre } from "./chiffrement";
import { ac, roles } from "./droits";
import { DialecteBunSql } from "./kysely-bun";
import { reprendreDeuxFacteurs } from "./legacy";
import { traducteur } from "./i18n";
import { envoyerMail } from "./mail";
import { synchroniserOperateurs } from "./operateurs";

export const SESSION_JOURS = 30;
export const INVITATION_JOURS = 7;
/** Validity of a magic sign-in link. */
const MAGIC_MINUTES = 10;
export const CHEMIN_AUTH = "/api/auth";

/** Tenant audit trail (without email: the audit is immutable). */
async function auditer(sql: Sql, tenantId: string, actor: string | null, action: string, ref: string, payload = {}) {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant', ${tenantId}, true)`;
    await journaliser(tx, actor, action, ref, payload);
  });
}

export interface OptionsAuth {
  /** Public origin (`BETTER_AUTH_URL`, otherwise `AUTO_URL_APP`): cookies, mail links, OAuth issuer. */
  baseURL?: string;
  /** Signing secret (`BETTER_AUTH_SECRET`); derived from auto's master key by default. */
  secret?: string;
  /** Rate limiting of the authentication routes; active by default in production. */
  limiteDebit?: boolean;
  env?: Record<string, string | undefined>;
  /** Schema check at startup (expected tables and columns); disabled to generate docs without a database. */
  validerSchema?: boolean;
}

/** Better Auth secret derived from `AUTO_CLE_MAITRE` (HMAC-SHA256): one secret to keep in the vault. */
export function secretDerive(env = Bun.env) {
  return new Bun.CryptoHasher("sha256", cleMaitre(env)).update("auto/better-auth/v1").digest("hex");
}

export function urlPublique(env: Record<string, string | undefined> = Bun.env) {
  return (env.BETTER_AUTH_URL ?? env.AUTO_URL_APP ?? env.AUTO_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Configured social sign-in providers (shown by the front end). */
export const fournisseursSociaux = (env = Bun.env) => Object.keys(sociaux(env) ?? {});

export function creerAuth(sql: Sql, o: OptionsAuth = {}) {
  const env = o.env ?? Bun.env;
  const baseURL = (o.baseURL ?? urlPublique(env)).replace(/\/+$/, "");
  const prod = env.NODE_ENV === "production";
  const https = baseURL.startsWith("https://");
  const app = `${baseURL}/app`;
  const db = new Kysely({ dialect: new DialecteBunSql(sql), plugins: [new CamelCasePlugin()] });

  return betterAuth({
    appName: "auto",
    baseURL,
    basePath: CHEMIN_AUTH,
    secret: o.secret ?? env.BETTER_AUTH_SECRET ?? secretDerive(env),
    database: { db, type: "postgres", transaction: true },
    // Production: the public origin and AUTO_ORIGINES_CONFIANCE. Outside production, any local origin
    // (development front end, test benches on random ports).
    trustedOrigins: [
      baseURL,
      ...(env.AUTO_ORIGINES_CONFIANCE?.split(",").map((s) => s.trim()) ?? []),
      ...(prod ? [] : ["http://localhost:*", "http://127.0.0.1:*"]),
    ],
    telemetry: { enabled: false },
    logger: {
      disabled: env.NODE_ENV === "test",
      level: "warn",
      // An invalid key is an ordinary 401 response, not a server error.
      log: (niveau, message, ...args) => {
        if (message.includes("Failed to validate API key")) return;
        (niveau === "error" ? console.error : console.warn)(`[auth] ${message}`, ...args);
      },
    },
    advanced: {
      database: { generateId: "uuid", validateSchema: o.validerSchema ?? true },
      cookiePrefix: "auto",
      useSecureCookies: https,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: https },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    user: {
      modelName: "app_user",
      changeEmail: { enabled: true },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: SESSION_JOURS * 86400,
      updateAge: 86400,
      // No session cookie cache: role, suspension and revocation apply on the next request.
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      // Historical `Bun.password` hashes (argon2id) kept as is; new ones too.
      password: {
        hash: (mdp) => Bun.password.hash(mdp),
        verify: ({ hash, password }) => Bun.password.verify(password, hash).catch(() => false),
      },
      sendResetPassword: async ({ user, url }, request) => {
        const t = traducteur(request);
        return envoyerMail({
          a: user.email,
          sujet: t.t("auth.mail.reset.subject"),
          texte: t.t("auth.mail.reset.text", { hours: 1, url }),
          modele: "reinitialisation",
          donnees: { lien: url },
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }, request) => {
        const t = traducteur(request);
        return envoyerMail({
          a: user.email,
          sujet: t.t("auth.mail.verify.subject"),
          texte: t.t("auth.mail.verify.text", { url }),
          modele: "verification",
          donnees: { lien: url },
        });
      },
    },
    socialProviders: sociaux(env),
    rateLimit: {
      enabled: o.limiteDebit ?? prod,
      storage: "database",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/magic-link": { window: 60, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/organization/invite-member": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Active company (= the session's tenant): the first, by membership seniority.
          before: async (s) => {
            if ((s as { activeOrganizationId?: string | null }).activeOrganizationId) return;
            const [m] = await sql<{ tenant_id: string }[]>`
              SELECT tenant_id FROM membership WHERE user_id = ${s.userId} ORDER BY created_at, tenant_id LIMIT 1`;
            return { data: { ...s, activeOrganizationId: m?.tenant_id ?? null } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => reprendreDeuxFacteurs(ctx, sql)),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/device/token" && ctx.context.newSession) await setSessionCookie(ctx, ctx.context.newSession);
      }),
    },
    plugins: [
      ...(env.AUTO_CONNEXION_APPAREIL === "1"
        ? [
            deviceAuthorization({
              expiresIn: "10m",
              interval: "5s",
              verificationUri: `${baseURL}/app/verification-appareil`,
              validateClient: (client) => client === "auto-native",
              onDeviceAuthRequest: async () => {
                await sql`DELETE FROM device_code WHERE expires_at<now()`;
              },
            }),
          ]
        : []),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        invitationExpiresIn: INVITATION_JOURS * 86400,
        cancelPendingInvitationsOnReInvite: true,
        // Companies are created through sign-up (SIRET checked): /v1/auth/inscription.
        allowUserToCreateOrganization: true,
        sendInvitationEmail: async ({ id, email, role, organization: org }, request) => {
          const lien = `${app}/invitation?id=${id}`;
          const t = traducteur(request);
          await envoyerMail({
            a: email,
            sujet: t.t("auth.mail.invite.subject", { organization: org.name }),
            texte: t.t("auth.mail.invite.text", { organization: org.name, role, days: INVITATION_JOURS, url: lien }),
            modele: "invitation",
            donnees: { entreprise: org.name, role, lien, jeton: id },
          });
        },
        organizationHooks: {
          afterCreateInvitation: async ({ invitation: i, inviter }) =>
            auditer(sql, i.organizationId, inviter.id, "invitation.creer", i.id, { role: i.role }),
          afterAcceptInvitation: async ({ invitation: i, user }) => {
            await sql`UPDATE invitation SET acceptee_at = now(), acceptee_par = ${user.id} WHERE id = ${i.id}`;
            await auditer(sql, i.organizationId, user.id, "invitation.accepter", i.id, { role: i.role });
          },
          afterCancelInvitation: async ({ invitation: i, cancelledBy }) => {
            await sql`UPDATE invitation SET revoquee_at = now() WHERE id = ${i.id} AND acceptee_at IS NULL`;
            await auditer(sql, i.organizationId, cancelledBy.id, "invitation.revoquer", i.id);
          },
          afterAddMember: async () => synchroniserOperateurs(sql),
          afterUpdateMemberRole: async ({ member: m, previousRole }) => {
            await auditer(sql, m.organizationId, null, "membre.role", m.id, { avant: previousRole, apres: m.role });
            await synchroniserOperateurs(sql);
          },
          afterRemoveMember: async ({ member: m }) => {
            await auditer(sql, m.organizationId, null, "membre.retirer", m.id);
            await synchroniserOperateurs(sql);
          },
        },
        schema: {
          organization: {
            modelName: "tenant",
            fields: { name: "nom" },
            additionalFields: {
              siren: { type: "string", required: true, input: true },
              siret: { type: "string", required: true, input: true },
              adresse: { type: "string", required: true, input: true },
              tvaIntracom: { type: "string", required: false, input: true },
              franchiseTva: { type: "boolean", required: false, defaultValue: false, input: true },
            },
          },
          member: { modelName: "membership", fields: { organizationId: "tenantId" } },
          invitation: {
            modelName: "invitation",
            fields: { organizationId: "tenantId", inviterId: "invitePar" },
          },
        },
      }),
      twoFactor({
        issuer: "auto",
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),
      passkey({ rpID: new URL(baseURL).hostname, rpName: "auto", origin: baseURL }),
      apiKey({
        // Company key (reference = tenant); the author is kept in the metadata.
        references: "organization",
        defaultPrefix: "auto_",
        enableMetadata: true,
        // Key rate: the API's (plan quotas), not the plugin's default limit (10/day).
        rateLimit: { enabled: false },
        keyExpiration: { defaultExpiresIn: null, minExpiresIn: 0, maxExpiresIn: 3650 },
      }),
      bearer(),
      admin({ defaultRole: "user", adminRoles: ["admin"], impersonationSessionDuration: 3600 }),
      magicLink({
        expiresIn: MAGIC_MINUTES * 60,
        disableSignUp: true,
        sendMagicLink: async ({ email, url }, ctx) => {
          const t = traducteur(ctx?.request);
          return envoyerMail({
            a: email,
            sujet: t.t("auth.mail.magic.subject"),
            texte: t.t("auth.mail.magic.text", { minutes: MAGIC_MINUTES, url }),
            modele: "lien-magique",
            donnees: { lien: url },
          });
        },
      }),
      openAPI({ disableDefaultReference: true }),
      jwt(),
      mcp({
        loginPage: `${app}/connexion`,
        consentPage: `${app}/autorisation`,
        resource: `${baseURL}/mcp`,
        // Claude Code and other clients register themselves (RFC 7591) or by CIMD document.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        postLogin: {
          page: `${app}/autorisation`,
          // Consent and token are bound to the session's active company.
          consentReferenceId: ({ session }) =>
            (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? undefined,
          shouldRedirect: ({ session }) => !(session as { activeOrganizationId?: string | null }).activeOrganizationId,
        },
        customAccessTokenClaims: ({ referenceId }) => (referenceId ? { auto_tenant: referenceId } : {}),
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  });
}

export type AuthAuto = ReturnType<typeof creerAuth>;

const instances = new WeakMap<Sql, AuthAuto>();

/** Better Auth instance of a database: created once (or supplied by `enregistrerAuth`). */
export function authDe(sql: Sql): AuthAuto {
  let a = instances.get(sql);
  if (!a) instances.set(sql, (a = creerAuth(sql)));
  return a;
}

export function enregistrerAuth(sql: Sql, a: AuthAuto) {
  instances.set(sql, a);
  return a;
}
