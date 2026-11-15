// Browser-safe entry: translator, MF2 and locale matching, no config or catalog directory access.
// Pass the catalogs (imported JSON) and the source locale explicitly.
export * from "./adapter.ts";
export * from "./match.ts";
export { createTranslatorCore as createTranslator } from "./translator.ts";
export type {
  Catalog,
  Catalogs,
  Translator,
  TranslatorOptions,
} from "./translator.ts";
export {
  argNames,
  formatMessage,
  isRtl,
  mf2Adapter,
  MessageSyntaxError,
  parseMessage,
  pluralCategory,
} from "./mf2.ts";
