// Browser translator of the app and the public pages, fixed for the page lifetime: `?lang=`, then the browser languages.
import { choisirLangue, traducteur } from "../i18n";

function demandee(): string {
  const requete = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("lang");
  if (requete) return requete;
  return typeof navigator === "undefined" ? "" : (navigator.languages ?? [navigator.language]).join(",");
}

const tr = traducteur(choisirLangue(demandee()));

export const locale = tr.locale;
/** Translate a catalog key (MessageFormat 2) with named arguments. */
export const t = tr.t;
export const nombre = tr.number;
export const monnaie = tr.currency;
export const date = tr.date;
if (typeof document !== "undefined") document.documentElement.lang = locale;
