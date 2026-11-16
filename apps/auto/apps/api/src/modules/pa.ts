// PA batch: the tenant's connection to its accredited platform, submission of issued invoices, life-cycle
// statuses, signed incoming webhook, invoice reception, directory, e-reporting.
import { ErreurApi, refus } from "../i18n";
import {
  chiffrer,
  estStatut,
  PLATEFORMES,
  plateforme,
  secretAleatoire,
  sha256,
  STATUTS,
  type EvenementPa,
  type Ereporting,
  type Identifiants,
  type Mandat,
  type NomPlateforme,
  type StatutCycle,
} from "@auto/pa";
import {
  connecterPa,
  creerDepot,
  deconnecterPa,
  depotActif,
  depotParIdPa,
  enregistrerEreporting,
  ErreurMetier,
  lire,
  lireConnexionPa,
  lireDepot,
  lireFichier,
  lireRecuePa,
  listerDepots,
  listerEreporting,
  listerRecuesPa,
  statutsDepot,
  withTenant,
} from "@auto/store";
import { entreprise } from "@auto/tenancy";
import type { BunRequest } from "bun";
import type { Module, Chemins } from ".";
import { avecId, brut, enumere, liste, objet, op, uuid } from "../openapi-outils";
import {
  type EvenementLot,
  UUID,
  VENDEUR,
  cleMaitre,
  options,
  pa,
  connexion,
  synchroniser,
  exigerConnexion,
  appliquerStatut,
  reporter,
  recevoir,
  lireMandat,
} from "@auto/services/pa";

export const routes: Module = ({ sql, publier, pub, auth }) => {
  /** Publication outside the business transaction: the event enters the outbox through its own transaction. */
  const emettre = (type: EvenementLot, tenantId: string, data: unknown) =>
    withTenant(sql, tenantId, (tx) => publier(tx, type, data));

  return {
    "/v1/pa": {
      GET: auth("lire", async (req, a) => {
        const c = await withTenant(sql, a.tenantId, (tx) => lireConnexionPa(tx));
        if (!c) return refus(req, "no_platform_connected", 404);
        return Response.json({
          plateforme: c.plateforme,
          mandat: c.mandat,
          mandatReference: c.mandatReference,
          connecteLe: c.connecteLe,
          webhook: `/v1/pa/webhook/${a.tenantId}`,
        });
      }),
      PUT: auth("parametres", async (req, a) => {
        const b = (await req.json()) as {
          plateforme: NomPlateforme;
          identifiants?: Record<string, string>;
          mandat?: Partial<Mandat>;
        };
        if (!PLATEFORMES.includes(b.plateforme))
          throw new ErreurApi("unknown_platform", [`expected: ${PLATEFORMES.join(", ")}`]);
        // The simulated PA serves development and tests: in production only real PAs connect.
        if (b.plateforme === "mock" && Bun.env.NODE_ENV === "production")
          throw new ErreurApi("simulated_platform_unavailable", ["expected: b2brouter"]);
        const e = await entreprise(sql, a.tenantId);
        const mandat = lireMandat(b.mandat, e.siret.slice(0, 9));
        // Mock: account and webhook secret fixed by the server (one simulated account per tenant).
        const ids: Identifiants =
          b.plateforme === "mock"
            ? { compte: a.tenantId, secretWebhook: secretAleatoire() }
            : {
                cleApi: b.identifiants?.cleApi ?? "",
                compte: b.identifiants?.compte ?? "",
                secretWebhook: b.identifiants?.secretWebhook ?? "",
              };
        const p = await pa(async () => plateforme(b.plateforme, ids, options()));
        const { reference } = await pa(() => p.mandater(mandat));
        const chiffre = await chiffrer(cleMaitre(), a.tenantId, ids);
        await withTenant(sql, a.tenantId, (tx) =>
          connecterPa(tx, a.userId, {
            plateforme: b.plateforme,
            identifiants: chiffre,
            mandat,
            mandatReference: reference,
          }),
        );
        return Response.json({
          plateforme: b.plateforme,
          mandat,
          mandatReference: reference,
          webhook: `/v1/pa/webhook/${a.tenantId}`,
          // Secret to carry over to the simulated PA; for a real PA, the PA provides it.
          ...(b.plateforme === "mock" ? { secretWebhook: (ids as { secretWebhook: string }).secretWebhook } : {}),
        });
      }),
      DELETE: auth("parametres", async (req, a) => {
        const ok = await withTenant(sql, a.tenantId, (tx) => deconnecterPa(tx, a.userId));
        return ok
          ? new Response(null, { status: 204 })
          : refus(req, "no_connection", 404);
      }),
    },

    "/v1/pa/depots": {
      GET: auth("lire", async (req, a) => Response.json(await withTenant(sql, a.tenantId, (tx) => listerDepots(tx)))),
      POST: auth("ecrire", async (req, a) => {
        const { documentId } = (await req.json()) as { documentId: string };
        if (!UUID.test(documentId ?? "")) throw new ErreurApi("invalid_document_id");
        // Document locked during submission: two simultaneous submissions of the same invoice are excluded.
        const d = await withTenant(sql, a.tenantId, async (tx) => {
          await tx`SELECT id FROM document WHERE id = ${documentId} FOR UPDATE`;
          const doc = await lire(tx, documentId);
          if (!doc) throw new ErreurApi("document_not_found", [], 404);
          if (doc.type === "devis" || doc.statut === "brouillon")
            throw new ErreurApi("deposit_issued_only", [], 409);
          if (await depotActif(tx, documentId)) throw new ErreurApi("invoice_already_deposited", [], 409);
          const f = await lireFichier(tx, documentId, "facturx");
          if (!f) throw new ErreurApi("facturx_copy_not_found", [], 409);
          const c = await exigerConnexion(tx, a.tenantId);
          const siren = doc.data.client.siret?.replace(/\s/g, "").slice(0, 9) || null;
          const r = await pa(() => c.p.deposer({ facturx: f.contenu, numero: doc.numero!, destinataireSiren: siren }));
          const depot = await creerDepot(tx, a.userId, {
            documentId,
            plateforme: c.nom,
            idPa: r.idPa,
            sha256: sha256(f.contenu),
            premier: {
              statut: r.statut,
              code: STATUTS[r.statut],
              motif: r.motif,
              source: "depot",
              at: new Date().toISOString(),
            },
          });
          await reporter(tx, a.userId, documentId, r.statut);
          return depot;
        });
        await emettre("pa.statut", a.tenantId, d);
        return Response.json(d, { status: 201 });
      }),
    },

    "/v1/pa/depots/:id": {
      GET: auth("lire", async (req: BunRequest<"/v1/pa/depots/:id">, a) => {
        if (!UUID.test(req.params.id)) return refus(req, "not_found", 404);
        const r = await withTenant(sql, a.tenantId, async (tx) => {
          const d = await lireDepot(tx, req.params.id);
          return d && { ...d, statuts: await statutsDepot(tx, d.id) };
        });
        return r ? Response.json(r) : refus(req, "not_found", 404);
      }),
    },

    "/v1/pa/depots/:id/statut": {
      POST: auth("ecrire", async (req: BunRequest<"/v1/pa/depots/:id/statut">, a) => {
        const { statut, motif } = (await req.json()) as { statut: StatutCycle; motif?: string };
        if (!VENDEUR.includes(statut)) throw new ErreurApi("status_expected_one_of", [], 422, { values: VENDEUR.join(", ") });
        if (!UUID.test(req.params.id)) throw new ErreurApi("deposit_not_found", [], 404);
        const d = await withTenant(sql, a.tenantId, async (tx) => {
          const dep = await lireDepot(tx, req.params.id);
          if (!dep) throw new ErreurApi("deposit_not_found", [], 404);
          const c = await exigerConnexion(tx, a.tenantId);
          await pa(() => c.p.signaler(dep.idPa, statut, motif));
          return appliquerStatut(tx, dep.id, dep.documentId, {
            statut,
            motif,
            source: "vendeur",
            at: new Date().toISOString(),
          });
        });
        if (d) await emettre("pa.statut", a.tenantId, d);
        return Response.json(d);
      }),
    },

    "/v1/pa/synchroniser": {
      POST: auth("ecrire", async (req, a) => Response.json(await synchroniser(sql, publier, a.tenantId))),
    },

    "/v1/pa/webhook/:tenant": {
      POST: pub(async (req: BunRequest<"/v1/pa/webhook/:tenant">) => {
        const tenantId = req.params.tenant;
        if (!UUID.test(tenantId)) return refus(req, "not_found", 404);
        const corps = await req.text();
        const c = await withTenant(sql, tenantId, (tx) => connexion(tx, tenantId));
        if (!c) return refus(req, "not_found", 404);
        let evs: EvenementPa[] | null;
        try {
          evs = await c.p.webhook(corps, req.headers);
        } catch {
          evs = null;
        }
        if (!evs) return refus(req, "invalid_signature", 401);
        let traites = 0;
        for (const ev of evs) {
          if (ev.type === "statut") {
            if (!estStatut(ev.statut)) continue;
            const d = await withTenant(sql, tenantId, async (tx) => {
              const dep = await depotParIdPa(tx, c.nom, ev.idPa);
              return dep && appliquerStatut(tx, dep.id, dep.documentId, { ...ev, source: "webhook", at: ev.date });
            });
            if (d) {
              traites++;
              await emettre("pa.statut", tenantId, d);
            }
          } else {
            const r = await recevoir(sql, tenantId, c, ev.idPa, ev.date);
            if (r) {
              traites++;
              await emettre("facture.recue", tenantId, r);
            }
          }
        }
        return Response.json({ traites });
      }),
    },

    "/v1/pa/recues": {
      GET: auth("lire", async (req, a) =>
        Response.json(await withTenant(sql, a.tenantId, (tx) => listerRecuesPa(tx))),
      ),
    },
    "/v1/pa/recues/:id": {
      GET: auth("lire", async (req: BunRequest<"/v1/pa/recues/:id">, a) => {
        const r =
          UUID.test(req.params.id) && (await withTenant(sql, a.tenantId, (tx) => lireRecuePa(tx, req.params.id)));
        if (!r) return refus(req, "not_found", 404);
        const { contenu: _, ...meta } = r;
        return Response.json(meta);
      }),
    },
    "/v1/pa/recues/:id/pdf": {
      GET: auth("lire", async (req: BunRequest<"/v1/pa/recues/:id/pdf">, a) => {
        const r =
          UUID.test(req.params.id) && (await withTenant(sql, a.tenantId, (tx) => lireRecuePa(tx, req.params.id)));
        if (!r) return refus(req, "not_found", 404);
        return new Response(r.contenu, { headers: { "content-type": "application/pdf", etag: `"${r.sha256}"` } });
      }),
    },

    "/v1/pa/annuaire/:siren": {
      GET: auth("lire", async (req: BunRequest<"/v1/pa/annuaire/:siren">, a) => {
        if (!/^\d{9}$/.test(req.params.siren)) throw new ErreurApi("siren_expected");
        const c = await withTenant(sql, a.tenantId, (tx) => exigerConnexion(tx, a.tenantId));
        const r = await pa(() => c.p.annuaire(req.params.siren));
        return r ? Response.json(r) : refus(req, "not_in_directory", 404);
      }),
    },

    "/v1/pa/ereporting": {
      GET: auth("lire", async (req, a) =>
        Response.json(await withTenant(sql, a.tenantId, (tx) => listerEreporting(tx))),
      ),
      POST: auth("ecrire", async (req, a) => {
        const e = (await req.json()) as Ereporting;
        if (e.nature !== "b2c" && e.nature !== "international")
          throw new ErreurApi("nature_expected");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.periode ?? "")) throw new ErreurApi("month_expected");
        if (!Array.isArray(e.lignes) || e.lignes.some((l) => ![l.tva, l.htCents, l.tvaCents].every(Number.isInteger)))
          throw new ErreurApi("lines_integers");
        const decl = { nature: e.nature, periode: e.periode, lignes: e.lignes };
        const c = await withTenant(sql, a.tenantId, (tx) => exigerConnexion(tx, a.tenantId));
        const r = await pa(() => c.p.ereporting(decl));
        const out = await withTenant(sql, a.tenantId, (tx) =>
          enregistrerEreporting(tx, a.userId, {
            plateforme: c.nom,
            idPa: r.idPa,
            statut: r.statut,
            nature: decl.nature,
            periode: decl.periode,
            data: decl,
          }),
        );
        return Response.json(out, { status: 201 });
      }),
    },
  };
};

/** OpenAPI description of the batch routes. */
export const openapi: Chemins = {
  "/v1/pa": {
    get: op({
      resume: "Connected accredited platform (without secrets)",
      tag: "PA",
      droit: "lire",
      succes: { 200: objet({}) },
    }),
    put: op({
      resume: "Connect a PA (b2brouter; mock outside production) with the mandate; credentials encrypted at rest",
      tag: "PA",
      droit: "parametres",
      corps: objet({ plateforme: enumere("mock", "b2brouter"), identifiants: objet({}), mandat: objet({}) }, [
        "plateforme",
      ]),
      succes: { 200: objet({}) },
      erreurs: [422],
    }),
    delete: op({ resume: "Disconnect the PA", tag: "PA", droit: "parametres", succes: { 204: null } }),
  },
  "/v1/pa/depots": {
    get: op({
      resume: "Invoice submissions to the PA",
      tag: "PA",
      droit: "lire",
      succes: { 200: liste(objet({})) },
    }),
    post: op({
      resume: "Submit an issued invoice (frozen Factur-X copy)",
      tag: "PA",
      droit: "ecrire",
      corps: objet({ documentId: uuid }, ["documentId"]),
      succes: { 201: objet({}) },
      erreurs: [404, 409, 422],
    }),
  },
  "/v1/pa/depots/{id}": avecId({
    get: op({ resume: "Submission and its statuses", tag: "PA", droit: "lire", succes: { 200: objet({}) }, erreurs: [404] }),
  }),
  "/v1/pa/depots/{id}/statut": avecId({
    post: op({
      resume: "Fetch the status of a submission from the PA",
      tag: "PA",
      droit: "ecrire",
      succes: { 200: objet({}) },
      erreurs: [404],
    }),
  }),
  "/v1/pa/synchroniser": {
    post: op({
      resume: "Fetch statuses and incoming invoices (without webhook)",
      tag: "PA",
      droit: "ecrire",
      succes: { 200: objet({}) },
    }),
  },
  "/v1/pa/webhook/{tenant}": avecId(
    {
      post: op({
        resume: "PA webhook (signature verified with the tenant secret)",
        tag: "PA",
        corps: objet({}),
        succes: { 200: objet({}) },
        erreurs: [400, 401],
      }),
    },
    "tenant",
  ),
  "/v1/pa/recues": {
    get: op({ resume: "Invoices received by the PA", tag: "PA", droit: "lire", succes: { 200: liste(objet({})) } }),
  },
  "/v1/pa/recues/{id}": avecId({
    get: op({
      resume: "Invoice received by the PA",
      tag: "PA",
      droit: "lire",
      succes: { 200: objet({}) },
      erreurs: [404],
    }),
  }),
  "/v1/pa/recues/{id}/pdf": avecId({
    get: op({
      resume: "Received Factur-X",
      tag: "PA",
      droit: "lire",
      succes: { 200: brut("application/pdf") },
      erreurs: [404],
    }),
  }),
  "/v1/pa/annuaire/{siren}": avecId(
    {
      get: op({
        resume: "Directory: receiving platform of a SIREN",
        tag: "PA",
        droit: "lire",
        succes: { 200: objet({}) },
        erreurs: [404],
      }),
    },
    "siren",
    { type: "string", pattern: "^[0-9]{9}$" },
  ),
  "/v1/pa/ereporting": {
    get: op({ resume: "Transmissions d'e-reporting", tag: "PA", droit: "lire", succes: { 200: liste(objet({})) } }),
    post: op({
      resume: "Transmit an e-reporting (B2C, international)",
      tag: "PA",
      droit: "ecrire",
      corps: objet({}),
      succes: { 201: objet({}) },
      erreurs: [422],
    }),
  },
};
