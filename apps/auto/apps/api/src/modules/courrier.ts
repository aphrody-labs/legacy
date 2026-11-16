import { ErreurApi, refus } from "../i18n";
import { avecCourrier, comptesCourrier } from "@auto/store";
import {
  debutCourrier,
  retourCourrier,
  fournisseurCourrier,
  connecterAphrody,
  synchroniserCourrier,
  envoyerCourrier,
} from "@auto/services/courrier";
import { configurationCourrier } from "@auto/mail";
import type { BunRequest } from "bun";
import type { Module, Chemins } from ".";
import { estSuperAdmin, type Auth } from "@auto/tenancy";

const id = (s: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new ErreurApi("invalid_id");
  return s;
};
export const routes: Module = ({ sql, ba, pub }) => {
  // Personal mail needs no company nor fictitious legal identity.
  const auth = <R extends Request>(_droit: string, fn: (req: R, a: Auth) => Promise<Response>) =>
    pub(async (req: R) => {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")
      )
        return refus(req, "json_content_type_required", 415);
      const session = await ba.api.getSession({ headers: req.headers, query: { disableRefresh: true } });
      if (!session) return refus(req, "unauthenticated", 401);
      let userId = session.user.id;
      // Explicitly authorized SSO aliases of the owner open the same private space.
      if (
        Bun.env.AUTO_COURRIER_PROPRIETAIRE &&
        estSuperAdmin(session.user.email, session.user.emailVerified, (session.user as { role?: string | null }).role)
      ) {
        const [principal] =
          await sql`SELECT id FROM app_user WHERE lower(email)=${Bun.env.AUTO_COURRIER_PROPRIETAIRE.toLowerCase()} AND email_verified`;
        if (!principal) throw new ErreurApi("owner_account_unavailable", [], 503);
        userId = String(principal.id);
      }
      const response = await fn(req, { userId, tenantId: userId, role: "owner" });
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      headers.set("vary", "cookie, authorization");
      return new Response(response.body, { status: response.status, headers });
    });
  const retour = (f: "google" | "microsoft") =>
    auth("lire", async (req: Request, a) => {
      const u = new URL(req.url),
        origine = new URL(configurationCourrier(f).redirect).origin;
      if (u.searchParams.has("error")) return Response.redirect(`${origine}/app/courrier?connexion=annulee`, 303);
      await retourCourrier(sql, a, f, u.searchParams.get("state") ?? "", u.searchParams.get("code") ?? "");
      return Response.redirect(`${origine}/app/courrier?connexion=ok`, 303);
    });
  const callback = (f: "google" | "microsoft") => (req: Request) =>
    new URL(req.url).searchParams.get("state")?.startsWith("courrier_") ? retour(f)(req) : ba.handler(req);
  return {
    "/api/auth/callback/google": { GET: callback("google") },
    "/api/auth/callback/microsoft": { GET: callback("microsoft") },
    "/v1/courrier/comptes": {
      GET: auth("lire", async (_req, a) =>
        Response.json({
          comptes: await avecCourrier(sql, a.tenantId, a.userId, comptesCourrier),
          fournisseurs: ["google", "microsoft"].map((n) => {
            try {
              configurationCourrier(fournisseurCourrier(n));
              return { id: n, disponible: true };
            } catch {
              return { id: n, disponible: false };
            }
          }),
        }),
      ),
    },
    "/v1/courrier/oauth/:fournisseur/connecter": {
      POST: auth("lire", async (req: BunRequest<"/v1/courrier/oauth/:fournisseur/connecter">, a) =>
        Response.json(await debutCourrier(sql, a, fournisseurCourrier(req.params.fournisseur))),
      ),
    },
    "/v1/courrier/oauth/:fournisseur/retour": {
      GET: auth("lire", async (req: BunRequest<"/v1/courrier/oauth/:fournisseur/retour">, a) => {
        const u = new URL(req.url),
          f = fournisseurCourrier(req.params.fournisseur);
        if (u.searchParams.has("error"))
          return Response.redirect(
            `${new URL(configurationCourrier(f).redirect).origin}/app/courrier?connexion=annulee`,
            303,
          );
        await retourCourrier(sql, a, f, u.searchParams.get("state") ?? "", u.searchParams.get("code") ?? "");
        return Response.redirect(`${new URL(configurationCourrier(f).redirect).origin}/app/courrier?connexion=ok`, 303);
      }),
    },
    "/v1/courrier/comptes/aphrody": {
      POST: auth("parametres", async (_req, a) => Response.json(await connecterAphrody(sql, a), { status: 201 })),
    },
    "/v1/courrier/comptes/:id": {
      DELETE: auth("lire", async (req: BunRequest<"/v1/courrier/comptes/:id">, a) => {
        const rows = await avecCourrier(
          sql,
          a.tenantId,
          a.userId,
          (tx) =>
            tx`UPDATE courrier_compte SET actif=false,secret=${new Uint8Array()},verrou=null,verrou_jusqua=null WHERE id=${id(req.params.id)} RETURNING id`,
        );
        return rows.length
          ? new Response(null, { status: 204 })
          : refus(req, "account_missing", 404);
      }),
    },
    "/v1/courrier/comptes/:id/synchroniser": {
      POST: auth("lire", async (req: BunRequest<"/v1/courrier/comptes/:id/synchroniser">, a) =>
        Response.json(await synchroniserCourrier(sql, a, id(req.params.id))),
      ),
    },
    "/v1/courrier/messages": {
      GET: auth("lire", async (req, a) => {
        const u = new URL(req.url),
          compte = u.searchParams.get("compte") || null,
          q = (u.searchParams.get("q") ?? "").slice(0, 200),
          dossier = u.searchParams.get("dossier") === "envoyes" ? "envoyes" : "reception";
        if (compte) id(compte);
        const page = Number(u.searchParams.get("page") ?? 0);
        if (!Number.isInteger(page) || page < 0 || page > 10000) throw new ErreurApi("invalid_page");
        const rows = await avecCourrier(
          sql,
          a.tenantId,
          a.userId,
          (
            tx,
          ) => tx`SELECT m.id,m.compte_id,c.adresse,c.fournisseur,m.expediteur,m.destinataires,m.sujet,left(m.texte,180) AS extrait,m.date_envoi,m.lu,
   (SELECT count(*)::int FROM courrier_piece p WHERE p.message_id=m.id) AS pieces
   FROM courrier_message m JOIN courrier_compte c ON c.id=m.compte_id
   WHERE m.present AND m.dossier=${dossier} AND (${compte}::uuid IS NULL OR m.compte_id=${compte}::uuid)
   AND (${q}='' OR m.sujet ILIKE ${"%" + q + "%"} OR m.expediteur ILIKE ${"%" + q + "%"} OR m.texte ILIKE ${"%" + q + "%"})
   ORDER BY m.date_envoi DESC,m.id DESC LIMIT 51 OFFSET ${page * 50}`,
        );
        return Response.json({ messages: rows.slice(0, 50), suite: rows.length > 50, page });
      }),
    },
    "/v1/courrier/messages/:id": {
      GET: auth("lire", async (req: BunRequest<"/v1/courrier/messages/:id">, a) => {
        const data = await avecCourrier(sql, a.tenantId, a.userId, async (tx) => {
          const [m] =
            await tx`SELECT m.*,c.adresse,c.fournisseur FROM courrier_message m JOIN courrier_compte c ON c.id=m.compte_id WHERE m.id=${id(req.params.id)}`;
          if (!m) throw new ErreurApi("message_missing", [], 404);
          const pieces =
            await tx`SELECT id,nom,type,octet_length(contenu) AS taille FROM courrier_piece WHERE message_id=${m.id} ORDER BY rang`;
          return { ...m, pieces };
        });
        return Response.json(data);
      }),
      PATCH: auth("lire", async (req: BunRequest<"/v1/courrier/messages/:id">, a) => {
        const b = (await req.json()) as { lu?: boolean };
        if (typeof b.lu !== "boolean") throw new ErreurApi("read_state_invalid");
        const r = await avecCourrier(
          sql,
          a.tenantId,
          a.userId,
          (tx) => tx`UPDATE courrier_message SET lu=${b.lu} WHERE id=${id(req.params.id)} RETURNING id`,
        );
        return r.length ? Response.json({ ok: true }) : refus(req, "message_missing", 404);
      }),
    },
    "/v1/courrier/pieces/:id": {
      GET: auth("lire", async (req: BunRequest<"/v1/courrier/pieces/:id">, a) => {
        const p = await avecCourrier(
          sql,
          a.tenantId,
          a.userId,
          async (tx) => (await tx`SELECT nom,type,contenu FROM courrier_piece WHERE id=${id(req.params.id)}`)[0],
        );
        if (!p) throw new ErreurApi("attachment_missing", [], 404);
        return new Response(new Uint8Array(p.contenu), {
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(p.nom)}`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      }),
    },
    "/v1/courrier/envoyer": {
      POST: auth("lire", async (req, a) => Response.json(await envoyerCourrier(sql, a, await req.json()))),
    },
  };
};
const operation = (summary: string) => ({
  summary,
  responses: {
    "200": { description: "Private result of the unified mailbox" },
    "401": { description: "Session requise" },
  },
});
export const openapi: Chemins = {
  "/v1/courrier/comptes": { get: operation("Lister mes comptes mail") },
  "/v1/courrier/oauth/{fournisseur}/connecter": { post: operation("Connect my mailbox over OAuth, read-only") },
  "/v1/courrier/oauth/{fournisseur}/retour": { get: operation("Validate the consent of my mailbox") },
  "/v1/courrier/comptes/aphrody": { post: operation("Connect my Aphrody mailbox") },
  "/v1/courrier/comptes/{id}": { delete: operation("Disconnect without deleting the messages") },
  "/v1/courrier/comptes/{id}/synchroniser": { post: operation("Synchronize my mailbox") },
  "/v1/courrier/messages": { get: operation("List my unified inbox") },
  "/v1/courrier/messages/{id}": { get: operation("Read my message"), patch: operation("Record the read state in Auto") },
  "/v1/courrier/pieces/{id}": { get: operation("Download my attachment") },
  "/v1/courrier/envoyer": { post: operation("Envoyer via Resend") },
};
