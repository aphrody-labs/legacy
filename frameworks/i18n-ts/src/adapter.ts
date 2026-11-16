// Message-format adapters. A project keeps the format its catalogs already use; MF2 (Unicode MessageFormat 2,
// `messageformat` package) is the default. Formats that are detected but have no adapter are rejected with a clear
// error: no adapter pretends to work.

export type MessageArg = string | number | boolean | Date | bigint;
export type MessageArgs = Readonly<Record<string, MessageArg>>;

export interface CompiledMessage {
  format(args?: MessageArgs): string;
  /** Names of the arguments the message reads (placeholder parity across locales). */
  argNames(): string[];
}

export interface MessageAdapter {
  readonly id: string;
  /** Parse `source` for `locale`; throws MessageSyntaxError when it does not parse. */
  compile(source: string, locale: string): CompiledMessage;
}

export interface CatalogFile {
  name: string;
  text: string;
}

export class UnsupportedFormatError extends Error {
  constructor(
    readonly format: string,
    detail: string,
  ) {
    super(
      `message format "${format}" (${detail}) has no adapter; implemented: ${[...adapters.keys()].join(", ")}`,
    );
    this.name = "UnsupportedFormatError";
  }
}

const adapters = new Map<string, MessageAdapter>();
export const registerAdapter = (a: MessageAdapter) =>
  void adapters.set(a.id, a);

/** Adapter for a format id; throws UnsupportedFormatError for an id nobody implemented. */
export function getAdapter(id: string): MessageAdapter {
  const a = adapters.get(id);
  if (!a) throw new UnsupportedFormatError(id, "requested");
  return a;
}

const FILE_FORMATS: [RegExp, string][] = [
  [/\.ftl$/i, "fluent"],
  [/\.pot?$/i, "gettext"],
  [/\.arb$/i, "arb"],
  [/\.xlf$|\.xliff$/i, "xliff"],
  [/\.properties$/i, "java-properties"],
];

/**
 * Detect the message format of a project from its catalog files: by extension (.ftl Fluent, .po gettext,
 * .arb Flutter, .xlf XLIFF), then by message syntax for JSON: `{$x}` / `.match` = mf2, `{x, plural, ...}` = icu-mf1,
 * `{{x}}` or `$t(` = i18next. Returns undefined when nothing can be inferred.
 */
export function detectFormat(
  files: readonly CatalogFile[],
): string | undefined {
  for (const f of files)
    for (const [re, id] of FILE_FORMATS) if (re.test(f.name)) return id;
  let mf1 = false;
  let i18next = false;
  for (const f of files) {
    if (!/\.json$/i.test(f.name)) continue;
    let data: unknown;
    try {
      data = JSON.parse(f.text);
    } catch {
      continue;
    }
    for (const v of flattenStrings(data)) {
      if (/\{\$[\w.-]+|^\s*\.(match|input|local)\b/m.test(v)) return "mf2";
      if (
        /\{\s*[\w.-]+\s*,\s*(plural|select|selectordinal|number|date|time)\b/.test(
          v,
        )
      )
        mf1 = true;
      if (/\{\{\s*[\w.-]+\s*\}\}|\$t\(/.test(v)) i18next = true;
    }
  }
  return i18next ? "i18next" : mf1 ? "icu-mf1" : undefined;
}

function* flattenStrings(v: unknown): Generator<string> {
  if (typeof v === "string") yield v;
  else if (v && typeof v === "object")
    for (const x of Object.values(v)) yield* flattenStrings(x);
}

/** Resolve the adapter for a project: configured id, else detected from files, else mf2. */
export function resolveAdapter(
  configured: string | undefined,
  files: readonly CatalogFile[],
): MessageAdapter {
  const id = configured ?? detectFormat(files) ?? "mf2";
  const a = adapters.get(id);
  if (!a)
    throw new UnsupportedFormatError(
      id,
      configured ? "configured" : "detected from the catalogs",
    );
  return a;
}
