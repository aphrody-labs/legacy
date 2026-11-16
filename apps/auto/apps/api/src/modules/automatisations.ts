// Automations (n8n-like workflows): editing, trial, execution, history, secrets and incoming webhooks.
// The engine and its catalog are in @aphrody/automate; actual execution in @auto/services/automatisations.
import { ErreurApi } from "../i18n";
import { catalogueJson, Definition, estN8n, importerN8n, MODELES, valider, type Element } from "@aphrody/automate";
import {
  chiffrerSecret,
  ecriture,
  elementWebhook,
  essayer,
  lancer,
  signerCrochet,
  verifierCrochet,
} from "@auto/services/automatisations";
import {
  creerAutomatisation,
  enfiler,
  enregistrerSecret,
  JOB_AUTOMATISATION,
  lireAutomatisation,
  lireVersion,
  listerVersions,
  lireExecution,
  listerAutomatisations,
  listerBases,
  listerExecutions,
  listerSecrets,
  modifierAutomatisation,
  supprimerAutomatisation,
  supprimerConnaissance,
  supprimerSecret,
  withTenant,
  type ChargeExecution,
} from "@auto/store";
import type { BunRequest } from "bun";
import { z } from "zod";
import { origineApp, type Chemins, type Module } from "../modules";
import { avecId, enumere, liste, objet, op, param, str } from "../openapi-outils";

type Corps = { nom?: unknown; description?: unknown; actif?: unknown; definition?: unknown; donnees?: unknown };

/** Trial data of a manual run: an object (one item) or a list of objects. */
function entree(donnees: unknown): Element[] {
  if (donnees == null) return [{ json: {} }];
  const liste = Array.isArray(donnees) ? donnees : [donnees];
  if (liste.length > 100 || liste.some((d) => !d || typeof d !== "object" || Array.isArray(d)))
    throw new ErreurApi("data_object_or_list");
  return liste.map((d) => ({ json: d as Record<string, unknown> }));
}

export const routes: Module = ({ sql, auth, pub }) => ({
  "/v1/automatisations": {
    GET: auth("lire", async (_req, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => listerAutomatisations(tx))),
    ),
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as Corps;
      const w = await withTenant(sql, a.tenantId, async (tx) =>
        creerAutomatisation(tx, a.userId, await ecriture(tx, b)),
      );
      return Response.json(w, { status: 201 });
    }),
  },
  "/v1/automatisations/catalogue": { GET: auth("lire", async () => Response.json(catalogueJson())) },
  "/v1/automatisations/modeles": { GET: auth("lire", async () => Response.json(MODELES)) },
  "/v1/automatisations/essai": {
    POST: auth("ecrire", async (req, a) => {
      const b = (await req.json()) as Corps;
      return Response.json(await essayer(sql, a.tenantId, a.userId, b.definition, entree(b.donnees)));
    }),
  },
  "/v1/automatisations/importer-n8n": {
    POST: auth("ecrire", async (req) => {
      const b = (await req.json()) as { workflow?: unknown };
      if (!estN8n(b.workflow)) throw new ErreurApi("workflow_export_expected");
      if (b.workflow.nodes.length > 100) throw new ErreurApi("max_100_nodes");
      return Response.json(importerN8n(b.workflow));
    }),
  },
  "/v1/automatisations/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/automatisations/:id">, a) => {
      const w = await withTenant(sql, a.tenantId, (tx) => lireAutomatisation(tx, req.params.id));
      if (!w) throw new ErreurApi("automation_not_found", [], 404);
      return Response.json(w);
    }),
    PUT: auth("ecrire", async (req: BunRequest<"/v1/automatisations/:id">, a) => {
      const b = (await req.json()) as Corps;
      const w = await withTenant(sql, a.tenantId, async (tx) => {
        const avant = await lireAutomatisation(tx, req.params.id);
        if (!avant) throw new ErreurApi("automation_not_found", [], 404);
        return modifierAutomatisation(tx, a.userId, avant.id, await ecriture(tx, b, avant));
      });
      return Response.json(w);
    }),
    DELETE: auth("ecrire", async (req: BunRequest<"/v1/automatisations/:id">, a) => {
      await withTenant(sql, a.tenantId, (tx) => supprimerAutomatisation(tx, a.userId, req.params.id));
      return new Response(null, { status: 204 });
    }),
  },
  "/v1/automatisations/:id/executer": {
    POST: auth("ecrire", async (req: BunRequest<"/v1/automatisations/:id/executer">, a) => {
      const b = (await req.json().catch(() => ({}))) as Corps;
      const { execution } = await lancer(sql, {
        tenantId: a.tenantId,
        automatisationId: req.params.id,
        origine: "manuel",
        entree: entree(b.donnees),
        signal: AbortSignal.timeout(120_000),
      });
      return Response.json(execution);
    }),
  },
  "/v1/automatisations/:id/versions": {
    GET: auth("lire", async (req: BunRequest<"/v1/automatisations/:id/versions">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => listerVersions(tx, req.params.id))),
    ),
  },
  "/v1/automatisations/:id/versions/:numero/restaurer": {
    // A restore is a change like any other: the replaced state itself becomes a version.
    POST: auth("ecrire", async (req: BunRequest<"/v1/automatisations/:id/versions/:numero/restaurer">, a) => {
      const w = await withTenant(sql, a.tenantId, async (tx) => {
        const avant = await lireAutomatisation(tx, req.params.id);
        if (!avant) throw new ErreurApi("automation_not_found", [], 404);
        const v = await lireVersion(tx, avant.id, Number(req.params.numero));
        if (!v) throw new ErreurApi("version_not_found", [], 404);
        const b = { nom: v.nom, description: v.description, definition: v.definition };
        return modifierAutomatisation(tx, a.userId, avant.id, await ecriture(tx, b, avant));
      });
      return Response.json(w);
    }),
  },
  "/v1/automatisations/:id/executions": {
    GET: auth("lire", async (req: BunRequest<"/v1/automatisations/:id/executions">, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => listerExecutions(tx, req.params.id))),
    ),
  },
  "/v1/automatisations/:id/webhook": {
    GET: auth("ecrire", async (req: BunRequest<"/v1/automatisations/:id/webhook">, a) => {
      const w = await withTenant(sql, a.tenantId, (tx) => lireAutomatisation(tx, req.params.id));
      if (!w) throw new ErreurApi("automation_not_found", [], 404);
      const jeton = await signerCrochet({ t: a.tenantId, a: w.id });
      return Response.json({ url: `${origineApp(req)}/v1/public/crochets/${jeton}` });
    }),
  },
  "/v1/executions/:id": {
    GET: auth("lire", async (req: BunRequest<"/v1/executions/:id">, a) => {
      const e = await withTenant(sql, a.tenantId, (tx) => lireExecution(tx, req.params.id));
      if (!e) throw new ErreurApi("run_not_found", [], 404);
      return Response.json(e);
    }),
  },

  "/v1/secrets": {
    GET: auth("parametres", async (_req, a) =>
      Response.json(await withTenant(sql, a.tenantId, (tx) => listerSecrets(tx))),
    ),
    POST: auth("parametres", async (req, a) => {
      const b = (await req.json()) as { nom?: unknown; valeur?: unknown };
      const valeur = typeof b.valeur === "string" ? b.valeur : "";
      // 32,000: a PKCS #12 certificate in base64 with its chain ("Sign a PDF" node).
      if (!valeur || valeur.length > 32_000) throw new ErreurApi("value_length");
      const chiffre = await chiffrerSecret(a.tenantId, valeur);
      const s = await withTenant(sql, a.tenantId, (tx) =>
        enregistrerSecret(tx, a.userId, String(b.nom ?? ""), chiffre),
      );
      return Response.json(s, { status: 201 });
    }),
  },
  "/v1/secrets/:id": {
    DELETE: auth("parametres", async (req: BunRequest<"/v1/secrets/:id">, a) => {
      await withTenant(sql, a.tenantId, (tx) => supprimerSecret(tx, a.userId, req.params.id));
      return new Response(null, { status: 204 });
    }),
  },

  // Knowledge bases (ia.indexer, ia.rechercher nodes): counts per base, deletion of a base or a source.
  "/v1/connaissances": {
    GET: auth("lire", async (_req, a) => Response.json(await withTenant(sql, a.tenantId, (tx) => listerBases(tx)))),
  },
  "/v1/connaissances/:base": {
    DELETE: auth("ecrire", async (req: BunRequest<"/v1/connaissances/:base">, a) => {
      const source = new URL(req.url).searchParams.get("source") ?? undefined;
      const morceaux = await withTenant(sql, a.tenantId, (tx) =>
        supprimerConnaissance(tx, a.userId, req.params.base, source),
      );
      return Response.json({ morceaux });
    }),
  },

  // Incoming webhook: the secret URL carries the tenant and the workflow (signed token, stateless).
  "/v1/public/crochets/:jeton": Object.fromEntries(
    ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => [
      m,
      pub(async (req: BunRequest<"/v1/public/crochets/:jeton">) => {
        const c = await verifierCrochet(req.params.jeton);
        if (!c) throw new ErreurApi("webhook_not_found", [], 404);
        const w = await withTenant(sql, c.t, (tx) => lireAutomatisation(tx, c.a));
        if (!w || w.declencheur !== "webhook") throw new ErreurApi("webhook_not_found", [], 404);
        if (!w.actif) throw new ErreurApi("workflow_inactive", [], 409);
        const el = await elementWebhook(req);
        const def = valider(w.definition);
        const reponse = (def.noeuds.find((n) => n.type === "declencheur.webhook")?.parametres as { reponse?: string })
          ?.reponse;
        if (reponse === "fin") {
          const { execution, resultat } = await lancer(sql, {
            tenantId: c.t,
            automatisationId: w.id,
            origine: "webhook",
            entree: [el],
            signal: AbortSignal.timeout(30_000),
          });
          if (resultat.statut === "erreur")
            return Response.json({ erreur: execution.erreur, execution: execution.id }, { status: 500 });
          const sortie = resultat.sortie.map((e) => e.json);
          return Response.json(sortie.length === 1 ? sortie[0] : sortie);
        }
        const charge: ChargeExecution = { automatisationId: w.id, origine: "webhook", entree: [el] };
        await withTenant(sql, c.t, (tx) => enfiler(tx, JOB_AUTOMATISATION, charge, { maxEssais: 3 }));
        return Response.json({ recu: true }, { status: 202 });
      }),
    ]),
  ),
});

const DEFINITION = z.toJSONSchema(Definition, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
const STATUT = enumere("en_cours", "succes", "erreur");
const DECLENCHEUR = enumere("manuel", "evenement", "planifie", "webhook");
const RESUME = objet({
  id: str,
  nom: str,
  description: str,
  actif: { type: "boolean" },
  declencheur: DECLENCHEUR,
  createdAt: str,
  updatedAt: str,
  derniereExecution: { ...objet({ id: str, statut: STATUT, debut: str }), nullable: true },
});
const AUTOMATISATION = objet({
  id: str,
  nom: str,
  description: str,
  actif: { type: "boolean" },
  declencheur: DECLENCHEUR,
  definition: DEFINITION,
  createdAt: str,
  updatedAt: str,
});
const ETAPE = objet({
  noeud: str,
  nom: str,
  type: str,
  debut: str,
  dureeMs: { type: "number" },
  entree: { type: "integer" },
  sorties: liste({ type: "integer" }),
  apercu: liste({ type: "object" }),
  erreur: str,
});
const EXECUTION = objet({
  id: str,
  automatisationId: str,
  origine: str,
  statut: STATUT,
  erreur: { type: "string", nullable: true },
  debut: str,
  fin: { type: "string", nullable: true },
  etapes: liste(ETAPE),
});
const VERSION = objet({
  numero: { type: "integer" },
  nom: str,
  description: str,
  definition: DEFINITION,
  auteur: { type: "string", nullable: true },
  createdAt: str,
});
const ECRITURE = objet({ nom: str, description: str, actif: { type: "boolean" }, definition: DEFINITION }, [
  "nom",
  "definition",
]);
const DONNEES = objet({ donnees: { description: "Object or list of objects: trigger items" } });
const T = "Automations";

/** OpenAPI description of the module routes. */
export const openapi: Chemins = {
  "/v1/automatisations": {
    get: op({ resume: "Company workflows", tag: T, droit: "lire", succes: { 200: liste(RESUME) } }),
    post: op({
      resume: "Create a workflow (validated definition: nodes, connections, one trigger, no cycle)",
      tag: T,
      droit: "ecrire",
      corps: ECRITURE,
      succes: { 201: AUTOMATISATION },
      erreurs: [422],
    }),
  },
  "/v1/automatisations/catalogue": {
    get: op({
      resume: "Available node types, parameters as JSON Schema",
      tag: T,
      droit: "lire",
      succes: { 200: liste({ type: "object" }) },
    }),
  },
  "/v1/automatisations/modeles": {
    get: op({
      resume: "Ready-to-use workflow templates",
      tag: T,
      droit: "lire",
      succes: { 200: liste({ type: "object" }) },
    }),
  },
  "/v1/automatisations/essai": {
    post: op({
      resume: "Try a definition without saving it",
      tag: T,
      droit: "ecrire",
      corps: objet({ definition: DEFINITION, donnees: {} }, ["definition"]),
      succes: { 200: EXECUTION },
      erreurs: [422],
    }),
  },
  "/v1/automatisations/importer-n8n": {
    post: op({
      resume: "Convert a workflow exported from n8n into an auto definition (nothing is saved)",
      tag: T,
      droit: "ecrire",
      corps: objet({ workflow: { type: "object" } }, ["workflow"]),
      succes: {
        200: objet({
          nom: str,
          definition: DEFINITION,
          avertissements: liste(str),
          autres: liste(objet({ nom: str, definition: DEFINITION })),
        }),
      },
      erreurs: [422],
    }),
  },
  "/v1/automatisations/{id}": avecId({
    get: op({ resume: "Read a workflow", tag: T, droit: "lire", succes: { 200: AUTOMATISATION }, erreurs: [404] }),
    put: op({
      resume: "Edit a workflow (partial fields)",
      tag: T,
      droit: "ecrire",
      corps: objet({ nom: str, description: str, actif: { type: "boolean" }, definition: DEFINITION }),
      succes: { 200: AUTOMATISATION },
      erreurs: [404, 422],
    }),
    delete: op({ resume: "Delete a workflow", tag: T, droit: "ecrire", succes: { 204: null }, erreurs: [404] }),
  }),
  "/v1/automatisations/{id}/executer": avecId({
    post: op({
      resume: "Run now (manual run, synchronous)",
      tag: T,
      droit: "ecrire",
      corps: DONNEES,
      succes: { 200: EXECUTION },
      erreurs: [404],
    }),
  }),
  "/v1/automatisations/{id}/versions": avecId({
    get: op({
      resume: "Previous versions (50 at most), most recent first",
      tag: T,
      droit: "lire",
      succes: { 200: liste(VERSION) },
    }),
  }),
  "/v1/automatisations/{id}/versions/{numero}/restaurer": {
    parameters: [param("id"), param("numero", { type: "integer" })],
    post: op({
      resume: "Restore a version (the replaced state itself becomes a version)",
      tag: T,
      droit: "ecrire",
      succes: { 200: AUTOMATISATION },
      erreurs: [404, 422],
    }),
  },
  "/v1/automatisations/{id}/executions": avecId({
    get: op({ resume: "Run history", tag: T, droit: "lire", succes: { 200: liste(EXECUTION) } }),
  }),
  "/v1/automatisations/{id}/webhook": avecId({
    get: op({
      resume: "Secret URL of the incoming webhook",
      tag: T,
      droit: "ecrire",
      succes: { 200: objet({ url: str }) },
      erreurs: [404],
    }),
  }),
  "/v1/executions/{id}": avecId({
    get: op({
      resume: "Detail of a run, step by step",
      tag: T,
      droit: "lire",
      succes: { 200: EXECUTION },
      erreurs: [404],
    }),
  }),
  "/v1/secrets": {
    get: op({
      resume: "Workflow secrets (names only)",
      tag: T,
      droit: "parametres",
      succes: { 200: liste(objet({ id: str, nom: str, createdAt: str })) },
    }),
    post: op({
      resume: "Save a secret (encrypted, referenced as {{ $secret.nom }})",
      tag: T,
      droit: "parametres",
      corps: objet({ nom: str, valeur: str }, ["nom", "valeur"]),
      succes: { 201: objet({ id: str, nom: str, createdAt: str }) },
      erreurs: [422],
    }),
  },
  "/v1/secrets/{id}": avecId({
    delete: op({ resume: "Delete a secret", tag: T, droit: "parametres", succes: { 204: null }, erreurs: [404] }),
  }),
  "/v1/connaissances": {
    get: op({
      resume: "Company knowledge bases: sources, chunks, embedding model and dimension",
      tag: T,
      droit: "lire",
      succes: {
        200: liste(
          objet({
            base: str,
            sources: { type: "integer" },
            morceaux: { type: "integer" },
            modele: str,
            dimension: { type: "integer" },
            majAt: str,
          }),
        ),
      },
    }),
  },
  "/v1/connaissances/{base}": avecId(
    {
      delete: op({
        resume: "Delete a knowledge base, or just one of its sources with ?source=",
        tag: T,
        droit: "ecrire",
        requete: [{ nom: "source", schema: str, description: "Single source to delete (name given at indexing)" }],
        succes: { 200: objet({ morceaux: { type: "integer", description: "Chunks deleted" } }) },
        erreurs: [404, 422],
      }),
    },
    "base",
    { type: "string", pattern: "^[a-z0-9_-]{1,60}$" },
  ),
  "/v1/public/crochets/{jeton}": avecId(
    Object.fromEntries(
      ["get", "post", "put", "patch", "delete"].map((m) => [
        m,
        op({
          resume: "Incoming webhook of a workflow (202: run queued; \"end\" answer: workflow output)",
          tag: T,
          succes: { 200: { type: "object" }, 202: objet({ recu: { type: "boolean" } }) },
          erreurs: [404, 409],
        }),
      ]),
    ),
    "jeton",
    str,
  ),
};
