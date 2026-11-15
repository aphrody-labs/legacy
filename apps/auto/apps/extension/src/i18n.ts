// Extension catalogs live next to the extension (locales/<tag>.json); the engine and negotiation come from @auto/i18n.
import { createTranslator, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Translator for a locale tag (the browser UI language in the extension pages and the service worker). */
export const traducteur = (locale?: string | null): Translator => createTranslator(locale, catalogs);

/** Join parts with the list conventions of the translator's locale (unit style, no conjunction forced). */
export const lister = (t: Translator, parts: string[]) =>
  new Intl.ListFormat(t.locale, { type: "unit", style: "short" }).format(parts);
