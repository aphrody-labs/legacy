// Launch a migrated Electron app (Tauri exe) on the PC and capture its accessibility tree + a screenshot through
// the relay hub (agent-desktop__desktop_*). Usage: bun scripts/electron-proof-desktop.ts <exe> <out-dir> [label]
// Writes <out-dir>/<label>-a11y.json (tree + timings) and <out-dir>/<label>.png. No input is injected; the app is killed at the end.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { call } from "../packages/ai-os/src/relay/protocols.ts";
import * as hubMod from "../packages/ai-os/src/relay/mcp-hub.ts";

const [exe, outDir, labelArg] = process.argv.slice(2);
if (!exe || !outDir)
  throw new Error("usage: electron-proof-desktop.ts <exe> <out-dir> [label]");
const label = labelArg ?? basename(exe).replace(/\.exe$/i, "");
const APP = basename(exe);
mkdirSync(outDir, { recursive: true });

const sc = (r: any) =>
  r?.structuredContent?.response ?? r?.structuredContent ?? r;
const dataOf = (r: any) => sc(r)?.data ?? sc(r);
const hub = async (n: string, a: Record<string, unknown> = {}) => {
  const r: any = await call(n, a);
  if (r?.isError || sc(r)?.success === false || sc(r)?.ok === false)
    throw new Error(JSON.stringify(sc(r)?.error ?? sc(r)).slice(0, 400));
  return r;
};
const timed = async <T>(f: () => Promise<T>) => {
  const t = performance.now();
  const v = await f();
  return { v, ms: Math.round(performance.now() - t) };
};

const t0 = performance.now();
const proc = Bun.spawn([exe], {
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});
const report: Record<string, unknown> = { exe, pid: proc.pid, label };
try {
  let apps: any = null;
  for (let i = 0; i < 60; i++) {
    try {
      apps = dataOf(
        await hub("agent-desktop__desktop_list_apps", { app: APP }),
      );
      if (apps?.apps?.length) break;
    } catch {}
    await Bun.sleep(500);
  }
  report.window_seen_ms = Math.round(performance.now() - t0);
  report.apps = apps?.apps;
  await Bun.sleep(2000);
  const snap = await timed(() =>
    hub("agent-desktop__desktop_snapshot", {
      app: APP,
      compact: true,
      max_depth: 10,
      timeout_ms: 60000,
    }),
  );
  report.snapshot_ms = snap.ms;
  report.snapshot = dataOf(snap.v);
  const png = join(outDir, `${label}.png`).replaceAll("\\", "/");
  const shot = await timed(() =>
    hub("agent-desktop__desktop_screenshot", { app: APP, output_path: png }),
  );
  report.screenshot_ms = shot.ms;
  report.screenshot = png;
} catch (e: any) {
  report.error = String(e?.message ?? e).slice(0, 600);
} finally {
  proc.kill();
  (hubMod as { closeHub?: () => void }).closeHub?.();
}
writeFileSync(
  join(outDir, `${label}-a11y.json`),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    label,
    error: report.error ?? null,
    window_seen_ms: report.window_seen_ms,
    snapshot_ms: report.snapshot_ms,
    screenshot: report.screenshot ?? null,
  }),
);
