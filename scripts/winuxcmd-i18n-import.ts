// winuxcmd-i18n catalogs -> the repo i18n stack (packages/i18n): MF2 messages in packages/i18n/catalogs/winuxcmd/<locale>.json.
//
//   bun scripts/winuxcmd-i18n-import.ts [--src DIR] [--write]
//
// A WinuxCmd catalog is `{ schema, locale, messages: { "<key>": "<text with {name} placeholders>" } }`; the stack's format is MF2 (flat
// key -> message, placeholders `{$name}`, see packages/i18n/i18n.config.json). The source locale of the namespace is English: its
// messages are the fallbacks compiled into WinuxCmd (winux-core `tr!`), so only translated locales are carried here.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/**
 * A WinuxCmd message (Rust format syntax) as an MF2 message: `{name}` -> `{$name}`, positional `{}` (in order) and `{N}` -> `{$argN}`
 * (MF2 variable names cannot be empty or numeric), `{{` and `}}` and any other brace -> escaped literal braces, a backslash -> `\\\\`.
 */
export function toMf2(text: string): string {
  let next = 0;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\") out += "\\\\";
    else if (c === "{" && text[i + 1] === "{") (out += "\\{"), i++;
    else if (c === "}" && text[i + 1] === "}") (out += "\\}"), i++;
    else if (c === "{") {
      const m = /^\{([A-Za-z_][A-Za-z0-9_]*|\d*)\}/.exec(text.slice(i));
      if (!m) out += "\\{";
      else {
        const n = m[1]!;
        out += n === "" ? `{$arg${next++}}` : /^\d+$/.test(n) ? `{$arg${n}}` : `{$${n}}`;
        i += m[0].length - 1;
      }
    } else if (c === "}") out += "\\}";
    else out += c;
  }
  // A simple message cannot start with `.` (a declaration keyword in MF2): quote the pattern.
  return out.startsWith(".") ? `{{${out}}}` : out;
}

export interface Imported {
  locale: string;
  messages: Record<string, string>;
}

export function convert(catalog: { locale: string; messages: Record<string, string> }): Imported {
  const messages: Record<string, string> = {};
  for (const k of Object.keys(catalog.messages).sort()) messages[k] = toMf2(catalog.messages[k]!);
  return { locale: catalog.locale, messages };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const known = new Set(["--src", "--write"]);
  const unknown = args.filter((a, i) => a.startsWith("-") ? !known.has(a) : args[i - 1] !== "--src");
  if (unknown.length) {
    console.error(`unknown argument: ${unknown.join(" ")}\nusage: bun scripts/winuxcmd-i18n-import.ts [--src DIR] [--write]`);
    process.exit(2);
  }
  const srcAt = args.indexOf("--src");
  if (srcAt >= 0 && (!args[srcAt + 1] || args[srcAt + 1]!.startsWith("-"))) {
    console.error("--src needs a directory");
    process.exit(2);
  }
  const src = srcAt >= 0 ? args[srcAt + 1]! : join(ROOT, "third_party/winuxcmd-i18n/catalogs");
  const out = join(ROOT, "packages/i18n/catalogs/winuxcmd");
  let n = 0;
  for (const loc of existsSync(src) ? readdirSync(src) : []) {
    const file = join(src, loc, "catalog.json");
    if (!existsSync(file)) continue;
    const r = convert(JSON.parse(readFileSync(file, "utf8")));
    n += Object.keys(r.messages).length;
    if (args.includes("--write")) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${r.locale}.json`), `${JSON.stringify(r.messages, null, 2)}\n`);
    }
    console.log(`${r.locale}: ${Object.keys(r.messages).length} messages`);
  }
  console.log(`${n} messages`);
}
