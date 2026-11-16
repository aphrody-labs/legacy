// Machine translation of missing catalog keys. Provider-agnostic: `ask` is any text-in/text-out model (the ai-os
// model layer in the CLI). Output is validated with the message-format adapter (must parse, same placeholders as
// the source) and recorded in a sidecar, so human-reviewed keys are never overwritten.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { MessageAdapter } from "./adapter.ts";
import type { Catalog } from "./i18n.ts";

export type Ask = (prompt: string, system: string) => Promise<string>;

export interface MachineEntry {
  /** hash of the source text the translation was made from (detects stale machine output) */
  from: string;
  model: string;
}
export type Sidecar = Record<string, MachineEntry>;

export const sidecarPath = (dir: string, locale: string) =>
  join(dir, "_machine", `${locale}.json`);

export const hashText = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex").slice(0, 16);

export async function readSidecar(
  dir: string,
  locale: string,
): Promise<Sidecar> {
  const p = sidecarPath(dir, locale);
  return existsSync(p) ? ((await Bun.file(p).json()) as Sidecar) : {};
}

export async function writeSidecar(
  dir: string,
  locale: string,
  s: Sidecar,
): Promise<void> {
  const p = sidecarPath(dir, locale);
  mkdirSync(join(dir, "_machine"), { recursive: true });
  if (!Object.keys(s).length) {
    if (existsSync(p)) await Bun.file(p).delete();
    return;
  }
  const sorted = Object.fromEntries(
    Object.entries(s).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  await Bun.write(p, JSON.stringify(sorted, null, 2) + "\n");
}

const languageName = (tag: string): string => {
  const l = new Intl.Locale(tag);
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const base = names.of(l.language) ?? tag;
  const script = l.script
    ? ` (${new Intl.DisplayNames(["en"], { type: "script" }).of(l.script)} script)`
    : "";
  const region = l.region
    ? ` as used in ${new Intl.DisplayNames(["en"], { type: "region" }).of(l.region)}`
    : "";
  return `${base}${script}${region} [${tag}]`;
};

const SYSTEM = (source: string, target: string, format: string) =>
  `You are a professional software localizer translating UI strings from ${source} to ${target}. ` +
  `The strings use the ${format} message syntax. Keep every placeholder name and every syntax token ` +
  `exactly as in the source (for MessageFormat 2: {$name}, {$n :number}, .input, .match, variant keys, the * catch-all, {{ }} pattern quotes, backslash escapes). ` +
  `Translate only the human text. For plural variants, write the variant keys the CLDR plural categories of ${target} require ` +
  `(plus exact numeric keys such as 0 when the source has them) and always a final * variant. ` +
  `Reply with one JSON object mapping each key to its translated string, nothing else.`;

function parseJsonObject(text: string): Record<string, unknown> {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("no JSON object in the reply");
  const v = JSON.parse(m[0]) as unknown;
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("reply is not a JSON object");
  return v as Record<string, unknown>;
}

export interface TranslateReport {
  locale: string;
  translated: string[];
  /** machine keys redone because the source text changed */
  refreshed: string[];
  failed: { key: string; reason: string }[];
}

export interface TranslateInput {
  source: Catalog;
  sourceLocale: string;
  /** current catalog of the target (empty for a new locale) */
  target: Catalog;
  sidecar: Sidecar;
  locale: string;
  adapter: MessageAdapter;
  adapterName: string;
  ask: Ask;
  model: string;
  /** redo machine keys whose source text changed */
  refreshStale?: boolean;
  batch?: number;
}

/** Fill the missing keys of one locale. Returns the new catalog and sidecar; the caller writes them. */
export async function translateLocale(inp: TranslateInput): Promise<{
  catalog: Record<string, string>;
  sidecar: Sidecar;
  report: TranslateReport;
}> {
  const catalog: Record<string, string> = { ...inp.target };
  const sidecar: Sidecar = { ...inp.sidecar };
  const report: TranslateReport = {
    locale: inp.locale,
    translated: [],
    refreshed: [],
    failed: [],
  };
  const todo: string[] = [];
  for (const [k, text] of Object.entries(inp.source)) {
    if (!(k in catalog)) todo.push(k);
    else if (
      sidecar[k] &&
      sidecar[k]!.from !== hashText(text) &&
      inp.refreshStale
    ) {
      todo.push(k);
      report.refreshed.push(k);
    }
  }
  const sys = SYSTEM(
    languageName(inp.sourceLocale),
    languageName(inp.locale),
    inp.adapterName,
  );
  const size = inp.batch ?? 15;
  const srcArgs = (k: string) =>
    inp.adapter.compile(inp.source[k]!, inp.sourceLocale).argNames().join();

  const accept = (k: string, v: unknown): string | undefined => {
    if (typeof v !== "string" || !v) return "empty or non-string value";
    try {
      const got = inp.adapter.compile(v, inp.locale).argNames().join();
      if (got !== srcArgs(k))
        return `placeholders differ: want [${srcArgs(k)}] got [${got}]`;
    } catch (e) {
      return `does not parse: ${(e as Error).message.split("\n")[0]}`;
    }
    return undefined;
  };
  const commit = (k: string, v: string) => {
    catalog[k] = v;
    sidecar[k] = { from: hashText(inp.source[k]!), model: inp.model };
    if (!report.refreshed.includes(k)) report.translated.push(k);
  };

  for (let i = 0; i < todo.length; i += size) {
    const keys = todo.slice(i, i + size);
    const payload = Object.fromEntries(keys.map((k) => [k, inp.source[k]]));
    let reply: Record<string, unknown> = {};
    try {
      reply = parseJsonObject(
        await inp.ask(JSON.stringify(payload, null, 1), sys),
      );
    } catch (e) {
      for (const k of keys)
        report.failed.push({ key: k, reason: (e as Error).message });
      continue;
    }
    for (const k of keys) {
      let bad = accept(k, reply[k]);
      if (!bad) {
        commit(k, reply[k] as string);
        continue;
      }
      // one corrective retry for this key alone
      try {
        const retry = parseJsonObject(
          await inp.ask(
            JSON.stringify({ [k]: inp.source[k] }) +
              `\nYour previous answer was rejected: ${bad}. Return the corrected JSON object.`,
            sys,
          ),
        );
        bad = accept(k, retry[k]);
        if (!bad) commit(k, retry[k] as string);
      } catch (e) {
        bad = (e as Error).message;
      }
      if (bad) report.failed.push({ key: k, reason: bad });
    }
  }
  return { catalog: orderLike(inp.source, catalog), sidecar, report };
}

/** Same key order as the source catalog (stable diffs); keys unknown to the source keep their place at the end. */
export function orderLike(
  source: Catalog,
  c: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(source)) if (k in c) out[k] = c[k]!;
  for (const k of Object.keys(c)) if (!(k in out)) out[k] = c[k]!;
  return out;
}
