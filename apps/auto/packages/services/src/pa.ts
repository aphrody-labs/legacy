// PA batch: tenant connection to its approved platform, submission of issued invoices, lifecycle
// statuses, signed incoming webhook, invoice reception, directory, e-reporting.
import {
  dechiffrer,
  ErreurPa,
  plateforme,
  STATUTS,
  type Identifiants,
  type Mandat,
  type NomPlateforme,
  type Plateforme,
  type StatutCycle,
} from "@auto/pa";
import {
  ajouterStatut,
  changerStatut,
  depotsEnCours,
  enregistrerRecuePa,
  ErreurMetier,
  lireConnexionPa,
  lireDepot,
  recueConnue,
  withTenant,
  type Sql,
  type StatutPa,
  type Tx,
} from "@auto/store";
import type { Statut } from "@auto/domain";
import { extraireXml, totalTtcCents } from "@auto/native";
import { deposer } from "./ingest";
import type { Emetteur, TypeEvenement } from "./evenements";

/**
 * `pa.statut` and `facture.recue` are added to the events of evenements.ts (outbox batch file):
 * to be merged into `TypeEvenement`.
 */
export type EvenementLot = "pa.statut" | "facture.recue";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Billing document status deduced from the PA lifecycle (attempted transition, ignored if forbidden). */
export const VERS_DOCUMENT: Partial<Record<StatutCycle, Statut>> = {
  deposee: "depose",
  rejetee: "rejete",
  refusee: "refuse",
  encaissee: "paye",
};

/** Statuses the seller may set on a submitted invoice. */
export const VENDEUR: StatutCycle[] = ["encaissee"];

export function cleMaitre(): string {
  const k = Bun.env.AUTO_CLE_MAITRE;
  if (!k || k.length < 32) throw new ErreurMetier("AUTO_CLE_MAITRE non configurée (32 caractères minimum)", [], 503);
  return k;
}

export const options = () => ({ b2brouter: { base: Bun.env.AUTO_PA_B2BROUTER_URL } });

/** PA error translated into a business error (JSON response). */
export async function pa<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErreurPa) throw new ErreurMetier(e.message, [], e.status);
    throw e;
  }
}

export interface Connecte {
  nom: NomPlateforme;
  p: Plateforme;
}

export async function connexion(tx: Tx, tenantId: string): Promise<Connecte | null> {
  const c = await lireConnexionPa(tx);
  if (!c) return null;
  const nom = c.plateforme as NomPlateforme;
  const ids = await dechiffrer<Identifiants>(cleMaitre(), tenantId, c.identifiants);
  return { nom, p: await pa(async () => plateforme(nom, ids, options())) };
}

/**
 * Polls the PA for the statuses of pending submissions and the tenant's incoming invoices.
 * Called by `POST /v1/pa/synchroniser` and by the worker's scheduled task; `null` without a connected PA.
 */
export async function synchroniser(
  sql: Sql,
  publier: Emetteur,
  tenantId: string,
): Promise<{ statuts: number; recues: number }> {
  const emettre = (type: string, data: unknown) =>
    withTenant(sql, tenantId, (tx) => publier(tx, type as TypeEvenement, data));
  const { c, depots } = await withTenant(sql, tenantId, async (tx) => ({
    c: await exigerConnexion(tx, tenantId),
    depots: await depotsEnCours(tx),
  }));
  let statuts = 0;
  for (const dep of depots.filter((x) => x.plateforme === c.nom)) {
    for (const ev of await pa(() => c.p.statuts(dep.idPa))) {
      const d = await withTenant(sql, tenantId, (tx) =>
        appliquerStatut(tx, dep.id, dep.documentId, { ...ev, source: "synchro", at: ev.date }),
      );
      if (d) {
        statuts++;
        await emettre("pa.statut", d);
      }
    }
  }
  let recues = 0;
  for (const e of await pa(() => c.p.entrantes())) {
    const r = await recevoir(sql, tenantId, c, e.idPa, e.date);
    if (r) {
      recues++;
      await emettre("facture.recue", r);
    }
  }
  return { statuts, recues };
}

/** Tenants with a connected PA: RLS is enforced, so each tenant is queried under its own identity. */
export async function tenantsConnectes(sql: Sql): Promise<string[]> {
  const out: string[] = [];
  for (const { id } of await sql<{ id: string }[]>`SELECT id FROM tenant ORDER BY id`)
    if (await withTenant(sql, id, async (tx) => (await tx`SELECT 1 FROM pa_connexion LIMIT 1`).length > 0))
      out.push(id);
  return out;
}

export async function exigerConnexion(tx: Tx, tenantId: string): Promise<Connecte> {
  const c = await connexion(tx, tenantId);
  if (!c) throw new ErreurMetier("aucune plateforme agréée connectée", [], 409);
  return c;
}

/** Adds a status to the submission and reports the status on the document; null if already known. */
export async function appliquerStatut(tx: Tx, depotId: string, documentId: string, s: Omit<StatutPa, "code">) {
  const statut = s.statut as StatutCycle;
  if (!(await ajouterStatut(tx, depotId, { ...s, code: STATUTS[statut] }))) return null;
  await reporter(tx, null, documentId, statut);
  return lireDepot(tx, depotId);
}

/** Reports a PA status on the document; a forbidden transition (e.g. already paid) is ignored. */
export async function reporter(tx: Tx, actor: string | null, documentId: string, statut: StatutCycle) {
  const cible = VERS_DOCUMENT[statut];
  if (!cible) return;
  try {
    await changerStatut(tx, actor, documentId, cible);
  } catch (e) {
    if (!(e instanceof ErreurMetier)) throw e;
  }
}

export const champ = (xml: string, re: RegExp) => re.exec(xml)?.[1]?.trim() ?? null;

/** Downloads and saves an incoming invoice; null if already received. */
export async function recevoir(sql: Sql, tenantId: string, c: Connecte, idPa: string, date: string) {
  const deja = await withTenant(sql, tenantId, (tx) => recueConnue(tx, c.nom, idPa));
  if (deja) return null;
  const contenu = await pa(() => c.p.telecharger(idPa));
  const xml = extraireXml(contenu);
  const r = await withTenant(sql, tenantId, (tx) =>
    enregistrerRecuePa(tx, null, {
      plateforme: c.nom,
      idPa,
      contenu,
      xml,
      numero: xml && champ(xml, /<rsm:ExchangedDocument>[\s\S]*?<ram:ID>([^<]*)<\/ram:ID>/),
      emetteur: xml && champ(xml, /<ram:SellerTradeParty>[\s\S]*?<ram:Name>([^<]*)<\/ram:Name>/),
      ttcCents: xml ? totalTtcCents(xml) : null,
      recueAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    }),
  );
  // Supplier invoice: CII XML reading and ingestion checks (queue "to verify" if in doubt).
  await deposer(sql, tenantId, null, { contenu, nom: `${idPa}.pdf`, typeMime: "application/pdf", canal: "pa" }).catch(
    (e) => console.error(`ingestion PA ${tenantId} : ${e instanceof Error ? e.message : e}`),
  );
  return r;
}

export function lireMandat(m: Partial<Mandat> | undefined, siren: string): Mandat {
  const erreurs: string[] = [];
  if (!m?.signataire?.trim()) erreurs.push("mandat.signataire");
  if (!m?.qualite?.trim()) erreurs.push("mandat.qualite");
  if (!m?.date || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) erreurs.push("mandat.date (AAAA-MM-JJ)");
  const perimetre = m?.perimetre ?? ["emission", "reception", "ereporting"];
  if (!Array.isArray(perimetre) || perimetre.some((x) => !["emission", "reception", "ereporting"].includes(x)))
    erreurs.push("mandat.perimetre");
  if (erreurs.length) throw new ErreurMetier("mandat incomplet", erreurs);
  return { siren, signataire: m!.signataire!, qualite: m!.qualite!, date: m!.date!, perimetre };
}
