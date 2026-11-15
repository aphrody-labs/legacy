// Catalogs of the mail package live next to it (locales/<tag>.json); engine and negotiation come from @auto/i18n.
import { createTranslator, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Translator for a language tag or an Accept-Language value; the source locale when unknown. */
export const traducteur = (locale?: string | null): Translator => createTranslator(locale, catalogs);
