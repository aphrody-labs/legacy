// Pure extension logic (no chrome.* API): tested with bun:test, shared by the service worker and the popup.
import type { Translator } from "@auto/i18n";
import { lister, traducteur } from "./i18n";

export const INSTANCE_PAR_DEFAUT = "https://auto.aphrody.com";
/** Same cap as the API (apps/api/src/modules/ingest.ts). */
export const TAILLE_MAX = 20 * 1024 * 1024;

export interface Reglages {
  instance: string;
  jeton: string;
}

/** Normalized instance URL (origin only); https required, except localhost for a dev instance. */
export function normaliserInstance(brute: string, t: Translator = traducteur()): string {
  let u: URL;
  try {
    u = new URL(brute.trim());
  } catch {
    throw new Error(t.t("ext.error.instance_invalid"));
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new Error(t.t("ext.error.instance_https"));
  return u.origin;
}

/** Host permission pattern for an origin (ex. https://auto.aphrody.com/*). */
export const motifHote = (origine: string) => `${new URL(origine).origin}/*`;

/** auto API tokens start with "auto_" (packages/tenancy). */
export const jetonValide = (j: string) => /^auto_[A-Za-z0-9_-]{20,}$/.test(j.trim());

export type TypeFichier = "application/pdf" | "application/xml";

/** File type from its first bytes (which win over the often wrong header); null if neither PDF nor XML. */
export function typeFichier(octets: Uint8Array): TypeFichier | null {
  const debut = new TextDecoder().decode(octets.subarray(0, 512)).replace(/^﻿/, "").trimStart();
  if (debut.startsWith("%PDF-")) return "application/pdf";
  if (debut.startsWith("<?xml") || /^<([\w-]+:)?CrossIndustryInvoice\b/.test(debut)) return "application/xml";
  return null;
}

/** File name: Content-Disposition (RFC 5987 filename*, then filename), otherwise the last URL segment. */
export function nomFichier(url: string, contentDisposition: string | null, type: TypeFichier): string {
  const extension = type === "application/pdf" ? ".pdf" : ".xml";
  const cd = contentDisposition ?? "";
  const etoile = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(cd);
  const simple = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  let nom = "";
  try {
    nom = etoile ? decodeURIComponent(etoile[1]!.trim()) : simple ? simple[1]!.trim() : "";
  } catch {
    nom = "";
  }
  if (!nom) {
    try {
      nom = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "");
    } catch {
      nom = "";
    }
  }
  // Characters forbidden in a file name, and control characters (code < 32).
  nom =
    [...nom]
      .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? "_" : c))
      .join("")
      .slice(0, 120) || "invoice";
  return nom.toLowerCase().endsWith(extension) ? nom : `${nom}${extension}`;
}

/** URL used to deposit a received invoice on the instance. */
export const urlDepot = (instance: string, nom: string) =>
  `${instance}/v1/factures-recues?nom=${encodeURIComponent(nom)}`;

export interface Recue {
  id: string;
  statut: "a_verifier" | "validee" | "rejetee";
  doublon?: boolean;
  fournisseur: string | null;
  numero: string | null;
  ttcCents: number | null;
  anomalies: string[];
}

/** Notification text after a deposit, from the user's point of view. Amounts are in euros (the API model has no currency). */
export function messageDepot(r: Recue, nom: string, t: Translator = traducteur()): { titre: string; message: string } {
  if (r.doublon)
    return { titre: t.t("ext.deposit.duplicate.title"), message: t.t("ext.deposit.duplicate.message", { name: nom }) };
  const parts = [
    r.numero ? t.t("ext.deposit.part.invoice_number", { number: r.numero }) : t.t("ext.deposit.part.invoice"),
    ...(r.fournisseur ? [t.t("ext.deposit.part.supplier", { supplier: r.fournisseur })] : []),
    ...(r.ttcCents !== null ? [t.t("ext.deposit.part.total", { total: t.currency(r.ttcCents / 100, "EUR") })] : []),
  ];
  const summary = lister(t, parts);
  return r.statut === "validee"
    ? { titre: t.t("ext.deposit.saved.title"), message: t.t("ext.deposit.saved.message", { summary }) }
    : {
        titre: t.t("ext.deposit.review.title"),
        message: t.t("ext.deposit.review.message", { summary, count: r.anomalies.length }),
      };
}

/** Badge text: number of invoices to check, empty at zero, "99+" beyond. */
export const texteBadge = (n: number) => (n <= 0 ? "" : n > 99 ? "99+" : String(n));

/** Readable error message from an API response ({ erreur, details }); `erreur` is the server's own text. */
export function erreurApi(statut: number, corps: unknown, t: Translator = traducteur()): string {
  const c = (corps ?? {}) as { erreur?: string; details?: string[] };
  if (statut === 401) return t.t("ext.error.token_rejected");
  if (statut === 402) return c.erreur ?? t.t("ext.error.quota");
  if (statut === 403) return t.t("ext.error.forbidden");
  const message = c.erreur ?? t.t("ext.error.generic", { status: statut });
  return c.details?.length ? t.t("ext.error.with_details", { message, details: lister(t, c.details) }) : message;
}
