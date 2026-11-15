// The only place that lists catalogs: add `<tag>.json` here to ship a language (a test checks it matches the folder).
import config from "./config.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };

export const SOURCE_LOCALE: string = config.source;
export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };
