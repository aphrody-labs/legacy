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
  await Bun.sleep(2500);
  // One snapshot + screenshot per window: an app with several windows is an AMBIGUOUS_TARGET without window_id.
  const wins = dataOf(
    await hub("agent-desktop__desktop_list_windows", { app: APP }),
  );
  const list: any[] = Array.isArray(wins) ? wins : (wins?.windows ?? []);
  report.windows = list.map((w) => ({ id: w.id, title: w.title }));
  const shots: string[] = [];
  const trees: unknown[] = [];
  for (const [i, w] of (list.length ? list : [{ id: undefined }]).entries()) {
    const target = w.id ? { window_id: w.id } : {};
    const snap = await timed(() =>
      hub("agent-desktop__desktop_snapshot", {
        app: APP,
        ...target,
        compact: true,
        max_depth: 10,
        timeout_ms: 60000,
      }),
    );
    trees.push({ window: w.id, title: w.title, ms: snap.ms, snapshot: dataOf(snap.v) });
    const png = join(outDir, `${label}-${i}.png`).replaceAll("\\", "/");
    await hub("agent-desktop__desktop_screenshot", { app: APP, ...target, output_path: png });
    shots.push(png);
  }
  report.snapshots = trees;
  report.screenshots = shots;
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
    windows: report.windows ?? null,
    screenshots: report.screenshots ?? null,
  }),
);
