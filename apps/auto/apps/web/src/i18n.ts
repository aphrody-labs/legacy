// apps/web catalogs live next to the code (locales/<tag>.json, MessageFormat 2); the engine and negotiation come from
// @auto/i18n. Locales are whatever catalogs exist: nothing here branches on a language.
import { LOCALES, createTranslator, matchLocale, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Every locale the web app can render: the shared catalogs plus its own. */
export const LANGUES: readonly string[] = [...new Set([...LOCALES, ...Object.keys(catalogs)])];

/** Translator for a BCP 47 tag or an Accept-Language header, with the apps/web catalogs layered over the shared ones. */
export const traducteur = (locale?: string | null): Translator => createTranslator(locale, catalogs);

/** Best locale for a tag or an Accept-Language header among the locales the web app ships. */
export const choisirLangue = (demande?: string | null): string => matchLocale(demande, LANGUES);

/** Locale asked by a request: `?lang=`, then Accept-Language, negotiated against the catalogs shipped. */
export function langueDemandee(req: Request): string {
  return choisirLangue(new URL(req.url).searchParams.get("lang") ?? req.headers.get("accept-language"));
}

/** Plain-text response (errors) in the language of the request. */
export function texte(req: Request, cle: string, status: number, entetes?: HeadersInit): Response {
  return new Response(traducteur(langueDemandee(req)).t(cle), {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...entetes },
  });
}
