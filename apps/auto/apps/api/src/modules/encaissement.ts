// Online invoice payment: the company's Stripe key (settings), signed payment link, public page
// /facture/<token> (viewing, Factur-X PDF, card payment, confirmation on return from Stripe).
import { ErreurApi } from "../i18n";
import { totaux } from "@auto/domain";
import { DUREE_LIEN_MS, signerLien, verifierLien } from "@auto/services/devis-public";
import { chiffrerCle, confirmerPaiement, creerSessionPaiement, verifierCle } from "@auto/services/encaissement";
import {
  enregistrerEncaissement,
  ErreurMetier,
  lire,
  lireEncaissement,
  lireFichier,
  resteDu,
  supprimerEncaissement,
  withTenant,
  type Sql,
} from "@auto/store";
import { entreprise } from "@auto/tenancy";
import type { BunRequest } from "bun";
import { origineApp, type Chemins, type Module } from "../modules";
import { avecId, brut, cents, objet, op, str } from "../openapi-outils";

const PAYABLE = ["emis", "envoye", "depose"];

async function vue(sql: Sql, tenantId: string, documentId: string) {
  const r = await withTenant(sql, tenantId, async (tx) => {
    const d = await lire(tx, documentId);
    if (!d || !["facture", "acompte"].includes(d.type)) return null;
    return { d, reste: (await resteDu(tx, d.id)).resteCents, actif: !!(await lireEncaissement(tx)) };
  });
  if (!r) throw new ErreurApi("link_invalid_or_expired", [], 404);
  const t = totaux(r.d.data.lignes);
  return {
    numero: r.d.numero,
    statut: r.d.statut,
    emetteur: (await entreprise(sql, tenantId)).nom,
    client: r.d.data.client.nom,
    date: r.d.data.date,
    echeance: r.d.data.echeance ?? null,
    totaux: { htCents: t.htCents, tvaCents: t.tvaCents, ttcCents: t.ttcCents },
    resteCents: r.reste,
    payable: r.actif && r.reste > 0 && PAYABLE.includes(r.d.statut),
  };
}

export const routes: Module = ({ sql, publier, pub, auth }) => {
  async function parJeton(jeton: string) {
    const c = await verifierLien(jeton);
    if (!c) throw new ErreurApi("link_invalid_or_expired", [], 404);
    return c;
  }
  const base = origineApp;

  return {
    "/v1/parametres/encaissement": {
      GET: auth("lire", async (_req, a) => {
        const e = await withTenant(sql, a.tenantId, (tx) => lireEncaissement(tx));
        return Response.json({ actif: !!e, fournisseur: e?.fournisseur ?? null, apercu: e?.apercu ?? null });
      }),
      PUT: auth("parametres", async (req, a) => {
        const { cle } = (await req.json().catch(() => ({}))) as { cle?: string };
        const c = await chiffrerCle(a.tenantId, (cle ?? "").trim());
        await verifierCle((cle ?? "").trim());
        await withTenant(sql, a.tenantId, (tx) => enregistrerEncaissement(tx, c.chiffree, c.apercu));
        return new Response(null, { status: 204 });
      }),
      DELETE: auth("parametres", async (_req, a) => {
        await withTenant(sql, a.tenantId, (tx) => supprimerEncaissement(tx));
        return new Response(null, { status: 204 });
      }),
    },

    "/v1/documents/:id/lien-paiement": {
      POST: auth("ecrire", async (req: BunRequest<"/v1/documents/:id/lien-paiement">, a) => {
        const v = await vue(sql, a.tenantId, req.params.id).catch(() => null);
        if (!v) throw new ErreurApi("invoice_not_found", [], 404);
        if (!v.payable)
          throw new ErreurApi("payment_link_unavailable", [], 409);
        const expire = Date.now() + DUREE_LIEN_MS;
        const jeton = await signerLien({ t: a.tenantId, d: req.params.id, e: expire });
        return Response.json(
          { url: `${base(req)}/facture/${jeton}`, jeton, expire: new Date(expire).toISOString() },
          { status: 201 },
        );
      }),
    },

    "/v1/public/factures/:jeton": {
      GET: pub(async (req: BunRequest<"/v1/public/factures/:jeton">) => {
        const c = await parJeton(req.params.jeton);
        return Response.json(await vue(sql, c.t, c.d), { headers: { "cache-control": "no-store" } });
      }),
    },

    "/v1/public/factures/:jeton/pdf": {
      GET: pub(async (req: BunRequest<"/v1/public/factures/:jeton/pdf">) => {
        const c = await parJeton(req.params.jeton);
        const r = await withTenant(sql, c.t, async (tx) => {
          const d = await lire(tx, c.d);
          return d && ["facture", "acompte"].includes(d.type) ? { d, f: await lireFichier(tx, d.id, "facturx") } : null;
        });
        if (!r?.f) throw new ErreurApi("link_invalid_or_expired", [], 404);
        return new Response(r.f.contenu, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="${r.d.numero}.pdf"`,
            "cache-control": "no-store",
          },
        });
      }),
    },

    "/v1/public/factures/:jeton/paiement": {
      POST: pub(async (req: BunRequest<"/v1/public/factures/:jeton/paiement">) => {
        const c = await parJeton(req.params.jeton);
        const page = `${base(req)}/facture/${req.params.jeton}`;
        const s = await creerSessionPaiement(sql, c.t, c.d, {
          succes: `${page}?session={CHECKOUT_SESSION_ID}`,
          annulation: page,
        });
        if (!s) throw new ErreurApi("online_payment_unavailable", [], 409);
        return Response.json(s, { status: 201 });
      }),
    },

    "/v1/public/factures/:jeton/confirmation": {
      POST: pub(async (req: BunRequest<"/v1/public/factures/:jeton/confirmation">) => {
        const c = await parJeton(req.params.jeton);
        const { session } = (await req.json().catch(() => ({}))) as { session?: string };
        const r = await confirmerPaiement(sql, c.t, c.d, session ?? "", publier);
        return Response.json({ ...(await vue(sql, c.t, c.d)), enregistre: r.enregistre });
      }),
    },
  };
};

const VUE = objet({
  numero: str,
  statut: str,
  emetteur: str,
  client: str,
  date: str,
  echeance: { type: ["string", "null"] },
  totaux: objet({ htCents: cents, tvaCents: cents, ttcCents: cents }),
  resteCents: cents,
  payable: { type: "boolean" },
});
const jeton = (ops: Record<string, unknown>) => avecId(ops, "jeton", str);

export const openapi: Chemins = {
  "/v1/parametres/encaissement": {
    get: op({
      resume: "Online payment: status (key masked)",
      tag: "Settings",
      droit: "lire",
      succes: { 200: objet({ actif: { type: "boolean" }, fournisseur: str, apercu: str }) },
    }),
    put: op({
      resume: "Online payment: save the company's Stripe key (verified with Stripe)",
      tag: "Settings",
      droit: "parametres",
      corps: objet({ cle: str }, ["cle"]),
      succes: { 204: null },
      erreurs: [422, 502],
    }),
    delete: op({
      resume: "Online payment: remove the Stripe key",
      tag: "Settings",
      droit: "parametres",
      succes: { 204: null },
    }),
  },
  "/v1/documents/{id}/lien-paiement": avecId({
    post: op({
      resume: "Create the online payment link of an invoice (30 days)",
      tag: "Documents",
      droit: "ecrire",
      succes: { 201: objet({ url: str, jeton: str, expire: str }) },
      erreurs: [404, 409],
    }),
  }),
  "/v1/public/factures/{jeton}": jeton({
    get: op({
      resume: "Invoice as seen by the client (public link)",
      tag: "Online payment",
      succes: { 200: VUE },
      erreurs: [404],
    }),
  }),
  "/v1/public/factures/{jeton}/pdf": jeton({
    get: op({
      resume: "Factur-X of the invoice (public link)",
      tag: "Online payment",
      succes: { 200: brut("application/pdf") },
      erreurs: [404],
    }),
  }),
  "/v1/public/factures/{jeton}/paiement": jeton({
    post: op({
      resume: "Open a card payment session (Stripe Checkout) for the balance due",
      tag: "Online payment",
      succes: { 201: objet({ url: str }) },
      erreurs: [404, 409, 502],
    }),
  }),
  "/v1/public/factures/{jeton}/confirmation": jeton({
    post: op({
      resume: "Confirm the payment on return from Stripe (session re-read at Stripe, single recording)",
      tag: "Online payment",
      corps: objet({ session: str }, ["session"]),
      succes: { 200: VUE },
      erreurs: [404, 409, 502],
    }),
  }),
};
