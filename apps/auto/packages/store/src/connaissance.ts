// Per-company knowledge base (migration 019): document chunks and vectors, under RLS. The
// chunking, embeddings and search are done by the services (@auto/services/connaissance).
import type { Tx } from "./db";
import { ErreurMetier, journaliser } from "./index";

/** Chunks at most per company, all bases combined. */
export const MORCEAUX_MAX = 20_000;
/** Bases at most per company. */
export const BASES_MAX = 50;

export const BASE = /^[a-z0-9_-]{1,60}$/;

export function verifierBase(base: string) {
  if (!BASE.test(base)) throw new ErreurMetier("base : 1 à 60 minuscules, chiffres, - ou _");
}

export interface MorceauIndexe {
  position: number;
  texte: string;
  /** Composantes f32 de l'embedding. */
  vecteur: Float32Array;
}

export interface BaseConnaissance {
  base: string;
  sources: number;
  morceaux: number;
  modele: string;
  dimension: number;
  majAt: string;
}

const octets = (v: Float32Array) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

/**
 * Replaces the chunks of a source (deleted then reinserted): model and dimension must match the rest
 * of the base; company quotas checked under lock (two simultaneous indexings cannot exceed them).
 */
export async function remplacerSource(
  tx: Tx,
  actor: string | null,
  o: { base: string; source: string; modele: string; morceaux: MorceauIndexe[] },
): Promise<{ morceaux: number; remplaces: number }> {
  verifierBase(o.base);
  const source = o.source.trim();
  if (!source || source.length > 300) throw new ErreurMetier("source : 1 à 300 caractères");
  if (!o.modele || o.modele.length > 200) throw new ErreurMetier("modèle d'embeddings : 1 à 200 caractères");
  const dimension = o.morceaux[0]?.vecteur.length ?? 0;
  if (o.morceaux.some((m) => m.vecteur.length !== dimension || !m.texte.trim()))
    throw new ErreurMetier("morceaux vides ou vecteurs de dimensions différentes");
  if (dimension > 8192) throw new ErreurMetier("vecteurs de 8 192 composantes au plus");
  await tx`SELECT pg_advisory_xact_lock(hashtext('connaissance:' || app_tenant()::text))`;
  const supprimes = await tx`DELETE FROM connaissance WHERE base = ${o.base} AND source = ${source} RETURNING id`;
  if (o.morceaux.length) {
    const [autre] = await tx<{ modele: string; dimension: number }[]>`
      SELECT modele, octet_length(vecteur) / 4 AS dimension FROM connaissance WHERE base = ${o.base} LIMIT 1`;
    if (autre && (autre.modele !== o.modele || autre.dimension !== dimension))
      throw new ErreurMetier(
        `base « ${o.base} » indexée avec ${autre.modele} (${autre.dimension} composantes) : même modèle requis`,
      );
    const [c] = await tx<{ morceaux: number; bases: number; ici: boolean | null }[]>`
      SELECT count(*)::int AS morceaux, count(DISTINCT base)::int AS bases, bool_or(base = ${o.base}) AS ici
      FROM connaissance`;
    if (!c!.ici && c!.bases >= BASES_MAX) throw new ErreurMetier(`${BASES_MAX} bases de connaissances au plus`);
    if (c!.morceaux + o.morceaux.length > MORCEAUX_MAX)
      throw new ErreurMetier(
        `base de connaissances pleine : ${MORCEAUX_MAX} morceaux au plus par entreprise (${c!.morceaux} utilisés)`,
      );
    const lignes = o.morceaux.map((m) => ({
      base: o.base,
      source,
      position: m.position,
      morceau: m.texte.slice(0, 20_000),
      vecteur: octets(m.vecteur),
      modele: o.modele,
    }));
    for (let i = 0; i < lignes.length; i += 1000) await tx`INSERT INTO connaissance ${tx(lignes.slice(i, i + 1000))}`;
  }
  await journaliser(tx, actor, "connaissance.indexer", null, {
    base: o.base,
    source,
    morceaux: o.morceaux.length,
    remplaces: supprimes.length,
  });
  return { morceaux: o.morceaux.length, remplaces: supprimes.length };
}

/** Bases of the company with their counts. */
export async function listerBases(tx: Tx): Promise<BaseConnaissance[]> {
  const rows = await tx<
    { base: string; sources: number; morceaux: number; modele: string; dimension: number; maj: Date }[]
  >`SELECT base, count(DISTINCT source)::int AS sources, count(*)::int AS morceaux, min(modele) AS modele,
      min(octet_length(vecteur) / 4)::int AS dimension, max(created_at) AS maj
    FROM connaissance GROUP BY base ORDER BY base`;
  return rows.map((r) => ({
    base: r.base,
    sources: r.sources,
    morceaux: r.morceaux,
    modele: r.modele,
    dimension: r.dimension,
    majAt: r.maj.toISOString(),
  }));
}

/** Deletes a whole base, or just one of its sources; returns the number of chunks deleted. */
export async function supprimerConnaissance(
  tx: Tx,
  actor: string | null,
  base: string,
  source?: string,
): Promise<number> {
  verifierBase(base);
  const r =
    source === undefined
      ? await tx`DELETE FROM connaissance WHERE base = ${base} RETURNING id`
      : await tx`DELETE FROM connaissance WHERE base = ${base} AND source = ${source} RETURNING id`;
  if (!r.length) throw new ErreurMetier(source === undefined ? "base introuvable" : "source introuvable", [], 404);
  await journaliser(tx, actor, "connaissance.supprimer", null, { base, source: source ?? null, morceaux: r.length });
  return r.length;
}

/** Vectors of a base laid end to end (native search matrix); `ids[i]`: chunk of row i. */
export async function vecteursBase(
  tx: Tx,
  base: string,
): Promise<{ modele: string; dimension: number; ids: string[]; matrice: Float32Array } | null> {
  verifierBase(base);
  const rows = await tx<{ id: string; modele: string; vecteur: Uint8Array }[]>`
    SELECT id, modele, vecteur FROM connaissance WHERE base = ${base} ORDER BY source, position`;
  if (!rows.length) return null;
  const dimension = rows[0]!.vecteur.length / 4;
  const matrice = new Float32Array(rows.length * dimension);
  const vue = new Uint8Array(matrice.buffer);
  rows.forEach((r, i) => {
    if (r.vecteur.length !== dimension * 4) throw new ErreurMetier(`base « ${base} » incohérente : dimensions mêlées`);
    vue.set(r.vecteur, i * dimension * 4);
  });
  return { modele: rows[0]!.modele, dimension, ids: rows.map((r) => r.id), matrice };
}

/** Chunks by id, in the requested order. */
export async function lireMorceaux(
  tx: Tx,
  ids: string[],
): Promise<{ id: string; source: string; position: number; texte: string }[]> {
  if (!ids.length) return [];
  const rows = await tx<{ id: string; source: string; position: number; morceau: string }[]>`
    SELECT id, source, position, morceau FROM connaissance WHERE id = ANY (ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb)::uuid))`;
  const parId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = parId.get(id);
    return r ? [{ id, source: r.source, position: r.position, texte: r.morceau }] : [];
  });
}
