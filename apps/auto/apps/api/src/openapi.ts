// OpenAPI 3.1 description of the /v1 API, served at GET /v1/openapi.json and written to docs/openapi.json
// (bun scripts/openapi.ts). A batch module documents its routes through `export const openapi: Chemins`.
// openapi.test.ts fails if a creerApp route is not described here.
import { MODULES } from "./app";
import type { Chemins } from "./modules";

import {
  ref,
  liste,
  json,
  str,
  uuid,
  date,
  cents,
  objet,
  enumere,
  tva,
  brut,
  op,
  avecId,
  type Schema,
} from "./openapi-outils";

const SCHEMAS: Record<string, Schema> = {
  Erreur: objet({ erreur: str, details: liste(str) }, ["erreur"]),
  Partie: objet(
    {
      nom: str,
      siret: { type: "string", pattern: "^\\d{14}$" },
      adresse: str,
      adresseLivraison: str,
      tvaIntracom: str,
      email: { type: "string", format: "email" },
    },
    ["nom", "siret", "adresse"],
  ),
  Ligne: objet(
    {
      designation: str,
      quantite: { type: "number" },
      prixUnitaireHtCents: cents,
      remiseBp: { type: "integer", description: "Discount in basis points (1000 = 10%)" },
      tva,
      unite: str,
    },
    ["designation", "quantite", "prixUnitaireHtCents", "tva"],
  ),
  TypeDocument: enumere("devis", "facture", "acompte", "avoir"),
  Statut: enumere("brouillon", "emis", "envoye", "accepte", "refuse", "depose", "rejete", "paye", "annule"),
  Document: objet(
    {
      type: ref("TypeDocument"),
      date,
      emetteur: ref("Partie"),
      client: ref("Partie"),
      lignes: liste(ref("Ligne")),
      datePrestation: date,
      echeance: date,
      conditionsPaiement: str,
      penalitesRetard: str,
      escompte: str,
      franchiseTva: { type: "boolean" },
      origine: { type: "string", description: "Credit note: number of the corrected invoice" },
      validiteJours: { type: "integer" },
      notes: str,
    },
    ["type", "date", "emetteur", "client", "lignes"],
  ),
  DocumentEntree: {
    description:
      "Issuer imposed by the company record; `clientId` re-reads the saved client; `chantierId` assigns the draft in the same transaction, without freezing this assignment in its content.",
    ...objet(
      {
        type: ref("TypeDocument"),
        date,
        client: ref("Partie"),
        clientId: { type: ["string", "null"], format: "uuid" },
        chantierId: { type: ["string", "null"], format: "uuid" },
        lignes: liste(ref("Ligne")),
        datePrestation: date,
        echeance: date,
        conditionsPaiement: str,
        penalitesRetard: str,
        escompte: str,
        origine: str,
        validiteJours: { type: "integer" },
        notes: str,
      },
      ["type", "lignes"],
    ),
  },
  Totaux: objet(
    {
      htCents: cents,
      tvaParTaux: { type: "object", additionalProperties: cents },
      tvaCents: cents,
      ttcCents: cents,
    },
    ["htCents", "tvaParTaux", "tvaCents", "ttcCents"],
  ),
  DocumentEnregistre: objet(
    {
      id: uuid,
      type: ref("TypeDocument"),
      statut: ref("Statut"),
      numero: { type: ["string", "null"] },
      data: ref("Document"),
      htCents: cents,
      tvaCents: cents,
      ttcCents: cents,
      emisAt: { type: ["string", "null"], format: "date-time" },
      createdAt: { type: "string", format: "date-time" },
      clientId: { type: ["string", "null"], format: "uuid" },
      totaux: ref("Totaux"),
    },
    ["id", "type", "statut", "numero", "data", "htCents", "tvaCents", "ttcCents", "createdAt", "totaux"],
  ),
  Client: { allOf: [ref("Partie"), objet({ id: uuid }, ["id"])] },
  ProduitEntree: objet({ designation: str, prixUnitaireHtCents: cents, tva, unite: str }, [
    "designation",
    "prixUnitaireHtCents",
    "tva",
  ]),
  Produit: { allOf: [ref("ProduitEntree"), objet({ id: uuid }, ["id"])] },
  ModePaiement: enumere("virement", "carte", "cheque", "especes", "prelevement", "autre"),
  PaiementEntree: objet({ date, montantCents: cents, mode: ref("ModePaiement"), reference: str }, [
    "date",
    "montantCents",
    "mode",
  ]),
  Paiement: objet(
    {
      id: uuid,
      documentId: uuid,
      date,
      montantCents: cents,
      mode: ref("ModePaiement"),
      reference: { type: ["string", "null"] },
    },
    ["id", "documentId", "date", "montantCents", "mode", "reference"],
  ),
  ResultatPaiement: objet({ paiement: ref("Paiement"), resteCents: cents }, ["paiement", "resteCents"]),
  Paiements: objet({ ttcCents: cents, resteCents: cents, paiements: liste(ref("Paiement")) }, [
    "ttcCents",
    "resteCents",
    "paiements",
  ]),
  ARelancer: objet(
    {
      documentId: uuid,
      numero: str,
      client: ref("Partie"),
      echeance: date,
      joursRetard: { type: "integer" },
      niveau: { ...enumere(1, 2, 3), description: "Level reached: D+7, D+30, D+60 after the due date" },
      resteCents: cents,
    },
    ["documentId", "numero", "client", "echeance", "joursRetard", "niveau", "resteCents"],
  ),
  RelanceEntree: objet({ niveau: enumere(1, 2, 3), canal: enumere("mail", "courrier", "telephone") }, ["niveau"]),
  Employe: objet(
    {
      nom: str,
      prenom: str,
      email: { type: "string", format: "email" },
      poste: str,
      contrat: enumere("cdi", "cdd", "apprentissage", "professionnalisation", "stage", "interim"),
      dateEntree: date,
      dateSortie: date,
      tempsTravail: { type: "integer", description: "Percentage of full time" },
      salaireBrutMensuelCents: cents,
    },
    ["nom", "prenom", "poste", "contrat", "dateEntree", "tempsTravail", "salaireBrutMensuelCents"],
  ),
  FicheEmploye: { allOf: [ref("Employe"), objet({ id: uuid }, ["id"])] },
  TypeAbsence: enumere("conges_payes", "rtt", "maladie", "sans_solde", "evenement_familial", "autre"),
  StatutAbsence: enumere("demandee", "validee", "refusee", "annulee"),
  AbsenceEntree: objet({ type: ref("TypeAbsence"), debut: date, fin: date, motif: str }, ["type", "debut", "fin"]),
  Absence: objet(
    {
      id: uuid,
      employeId: uuid,
      type: ref("TypeAbsence"),
      debut: date,
      fin: date,
      joursOuvrables: { type: "number" },
      statut: ref("StatutAbsence"),
      motif: { type: ["string", "null"] },
    },
    ["id", "employeId", "type", "debut", "fin", "joursOuvrables", "statut", "motif"],
  ),
  SoldeConges: objet(
    {
      periode: date,
      acquis: { type: "number" },
      pris: { type: "number" },
      demandes: { type: "number" },
      disponible: { type: "number" },
    },
    ["periode", "acquis", "pris", "demandes", "disponible"],
  ),
  Role: enumere("owner", "admin", "comptable", "lecture", "rh"),
  Inscription: objet(
    {
      email: { type: "string", format: "email" },
      motDePasse: { type: "string", minLength: 12 },
      entreprise: objet({ nom: str, siret: str, adresse: str, franchiseTva: { type: "boolean" } }, [
        "nom",
        "siret",
        "adresse",
      ]),
    },
    ["email", "motDePasse", "entreprise"],
  ),
  Session: objet({ userId: uuid, tenantId: uuid, session: str }, ["userId", "tenantId", "session"]),
  Entreprise: objet(
    {
      id: uuid,
      nom: str,
      siren: str,
      siret: str,
      adresse: str,
      tvaIntracom: { type: ["string", "null"] },
      franchiseTva: { type: "boolean" },
    },
    ["id", "nom", "siren", "siret", "adresse", "tvaIntracom", "franchiseTva"],
  ),
  Moi: objet(
    {
      userId: uuid,
      tenantId: uuid,
      role: ref("Role"),
      email: str,
      nom: str,
      deuxFacteurs: { type: "boolean" },
      entreprise: ref("Entreprise"),
      entreprises: liste(objet({ id: uuid, nom: str, siren: str, role: ref("Role"), suspendue: { type: "boolean" } })),
    },
    ["userId", "tenantId", "role", "entreprise"],
  ),
  Siren: objet({ siren: str, nom: str, siretSiege: str, adresse: str }, ["siren", "nom", "siretSiege", "adresse"]),
  VerificationAudit: objet({ ok: { type: "boolean" }, entrees: { type: "integer" } }, ["ok", "entrees"]),
  Evenement: {
    description:
      "Body of an outgoing webhook. Headers: `x-auto-signature: sha256=<hex>` (HMAC-SHA256 of the raw body) and " +
      "`x-auto-evenement: <id>` (idempotency key, the same event may be delivered more than once).",
    ...objet(
      {
        id: { type: "string", format: "uuid", description: "UUID v7" },
        type: str,
        tenantId: uuid,
        date: { type: "string", format: "date-time" },
        data: {},
      },
      ["id", "type", "tenantId", "date", "data"],
    ),
  },
};

const ERREURS: Record<number, string> = {
  400: "Invalid JSON",
  401: "Not authenticated",
  403: "Droit insuffisant",
  404: "Introuvable",
  402: "Plan quota reached",
  409: "Conflict (state or uniqueness)",
  413: "Fichier trop volumineux",
  415: "Content-Type application/json required (cookie session)",
  410: "Expired or already used",
  422: "Business rule not met",
  429: "Too many attempts",
  502: "Service tiers indisponible",
  503: "Service not configured (Stripe, PA)",
};

const D = "Documents";
const doc = ref("DocumentEnregistre");

const CHEMINS: Chemins = {
  "/v1/auth/inscription": {
    post: op({
      resume: "Create an account and its company",
      tag: "Accounts",
      corps: ref("Inscription"),
      succes: { 201: ref("Session") },
      erreurs: [409, 422],
    }),
  },
  "/v1/auth/connexion": {
    post: op({
      resume: "Open a Better Auth session (auto.session_token cookie and Bearer token) or a 2FA challenge",
      tag: "Accounts",
      corps: objet({ email: str, motDePasse: str, tenantId: uuid }, ["email", "motDePasse"]),
      succes: { 200: ref("Session") },
      erreurs: [401, 403],
    }),
  },
  "/v1/auth/deconnexion": {
    post: op({ resume: "Close the session", tag: "Accounts", succes: { 204: null } }),
  },
  "/v1/siren/{siren}": avecId(
    {
      get: op({
        resume: "Search a company in the directory",
        tag: "Accounts",
        succes: { 200: ref("Siren") },
        erreurs: [404, 422, 502],
      }),
    },
    "siren",
    { type: "string", pattern: "^\\d{9}$" },
  ),
  "/v1/moi": {
    get: op({ resume: "Caller and company", tag: "Accounts", droit: "lire", succes: { 200: ref("Moi") } }),
  },
  "/v1/jetons": {
    get: op({
      resume: "Company API keys (without the secret)",
      tag: "Accounts",
      droit: "parametres",
      succes: {
        200: liste(
          objet({ id: uuid, nom: str, debut: str, email: str, creeLe: str, expireLe: str, dernierUsage: str }),
        ),
      },
    }),
    post: op({
      resume: "Create an `auto_…` API key (returned only once)",
      tag: "Accounts",
      droit: "parametres",
      corps: objet({ nom: str, expireEnJours: { type: "integer", minimum: 1 } }),
      succes: { 201: objet({ jeton: str }, ["jeton"]) },
    }),
  },
  "/v1/membres": {
    get: op({
      resume: "Company members",
      tag: "Accounts",
      droit: "membres",
      succes: { 200: liste(objet({ id: uuid, userId: uuid, email: str, nom: str, role: ref("Role"), depuis: str })) },
    }),
    post: op({
      resume: "Add an existing user or change their role",
      tag: "Accounts",
      droit: "membres",
      corps: objet({ email: str, role: ref("Role") }, ["email", "role"]),
      succes: { 204: null },
      erreurs: [404],
    }),
  },
  "/v1/documents": {
    get: op({
      resume: "List documents",
      tag: D,
      droit: "lire",
      requete: [{ nom: "type", schema: ref("TypeDocument"), description: "Filter by type" }],
      succes: { 200: liste(doc) },
    }),
    post: op({
      resume: "Create a draft",
      tag: D,
      droit: "ecrire",
      corps: ref("DocumentEntree"),
      succes: { 201: doc },
      erreurs: [404, 422],
    }),
  },
  "/v1/documents/{id}": avecId({
    get: op({ resume: "Read a document", tag: D, droit: "lire", succes: { 200: doc }, erreurs: [404] }),
    put: op({
      resume: "Edit a draft",
      tag: D,
      droit: "ecrire",
      corps: ref("DocumentEntree"),
      succes: { 200: doc },
      erreurs: [404, 422],
    }),
    delete: op({ resume: "Delete a draft", tag: D, droit: "ecrire", succes: { 204: null }, erreurs: [404] }),
  }),
  "/v1/documents/{id}/emettre": avecId({
    post: op({
      resume: "Issue: number, frozen copy (PDF or Factur-X), document.emis event",
      tag: D,
      droit: "ecrire",
      succes: { 200: doc },
      erreurs: [404, 409, 422],
    }),
  }),
  "/v1/documents/{id}/pdf": avecId({
    get: op({
      resume: "PDF (Factur-X PDF/A-3b for an issued invoice); ETag = SHA-256",
      tag: D,
      droit: "lire",
      succes: { 200: brut("application/pdf") },
      erreurs: [404],
    }),
  }),
  "/v1/documents/{id}/xml": avecId({
    get: op({
      resume: "CII XML EN 16931 extracted from the Factur-X",
      tag: D,
      droit: "lire",
      succes: { 200: brut("application/xml") },
      erreurs: [404],
    }),
  }),
  "/v1/documents/{id}/statut": avecId({
    post: op({
      resume: "Change the status of an issued document (document.statut event)",
      tag: D,
      droit: "ecrire",
      corps: objet({ statut: ref("Statut") }, ["statut"]),
      succes: { 200: doc },
      erreurs: [404, 409],
    }),
  }),
  "/v1/clients": {
    get: op({
      resume: "List or search clients",
      tag: "Clients",
      droit: "lire",
      requete: [{ nom: "q", schema: str, description: "Name (contains) or start of SIRET" }],
      succes: { 200: liste(ref("Client")) },
    }),
    post: op({
      resume: "Create a client",
      tag: "Clients",
      droit: "ecrire",
      corps: ref("Partie"),
      succes: { 201: ref("Client") },
      erreurs: [422],
    }),
  },
  "/v1/clients/{id}": avecId({
    get: op({
      resume: "Read a client",
      tag: "Clients",
      droit: "lire",
      succes: { 200: ref("Client") },
      erreurs: [404],
    }),
    put: op({
      resume: "Edit a client",
      tag: "Clients",
      droit: "ecrire",
      corps: ref("Partie"),
      succes: { 200: ref("Client") },
      erreurs: [404, 422],
    }),
  }),
  "/v1/produits": {
    get: op({ resume: "List products", tag: "Products", droit: "lire", succes: { 200: liste(ref("Produit")) } }),
    post: op({
      resume: "Create a product",
      tag: "Products",
      droit: "ecrire",
      corps: ref("ProduitEntree"),
      succes: { 201: ref("Produit") },
      erreurs: [422],
    }),
  },
  "/v1/documents/{id}/paiements": avecId({
    get: op({
      resume: "Payments and balance due",
      tag: "Payments",
      droit: "lire",
      succes: { 200: ref("Paiements") },
      erreurs: [404],
    }),
    post: op({
      resume: "Record a payment (paiement.enregistre event)",
      tag: "Payments",
      droit: "ecrire",
      corps: ref("PaiementEntree"),
      succes: { 201: ref("ResultatPaiement") },
      erreurs: [404, 409, 422],
    }),
  }),
  "/v1/relances": {
    get: op({
      resume: "Overdue invoices to chase",
      tag: "Payments",
      droit: "lire",
      requete: [{ nom: "date", schema: date, description: "Reference day (default: today)" }],
      succes: { 200: liste(ref("ARelancer")) },
    }),
  },
  "/v1/documents/{id}/relances": avecId({
    post: op({
      resume: "Record a reminder sent",
      tag: "Payments",
      droit: "ecrire",
      corps: ref("RelanceEntree"),
      succes: { 204: null },
      erreurs: [404, 409],
    }),
  }),
  "/v1/employes": {
    get: op({
      resume: "List employees",
      tag: "HR",
      droit: "rh",
      requete: [{ nom: "tous", schema: str, description: "Present: include employees who left" }],
      succes: { 200: liste(ref("FicheEmploye")) },
    }),
    post: op({
      resume: "Create an employee",
      tag: "HR",
      droit: "rh",
      corps: ref("Employe"),
      succes: { 201: ref("FicheEmploye") },
      erreurs: [422],
    }),
  },
  "/v1/employes/{id}": avecId({
    get: op({
      resume: "Read an employee",
      tag: "HR",
      droit: "rh",
      succes: { 200: ref("FicheEmploye") },
      erreurs: [404],
    }),
    put: op({
      resume: "Edit an employee",
      tag: "HR",
      droit: "rh",
      corps: ref("Employe"),
      succes: { 200: ref("FicheEmploye") },
      erreurs: [404, 422],
    }),
  }),
  "/v1/employes/{id}/conges": avecId({
    get: op({
      resume: "Paid leave balance",
      tag: "HR",
      droit: "rh",
      requete: [{ nom: "au", schema: date, description: "Reference day" }],
      succes: { 200: ref("SoldeConges") },
      erreurs: [404],
    }),
  }),
  "/v1/employes/{id}/absences": avecId({
    get: op({
      resume: "Absences of an employee",
      tag: "HR",
      droit: "rh",
      succes: { 200: liste(ref("Absence")) },
    }),
    post: op({
      resume: "Request an absence (absence.demandee event)",
      tag: "HR",
      droit: "rh",
      corps: ref("AbsenceEntree"),
      succes: { 201: ref("Absence") },
      erreurs: [404, 422],
    }),
  }),
  "/v1/absences": {
    get: op({
      resume: "List absences",
      tag: "HR",
      droit: "rh",
      requete: [{ nom: "statut", schema: ref("StatutAbsence"), description: "Filter by status" }],
      succes: { 200: liste(ref("Absence")) },
    }),
  },
  "/v1/absences/{id}/decision": avecId({
    post: op({
      resume: "Approve, refuse or cancel an absence (absence.decidee event)",
      tag: "HR",
      droit: "rh",
      corps: objet({ statut: enumere("validee", "refusee", "annulee") }, ["statut"]),
      succes: { 200: ref("Absence") },
      erreurs: [404, 409, 422],
    }),
  }),
  "/v1/audit/verification": {
    get: op({
      resume: "Verify the SHA-256 chain of the audit trail",
      tag: "Audit",
      droit: "lire",
      succes: { 200: ref("VerificationAudit") },
    }),
  },
  "/v1/openapi.json": {
    get: op({ resume: "This OpenAPI 3.1 description", tag: "Meta", succes: { 200: { type: "object" } } }),
  },
};

const TYPES_EVENEMENTS: [string, string][] = [
  ["document.emis", "Document issued (data: saved document with totals)"],
  ["document.statut", "Document status changed (data: saved document)"],
  ["paiement.enregistre", "Payment recorded (data: documentId, payment, resteCents)"],
  ["absence.demandee", "Absence requested (data: absence)"],
  ["absence.decidee", "Absence decided (data: absence)"],
  ["relance.a_envoyer", "Reminder scheduled to send (data: invoice to chase, day)"],
  ["export.mensuel", "Monthly summary of issued documents (data: month, totals per type)"],
];

/** Full specification: core and module routes, schemas, outgoing webhooks. */
export function specification() {
  const paths: Chemins = { ...CHEMINS };
  for (const m of MODULES) Object.assign(paths, (m as { openapi?: Chemins }).openapi ?? {});
  return {
    openapi: "3.1.0",
    info: {
      title: "auto",
      version: "1",
      description:
        "API of the auto company administration: Factur-X invoicing, clients, payments, HR. " +
        "Integer amounts in cents, VAT in tenths of a percent. Each authenticated route requires the `x-droit` right.",
    },
    servers: [{ url: "/" }],
    security: [{ jeton: [] }, { session: [] }],
    paths,
    webhooks: Object.fromEntries(
      TYPES_EVENEMENTS.map(([type, resume]) => [
        type,
        {
          post: {
            summary: resume,
            requestBody: { required: true, ...json(ref("Evenement")) },
            responses: { 200: { description: "Received (any 2xx); otherwise exponential retry" } },
          },
        },
      ]),
    ),
    components: {
      securitySchemes: {
        jeton: {
          type: "http",
          scheme: "bearer",
          description: "`auto_…` API key, Better Auth session token or OAuth access token (MCP clients)",
        },
        session: { type: "apiKey", in: "cookie", name: "auto.session_token" },
        oauth: {
          type: "oauth2",
          description:
            "OAuth 2.1 + PKCE (MCP clients); metadata: /.well-known/oauth-authorization-server/api/auth",
          flows: {
            authorizationCode: {
              authorizationUrl: "/api/auth/oauth2/authorize",
              tokenUrl: "/api/auth/oauth2/token",
              refreshUrl: "/api/auth/oauth2/token",
              scopes: {
                openid: "Identité",
                profile: "Profil",
                email: "Adresse",
                offline_access: "Refresh token",
              },
            },
          },
        },
      },
      schemas: SCHEMAS,
      responses: Object.fromEntries(
        Object.entries(ERREURS).map(([c, description]) => [`E${c}`, { description, ...json(ref("Erreur")) }]),
      ),
    },
  };
}

interface SpecAuth {
  paths?: Record<string, Record<string, Record<string, unknown>>>;
  components?: { schemas?: Record<string, unknown> };
}

/**
 * Served specification: the API's and Better Auth's (openAPI plugin), paths prefixed by
 * /api/auth, tag "Authentication", schemas prefixed `Auth` (no collision with auto's).
 */
export async function specificationComplete(genererAuth: () => Promise<unknown>) {
  const base = specification();
  const texte = JSON.stringify(await genererAuth()).replaceAll('"#/components/schemas/', '"#/components/schemas/Auth');
  const a = JSON.parse(texte) as SpecAuth;
  const paths: Record<string, unknown> = { ...base.paths };
  for (const [chemin, ops] of Object.entries(a.paths ?? {}).sort(([x], [y]) => x.localeCompare(y)))
    paths[`/api/auth${chemin}`] = Object.fromEntries(
      Object.entries(ops).map(([m, o]) => [m, { ...o, tags: ["Authentication"] }]),
    );
  const schemas = Object.fromEntries(Object.entries(a.components?.schemas ?? {}).map(([n, v]) => [`Auth${n}`, v]));
  return { ...base, paths, components: { ...base.components, schemas: { ...base.components.schemas, ...schemas } } };
}
