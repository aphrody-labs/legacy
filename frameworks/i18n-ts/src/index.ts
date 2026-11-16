export * from "./adapter.ts";
export * from "./config.ts";
export * from "./negotiate.ts";
export * from "./i18n.ts";
export {
  argNames,
  formatMessage,
  isRtl,
  mf2Adapter,
  MessageSyntaxError,
  parseMessage,
  pluralCategory,
} from "./mf2.ts";
import { loadCatalogsSync } from "./i18n.ts";

/** Catalogs found in frameworks/i18n-ts/locales at load time; the same JSON files are read by frameworks/i18n. */
export const catalogs: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = loadCatalogsSync();
