// E2E desktop : agent-desktop, rea, ghidra (relais), agent-browser, gnu sur le PC. `just e2e-desktop`.
// Sortie : var/e2e-desktop-<horodatage>.json + docs/reviews/e2e-desktop-<date>.md (+ verdict Gemini archivé).
// Pas de secret saisi : session Gemini existante uniquement ; E2E_GEMINI_PROMPT=0 saute la saisie.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { call } from "../packages/ai-os/src/relay/protocols.ts";
import * as hubMod from "../packages/ai-os/src/relay/mcp-hub.ts";
const closeHub = () => (hubMod as { closeHub?: () => void }).closeHub?.();

const ROOT = join(import.meta.dir, "..");
const GEM = `${Bun.env.LOCALAPPDATA}/Google/Gemini/app-1.19.0`.replaceAll("\\", "/");
const APP = "Gemini.exe";
const date = new Date().toISOString().slice(0, 10);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
type R = { family: string; name: string; status: "pass" | "fail" | "blocked" | "skip"; ms: number; note: string };
const results: R[] = [];
let gemini = "";

const sc = (r: any) => r?.structuredContent?.response ?? r?.structuredContent ?? r;
const dataOf = (r: any) => sc(r)?.data ?? sc(r);
async function step(family: string, name: string, fn: () => Promise<string | void>, blockedIf?: (e: Error) => boolean) {
  const t = performance.now();
  let status: R["status"] = "pass";
  let note = "";
  try {
    note = (await fn()) ?? "";
  } catch (e: any) {
    status = blockedIf?.(e) ? "blocked" : "fail";
    note = String(e?.message ?? e).slice(0, 300);
  }
  const ms = Math.round(performance.now() - t);
  results.push({ family, name, status, ms, note });
  console.log(`${status.toUpperCase().padEnd(7)} ${family}/${name} ${ms}ms ${note.slice(0, 100)}`);
}
const hub = async (n: string, a: Record<string, unknown> = {}) => {
  const r: any = await call(n, a);
  if (r?.isError || sc(r)?.success === false || sc(r)?.ok === false)
    throw new Error(JSON.stringify(sc(r)?.error ?? sc(r)).slice(0, 300));
  return r;
};
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};

// ---- agent-desktop (Gemini Electron) ----
let box = "";
await step("agent-desktop", "version", async () => `${JSON.stringify(dataOf(await hub("agent-desktop__desktop_version")))}`.slice(0, 80));
await step("agent-desktop", "list-apps", async () => {
  const d = dataOf(await hub("agent-desktop__desktop_list_apps", { app: APP }));
  assert(d.apps?.length, "Gemini.exe not running");
  return `pid=${d.apps[0].pid}`;
});
await step("agent-desktop", "restore+focus", async () => {
  await hub("agent-desktop__desktop_restore", { app: APP });
  await hub("agent-desktop__desktop_focus_window", { app: APP });
});
await step("agent-desktop", "snapshot", async () => {
  // profondeur 10 : 25 dépasse l'échéance sur Chromium (mesuré 2026-11-15)
  const d = dataOf(await hub("agent-desktop__desktop_snapshot", { app: APP, interactive_only: true, compact: true, max_depth: 10, timeout_ms: 60000 }));
  assert(d.ref_count > 5, `ref_count=${d.ref_count}`);
  return `refs=${d.ref_count}`;
});
await step("agent-desktop", "find-textbox", async () => {
  const d = dataOf(await hub("agent-desktop__desktop_find", { app: APP, role: "textbox", limit: 1, timeout_ms: 30000 }));
  box = d.matches?.[0]?.ref_id ?? "";
  assert(box, "no textfield");
  return box;
});
if (Bun.env.E2E_GEMINI_PROMPT === "0") results.push({ family: "agent-desktop", name: "prompt+answer", status: "skip", ms: 0, note: "E2E_GEMINI_PROMPT=0" });
else {
  const file = "src/re/src/abi.rs";
  const code = (await Bun.file(join(ROOT, file)).text()).split("#[cfg(test)]")[0].replace(/\s+/g, " ").slice(0, 1800);
  await step("agent-desktop", "new-chat", async () => {
    const d = dataOf(await hub("agent-desktop__desktop_find", { app: APP, role: "button", name: "New Chat", limit: 1, timeout_ms: 30000 }));
    if (d.matches?.[0]?.ref_id) await hub("agent-desktop__desktop_click", { ref_id: d.matches[0].ref_id });
  });
  await step("agent-desktop", "type-prompt", async () => {
    // desktop_type exige --headed (POLICY_DENIED en mode strict par défaut) : set_value (ValuePattern) livre sans focus ;
    // Chromium ne relit pas la valeur, d'où post_action_verification = delivered_unverified, accepté.
    box = dataOf(await hub("agent-desktop__desktop_find", { app: APP, role: "textbox", limit: 1, timeout_ms: 30000 })).matches?.[0]?.ref_id ?? box;
    const r: any = await call("agent-desktop__desktop_set_value", { ref_id: box, value: `Review ${file} (Rust ABI symbol classifier). Reply with a score /20 and the 3 main defects, then end with the word FINI followed by the digits of 7 times 6. Code: ${code}` });
    const s = JSON.stringify(sc(r));
    assert(!r.isError || s.includes("delivered_unverified"), s.slice(0, 250));
  });
  // press exige le premier plan (refusé hors --headed) : clic sémantique (InvokePattern) sur le bouton d'envoi
  await step("agent-desktop", "send", async () => {
    const d = dataOf(await hub("agent-desktop__desktop_find", { app: APP, role: "button", name: "Send", limit: 1, timeout_ms: 30000 }));
    const ref = d.matches?.[0]?.ref_id;
    assert(ref, "no Send button");
    await hub("agent-desktop__desktop_click", { ref_id: ref });
  });
  await step("agent-desktop", "read-answer", async () => {
    // la fenêtre se réduit seule hors premier plan et Chromium n'expose alors plus son arbre : restore à chaque sondage
    let lines: string[] = [];
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) {
      await call("agent-desktop__desktop_restore", { app: APP }).catch(() => {});
      const w: any = await call("agent-desktop__desktop_find", { app: APP, role: "statictext", limit: 0, timeout_ms: 30000 }).catch(() => null);
      lines = w && !w.isError ? (dataOf(w).matches ?? []).map((m: any) => m.name ?? m.value ?? "") : [];
      // Gemini rend « FINI 42 » (espace) : le prompt, lui, ne contient jamais FINI suivi de 42
      hit = /FINI\s*42/.test(lines.slice(lines.lastIndexOf("Gemini said") + 1).join(""));
      if (!hit) await Bun.sleep(6000);
    }
    assert(hit, "answer not seen in 180 s");
    gemini = lines.slice(lines.lastIndexOf("Gemini said") + 1).filter((l) => !/^Gemini is AI|^Your privacy|^Opens in/.test(l)).join("").slice(0, 8000);
    assert(gemini.length > 20, "empty answer");
    return `${gemini.length} chars`;
  });
}
await step("agent-desktop", "screenshot", async () => {
  mkdirSync(join(ROOT, "var"), { recursive: true });
  const out = join(ROOT, "var", `e2e-gemini-${stamp}.png`);
  await hub("agent-desktop__desktop_screenshot", { app: APP, output_path: out });
  assert(existsSync(out), "no file");
});

// ---- rea (binaires Gemini) ----
await step("rea", "electron-fuses", async () => {
  const d: any = sc(await hub("rea__inspect_electron_fuses", { path: `${GEM}/Gemini.exe` }));
  assert(JSON.stringify(d).includes("RunAsNode"), "no fuses");
});
await step("rea", "pe-imports(launcher)", async () => void (await hub("rea__inspect_pe_imports", { path: `${GEM}/GeminiAppLauncher.exe` })));
await step("rea", "pe-certificates", async () => void (await hub("rea__inspect_pe_certificates", { path: `${GEM}/Gemini.exe`, max_file_bytes: 300_000_000 })));
await step("rea", "audit-asar", async () => void (await hub("rea__audit_release_exposure", { path: `${GEM}/resources/app.asar` })));
await step("rea", "desktop-application", async () => void (await hub("rea__inspect_desktop_application", { path: GEM })));

// ---- ghidra (outil du relais) ----
await step("ghidra", "decompile(launcher)", async () => {
  const r: any = await call("core_ghidra_decompile", { path: `${GEM}/GeminiAppLauncher.exe`, maxFunctions: 4 });
  const d = r?.structuredContent ?? r;
  const n = d.decompiled_functions?.length ?? 0;
  assert(n >= 1, "no function");
  return `functions=${n}/4 entry=${d.entry_point_va}`;
});

// ---- agent-browser + gnu ----
const ev = async (s: string) => {
  const r = dataOf(await hub("agent-browser__agent_browser_eval", { script: `(async()=>{${s}})()` }));
  return JSON.parse(r.result);
};
await step("agent-browser", "open gnu.aphrody.com", async () => void (await hub("agent-browser__agent_browser_open", { url: "https://gnu.aphrody.com" })));
await step("agent-browser", "gnu packages>100", async () => {
  const j = await ev(`await new Promise(r=>setTimeout(r,2500)); return JSON.stringify(document.querySelectorAll('tbody tr').length)`);
  assert(j > 100, `rows=${j}`);
  return `rows=${j}`;
});
await step("agent-browser", "gnu search coreutils", async () => {
  await hub("agent-browser__agent_browser_fill", { selector: "input", text: "coreutils" });
  const j = await ev(`await new Promise(r=>setTimeout(r,800)); const t=[...document.querySelectorAll('tbody tr')].filter(r=>r.offsetParent); return JSON.stringify({n:t.length,hit:/coreutils/i.test(t.map(r=>r.textContent).join(' '))})`);
  assert(j.hit && j.n < 100, JSON.stringify(j));
  return JSON.stringify(j);
});
await step("agent-browser", "gnu kernel tab", async () => {
  const j = await ev(`[...document.querySelectorAll('button,a,[role=tab]')].find(e=>e.textContent.trim()==='Linux kernel').click(); await new Promise(r=>setTimeout(r,1500)); return JSON.stringify(/kernel/i.test(document.body.innerText))`);
  assert(j === true, "kernel text absent");
});
await step("agent-browser", "gemini.google.com", async () => {
  await hub("agent-browser__agent_browser_open", { url: "https://gemini.google.com/app" });
  const t = dataOf(await hub("agent-browser__agent_browser_get_url"));
  const u = String(t.url ?? t.result ?? JSON.stringify(t));
  assert(!/accounts\.google\.com/.test(u), `redirect to sign-in: ${u}`);
  return u;
}, (e) => /sign-in|accounts\.google\.com/.test(e.message));
await hub("agent-browser__agent_browser_close").catch(() => {});

// ---- latence hub_call par serveur (froid puis chaud) ----
const lat: Record<string, { cold: number; warm: number[] }> = {};
for (const [srv, tool, args] of [
  ["agent-desktop", "desktop_version", {}],
  ["agent-browser", "agent_browser_tab_list", {}],
  ["rea", "inspect_byte_entropy", { path: `${GEM}/version` }],
  ["gnu", "gnu_status", {}],
  ["context7", "resolve-library-id", { libraryName: "bun", query: "bun" }],
] as const) {
  const m: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await call(`${srv}__${tool}`, args as any).catch(() => {});
    m.push(Math.round(performance.now() - t));
  }
  lat[srv] = { cold: m[0], warm: m.slice(1) };
}

// ---- rapport ----
const count = (f: string, s: R["status"]) => results.filter((r) => r.family === f && r.status === s).length;
const fams = [...new Set(results.map((r) => r.family))];
mkdirSync(join(ROOT, "var"), { recursive: true });
mkdirSync(join(ROOT, "docs/reviews"), { recursive: true });
writeFileSync(join(ROOT, "var", `e2e-desktop-${stamp}.json`), JSON.stringify({ date, results, latency: lat }, null, 1));
const md = [
  `# E2E desktop ${date}`,
  "",
  "| famille | pass | fail | blocked | skip |",
  "|---|---|---|---|---|",
  ...fams.map((f) => `| ${f} | ${count(f, "pass")} | ${count(f, "fail")} | ${count(f, "blocked")} | ${count(f, "skip")} |`),
  "",
  "| étape | statut | ms | note |",
  "|---|---|---|---|",
  ...results.map((r) => `| ${r.family}/${r.name} | ${r.status} | ${r.ms} | ${r.note.replace(/\|/g, "/").slice(0, 120)} |`),
  "",
  "## Latence hub_call (ms, 1 froid + 4 chauds)",
  ...Object.entries(lat).map(([k, v]) => `- ${k}: froid ${v.cold}, chaud ${v.warm.join("/")}`),
].join("\n");
writeFileSync(join(ROOT, "docs/reviews", `e2e-desktop-${date}.md`), `${md}\n`);
if (gemini) writeFileSync(join(ROOT, "docs/reviews", `gemini-desktop-${date}-src-re-abi.md`), `# Verdict Gemini (app bureau 1.19.0) sur src/re/src/abi.rs, ${date}\n\n${gemini}\n`);
closeHub();
process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
