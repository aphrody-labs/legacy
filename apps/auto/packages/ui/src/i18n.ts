// Catalogs of the UI kit live next to it (locales/<tag>.json); engine and negotiation come from @auto/i18n.
// The locale is the one set with `setLocale`, else the `lang` of the document, else the source locale.
import { createTranslator, type MessageArgs, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

let forced: string | null = null;

/** Force the UI locale (BCP 47 tag); `null` goes back to the document language. */
export const setLocale = (tag: string | null) => {
  forced = tag;
};

export const translator = (): Translator =>
  createTranslator(forced ?? (typeof document === "undefined" ? null : document.documentElement.lang), catalogs);

export const t = (key: string, args?: MessageArgs): string => translator().t(key, args);
