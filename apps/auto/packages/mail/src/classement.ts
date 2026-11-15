// Classification of received messages: invoice (Factur-X or invoice PDF) or ordinary mail.
import type { PieceJointe } from "./mime";

export type Classement = "facture" | "autre";

const MOTS_FACTURE = /factur|invoice|avoir|rechnung/i;

const estPdf = (p: PieceJointe) =>
  p.type === "application/pdf" ||
  (p.nom.toLowerCase().endsWith(".pdf") && new TextDecoder().decode(p.octets.subarray(0, 5)) === "%PDF-");

/**
 * `estFacturx` receives the bytes of a PDF and says whether it embeds a Factur-X XML (Rust extraction).
 * An invoice is recognized by a Factur-X, or by a PDF whose name or subject mentions an invoice.
 */
export function classer(
  sujet: string,
  pieces: PieceJointe[],
  estFacturx: (pdf: Uint8Array) => boolean,
): { classement: Classement; facturx: boolean[] } {
  const facturx = pieces.map((p) => estPdf(p) && estFacturx(p.octets));
  const facture =
    facturx.some(Boolean) || pieces.some((p) => estPdf(p) && (MOTS_FACTURE.test(p.nom) || MOTS_FACTURE.test(sujet)));
  return { classement: facture ? "facture" : "autre", facturx };
}
