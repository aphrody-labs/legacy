// Accounts: Better Auth mounted under /api/auth (and /.well-known for OAuth), legacy /v1 facades
// (sign-up with SIRET, sign-in, 2FA, API keys, members, invitations) and remote MCP server
// (POST /mcp, OAuth 2.1, tokens bound to the company). See docs/AUTH.md.
import { corpsErreur, ErreurApi, refus, traducteur } from "../i18n";
import { ApiAuto, ServeurMcp } from "@auto/agent";
import { requireMcpAuth } from "@better-auth/mcp";
import { withTenant } from "@auto/store";
import {
  accepterInvitation,
  ajouterMembre,
  brancherEnvoyeur as brancher,
  confirmerTotp,
  connecter,
  creerEntreprise,
  creerJetonApi,
  deconnecter,
  desactiverTotp,
  enrolerTotp,
  entreprise,
  entreprisesDe,
  fournisseursSociaux,
  inscrire,
  inviter,
  listerInvitations,
  listerJetons,
  listerMembres,
  regenererCodesSecours,
  resoudre,
  retirerMembre,
  revoquerInvitation,
  totpActif,
  validerDeuxFacteurs,
  type EnvoyeurMail,
  type Role,
} from "@auto/tenancy";
import type { BunRequest } from "bun";
import type { Chemins, Module } from "../modules";
import { avecId, enumere, liste, objet, op, ref, str, uuid } from "../openapi-outils";

/** Wires the real mail delivery (invitations, magic links...); by default they are logged. */
export function brancherEnvoyeur(e: EnvoyeurMail) {
  brancher(e);
}

const corps = async <T>(req: Request) => ((await req.json()) ?? {}) as Partial<T>;

/** JSON response with the Better Auth cookies (session, 2FA challenge); the `cookies` field is not returned. */
function avecCookies(r: { cookies?: string[] } & object, status = 200) {
  const { cookies = [], ...corpsReponse } = r;
  const h = new Headers({ "content-type": "application/json" });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(JSON.stringify(corpsReponse), { status, headers: h });
}

export const routes: Module = ({ sql, publier, pub, auth, ba }) => {
  /**
   * Remote MCP: OAuth access token verified by `requireMcpAuth` (signature, issuer, audience = /mcp,
   * expiry), company = `auto_tenant` claim. The packages/agent tools call the API
   * over loopback with this same token: same rights and RLS as REST.
   */
  const mcp = async (req: Request) => {
    const interne = new URL(req.url).origin;
    const publique = new URL((await ba.$context).baseURL).origin;
    return requireMcpAuth(
      ba,
      async (r, claims) => {
        const a = claims.sub ? await resoudre(sql, claims.sub, claims.auto_tenant as string | undefined) : null;
        if (!a) return refus(req, "company_unreachable", 403);
        const jeton = r.headers.get("authorization")!.replace(/^Bearer\s+/i, "");
        const serveur = new ServeurMcp(new ApiAuto(interne, jeton));
        let message: unknown;
        try {
          message = await r.json();
        } catch {
          return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } });
        }
        const reponse = await serveur.traiter(message);
        return reponse ? Response.json(reponse) : new Response(null, { status: 202 });
      },
      // Resource = /mcp of the public origin; keys read over loopback (no outbound call to the Internet).
      { resource: `${publique}/mcp`, jwksUrl: `${interne}/api/auth/jwks` },
    )(req);
  };

  return {
    "/api/auth/*": (req: Request) => ba.handler(req),
    "/.well-known/*": (req: Request) => ba.handler(req),
    "/mcp": {
      POST: mcp,
      // Streamable HTTP transport without a server SSE stream: only POST (JSON-RPC) is served, GET says so explicitly.
      GET: (req: Request) =>
        Response.json(
          {
            ...corpsErreur(req, "method_not_allowed"),
            message: traducteur(req).t("mcp.post_only"),
          },
          { status: 405, headers: { allow: "POST", "cache-control": "no-store" } },
        ),
    },

    "/v1/auth/inscription": {
      POST: pub(async (req) => avecCookies(await inscrire(sql, await req.json()), 201)),
    },
    "/v1/auth/connexion": {
      POST: pub(async (req) => {
        const b = await corps<{ email: string; motDePasse: string; tenantId?: string }>(req);
        // 2FA enabled: no session, a challenge to complete with POST /v1/auth/2fa.
        return avecCookies(await connecter(sql, b.email ?? "", b.motDePasse ?? "", b.tenantId));
      }),
    },
    "/v1/auth/2fa": {
      POST: pub(async (req) => {
        const { defi, code } = await corps<{ defi: string; code: string }>(req);
        return avecCookies(await validerDeuxFacteurs(sql, defi ?? "", code ?? ""));
      }),
    },
    "/v1/auth/deconnexion": {
      POST: pub(async (req) => {
        const h = new Headers();
        for (const c of await deconnecter(sql, req.headers)) h.append("set-cookie", c);
        return new Response(null, { status: 204, headers: h });
      }),
    },
    "/v1/auth/methodes": {
      GET: () =>
        Response.json({
          motDePasse: true,
          lienMagique: true,
          passkey: true,
          sociaux: fournisseursSociaux(),
          ...(Bun.env.AUTO_CONNEXION_APPAREIL === "1" ? { appareil: true } : {}),
        }),
    },

    "/v1/moi": {
      GET: auth("lire", async (_req, a) => {
        const [u] = await sql<
          { email: string; name: string }[]
        >`SELECT email, name FROM app_user WHERE id = ${a.userId}`;
        return Response.json({
          ...a,
          email: u?.email,
          nom: u?.name,
          deuxFacteurs: await totpActif(sql, a.userId),
          entreprise: await entreprise(sql, a.tenantId),
          entreprises: await entreprisesDe(sql, a.userId),
        });
      }),
    },
    "/v1/entreprises": {
      // Session required, company not: first tenant of an account opened through magic link or Google.
      POST: pub(async (req) => {
        const s = await ba.api.getSession({ headers: req.headers, query: { disableRefresh: true } }).catch(() => null);
        if (!s) return refus(req, "unauthenticated", 401);
        const e = await corps<{ nom: string; siret: string; adresse: string; franchiseTva?: boolean }>(req);
        const id = await creerEntreprise(sql, s.user.id, e as { nom: string; siret: string; adresse: string });
        await sql`UPDATE session SET active_organization_id = ${id} WHERE id = ${s.session.id}`;
        return Response.json(await entreprise(sql, id), { status: 201 });
      }),
    },

    "/v1/jetons": {
      GET: auth("parametres", async (_req, a) => Response.json(await listerJetons(sql, a))),
      POST: auth("parametres", async (req, a) => {
        const { nom, expireEnJours } = await corps<{ nom: string; expireEnJours?: number }>(req);
        const expire = Number(expireEnJours) > 0 ? Math.round(Number(expireEnJours) * 86400) : undefined;
        return Response.json(
          { jeton: await creerJetonApi(sql, a, nom ?? "api", { expireEnSecondes: expire }) },
          { status: 201 },
        );
      }),
    },

    "/v1/membres": {
      GET: auth("membres", async (_req, a) => Response.json(await listerMembres(sql, a))),
      POST: auth("membres", async (req, a) => {
        const { email, role } = await corps<{ email: string; role: Role }>(req);
        await ajouterMembre(sql, a, email ?? "", role as Role);
        return new Response(null, { status: 204 });
      }),
    },
    "/v1/membres/:id": {
      DELETE: auth("membres", async (req: BunRequest<"/v1/membres/:id">, a) => {
        await retirerMembre(sql, a, req.params.id);
        return new Response(null, { status: 204 });
      }),
    },

    "/v1/invitations": {
      GET: auth("membres", async (_req, a) => Response.json(await listerInvitations(sql, a))),
      POST: auth("membres", async (req, a) => {
        const { email, role } = await corps<{ email: string; role: Role }>(req);
        const i = await inviter(sql, a, email ?? "", role as Role);
        await withTenant(sql, a.tenantId, (tx) => publier(tx, "invitation.creee", i));
        return Response.json(i, { status: 201 });
      }),
    },
    "/v1/invitations/:id": {
      DELETE: auth("membres", async (req: BunRequest<"/v1/invitations/:id">, a) => {
        await revoquerInvitation(sql, a, req.params.id);
        return new Response(null, { status: 204 });
      }),
    },
    "/v1/invitations/acceptation": {
      POST: pub(async (req) => {
        const { jeton, id, motDePasse } = await corps<{ jeton: string; id: string; motDePasse: string }>(req);
        if (!(jeton ?? id)) throw new ErreurApi("token_password_required");
        return avecCookies(await accepterInvitation(sql, (jeton ?? id)!, motDePasse!), 201);
      }),
    },

    "/v1/2fa/enrolement": {
      POST: auth("lire", async (req, a) => {
        const { motDePasse } = await corps<{ motDePasse: string }>(req);
        return Response.json(await enrolerTotp(sql, a, String(motDePasse ?? "")), { status: 201 });
      }),
    },
    "/v1/2fa/confirmation": {
      POST: auth("lire", async (req, a) => {
        const { code } = await corps<{ code: string }>(req);
        return Response.json(await confirmerTotp(sql, a, String(code ?? "")));
      }),
    },
    "/v1/2fa/codes-secours": {
      POST: auth("lire", async (req, a) => {
        const { motDePasse } = await corps<{ motDePasse: string }>(req);
        return Response.json(await regenererCodesSecours(sql, a, String(motDePasse ?? "")));
      }),
    },
    "/v1/2fa/desactivation": {
      POST: auth("lire", async (req, a) => {
        const { motDePasse, code } = await corps<{ motDePasse: string; code: string }>(req);
        await desactiverTotp(sql, a, String(motDePasse ?? ""), String(code ?? ""));
        return new Response(null, { status: 204 });
      }),
    },
  };
};

const ROLE = ref("Role");
const CODE = { type: "string", pattern: "^[0-9]{6}$" };

/** OpenAPI description of the batch routes (Better Auth routes are merged by openapi.ts). */
export const openapi: Chemins = {
  "/v1/auth/2fa": {
    post: op({
      resume: "Second sign-in factor: challenge + TOTP code or backup code",
      tag: "Accounts",
      corps: objet({ defi: str, code: str }, ["defi", "code"]),
      succes: { 200: ref("Session") },
      erreurs: [401, 429],
    }),
  },
  "/v1/auth/methodes": {
    get: op({
      resume: "Offered sign-in methods (password, magic link, passkey, configured providers)",
      tag: "Accounts",
      succes: {
        200: objet({
          motDePasse: { type: "boolean" },
          lienMagique: { type: "boolean" },
          passkey: { type: "boolean" },
          sociaux: liste(enumere("google", "microsoft")),
        }),
      },
    }),
  },
  "/v1/entreprises": {
    post: op({
      resume: "Create a company (SIRET) whose owner becomes the session user; it becomes active",
      tag: "Accounts",
      corps: objet({ nom: str, siret: str, adresse: str, franchiseTva: { type: "boolean" } }, [
        "nom",
        "siret",
        "adresse",
      ]),
      succes: { 201: ref("Entreprise") },
      erreurs: [401, 422],
    }),
  },
  "/v1/membres/{id}": avecId({
    delete: op({
      resume: "Remove a member (the last owner stays)",
      tag: "Accounts",
      droit: "membres",
      succes: { 204: null },
      erreurs: [404, 409],
    }),
  }),
  "/v1/invitations": {
    get: op({
      resume: "Company invitations",
      tag: "Accounts",
      droit: "membres",
      succes: { 200: liste(objet({})) },
    }),
    post: op({
      resume: "Invite an email with a role (single-use link, 7 days)",
      tag: "Accounts",
      droit: "membres",
      corps: objet({ email: str, role: ROLE }, ["email", "role"]),
      succes: { 201: objet({}) },
      erreurs: [409, 422],
    }),
  },
  "/v1/invitations/{id}": avecId({
    delete: op({
      resume: "Revoke an invitation",
      tag: "Accounts",
      droit: "membres",
      succes: { 204: null },
      erreurs: [404],
    }),
  }),
  "/v1/invitations/acceptation": {
    post: op({
      resume: "Accept an invitation (account creation or attachment by password)",
      tag: "Accounts",
      corps: objet({ id: uuid, jeton: str, motDePasse: str }, ["motDePasse"]),
      succes: { 201: ref("Session") },
      erreurs: [401, 403, 410, 422],
    }),
  },
  "/v1/2fa/enrolement": {
    post: op({
      resume: "Enroll a TOTP authenticator (password required): secret, otpauth URI, backup codes",
      tag: "Accounts",
      droit: "lire",
      corps: objet({ motDePasse: str }, ["motDePasse"]),
      succes: { 201: objet({ secret: str, uri: str, codesSecours: liste(str) }) },
      erreurs: [401],
    }),
  },
  "/v1/2fa/confirmation": {
    post: op({
      resume: "Confirm enrollment with a first code: 2FA becomes active",
      tag: "Accounts",
      droit: "lire",
      corps: objet({ code: CODE }, ["code"]),
      succes: { 200: objet({ actif: { type: "boolean" } }) },
      erreurs: [401, 409],
    }),
  },
  "/v1/2fa/codes-secours": {
    post: op({
      resume: "Regenerate the backup codes (password required)",
      tag: "Accounts",
      droit: "lire",
      corps: objet({ motDePasse: str }, ["motDePasse"]),
      succes: { 200: objet({ codesSecours: liste(str) }) },
      erreurs: [401, 409],
    }),
  },
  "/v1/2fa/desactivation": {
    post: op({
      resume: "Disable 2FA (password and code)",
      tag: "Accounts",
      droit: "lire",
      corps: objet({ motDePasse: str, code: str }, ["motDePasse", "code"]),
      succes: { 204: null },
      erreurs: [401, 409],
    }),
  },
};
