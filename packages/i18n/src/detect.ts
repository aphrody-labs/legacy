// Language detection for tracked text: flags prose that is not in the project's source locale.
// Detector: eld (Efficient Language Detector, pure JS n-gram detector; no maintained JS/WASM build of lingua exists on npm).
import { eld } from "eld/medium";
import { readConfig } from "./config.ts";

export interface Detection {
  /** ISO 639-1 code, empty when nothing was detected */
  language: string;
  reliable: boolean;
}

export function detectLanguage(text: string): Detection {
  const r = eld.detect(text);
  return { language: r.language, reliable: r.isReliable() };
}

/** Source language code (ISO 639-1) of the project, from i18n.config.json. */
export const sourceLanguage = (root?: string): string =>
  new Intl.Locale(readConfig(root).sourceLocale).language;

const URL_OR_PATH = /\b(?:https?:\/\/|[\w.-]+\/[\w./-]+)\S*/g;
const NON_LATIN =
  /[\u0400-\u04ff\u0590-\u06ff\u0900-\u0dff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;

/** The human-language part of a source line: the comment and long string literals of code, the text of prose. */
export function proseOf(line: string, code: boolean): string {
  let s = line;
  if (code) {
    const parts: string[] = [];
    const c = /(?:\/\/+|\/\*+|^\s*\*|^\s*#+)\s?(.*)$/.exec(s);
    if (c?.[1]) parts.push(c[1].replace(/\*\/\s*$/, ""));
    for (const m of s.matchAll(/(["'`])((?:\\.|(?!\1).){24,}?)\1/g))
      parts.push(m[2]!);
    s = parts.join(" ");
  } else {
    s = s.replace(/^\s*(?:[-*+>]|\d+\.|#{1,6})\s+/, "").replace(/\|/g, " ");
  }
  return s
    .replace(/`[^`]*`/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(URL_OR_PATH, " ")
    .replace(/\{[^}]*\}|<[^>]*>|\$\{[^}]*\}/g, " ")
    .replace(/\b[\w.]*[_$][\w.$]*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `line` is reliable prose in a language other than `sourceLang`. */
export function isNonSourceProse(
  line: string,
  code: boolean,
  sourceLang: string,
): boolean {
  const text = proseOf(line, code);
  const words = text.split(" ").filter((w) => /^\p{L}{2,}[.,;:!?]?$/u.test(w));
  const nonLatin = (text.match(NON_LATIN) ?? []).length;
  if (words.length < 6 && nonLatin < 6) return false;
  const d = detectLanguage(text);
  return d.reliable && d.language !== "" && d.language !== sourceLang;
}
