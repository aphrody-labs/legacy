// Catalogs of the accounts layer live next to it (locales/<tag>.json); engine and negotiation come from @auto/i18n.
import { createTranslator, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Translator for the language the user asked in (Accept-Language of the request), else the source locale. */
export const traducteur = (request?: Request | null): Translator =>
  createTranslator(request?.headers.get("accept-language"), catalogs);

/** Translator for a language tag or an Accept-Language value (no request at hand: roles, segments, exports). */
export const traducteurPour = (locale?: string | null): Translator => createTranslator(locale, catalogs);
