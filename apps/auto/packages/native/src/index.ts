// bun:ffi bridge to crates/auto-ffi: PDF rendering, Factur-X, CII XML, extraction, PDF/A check, spreadsheets,
// PDF files (merge, pages, text) and Word (template, creation, PDF export), knowledge base (chunking,
// nearest neighbors).
// Library: AUTO_FFI_LIB, otherwise dist/native/<platform>/ (bun run build:native).
import { dlopen, FFIType, toArrayBuffer, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";

const PLATEFORMES: Record<string, string> = {
  "linux-x64": "linux-x64/libauto_ffi.so",
  "win32-x64": "windows-x64/auto_ffi.dll",
};

function chemin(): string {
  if (Bun.env.AUTO_FFI_LIB) return Bun.env.AUTO_FFI_LIB;
  const rel = PLATEFORMES[`${process.platform}-${process.arch}`];
  if (!rel) throw new Error(`auto-ffi: unsupported platform (${process.platform}-${process.arch})`);
  // Published package: binaries embedded in native/; repository: dist/native/ (bun run build:native).
  const embarque = Bun.fileURLToPath(new URL(`../native/${rel}`, import.meta.url));
  return existsSync(embarque) ? embarque : Bun.fileURLToPath(new URL(`../../../dist/native/${rel}`, import.meta.url));
}

let lib: ReturnType<typeof ouvrir> | undefined;

function ouvrir() {
  return dlopen(chemin(), {
    auto_call: {
      args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr],
      returns: FFIType.ptr,
    },
    auto_free: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.void },
  });
}

export class ErreurNative extends Error {}

const encodeur = new TextEncoder();
const VIDE = new Uint8Array(1);

function appeler(op: string, entree: Uint8Array): Uint8Array<ArrayBuffer> {
  lib ??= ouvrir();
  const o = encodeur.encode(op);
  const len = new BigUint64Array(1);
  const p = lib.symbols.auto_call(o, o.length, entree.length ? entree : VIDE, entree.length, len) as Pointer;
  const n = Number(len[0]);
  try {
    const sortie = new Uint8Array(toArrayBuffer(p, 0, n)).slice();
    if (sortie[0] !== 0) throw new ErreurNative(new TextDecoder().decode(sortie.subarray(1)));
    return sortie.subarray(1);
  } finally {
    lib.symbols.auto_free(p, n);
  }
}

const json = (doc: unknown) => encodeur.encode(JSON.stringify(doc));

/** Document (JSON de @auto/domain + numero) → PDF A4. */
export const rendrePdf = (doc: unknown) => appeler("rendre", json(doc));

/** Issued invoice → Factur-X EN 16931 (PDF/A-3b with factur-x.xml), checked before returning. */
export function facturx(doc: unknown, date = new Date()): Uint8Array<ArrayBuffer> {
  const corps = json(doc);
  const entree = new Uint8Array(8 + corps.length);
  new DataView(entree.buffer).setBigInt64(0, BigInt(Math.floor(date.getTime() / 1000)), true);
  entree.set(corps, 8);
  return appeler("facturx", entree);
}

/** EN 16931 CII XML of an issued invoice. */
export const xmlCii = (doc: unknown) => new TextDecoder().decode(appeler("xml", json(doc)));

/** Factur-X XML embedded in a received PDF, or null. */
export function extraireXml(pdf: Uint8Array): string | null {
  const x = new TextDecoder().decode(appeler("extraire", pdf));
  return x || null;
}

/** PDF/A-3b non-conformities (empty = conformant). */
export const verifierPdfA = (pdf: Uint8Array): string[] =>
  JSON.parse(new TextDecoder().decode(appeler("verifier_pdfa", pdf)));

/** Total including tax (BT-112, GrandTotalAmount) of a CII XML, in cents. */
export function totalTtcCents(xml: string): number | null {
  const m = /<ram:GrandTotalAmount>(-?\d+)\.(\d{2})<\/ram:GrandTotalAmount>/.exec(xml);
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number(m[2]);
  return m[1]!.startsWith("-") ? -(Math.abs(Number(m[1])) * 100 + Number(m[2])) : c;
}

export type CelluleLue = string | number | boolean | null;
export interface Lecture {
  format: "xlsx" | "xls" | "xlsb" | "ods" | "csv";
  feuilles: { nom: string; lignes: CelluleLue[][] }[];
  avertissements: string[];
}

/** Workbook xlsx, xls, xlsb, ods or csv → rows of values (Excel dates as serial numbers). */
export const lireTableur = (octets: Uint8Array): Lecture =>
  JSON.parse(new TextDecoder().decode(appeler("tableur_lire", octets)));

export type TypeColonne = "texte" | "nombre" | "euros" | "date" | "pourcent";
export interface Classeur {
  feuilles: {
    nom: string;
    colonnes: { titre: string; type?: TypeColonne; largeur?: number }[];
    /** euros in cents, percent in basis points, date "YYYY-MM-DD". */
    lignes: CelluleLue[][];
  }[];
}

/** Typed workbook → xlsx (frozen bold header). */
export const writeXlsx = (c: Classeur) => appeler("xlsx_ecrire", json(c));
export interface EditionCellule {
  feuille: string;
  ligne: number;
  colonne: number;
  valeur?: CelluleLue;
  formule?: string;
}
/** Coordinates from 1; formulas recalculated by Gridcraft, styles kept. */
export const modifierXlsx = (xlsx: Uint8Array, editions: EditionCellule[]) =>
  appeler("xlsx_modifier", trames([json(editions), xlsx]));
export const remplacerDocx = (docx: Uint8Array, remplacements: { chercher: string; remplacer: string }[]) =>
  appeler("docx_remplacer", trames([json(remplacements), docx]));

/** Excel serial number (1900 system) → "YYYY-MM-DD". */
export function dateExcel(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86_400_000).toISOString().slice(0, 10);
}

// PDF and Word files (auto-fichiers crate) ------------------------------------------------------

/** Concatenates `u32` LE length-prefixed frames + bytes (input of multi-part operations). */
function trames(parties: Uint8Array[]): Uint8Array {
  const sortie = new Uint8Array(parties.reduce((n, p) => n + 4 + p.length, 0));
  const vue = new DataView(sortie.buffer);
  let i = 0;
  for (const p of parties) {
    vue.setUint32(i, p.length, true);
    sortie.set(p, i + 4);
    i += 4 + p.length;
  }
  return sortie;
}

/** PDFs merged in order, one bookmark per file (its name). */
export const fusionnerPdf = (pdfs: { nom: string; octets: Uint8Array }[]) =>
  appeler("pdf_fusionner", trames(pdfs.flatMap((p) => [encodeur.encode(p.nom), p.octets])));

/** New PDF made of the given pages (numbered from 1, in the given order). */
export const extrairePagesPdf = (pdf: Uint8Array, pages: number[]) =>
  appeler("pdf_pages", trames([json(pages.map((p) => p - 1)), pdf]));

/** Nombre de pages d'un PDF. */
export const nombrePagesPdf = (pdf: Uint8Array) => Number(new TextDecoder().decode(appeler("pdf_nombre_pages", pdf)));

/** Text of each page in reading order (500 pages at most; empty for a scanned page). */
export const textePdf = (pdf: Uint8Array): string[] =>
  (JSON.parse(new TextDecoder().decode(appeler("pdf_texte", pdf))) as { pages: string[] }).pages;

export interface DocumentSimple {
  titre?: string;
  paragraphes: { texte: string; style?: "titre" | "titre1" | "titre2" | "titre3"; gras?: boolean }[];
}

/** A4 Word document: title then paragraphs (one line of text = one paragraph). */
export const creerDocx = (d: DocumentSimple) => appeler("docx_creer", json(d));

/** Names of the `{{ name }}` fields of a Word template, without duplicates. */
export const champsDocx = (docx: Uint8Array): string[] =>
  JSON.parse(new TextDecoder().decode(appeler("docx_champs", docx)));

/** Word template whose known `{{ name }}` fields are replaced (the others remain). */
export const remplirDocx = (docx: Uint8Array, valeurs: Record<string, string>) =>
  appeler("docx_remplir", trames([json(valeurs), docx]));

/** Body text of a Word document, one paragraph per line. */
export const texteDocx = (docx: Uint8Array) => new TextDecoder().decode(appeler("docx_texte", docx));

/** Word document → PDF (wordcraft layout, embedded fonts). */
export const docxEnPdf = (docx: Uint8Array) => appeler("docx_pdf", docx);

// Redaction, signing and presentations (auto-fichiers crate) ------------------------------------

/** Reads `u32` LE length-prefixed frames + bytes (output of multi-part operations). */
function lireTrames(o: Uint8Array): Uint8Array[] {
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const parties: Uint8Array[] = [];
  for (let i = 0; i < o.length;) {
    const n = vue.getUint32(i, true);
    parties.push(o.subarray(i + 4, i + 4 + n));
    i += 4 + n;
  }
  return parties;
}

export type MotifCaviardage = "iban" | "email" | "telephone" | "carte" | "date";

export interface OptionsCaviardage {
  textes?: string[];
  motifs?: MotifCaviardage[];
  casse?: boolean;
  mots_entiers?: boolean;
  texte_superpose?: string;
}

export interface RapportCaviardage {
  occurrences: number;
  pages: number[];
  par_recherche: { recherche: string; occurrences: number }[];
  glyphes: number;
  images: number;
  traces: number;
  annotations: number;
  champs: number;
}

/** Permanent redaction (content removed, black box, verification); with no occurrence, PDF unchanged. */
export function caviarderPdf(pdf: Uint8Array, o: OptionsCaviardage) {
  const [rapport, sortie] = lireTrames(appeler("pdf_caviarder", trames([json(o), pdf])));
  return { pdf: sortie!.slice(), rapport: JSON.parse(new TextDecoder().decode(rapport)) as RapportCaviardage };
}

export interface OptionsSignature {
  mot_de_passe: string;
  /** PDF date `D:YYYYMMDDHHmmSSZ`; defaults to now. */
  date?: string;
  raison?: string;
  lieu?: string;
  contact?: string;
  champ?: string;
  /** Page of the new field, from 0. */
  page?: number;
  /** Visible rectangle `[x0, y0, x1, y1]` in points, origin at bottom left; otherwise invisible. */
  rectangle?: [number, number, number, number];
  certifier?: 1 | 2 | 3;
}

/** Date PDF UTC (`D:20261023120000Z`). */
export const datePdf = (d = new Date()) => `D:${d.toISOString().replace(/\D/g, "").slice(0, 14)}Z`;

/** PAdES B-B signature (ETSI.CAdES.detached) with a PKCS #12 identity, as an incremental update. */
export const signerPdf = (pdf: Uint8Array, p12: Uint8Array, o: OptionsSignature) =>
  appeler("pdf_signer", trames([json({ ...o, date: o.date ?? datePdf() }), p12, pdf]));

export interface SignatureVerifiee {
  champ: string;
  signee: boolean;
  statut: "valide" | "inconnue" | "invalide" | "non_signee";
  signataire: string | null;
  date: string | null;
  raison: string | null;
  lieu: string | null;
  format: string | null;
  algorithme: string | null;
  certification: number | null;
  horodatage: boolean;
  modifications: "aucune" | "permises" | "interdites";
  changements: string[];
  empreinte: string | null;
  details: string[];
}

/** Verified signatures of a PDF; `confiance`: trusted PEM certificates (otherwise unknown identities). */
export const verifierSignaturesPdf = (pdf: Uint8Array, confiance = ""): SignatureVerifiee[] =>
  JSON.parse(new TextDecoder().decode(appeler("pdf_signatures", trames([encodeur.encode(confiance), pdf]))));

export interface NouvellePresentation {
  titre?: string;
  sous_titre?: string;
  diapositives: { titre?: string; puces?: (string | { texte: string; niveau?: number })[]; notes?: string }[];
}

/** 16:9 PPTX presentation: title slide then title-and-bullets slides. */
export const creerPptx = (p: NouvellePresentation) => appeler("pptx_creer", json(p));

/** PPTX → PDF, one slide per page (DeckCraft rendering, selectable text). */
export const pptxEnPdf = (pptx: Uint8Array) => appeler("pptx_pdf", pptx);

// Base de connaissances (crate auto-connaissance, aphrody-rag-core) --------------------------------

export interface Morceau {
  /** Position in the document, from 0. */
  position: number;
  texte: string;
  /** Heading trail (`Guide > Warranty`) of a Markdown source. */
  titre: string | null;
  ligne_debut: number;
  ligne_fin: number;
}

/** Chunks of a text: sections by headings for a `.md` source, otherwise grouped sentences (15% overlap). */
export const decouperTexte = (source: string, texte: string, taille?: number): Morceau[] =>
  JSON.parse(new TextDecoder().decode(appeler("rag_decouper", json({ source, texte, taille }))));

const octetsF32 = (v: Float32Array | number[]) => {
  const f = v instanceof Float32Array ? v : Float32Array.from(v);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
};

/**
 * The `k` rows of `matrice` (vectors of `dimension` numbers laid end to end) closest to `question`
 * by cosine similarity, highest score first; `diversite` (MMR λ, 0 to 1) drops near-duplicates.
 */
export const plusProches = (
  question: Float32Array | number[],
  matrice: Float32Array,
  dimension: number,
  k: number,
  diversite?: number,
): { indice: number; score: number }[] =>
  JSON.parse(
    new TextDecoder().decode(
      appeler("rag_topk", trames([json({ dimension, k, diversite }), octetsF32(question), octetsF32(matrice)])),
    ),
  );
