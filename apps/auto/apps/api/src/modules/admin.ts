// Operator console: cross-tenant read, suspension, support and queues. Reserved to the owner and
// admin of the operator tenant (AUTO_TENANT_OPERATEUR). Per-tenant reads go through withTenant: RLS
// remains the only way into business data, the operator does not bypass it.
import { ErreurApi, refus } from "../i18n";
import { consommation, planEffectif } from "@auto/billing";
import {
  avecWorker,
  journaliser,
  lireAbonnement,
  lister,
  verifierAudit,
  withTenant,
  type Sql,
} from "@auto/store";
import { revoquerJeton, humainSuperAdmin, agentAdministrateur, ipAdministration, type Auth } from "@auto/tenancy";
import type { BunRequest } from "bun";
import type { Chemins, Module } from ".";
import { avecId, enumere, liste, objet, op, str } from "../openapi-outils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Operator: owner or admin of the tenant named by AUTO_TENANT_OPERATEUR; otherwise 403. */
export function exigerOperateur(a: Auth, operateur = Bun.env.AUTO_TENANT_OPERATEUR) {
  if (!operateur || a.tenantId !== operateur || (a.role !== "owner" && a.role !== "admin"))
    throw new ErreurApi("operator_only", [], 403);
}

interface TenantRow {
  id: string;
  nom: string;
  siren: string;
  created_at: Date;
  suspendu_at: Date | null;
  suspension_motif: string | null;
  membres: number;
}

async function resume(sql: Sql, t: TenantRow) {
  const { ab, conso } = await withTenant(sql, t.id, async (tx) => ({
    ab: await lireAbonnement(tx),
    conso: await consommation(tx),
  }));
  return {
    id: t.id,
    nom: t.nom,
    siren: t.siren,
    creeLe: t.created_at.toISOString(),
    suspendu: t.suspendu_at ? { depuis: t.suspendu_at.toISOString(), motif: t.suspension_motif } : null,
    membres: t.membres,
    plan: planEffectif(ab).id,
    statut: ab.statut,
    stripe: ab.stripeSubscriptionId ?? null,
    consommation: conso,
  };
}

const TENANTS = (sql: Sql, id?: string) => sql<TenantRow[]>`
  SELECT t.id, t.nom, t.siren, t.created_at, t.suspendu_at, t.suspension_motif,
    (SELECT count(*)::int FROM membership m WHERE m.tenant_id = t.id) AS membres
  FROM tenant t WHERE ${id ?? null}::uuid IS NULL OR t.id = ${id ?? null}::uuid
  ORDER BY t.created_at DESC LIMIT 500`;

export const routes: Module = ({ sql, auth, ba, pub }) => {
  /** Operator route: "read" right on its tenant, then operator check. */
  const op_ = <R extends Request>(fn: (req: R, a: Auth) => Promise<Response>) =>
    pub(async (req: R) => {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")
      )
        return refus(req, "json_content_type_required", 415);
      const agent = await agentAdministrateur(sql, req);
      if (!agent && !ipAdministration(req).autorise)
        return refus(req, "admin_network_forbidden", 403);
      const humain = agent ? null : await humainSuperAdmin(ba, req);
      if (agent || humain) {
        const a: Auth = {
          userId: agent?.proprietaireId ?? humain!.user.id,
          tenantId: Bun.env.AUTO_TENANT_OPERATEUR ?? agent?.proprietaireId ?? humain!.user.id,
          role: "owner",
        };
        const response = await fn(req, a);
        if (agent)
          await sql`INSERT INTO agent_admin_journal(agent_id,methode,route,statut) VALUES(${agent.id},${req.method},${new URL(req.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id")},${response.status})`;
        return response;
      }
      return auth<R>("lire", async (req, a) => {
        exigerOperateur(a);
        return fn(req, a);
      })(req);
    });

  return {
    "/v1/jetons/:id": {
      DELETE: auth("parametres", async (req: BunRequest<"/v1/jetons/:id">, a) => {
        await revoquerJeton(sql, a, req.params.id);
        return new Response(null, { status: 204 });
      }),
    },

    "/v1/admin/tenants": {
      GET: op_(async () => Response.json(await Promise.all((await TENANTS(sql)).map((t) => resume(sql, t))))),
    },
    "/v1/admin/tenants/:id": {
      GET: op_(async (req: BunRequest<"/v1/admin/tenants/:id">) => {
        const id = req.params.id;
        const [t] = UUID.test(id) ? await TENANTS(sql, id) : [];
        if (!t) return refus(req, "not_found", 404);
        const membres = await sql<{ email: string; role: string }[]>`
          SELECT u.email, m.role FROM membership m JOIN app_user u ON u.id = m.user_id
          WHERE m.tenant_id = ${id} ORDER BY u.email`;
        const { documents, audit } = await withTenant(sql, id, async (tx) => ({
          documents: (await lister(tx, undefined, 10)).map((d) => ({
            id: d.id,
            type: d.type,
            numero: d.numero,
            statut: d.statut,
            ttcCents: d.ttcCents,
            createdAt: d.createdAt,
          })),
          audit: await verifierAudit(tx),
        }));
        return Response.json({ ...(await resume(sql, t)), membres, documents, audit });
      }),
    },
    "/v1/admin/tenants/:id/suspension": {
      POST: op_(async (req: BunRequest<"/v1/admin/tenants/:id/suspension">, a) => {
        const id = req.params.id;
        const { suspendu, motif } = (await req.json()) as { suspendu?: boolean; motif?: string };
        if (typeof suspendu !== "boolean") throw new ErreurApi("suspended_boolean");
        if (id === a.tenantId) throw new ErreurApi("operator_tenant_not_suspendable", [], 409);
        if (suspendu && !motif?.trim()) throw new ErreurApi("suspension_reason_required");
        const r = UUID.test(id)
          ? await sql`UPDATE tenant SET suspendu_at = ${suspendu ? new Date() : null},
              suspension_motif = ${suspendu ? motif!.trim() : null} WHERE id = ${id} RETURNING id`
          : [];
        if (!r.length) return refus(req, "not_found", 404);
        // Trace in the audit trail of the tenant concerned, with the operator as author.
        await withTenant(sql, id, (tx) =>
          journaliser(tx, a.userId, suspendu ? "tenant.suspendre" : "tenant.retablir", id, { motif: motif ?? null }),
        );
        return new Response(null, { status: 204 });
      }),
    },
    "/v1/admin/utilisateurs": {
      GET: op_(async (req) => {
        const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
        if (!email) throw new ErreurApi("email_required");
        const rows = await sql<
          { id: string; email: string; created_at: Date; tenant_id: string; nom: string; role: string }[]
        >`
          SELECT u.id, u.email, u.created_at, m.tenant_id, t.nom, m.role FROM app_user u
          LEFT JOIN membership m ON m.user_id = u.id LEFT JOIN tenant t ON t.id = m.tenant_id
          WHERE u.email = ${email}`;
        if (!rows.length) return refus(req, "not_found", 404);
        return Response.json({
          id: rows[0]!.id,
          email: rows[0]!.email,
          creeLe: rows[0]!.created_at.toISOString(),
          adhesions: rows.filter((r) => r.tenant_id).map((r) => ({ tenantId: r.tenant_id, nom: r.nom, role: r.role })),
        });
      }),
    },
    "/v1/admin/stripe/evenements": {
      GET: op_(async () =>
        Response.json(
          (
            await sql<
              { id: string; type: string; cree_at: Date; recu_at: Date; resultat: string; tenant_id: string | null }[]
            >`
              SELECT id, type, cree_at, recu_at, resultat, tenant_id FROM stripe_evenement ORDER BY recu_at DESC LIMIT 200`
          ).map((r) => ({
            id: r.id,
            type: r.type,
            creeLe: r.cree_at.toISOString(),
            recuLe: r.recu_at.toISOString(),
            resultat: r.resultat,
            tenantId: r.tenant_id,
          })),
        ),
      ),
    },
    "/v1/admin/evenements": {
      GET: op_(async (req) => {
        const statut = new URL(req.url).searchParams.get("statut");
        const rows = await avecWorker(
          sql,
          (tx) => tx<
            {
              id: string;
              tenant_id: string;
              type: string;
              statut: string;
              essais: number;
              derniere_erreur: string | null;
              created_at: Date;
            }[]
          >`
            SELECT id, tenant_id, type, statut, essais, derniere_erreur, created_at FROM evenement
            WHERE ${statut}::text IS NULL OR statut = ${statut}::text ORDER BY created_at DESC LIMIT 200`,
        );
        return Response.json(
          rows.map((r) => ({
            id: r.id,
            tenantId: r.tenant_id,
            type: r.type,
            statut: r.statut,
            essais: r.essais,
            derniereErreur: r.derniere_erreur,
            createdAt: r.created_at.toISOString(),
          })),
        );
      }),
    },
    "/v1/admin/audit": {
      GET: op_(async () => {
        const out: { tenantId: string; nom: string; ok: boolean; entrees: number }[] = [];
        for (const t of await TENANTS(sql))
          out.push({ tenantId: t.id, nom: t.nom, ...(await withTenant(sql, t.id, (tx) => verifierAudit(tx))) });
        return Response.json(out);
      }),
    },
  };
};

const OPERATEUR = "Opérateur";

/** OpenAPI description of the module routes. */
export const openapi: Chemins = {
  "/v1/jetons/{id}": avecId({
    delete: op({
      resume: "Revoke an API key",
      tag: "Accounts",
      droit: "parametres",
      succes: { 204: null },
      erreurs: [404],
    }),
  }),
  "/v1/admin/tenants": {
    get: op({
      resume: "Entreprises : plan effectif, statut Stripe, consommation, suspension",
      tag: OPERATEUR,
      droit: "lire",
      succes: { 200: liste(objet({})) },
    }),
  },
  "/v1/admin/tenants/{id}": avecId({
    get: op({
      resume: "Company record: members, quotas, latest documents, audit",
      tag: OPERATEUR,
      droit: "lire",
      succes: { 200: objet({}) },
      erreurs: [404],
    }),
  }),
  "/v1/admin/tenants/{id}/suspension": avecId({
    post: op({
      resume: "Suspend or reinstate a company (traced in its audit)",
      tag: OPERATEUR,
      droit: "lire",
      corps: objet({ suspendu: { type: "boolean" }, motif: str }, ["suspendu"]),
      succes: { 204: null },
      erreurs: [404, 409, 422],
    }),
  }),
  "/v1/admin/utilisateurs": {
    get: op({
      resume: "Find an account and its memberships (support)",
      tag: OPERATEUR,
      droit: "lire",
      requete: [{ nom: "email", schema: str, description: "Exact email" }],
      succes: { 200: objet({}) },
      erreurs: [404, 422],
    }),
  },
  "/v1/admin/stripe/evenements": {
    get: op({
      resume: "Log of received Stripe webhooks",
      tag: OPERATEUR,
      droit: "lire",
      succes: { 200: liste(objet({})) },
    }),
  },
  "/v1/admin/evenements": {
    get: op({
      resume: "Event queue (outbox) and their failures",
      tag: OPERATEUR,
      droit: "lire",
      requete: [{ nom: "statut", schema: enumere("a_livrer", "livre", "echec"), description: "Status filter" }],
      succes: { 200: liste(objet({})) },
    }),
  },
  "/v1/admin/audit": {
    get: op({
      resume: "Verification of the audit chains of all companies",
      tag: OPERATEUR,
      droit: "lire",
      succes: { 200: liste(objet({})) },
    }),
  },
};
