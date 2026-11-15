// Business tools of the agent: each calls the /v1 API with the user's token.
import type { ApiAuto } from "./api";

export interface Outil {
  nom: string;
  description: string;
  /** JSON Schema of the arguments. */
  schema: { type: "object"; properties: Record<string, object>; required?: string[]; additionalProperties?: boolean };
  /** Lecture seule (annotation MCP readOnlyHint). */
  lecture: boolean;
  executer(api: ApiAuto, args: Record<string, unknown>): Promise<unknown>;
}

interface Doc {
  id: string;
  type: string;
  statut: string;
  numero: string | null;
  ttcCents: number;
  data: { date: string; echeance?: string; client: { nom: string }; lignes: { designation: string }[] };
}

const resume = (d: Doc) => ({
  id: d.id,
  type: d.type,
  statut: d.statut,
  numero: d.numero,
  date: d.data.date,
  echeance: d.data.echeance ?? null,
  client: d.data.client.nom,
  ttcCents: d.ttcCents,
});

const id = { type: "string", description: "Identifiant (UUID)" };
const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date AAAA-MM-JJ" };
const TYPES = ["devis", "facture", "acompte", "avoir"];
const STATUTS = ["brouillon", "emis", "envoye", "accepte", "refuse", "depose", "rejete", "paye", "annule"];
const lignes = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    required: ["designation", "quantite", "prixUnitaireHtCents", "tva"],
    properties: {
      designation: { type: "string" },
      quantite: { type: "number" },
      prixUnitaireHtCents: { type: "integer", description: "Prix unitaire HT en centimes (450 € = 45000)" },
      tva: { type: "integer", enum: [0, 21, 55, 100, 200], description: "Rate in tenths of a % (20% = 200)" },
      remiseBp: { type: "integer", description: "Remise en points de base (10 % = 1000)" },
      unite: { type: "string" },
    },
  },
};
const client = {
  type: "object",
  description: "Customer typed in (if no clientId)",
  required: ["nom", "siret", "adresse"],
  properties: {
    nom: { type: "string" },
    siret: { type: "string" },
    adresse: { type: "string" },
    email: { type: "string" },
  },
};

const enc = encodeURIComponent;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function documents(api: ApiAuto, type?: string): Promise<Doc[]> {
  return api.get<Doc[]>(`/v1/documents${type && TYPES.includes(type) ? `?type=${type}` : ""}`);
}

function brouillon(type: "devis" | "facture", a: Record<string, unknown>) {
  const { clientId, client, lignes, ...reste } = a;
  if (!clientId && !client) throw new Error("clientId or client required (use chercher_client)");
  return { ...reste, type, clientId, client, lignes };
}

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export const OUTILS: Outil[] = [
  {
    nom: "chercher_piece_gestion",
    description:
      "Finds the quotes, customer and supplier invoices, sites, delivery notes and order confirmations known to auto, archives included, by reference, third party, site or extracted text. Does not browse a network share that is not connected.",
    lecture: true,
    schema: { type: "object", properties: { q: { type: "string", minLength: 2, maxLength: 200 } }, required: ["q"] },
    executer: (api, a) => api.get("/v1/recherche-gestion?q=" + enc(String(a.q))),
  },
  {
    nom: "consulter_chantier",
    description:
      "Shows a site with its documents, purchases, files and analytics excluding VAT (issued sales, validated purchases, separate orders).",
    lecture: true,
    schema: { type: "object", properties: { id }, required: ["id"] },
    executer: (api, a) => api.get("/v1/chantiers/" + enc(String(a.id))),
  },
  {
    nom: "lister_documents",
    description: "Lists quotes, invoices, down payments and credit notes (summary: number, customer, status, gross total in cents).",
    lecture: true,
    schema: {
      type: "object",
      properties: { type: { type: "string", enum: TYPES }, statut: { type: "string", enum: STATUTS } },
    },
    async executer(api, a) {
      const docs = await documents(api, str(a.type));
      return docs.filter((d) => !a.statut || d.statut === a.statut).map(resume);
    },
  },
  {
    nom: "lire_document",
    description: "Full detail of a document (lines, mentions, totals).",
    lecture: true,
    schema: { type: "object", properties: { id }, required: ["id"] },
    executer: (api, a) => api.get(`/v1/documents/${enc(String(a.id))}`),
  },
  {
    nom: "chercher_document",
    description: "Finds a document by number, customer name or line description.",
    lecture: true,
    schema: {
      type: "object",
      properties: { q: { type: "string" }, type: { type: "string", enum: TYPES } },
      required: ["q"],
    },
    async executer(api, a) {
      const q = String(a.q).toLowerCase();
      const docs = await documents(api, str(a.type));
      return docs
        .filter(
          (d) =>
            d.numero?.toLowerCase().includes(q) ||
            d.data.client.nom.toLowerCase().includes(q) ||
            d.data.lignes.some((l) => l.designation.toLowerCase().includes(q)),
        )
        .map(resume);
    },
  },
  {
    nom: "chercher_client",
    description: "Finds a registered customer by name (returns its id to create a quote or an invoice).",
    lecture: true,
    schema: { type: "object", properties: { q: { type: "string" } } },
    executer: (api, a) => api.get(`/v1/clients${a.q ? `?q=${enc(String(a.q))}` : ""}`),
  },
  {
    nom: "creer_devis",
    description: "Creates a draft quote (unnumbered) for a registered customer (clientId) or a typed-in one.",
    lecture: false,
    schema: {
      type: "object",
      properties: {
        clientId: id,
        chantierId: id,
        client,
        lignes,
        date,
        validiteJours: { type: "integer" },
        notes: { type: "string" },
      },
      required: ["lignes"],
    },
    executer: async (api, a) => resume(await api.post<Doc>("/v1/documents", brouillon("devis", a))),
  },
  {
    nom: "creer_facture",
    description:
      "Creates a draft invoice. Issuing (final number, Factur-X) is done with emettre_document.",
    lecture: false,
    schema: {
      type: "object",
      properties: {
        clientId: id,
        chantierId: id,
        client,
        lignes,
        date,
        echeance: date,
        datePrestation: date,
        origine: { type: "string", description: "Number of the original quote" },
        notes: { type: "string" },
      },
      required: ["lignes"],
    },
    executer: async (api, a) => resume(await api.post<Doc>("/v1/documents", brouillon("facture", a))),
  },
  {
    nom: "emettre_document",
    description: "Issues a draft: final number and frozen copy (Factur-X for an invoice). Irreversible.",
    lecture: false,
    schema: { type: "object", properties: { id }, required: ["id"] },
    executer: async (api, a) => resume(await api.post<Doc>(`/v1/documents/${enc(String(a.id))}/emettre`)),
  },
  {
    nom: "enregistrer_paiement",
    description: "Records a payment received on an issued invoice; returns the amount still due.",
    lecture: false,
    schema: {
      type: "object",
      properties: {
        id,
        montantCents: { type: "integer", minimum: 1 },
        date,
        mode: { type: "string", enum: ["virement", "carte", "cheque", "especes", "prelevement", "autre"] },
        reference: { type: "string" },
      },
      required: ["id", "montantCents"],
    },
    executer: (api, a) =>
      api.post(`/v1/documents/${enc(String(a.id))}/paiements`, {
        montantCents: a.montantCents,
        date: a.date ?? new Date().toISOString().slice(0, 10),
        mode: a.mode ?? "virement",
        reference: a.reference,
      }),
  },
  {
    nom: "lister_relances",
    description: "Overdue unsettled invoices to chase on a date (level 1, 2 or 3).",
    lecture: true,
    schema: { type: "object", properties: { date } },
    executer: (api, a) => api.get(`/v1/relances${a.date ? `?date=${enc(String(a.date))}` : ""}`),
  },
  {
    nom: "relancer",
    description: "Records the reminder of an invoice (level 1, 2 or 3).",
    lecture: false,
    schema: {
      type: "object",
      properties: {
        id,
        niveau: { type: "integer", enum: [1, 2, 3] },
        canal: { type: "string", enum: ["mail", "courrier", "telephone"] },
      },
      required: ["id", "niveau"],
    },
    async executer(api, a) {
      await api.post(`/v1/documents/${enc(String(a.id))}/relances`, { niveau: a.niveau, canal: a.canal });
      return { ok: true };
    },
  },
  {
    nom: "lister_absences",
    description: "Employee absences (leave, RTT, sickness...), filterable by status. Requires the \"rh\" right.",
    lecture: true,
    schema: {
      type: "object",
      properties: { statut: { type: "string", enum: ["demandee", "validee", "refusee", "annulee"] } },
    },
    executer: (api, a) => api.get(`/v1/absences${a.statut ? `?statut=${enc(String(a.statut))}` : ""}`),
  },
  {
    nom: "lister_factures_recues",
    description: "Supplier invoices received (to check, validated, rejected).",
    lecture: true,
    schema: { type: "object", properties: { statut: { type: "string", enum: ["a_verifier", "validee", "rejetee"] } } },
    executer: (api, a) => api.get(`/v1/factures-recues${a.statut ? `?statut=${enc(String(a.statut))}` : ""}`),
  },
  {
    nom: "exporter",
    description: "Exports documents as CSV (separator ;) or JSON, filtered by type and issue period.",
    lecture: true,
    schema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["csv", "json"] },
        type: { type: "string", enum: TYPES },
        du: date,
        au: date,
      },
    },
    async executer(api, a) {
      const docs = (await documents(api, str(a.type)))
        .map(resume)
        .filter((d) => (!a.du || d.date >= String(a.du)) && (!a.au || d.date <= String(a.au)));
      if (a.format === "json") return docs;
      const cols = ["numero", "type", "statut", "date", "echeance", "client", "ttcCents", "id"] as const;
      return [cols.join(";"), ...docs.map((d) => cols.map((c) => csv(d[c])).join(";"))].join("\n");
    },
  },
  {
    nom: "lister_automatisations",
    description: "Automation workflows of the company: trigger, active or not, last run.",
    lecture: true,
    schema: { type: "object", properties: {} },
    executer: (api) => api.get("/v1/automatisations"),
  },
  {
    nom: "catalogue_automatisation",
    description:
      "Node types available to build a workflow (triggers, logic, data, HTTP, Slack, mail, AI, auto actions), parameters as JSON Schema, and ready-made templates.",
    lecture: true,
    schema: { type: "object", properties: {} },
    executer: async (api) => ({
      catalogue: await api.get("/v1/automatisations/catalogue"),
      modeles: await api.get("/v1/automatisations/modeles"),
    }),
  },
  {
    nom: "creer_automatisation",
    description:
      "Creates a workflow from a definition { noeuds: [{ id, type, nom, parametres, position: [x, y] }], connexions: [{ de, sortie, vers }] } with a single trigger. Expressions: {{ $json.champ }}, {{ $secret.nom }}. Created inactive unless actif: true.",
    lecture: false,
    schema: {
      type: "object",
      properties: {
        nom: { type: "string" },
        description: { type: "string" },
        definition: { type: "object" },
        actif: { type: "boolean" },
      },
      required: ["nom", "definition"],
    },
    executer: (api, a) => api.post("/v1/automatisations", a),
  },
  {
    nom: "importer_n8n",
    description:
      "Imports a workflow exported from n8n (JSON nodes + connections): conversion of the common nodes and expressions, one workflow per trigger, created inactive; returns the warnings to handle.",
    lecture: false,
    schema: { type: "object", properties: { workflow: { type: "object" } }, required: ["workflow"] },
    async executer(api, a) {
      const r = await api.post<{
        nom: string;
        definition: unknown;
        avertissements: string[];
        autres: { nom: string; definition: unknown }[];
      }>("/v1/automatisations/importer-n8n", { workflow: a.workflow });
      // One workflow per n8n trigger, all created inactive.
      const automatisations = [];
      for (const w of [r, ...r.autres])
        automatisations.push(
          await api.post("/v1/automatisations", { nom: w.nom, definition: w.definition, actif: false }),
        );
      return { automatisations, avertissements: r.avertissements };
    },
  },
  {
    nom: "executer_automatisation",
    description: "Runs a workflow now with optional input data; returns each step.",
    lecture: false,
    schema: { type: "object", properties: { id, donnees: { type: "object" } }, required: ["id"] },
    executer: (api, a) => api.post(`/v1/automatisations/${enc(String(a.id))}/executer`, { donnees: a.donnees }),
  },
  {
    nom: "lire_execution",
    description: "Detail of a workflow run: status, error, items produced by each node.",
    lecture: true,
    schema: { type: "object", properties: { id }, required: ["id"] },
    executer: (api, a) => api.get(`/v1/executions/${enc(String(a.id))}`),
  },
];

export const outil = (nom: string) => OUTILS.find((o) => o.nom === nom);
