// UI catalogs (locales/<tag>.json, English source, MF2). Locales = catalogs present; the browser language picks one.
import { createTranslator } from "@aphrody/i18n/browser";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

const catalogs = { en, fr };

export const tr = createTranslator(catalogs, typeof navigator === "undefined" ? "en" : navigator.language, "en");
export const loc = tr.locale;
export const t = tr.t;

const nf = new Map<number, Intl.NumberFormat>();
/** Number with a fixed count of fraction digits in the UI locale. */
export const num = (v: number, digits = 0): string => {
  let f = nf.get(digits);
  if (!f)
    nf.set(
      digits,
      (f = new Intl.NumberFormat(loc, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })),
    );
  return f.format(v);
};
