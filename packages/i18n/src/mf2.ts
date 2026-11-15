import {
  MessageFormat,
  MessageSyntaxError,
  parseMessage,
  visit,
} from "messageformat";
import {
  registerAdapter,
  type CompiledMessage,
  type MessageAdapter,
  type MessageArgs,
} from "./adapter.ts";

export { MessageSyntaxError, parseMessage };

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "yi", "dv", "ckb"]);
export const isRtl = (locale: string): boolean => {
  try {
    const l = new Intl.Locale(locale);
    return RTL.has(l.language);
  } catch {
    return false;
  }
};

const cache = new Map<string, CompiledMessage>();

/** Names of the variables a message reads (declared `.local` names excluded). */
export function argNames(source: string): string[] {
  const used = new Set<string>();
  const locals = new Set<string>();
  visit(parseMessage(source), {
    declaration: (d) => {
      if (d.type === "local") locals.add(d.name);
    },
    value: (v) => {
      if (v.type === "variable") used.add(v.name);
    },
  });
  return [...used].filter((n) => !locals.has(n)).sort();
}

function compile(source: string, locale: string): CompiledMessage {
  const key = `${locale}\0${source}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Isolation marks only matter for right-to-left text; they would pollute LTR UI strings and HTML.
  const mf = new MessageFormat(locale, source, {
    bidiIsolation: isRtl(locale) ? "default" : "none",
  });
  const names = argNames(source);
  const out: CompiledMessage = {
    format: (args = {}) => mf.format(args as Record<string, unknown>, () => {}),
    argNames: () => names,
  };
  cache.set(key, out);
  return out;
}

export const mf2Adapter: MessageAdapter = { id: "mf2", compile };
registerAdapter(mf2Adapter);

/** Format one MF2 message. Unresolved variables render as `{$name}` (MF2 fallback representation). */
export const formatMessage = (
  source: string,
  locale: string,
  args: MessageArgs = {},
): string => compile(source, locale).format(args);

export function pluralCategory(n: number, locale: string): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale).select(n);
  } catch {
    return "other";
  }
}
