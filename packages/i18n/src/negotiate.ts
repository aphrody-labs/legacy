import { readConfig } from "./config.ts";

export * from "./match.ts";

/** Source locale of the project, from i18n.config.json (default en). */
export const sourceLocale = (): string => readConfig().sourceLocale;
