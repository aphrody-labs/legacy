// Catalogs of the services (customer-facing mails and documents) live next to them (locales/<tag>.json);
// engine and negotiation come from @auto/i18n.
import { createTranslator, type Translator } from "@auto/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/**
 * Language of the texts sent to customers until tenants store their own language: `AUTO_LOCALE_DOCUMENTS`,
 * French by default (the customers of the current tenants are French companies).
 */
export const langueDocuments = (env: Record<string, string | undefined> = Bun.env): string =>
  env.AUTO_LOCALE_DOCUMENTS || "fr";

/** Translator for a language tag or an Accept-Language value; the documents language when none is given. */
export const traducteur = (locale?: string | null): Translator =>
  createTranslator(locale ?? langueDocuments(), catalogs);

export const premiereMajuscule = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
