// Automations of a company: validation of definitions, execution (API for trials and
// synchronous webhooks, worker for events and crons), encrypted secrets and signed webhook URL.
// The engine (`@aphrody/automate`) makes no outside access itself: the services below carry them,
// with the network guard, the tenant's mailbox and the auto API under the rights of the workflow's author.
import {
  declencheurDe,
  ErreurDefinition,
  executer,
  secretsCites,
  valider,
  type Definition,
  type Element,
  type Resultat,
  type Services,
} from "@aphrody/automate";
import {
  debuterExecution,
  ecrireMemoire,
  lireMemoire,
  ErreurMetier,
  lireAutomatisation,
  secretsChiffres,
  terminerExecution,
  withTenant,
  type Ecriture,
  type Execution,
  type Sql,
  type Tx,
} from "@auto/store";
import { chiffrer, cleMaitre, cleTemporaire, dechiffrer } from "@auto/tenancy";
import {
  caviarderPdf,
  champsDocx,
  creerDocx,
  creerPptx,
  docxEnPdf,
  writeXlsx,
  extrairePagesPdf,
  fusionnerPdf,
  lireTableur,
  nombrePagesPdf,
  pptxEnPdf,
  remplirDocx,
  signerPdf,
  textePdf,
  texteDocx,
  verifierSignaturesPdf,
} from "@auto/native";
import { servicesConnaissance } from "./connaissance";
import { envoyerTexte } from "./mail";
import { servicesMedia } from "./media";
import { executerScript } from "./script";
import { PRIVE } from "./webhooks";

/** Derivation info of the automation secrets key: specific to the tenant. */
export const infoSecretAutomatisation = (tenantId: string) => `automatisation:${tenantId}`;

export const chiffrerSecret = (tenantId: string, valeur: string) =>
  chiffrer(infoSecretAutomatisation(tenantId), new TextEncoder().encode(valeur));

/** Body for creation or update, validated and completed by the trigger extracted from the definition. */
export async function ecriture(
  tx: Tx,
  b: { nom?: unknown; description?: unknown; actif?: unknown; definition?: unknown },
  avant?: { nom: string; description: string; actif: boolean; definition: unknown },
): Promise<Ecriture> {
  const nom = String(b.nom ?? avant?.nom ?? "").trim();
  if (!nom || nom.length > 120) throw new ErreurMetier("nom : 1 à 120 caractères");
  let def: Definition;
  try {
    def = valider(b.definition ?? avant?.definition);
  } catch (e) {
    if (e instanceof ErreurDefinition) throw new ErreurMetier(e.message, e.details);
    throw e;
  }
  const cites = secretsCites(def);
  const connus = new Set((await secretsChiffres(tx, cites)).map((s) => s.nom));
  const manquants = cites.filter((c) => !connus.has(c));
  const actif = Boolean(b.actif ?? avant?.actif ?? false);
  if (actif && manquants.length)
    throw new ErreurMetier(
      "secrets inconnus",
      manquants.map((m) => `$secret.${m}`),
    );
  const d = declencheurDe(def);
  const p = d.parametres as { types?: string[]; cron?: string; fuseau?: string };
  const declencheur = d.type.slice("declencheur.".length) as Ecriture["declencheur"];
  return {
    nom,
    description: String(b.description ?? avant?.description ?? "").slice(0, 2000),
    actif,
    definition: def,
    declencheur,
    evenements: declencheur === "evenement" ? (p.types ?? []) : [],
    cron: declencheur === "planifie" ? (p.cron ?? null) : null,
    fuseau: declencheur === "planifie" ? (p.fuseau ?? "Europe/Paris") : null,
  };
}

/**
 * Network guard of the HTTP nodes: http(s) only, no credentials in the URL and, in production, no
 * internal address (operator network, cloud metadata). No automatic redirect following: a
 * redirect to an internal address would bypass the guard.
 */
export function gardeUrl(
  brute: string,
  production = Bun.env.NODE_ENV === "production",
  permis = Bun.env.AUTO_HOTES_PERMIS ?? "",
): URL {
  let u: URL;
  try {
    u = new URL(brute);
  } catch {
    throw new Error(`URL invalide : ${brute}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("URL http ou https exigée");
  if (u.username || u.password) throw new Error("identifiants interdits dans l'URL");
  const hote = u.hostname.toLowerCase();
  // A name without a dot ("auto-api", "postgres") designates a container or a machine of the local network.
  const interne =
    hote === "localhost" ||
    hote.endsWith(".localhost") ||
    hote.endsWith(".internal") ||
    hote.endsWith(".local") ||
    (!hote.includes(".") && !hote.includes(":")) ||
    PRIVE.some((r) => r.test(hote));
  if (production && interne && !reseauLocal() && !hotesPermis(permis).includes(hote))
    throw new Error("adresse interne refusée");
  return u;
}

/**
 * Local network fully reachable (`AUTO_RESEAU_LOCAL=permis`): reserved for an installation where all the
 * accounts are controlled (Aphrody Box at home), to reach Home Assistant, Nextcloud or a network printer.
 */
const reseauLocal = () => Bun.env.AUTO_RESEAU_LOCAL === "permis";

/** Internal hosts reachable anyway (`AUTO_HOTES_PERMIS`, comma-separated; e.g. `ollama`). */
const hotesPermis = (liste = Bun.env.AUTO_HOTES_PERMIS ?? "") =>
  liste
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

const fetchGarde: Services["fetch"] = (url, init) =>
  fetch(gardeUrl(url), { ...init, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(30_000) });

/** The auto API as seen by the worker and the API itself. */
const urlApi = () => (Bun.env.AUTO_API_URL ?? `http://localhost:${Bun.env.PORT ?? 3000}`).replace(/\/+$/, "");

/**
 * Temporary API key of the workflow's author for the "auto Action" nodes: an ordinary Better Auth
 * key that expires by itself and that the execution deletes at the end. Rights = the author's current role.
 */
const jetonTemporaire = (sql: Sql, tenantId: string, userId: string, nom: string) =>
  cleTemporaire(sql, tenantId, userId, nom);

export interface Lancement {
  tenantId: string;
  automatisationId: string;
  origine: string;
  entree: Element[];
  signal?: AbortSignal;
  /** Nesting level: 0 for a directly started workflow, +1 per sub-workflow. */
  profondeur?: number;
}

/** Nested sub-workflows at most: a looping call stops quickly and clearly. */
export const PROFONDEUR_MAX = 3;

/** Real services of an execution; `fermer` revokes the temporary token. */
async function servicesPour(
  sql: Sql,
  tenantId: string,
  auteur: string | null,
  nom: string,
  automatisationId?: string,
  profondeur = 0,
) {
  let temporaire: Awaited<ReturnType<typeof jetonTemporaire>> | null = null;
  // Trial: ephemeral memory, the state of a saved workflow is not modified by a trial.
  const ephemere = new Map<string, unknown>();
  const services: Services = {
    memoire: automatisationId
      ? {
          lire: (cle) => withTenant(sql, tenantId, (tx) => lireMemoire(tx, automatisationId, cle)),
          ecrire: (cle, v) => withTenant(sql, tenantId, (tx) => ecrireMemoire(tx, automatisationId, cle, v)),
        }
      : { lire: async (cle) => ephemere.get(cle), ecrire: async (cle, v) => void ephemere.set(cle, v) },
    fetch: fetchGarde,
    envoyerMail: (m) => envoyerTexte(sql, tenantId, auteur, m),
    script: executerScript,
    ...servicesMedia((u) => gardeUrl(u)),
    tableur: { ecrire: (feuille) => writeXlsx({ feuilles: [feuille] }), lire: (octets) => lireTableur(octets) },
    pdf: { fusionner: fusionnerPdf, pages: extrairePagesPdf, nombrePages: nombrePagesPdf, texte: textePdf },
    word: { creer: creerDocx, champs: champsDocx, remplir: remplirDocx, enPdf: docxEnPdf, texte: texteDocx },
    documents: {
      caviarder: caviarderPdf,
      signer: signerPdf,
      signatures: verifierSignaturesPdf,
      presentation: creerPptx,
      presentationEnPdf: pptxEnPdf,
    },
    connaissance: servicesConnaissance(sql, tenantId, auteur, fetchGarde),
    async sousWorkflow(id, entree, signal) {
      if (id === automatisationId) throw new Error("un workflow ne peut pas s'exécuter lui-même");
      if (profondeur >= PROFONDEUR_MAX) throw new Error(`plus de ${PROFONDEUR_MAX} niveaux de sous-workflows`);
      const { resultat } = await lancer(sql, {
        tenantId,
        automatisationId: id,
        origine: `workflow:${automatisationId ?? "essai"}`,
        entree,
        signal,
        profondeur: profondeur + 1,
      });
      if (resultat.statut === "erreur") throw new Error(`sous-workflow en échec : ${resultat.erreur?.message ?? "?"}`);
      return resultat.sortie;
    },
    async appelerAuto(methode, chemin, corps) {
      if (!auteur) throw new Error("auteur du workflow inconnu : actions auto impossibles");
      temporaire ??= await jetonTemporaire(sql, tenantId, auteur, `automatisation:${nom}`.slice(0, 100));
      const init: RequestInit = {
        method: methode,
        headers: { authorization: `Bearer ${temporaire.jeton}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(30_000),
      };
      if (corps !== undefined && methode !== "GET") init.body = JSON.stringify(corps);
      const r = await fetch(`${urlApi()}${chemin}`, init);
      const texte = await r.text();
      let valeur: unknown = texte;
      try {
        valeur = texte ? JSON.parse(texte) : null;
      } catch {}
      return { statut: r.status, corps: valeur };
    },
  };
  return { services, fermer: async () => temporaire?.revoquer() };
}

async function secretsClairs(sql: Sql, tenantId: string, def: Definition) {
  const chiffres = await withTenant(sql, tenantId, (tx) => secretsChiffres(tx, secretsCites(def)));
  const clairs: Record<string, string> = {};
  for (const s of chiffres)
    clairs[s.nom] = new TextDecoder().decode(await dechiffrer(infoSecretAutomatisation(tenantId), s.valeur));
  return clairs;
}

/** Removes secrets from the kept steps (a node may copy a resolved value into its output). */
function masquer(r: Resultat, secrets: Record<string, string>): Resultat {
  const valeurs = Object.values(secrets).filter((v) => v.length >= 6);
  if (!valeurs.length) return r;
  const s = valeurs.reduce((t, v) => t.replaceAll(JSON.stringify(v).slice(1, -1), "••••••"), JSON.stringify(r));
  return JSON.parse(s) as Resultat;
}

/** Runs a saved workflow and records the execution; returns the execution and the output. */
export async function lancer(sql: Sql, l: Lancement): Promise<{ execution: Execution; resultat: Resultat }> {
  const a = await withTenant(sql, l.tenantId, (tx) => lireAutomatisation(tx, l.automatisationId));
  if (!a) throw new ErreurMetier("automatisation introuvable", [], 404);
  const def = valider(a.definition);
  const executionId = await withTenant(sql, l.tenantId, (tx) => debuterExecution(tx, a.id, l.origine));
  const secrets = await secretsClairs(sql, l.tenantId, def);
  const { services, fermer } = await servicesPour(sql, l.tenantId, a.createdBy, a.nom, a.id, l.profondeur ?? 0);
  let resultat: Resultat;
  try {
    resultat = masquer(
      await executer(def, l.entree, {
        services,
        workflow: { id: a.id, nom: a.nom },
        executionId,
        secrets,
        signal: l.signal,
      }),
      secrets,
    );
  } catch (e) {
    resultat = { statut: "erreur", etapes: [], erreur: { noeud: "", message: String(e) }, sortie: [] };
  } finally {
    await fermer();
  }
  const execution = await withTenant(sql, l.tenantId, (tx) =>
    terminerExecution(tx, executionId, {
      statut: resultat.statut,
      etapes: resultat.etapes,
      erreur: resultat.erreur
        ? `${resultat.erreur.noeud ? `${resultat.erreur.noeud} : ` : ""}${resultat.erreur.message}`
        : null,
    }),
  );
  return { execution: { ...execution, etapes: resultat.etapes }, resultat };
}

/** Trial of an unsaved definition (the editor's "Test" button): nothing is recorded. */
export async function essayer(
  sql: Sql,
  tenantId: string,
  userId: string,
  definition: unknown,
  entree: Element[],
): Promise<Execution & { sortie: Element[] }> {
  let def: Definition;
  try {
    def = valider(definition);
  } catch (e) {
    if (e instanceof ErreurDefinition) throw new ErreurMetier(e.message, e.details);
    throw e;
  }
  const secrets = await secretsClairs(sql, tenantId, def);
  const { services, fermer } = await servicesPour(sql, tenantId, userId, "essai");
  const debut = new Date().toISOString();
  try {
    const r = masquer(
      await executer(def, entree, {
        services,
        workflow: { id: "essai", nom: "Essai" },
        executionId: "essai",
        secrets,
        dureeMaxMs: 60_000,
      }),
      secrets,
    );
    return {
      id: "essai",
      automatisationId: "essai",
      origine: "essai",
      statut: r.statut,
      erreur: r.erreur ? `${r.erreur.noeud} : ${r.erreur.message}` : null,
      debut,
      fin: new Date().toISOString(),
      etapes: r.etapes,
      sortie: r.sortie,
    };
  } finally {
    await fermer();
  }
}

// ── Secret URL of incoming webhooks ──────────────────────────────────────
// Stateless token `<payload>.<HMAC>` (key derived from the master key, dedicated usage) carrying the tenant and the
// workflow: nothing to store, and a workflow's URL never triggers another company's.

const b64 = (o: Uint8Array) => o.toBase64({ alphabet: "base64url", omitPadding: true });

async function cleCrochet(maitre: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey("raw", maitre, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("auto/crochet/v1"),
      info: new TextEncoder().encode("crochet"),
    },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export async function signerCrochet(c: { t: string; a: string }, maitre = cleMaitre()): Promise<string> {
  const charge = b64(new TextEncoder().encode(JSON.stringify(c)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await cleCrochet(maitre), new TextEncoder().encode(charge)),
  );
  return `${charge}.${b64(sig)}`;
}

export async function verifierCrochet(jeton: string, maitre = cleMaitre()): Promise<{ t: string; a: string } | null> {
  const [charge, sig] = jeton.split(".");
  if (!charge || !sig || jeton.length > 400) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await cleCrochet(maitre),
      Uint8Array.fromBase64(sig, { alphabet: "base64url" }),
      new TextEncoder().encode(charge),
    );
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(charge, { alphabet: "base64url" })));
    return typeof c?.t === "string" && typeof c?.a === "string" ? c : null;
  } catch {
    return null;
  }
}

/** Input element of a received webhook: method, query, headers (without cookies or authorization), body. */
export async function elementWebhook(req: Request): Promise<Element> {
  const u = new URL(req.url);
  const entetes = Object.fromEntries(
    [...req.headers].filter(([k]) => !["cookie", "authorization", "x-forwarded-for"].includes(k.toLowerCase())),
  );
  const brut = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  if (brut.length > 1_000_000) throw new ErreurMetier("corps trop volumineux (1 Mo au plus)", [], 413);
  let corps: unknown = brut;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("json") && brut) {
    try {
      corps = JSON.parse(brut);
    } catch {
      throw new ErreurMetier("JSON invalide", [], 400);
    }
  } else if (type.includes("application/x-www-form-urlencoded")) corps = Object.fromEntries(new URLSearchParams(brut));
  return { json: { methode: req.method, requete: Object.fromEntries(u.searchParams), entetes, corps } };
}
