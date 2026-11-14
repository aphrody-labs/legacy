// Current script context (pyghidra/GhidraScript globals). Set by runScript(), the plugin or user code.
import type { Session, JObject } from "./rpc.ts";
import type { Flat } from "./flat.ts";

export interface ScriptContext {
  session: Session;
  project?: JObject | null;
  currentProgram?: JObject | null;
  currentAddress?: JObject | null;
  currentLocation?: JObject | null;
  currentSelection?: JObject | null;
  currentHighlight?: JObject | null;
  monitor?: JObject | null;
  state?: JObject | null;
  /** FlatProgramAPI-like facade (println/ask* local, rest forwarded to the JVM) */
  flat: Flat;
  /** the raw Java FlatProgramAPI object */
  javaFlat?: JObject;
  scriptArgs?: string[];
  scriptName?: string;
}

let ctx: ScriptContext | undefined;
const listeners = new Set<(c: ScriptContext | undefined) => void>();

export function setContext(c: ScriptContext) { ctx = c; for (const l of listeners) l(c); }
export function clearContext() { ctx = undefined; for (const l of listeners) l(undefined); }
export function getContext(): ScriptContext | undefined { return ctx; }
export function requireContext(): ScriptContext {
  if (!ctx) throw new Error("no Ghidra script context: use runScript() or setContext() first");
  return ctx;
}
export function onContext(l: (c: ScriptContext | undefined) => void) { listeners.add(l); return () => listeners.delete(l); }
