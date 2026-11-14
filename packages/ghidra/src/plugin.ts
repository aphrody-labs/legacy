// Bun plugin: `import analysis from "./x.exe?ghidra"` and the `ghidra:` namespace (`ghidra:./x.exe`).
// Works with Bun.plugin() (runtime, bunfig preload) and Bun.build() (onStart/onResolve/onLoad with defer).
// onBeforeParse (native) only exists in Bun.build: see nativeGhidraPlugin().
import type { BunPlugin } from "bun";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { openProgram, started, stop } from "./api.ts";
import { summarize, type ProgramSummary } from "./analysis.ts";

export interface GhidraPluginOptions {
  /** "jvm" (full Ghidra through the bridge, default) or "native" (aphrody-re via the NAPI addon). */
  backend?: "jvm" | "native";
  /** path to the aphrody_ghidra_bun .node addon (needed for backend native) */
  nativeAddon?: string;
  /** decompile every function with the Ghidra decompiler (JVM backend) */
  decompile?: boolean;
  maxFunctions?: number;
  projectLocation?: string;
  /** Bun.build only: wait for all other modules before the heavy analysis (onLoad `defer`) */
  deferAnalysis?: boolean;
  /** stop the JVM when the Bun.build finishes (no onEnd in Bun's plugin API: done via process exit hook) */
  keepAlive?: boolean;
}

const QUERY = /\?ghidra(=[a-z]+)?(&.*)?$/;

export function parseSpecifier(spec: string): { file: string; backend?: "jvm" | "native" } | null {
  if (spec.startsWith("ghidra:")) return { file: spec.slice("ghidra:".length) };
  const m = spec.match(QUERY);
  if (!m) return null;
  const b = m[1]?.slice(1);
  return { file: spec.slice(0, m.index), backend: b === "native" || b === "jvm" ? b : undefined };
}

export function renderModule(s: ProgramSummary | Record<string, any>): string {
  const json = JSON.stringify(s);
  return `const analysis = ${json};
export default analysis;
export const functions = analysis.functions ?? analysis.decompiled_functions ?? [];
export const blocks = analysis.blocks ?? analysis.sections ?? [];
export const name = analysis.name ?? analysis.binary_path;
export const language = analysis.language;
export const functionCount = analysis.functionCount ?? functions.length;
`;
}

const cache = new Map<string, Promise<string>>();

async function analyzeToModule(file: string, backend: "jvm" | "native", o: GhidraPluginOptions): Promise<string> {
  const key = `${backend}:${file}:${o.decompile}:${o.maxFunctions}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (backend === "native") {
        const addon = o.nativeAddon ?? process.env.GHIDRA_BUN_NATIVE;
        if (!addon) throw new Error("backend native needs nativeAddon or GHIDRA_BUN_NATIVE");
        const mod = require(addon) as { analyze(path: string, max?: number): string };
        return renderModule(JSON.parse(mod.analyze(file, o.maxFunctions ?? 64)));
      }
      const h = await openProgram(file, { projectLocation: o.projectLocation ?? `${process.env.TMPDIR ?? "/tmp"}/bun-ghidra-projects` });
      try {
        return renderModule(await summarize(h.program, { max: o.maxFunctions, decompile: o.decompile }));
      } finally {
        await h.close();
      }
    })();
    cache.set(key, p);
  }
  return p;
}

export function ghidraPlugin(o: GhidraPluginOptions = {}): BunPlugin {
  return {
    name: "aphrody-ghidra",
    setup(build) {
      build.onStart(() => { cache.clear(); });
      build.onResolve({ filter: /\?ghidra(=[a-z]+)?(&.*)?$|^ghidra:/ }, (args) => {
        const spec = parseSpecifier(args.path);
        if (!spec) return undefined;
        const base = args.importer ? dirname(args.importer) : process.cwd();
        const abs = isAbsolute(spec.file) ? spec.file : resolve(base, spec.file);
        if (!existsSync(abs)) throw new Error(`ghidra: no such file ${abs}`);
        return { path: abs + (spec.backend ? `#${spec.backend}` : ""), namespace: "ghidra" };
      });
      build.onLoad({ filter: /.*/, namespace: "ghidra" }, async (args: any) => {
        if (o.deferAnalysis && typeof args.defer === "function") await args.defer();
        const [file, tag] = args.path.split("#");
        const backend = (tag as "jvm" | "native" | undefined) ?? o.backend ?? "jvm";
        return { contents: await analyzeToModule(file, backend, o), loader: "js" };
      });
    },
  };
}

/** Build-only native onBeforeParse plugin (Rust cdylib in src/ghidra-bun): files `*.ghidra.js` become analysis modules. */
export function nativeGhidraPlugin(addonPath: string, filter = /\.ghidra\.js$/): BunPlugin {
  return {
    name: "aphrody-ghidra-native",
    setup(build) {
      const napiModule = require(addonPath);
      (build as any).onBeforeParse({ filter }, { napiModule, symbol: "ghidra_on_before_parse" });
    },
  };
}

export async function shutdown() { if (started()) await stop(); }
