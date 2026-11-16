#!/usr/bin/env bun
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveAdapter, UnsupportedFormatError } from "./adapter.ts";
import { checkCatalogs, extractKeys, reportOk } from "./check.ts";
import { canonicalTag, defaultLocalesDir, readConfig } from "./config.ts";
import { discoverLocales, type Catalog } from "./i18n.ts";
import "./mf2.ts";
import {
  readSidecar,
  translateLocale,
  writeSidecar,
  type Ask,
} from "./translate.ts";

const USAGE = `aphrody-i18n <command>
  check [--dir locales] [--json] [--strict]  compare every catalog with the source locale: extra keys, placeholders, syntax;
                                       missing keys are listed as coverage and fail only with --strict
  extract <path...> [--dir locales]    list t("key") call sites; with a catalog, report unknown and unused keys
  translate [--to tag,tag] [--dir locales] [--model provider/model] [--refresh-stale] [--dry-run]
                                       fill the missing keys of every catalog (and of each --to tag, creating it) from the
                                       source locale through the ai-os model layer; output is validated and recorded in
                                       <dir>/_machine/<locale>.json, human keys are never overwritten
  review <locale> [key...]             mark machine translations as human-reviewed (all keys when none given)
source locale and format: i18n.config.json next to the locales dir; locales = the <bcp47>.json files present
exit code 1 when a problem is found`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function loadDir(dir: string): Promise<Record<string, Catalog>> {
  const out: Record<string, Catalog> = {};
  for (const l of discoverLocales(dir))
    out[l] = (await Bun.file(join(dir, `${l}.json`)).json()) as Catalog;
  return out;
}

async function walk(path: string, acc: string[]): Promise<void> {
  if (await Bun.file(path).exists()) {
    acc.push(path);
    return;
  }
  for (const e of await readdir(path, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(path, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) acc.push(p);
  }
}

/** Text-in/text-out backend: the ai-os model layer (any discovered provider, local first). Loaded lazily so the
 * i18n package keeps no hard dependency on the agent layer. */
async function aiOsAsk(
  model: string | undefined,
): Promise<{ ask: Ask; model: string }> {
  const spec = "@aphrody/ai-os/llm";
  const mod = (await import(spec)) as {
    defaultModelId(): Promise<string>;
    llmAsk(
      model: string,
      prompt: string,
      system?: string,
      opts?: { temperature?: number },
    ): Promise<{ text: string }>;
  };
  const id = model || Bun.env.AGENT_MODEL || (await mod.defaultModelId());
  return {
    model: id,
    ask: async (prompt, system) =>
      (await mod.llmAsk(id, prompt, system, { temperature: 0 })).text,
  };
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const dir = resolve(flag(rest, "--dir") ?? defaultLocalesDir);
  const cfg = readConfig(dirname(dir));
  const src = cfg.sourceLocale;
  if (cmd === "check") {
    const all = await loadDir(dir);
    const source = all[src];
    if (!source) {
      console.error(`no ${src}.json in ${dir}`);
      return 1;
    }
    const adapter = resolveAdapter(
      cfg.format,
      Object.entries(all).map(([l, c]) => ({
        name: `${l}.json`,
        text: JSON.stringify(c),
      })),
    );
    const { [src]: _, ...others } = all;
    const reports = checkCatalogs(source, others, adapter, src);
    const strict = rest.includes("--strict") || cfg.strictCoverage === true;
    if (rest.includes("--json")) console.log(JSON.stringify(reports, null, 2));
    else {
      for (const r of reports) {
        console.log(
          `${r.locale}: ${reportOk(r, strict) ? "ok" : "FAIL"}${r.missing.length ? ` (${r.missing.length} missing, falls back to ${src})` : ""}`,
        );
        for (const [label, list] of [
          ["missing", r.missing],
          ["extra", r.extra],
          ["placeholders", r.placeholders],
          ["syntax", r.syntax],
        ] as const)
          if (list.length && label !== "missing")
            console.log(`  ${label}: ${list.join(", ")}`);
      }
    }
    return reports.every((r) => reportOk(r, strict)) ? 0 : 1;
  }
  if (cmd === "extract") {
    const paths = rest.filter(
      (a, i) => !a.startsWith("--") && rest[i - 1] !== "--dir",
    );
    if (!paths.length) {
      console.error(USAGE);
      return 2;
    }
    const files: string[] = [];
    for (const p of paths) await walk(resolve(p), files);
    const used = new Set<string>();
    for (const f of files)
      for (const k of extractKeys(await Bun.file(f).text())) used.add(k);
    const source = (
      (await loadDir(dir).catch(() => ({}))) as Record<string, Catalog>
    )[src];
    const keys = [...used].sort();
    if (!source) {
      console.log(keys.join("\n"));
      return 0;
    }
    const unknown = keys.filter((k) => !(k in source));
    const unused = Object.keys(source).filter((k) => !used.has(k));
    console.log(
      JSON.stringify({ files: files.length, keys, unknown, unused }, null, 2),
    );
    return unknown.length ? 1 : 0;
  }
  if (cmd === "translate") {
    const all = await loadDir(dir);
    const source = all[src];
    if (!source) {
      console.error(`no ${src}.json in ${dir}`);
      return 1;
    }
    const files = Object.entries(all).map(([l, c]) => ({
      name: `${l}.json`,
      text: JSON.stringify(c),
    }));
    const adapter = resolveAdapter(cfg.format, files);
    const to = (flag(rest, "--to") ?? "")
      .split(",")
      .filter(Boolean)
      .map(canonicalTag);
    const targets = [
      ...new Set([...Object.keys(all).filter((l) => l !== src), ...to]),
    ].filter((l) => l !== src);
    const dry = rest.includes("--dry-run");
    if (dry) {
      for (const l of targets) {
        const missing = Object.keys(source).filter(
          (k) => !(k in (all[l] ?? {})),
        );
        console.log(`${l}: ${missing.length} missing`);
      }
      return 0;
    }
    const { ask, model } = await aiOsAsk(flag(rest, "--model"));
    let failed = 0;
    for (const l of targets) {
      const r = await translateLocale({
        source,
        sourceLocale: src,
        target: all[l] ?? {},
        sidecar: await readSidecar(dir, l),
        locale: l,
        adapter,
        adapterName:
          adapter.id === "mf2" ? "Unicode MessageFormat 2" : adapter.id,
        ask,
        model,
        refreshStale: rest.includes("--refresh-stale"),
      });
      if (r.report.translated.length || r.report.refreshed.length) {
        await Bun.write(
          join(dir, `${l}.json`),
          JSON.stringify(r.catalog, null, 2) + "\n",
        );
        await writeSidecar(dir, l, r.sidecar);
      }
      failed += r.report.failed.length;
      console.log(
        `${l}: ${r.report.translated.length} translated, ${r.report.refreshed.length} refreshed, ${r.report.failed.length} failed`,
      );
      for (const f of r.report.failed) console.log(`  ${f.key}: ${f.reason}`);
    }
    return failed ? 1 : 0;
  }
  if (cmd === "review") {
    const [locale, ...keys] = rest.filter(
      (a, i) => !a.startsWith("--") && rest[i - 1] !== "--dir",
    );
    if (!locale) {
      console.error(USAGE);
      return 2;
    }
    const side = await readSidecar(dir, locale);
    const drop = keys.length ? keys : Object.keys(side);
    for (const k of drop) delete side[k];
    await writeSidecar(dir, locale, side);
    console.log(
      `${locale}: ${drop.length} key(s) marked reviewed, ${Object.keys(side).length} still machine`,
    );
    return 0;
  }
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(USAGE);
    return 0;
  }
  console.error(USAGE);
  return 2;
}

try {
  process.exitCode = await main(Bun.argv.slice(2));
} catch (e) {
  if (e instanceof UnsupportedFormatError || e instanceof RangeError) {
    console.error(e.message);
    process.exitCode = 2;
  } else throw e;
}
