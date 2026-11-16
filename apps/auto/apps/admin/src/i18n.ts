// Catalogs of the operator console live next to it (locales/<tag>.json); engine and negotiation come from @auto/i18n.
// The locale is the `lang` of the document (set from the browser languages at startup) or the one passed in.
import { createTranslator, type MessageArgs, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Translator for a language tag or an Accept-Language value; the document language when none is given. */
export const translator = (locale?: string | null): Translator =>
  createTranslator(locale ?? (typeof document === "undefined" ? null : document.documentElement.lang), catalogs);

export const t = (key: string, args?: MessageArgs): string => translator().t(key, args);

/** Negotiates the browser languages against the shipped catalogs, then sets the document language and title. */
export function initLocale(languages: readonly string[] = navigator.languages): string {
  const tag = translator(languages.join(",")).locale;
  document.documentElement.lang = tag;
  document.title = `${t("console.title")} · auto`;
  return tag;
}
