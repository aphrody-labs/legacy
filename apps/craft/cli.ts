#!/usr/bin/env bun
// craft: entry point of the Craft Apps. Sources are the third_party pins of src.lock.json; apps.toml lists the apps.
// craft list | fetch <app|all> | build <app|all> | run <app> [-- args] | shot <app> [--seconds N]
// Environment: CRAFT_HOME (checkouts, default <root>/third_party), CRAFT_TARGET (cargo target dir), CRAFT_OUT (logs, shots), CRAFT_FAST=1 (LTO off, 16 codegen units).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import toml from "./apps.toml";

type App = { repo: string; package: string; cli?: string };
const apps = toml.app as Record<string, App>;
let root = import.meta.dir;
while (!existsSync(join(root, "src.lock.json"))) root = dirname(root);
const lock = JSON.parse(await Bun.file(join(root, "src.lock.json")).text()).repositories;
const home = process.env.CRAFT_HOME ?? join(root, "third_party");
const target = process.env.CRAFT_TARGET ?? join(home, ".target");
const out = process.env.CRAFT_OUT ?? join(home, ".out");
const sh = (cmd: string[], opt: { cwd?: string; env?: Record<string, string> } = {}) =>
  Bun.spawnSync(cmd, { cwd: opt.cwd, env: { ...process.env, ...opt.env }, stdout: "inherit", stderr: "inherit" }).exitCode;

const [cmd = "list", sel, ...rest] = Bun.argv.slice(2);
const pin = (a: App) => lock[`third_party/${a.repo}`] as { url: string; commit: string };
const pick = (s?: string) => (s === "all" ? Object.keys(apps) : apps[s ?? ""] ? [s!] : (console.error(`unknown app ${s}`), process.exit(2)));
const dir = (a: App) => join(home, a.repo);

function fetchApp(a: App) {
  const p = pin(a), d = dir(a);
  if (!existsSync(join(d, ".git"))) { mkdirSync(d, { recursive: true }); sh(["git", "init", "-q", d]); sh(["git", "-C", d, "remote", "add", "origin", p.url]); }
  if (sh(["git", "-C", d, "cat-file", "-e", `${p.commit}^{commit}`]) !== 0) sh(["git", "-C", d, "fetch", "-q", "--depth", "1", "origin", p.commit]);
  return sh(["git", "-C", d, "checkout", "-q", "--detach", p.commit]);
}
const cargoEnv = (): Record<string, string> => ({
  CARGO_TARGET_DIR: target,
  ...(process.env.CRAFT_FAST ? { CARGO_PROFILE_RELEASE_LTO: "off", CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "16" } : {}),
});
const bin = (a: App) => join(target, "release", a.package);

switch (cmd) {
  case "list":
    for (const [id, a] of Object.entries(apps)) console.log(id.padEnd(16), a.package.padEnd(20), (pin(a)?.commit ?? "unpinned").slice(0, 8), existsSync(join(dir(a), ".git")) ? "fetched" : "-");
    break;
  case "fetch":
    for (const id of pick(sel)) if (fetchApp(apps[id]!) !== 0) process.exit(1);
    break;
  case "build":
    for (const id of pick(sel)) {
      const a = apps[id]!; if (fetchApp(a) !== 0) process.exit(1);
      const t0 = Date.now();
      const code = sh(["cargo", "build", "--release", "-p", a.package, ...(a.cli ? ["-p", a.cli] : [])], { cwd: dir(a), env: cargoEnv() });
      console.log(JSON.stringify({ app: id, commit: pin(a).commit, ok: code === 0, seconds: Math.round((Date.now() - t0) / 1000) }));
      if (code !== 0) process.exit(code);
    }
    break;
  case "run":
    process.exit(sh([bin(apps[pick(sel)[0]!]!), ...rest.filter((x) => x !== "--")], { env: process.env as Record<string, string> }));
  case "shot": {
    // Real render proof: Xvfb 1600x900, Mesa llvmpipe through Vulkan, root window captured after N seconds.
    const id = pick(sel)[0]!, a = apps[id]!, secs = Number(rest[rest.indexOf("--seconds") + 1] || 15);
    mkdirSync(out, { recursive: true });
    const png = resolve(out, `${id}.png`), log = resolve(out, `${id}.log`);
    const script = `${bin(a)} >"${log}" 2>&1 & pid=$!; sleep ${secs}; import -window root "${png}"; kill $pid 2>/dev/null; wait $pid 2>/dev/null; true`;
    sh(["xvfb-run", "-a", "-s", "-screen 0 1600x900x24", "bash", "-c", script], { env: { WGPU_BACKEND: "vulkan" } });
    console.log(JSON.stringify({ app: id, png, log, bytes: Bun.file(png).size }));
    break;
  }
  default:
    console.error("craft list | fetch <app|all> | build <app|all> | run <app> [-- args] | shot <app> [--seconds N]");
    process.exit(2);
}
