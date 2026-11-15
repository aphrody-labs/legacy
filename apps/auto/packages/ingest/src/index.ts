// Ingestion of supplier invoices: Factur-X (CII XML read directly) or PDF (OCR then LLM constrained by JSON
// Schema), then checks. Stateless functions: no cache between two calls, so nothing passes from one tenant to
// another.
import { extraireXml } from "@auto/native";
import { lireCii } from "./cii";
import { conforme, SCHEMA, sansNuls, valider, type FactureRecue, type Source } from "./facture";
import type { ClientLlm } from "./llm";
import { ocrParDefaut, type Ocr } from "./ocr";

export * from "./facture";
export * from "./devis";
export { analyserXml, centimes, lireCii } from "./cii";
export * from "./llm";
export * from "./ocr";

export type StatutRecue = "a_verifier" | "validee" | "rejetee";

export interface Resultat {
  source: Source | null;
  statut: Exclude<StatutRecue, "rejetee">;
  facture: FactureRecue | null;
  anomalies: string[];
}

export interface OptionsIngestion {
  ocr?: Ocr;
  /** Without an LLM, a PDF without XML goes straight to the "to check" queue. */
  llm?: ClientLlm | null;
  aujourdhui?: string;
  /** OCR text sent to the LLM, truncated (characters). */
  maxTexte?: number;
}

const PROMPT = `You extract the data of a French supplier invoice from its OCR text.
Reply only with a JSON object that matches the schema provided.
- Amounts in whole cents (12.50 EUR = 1250); VAT rates in tenths of a percent (20% = 200, 5.5% = 55).
- Dates as YYYY-MM-DD; currency as an ISO 4217 code (EUR by default).
- SIREN: 9 digits; SIRET: 14 digits; no spaces.
- Invent nothing: null for a field absent from the text.`;

const debut = (o: Uint8Array, s: string) => new TextDecoder().decode(o.subarray(0, 64)).trimStart().startsWith(s);

function conclure(source: Source, f: FactureRecue, anomalies: string[], aujourdhui?: string): Resultat {
  const a = [...anomalies, ...valider(f, aujourdhui)];
  return { source, statut: a.length ? "a_verifier" : "validee", facture: f, anomalies: a };
}

/** LLM extraction from an OCR text, as JSON constrained by SCHEMA then checked again. */
export async function extraireParLlm(llm: ClientLlm, texte: string, max = 24_000): Promise<FactureRecue> {
  const r = await llm.completer({
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: texte.slice(0, max) },
    ],
    schema: { nom: "facture_recue", schema: SCHEMA },
  });
  let v: unknown;
  try {
    v = JSON.parse((r.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("LLM response is not JSON");
  }
  const ecarts = conforme(SCHEMA, v);
  if (ecarts.length) throw new Error(`LLM response does not match the schema: ${ecarts.slice(0, 5).join("; ")}`);
  return sansNuls(v as FactureRecue);
}

/** Received file (Factur-X PDF, plain PDF or CII XML) → normalized invoice and status. */
export async function ingerer(fichier: Uint8Array, o: OptionsIngestion = {}): Promise<Resultat> {
  const xml = debut(fichier, "<")
    ? new TextDecoder().decode(fichier)
    : debut(fichier, "%PDF")
      ? extraireXml(fichier)
      : null;
  if (xml) {
    const f = lireCii(xml);
    if (f) return conclure("facturx", f, [], o.aujourdhui);
    if (!debut(fichier, "%PDF"))
      return { source: null, statut: "a_verifier", facture: null, anomalies: ["XML non CII"] };
  }
  if (!debut(fichier, "%PDF"))
    return {
      source: null,
      statut: "a_verifier",
      facture: null,
      anomalies: ["unrecognized format (PDF or CII XML expected)"],
    };

  const texte = await (o.ocr ?? ocrParDefaut)(fichier);
  if (!texte.trim())
    return {
      source: "ocr",
      statut: "a_verifier",
      facture: null,
      anomalies: ["no readable text (OCR unavailable or empty)"],
    };
  if (!o.llm)
    return { source: "ocr", statut: "a_verifier", facture: null, anomalies: ["LLM not configured (AUTO_LLM_URL)"] };
  try {
    return conclure("ocr", await extraireParLlm(o.llm, texte, o.maxTexte), [], o.aujourdhui);
  } catch (e) {
    return { source: "ocr", statut: "a_verifier", facture: null, anomalies: [(e as Error).message] };
  }
}
