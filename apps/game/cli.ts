#!/usr/bin/env bun
// game: entry point of the game app (Bevy game of frameworks/game with the Steam and Epic storefront services).
// game play | probe | epic <legendary args> | steam <ay steam args> | <gaming command: status, apps, proton, layers, dx, forks, steamcmd, run, skills>
// Epic goes through legendary (aphrody-labs/legendary pin), Steam data through `ay steam` (frameworks/steam), the host gaming stack through frameworks/gaming.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const [cmd = "help", ...rest] = Bun.argv.slice(2);
// steamworks-sys leaves libsteam_api in its build output; the loader needs that directory (a running Steam client or steamcmd provides steamclient.so).
const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
const steamLib = existsSync(target) ? [...new Bun.Glob("{release,debug}/build/**/libsteam_api.so").scanSync({ cwd: target })].map((f) => dirname(join(target, f)))[0] : undefined;
const env = { ...process.env, ...(steamLib ? { LD_LIBRARY_PATH: [steamLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") } : {}) };
const run = (argv: string[]) => Bun.spawnSync(argv, { cwd: root, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exitCode;
const cargo = (profile: string[], ...a: string[]) => run(["cargo", "run", "-q", ...profile, "-p", "aphrody-game", ...a]);
const has = (bin: string) => Bun.which(bin) !== null;

switch (cmd) {
  case "play":
    process.exit(cargo(["--release"], "--", ...rest));
  case "probe":
    process.exit(cargo([], "--", "probe"));
  case "epic":
    process.exit(has("legendary") ? run(["legendary", ...rest]) : run(["uv", "tool", "run", "--from", "legendary-gl", "legendary", ...rest]));
  case "steam":
    process.exit(run(["ay", "steam", ...rest]));
  case "help":
    console.log("game play | probe | epic <legendary args> | steam <ay steam args> | status | apps | proton | layers | dx | forks | steamcmd | run | skills");
    break;
  default:
    process.exit(run(["bun", join(root, "frameworks", "gaming", "src", "cli.ts"), cmd, ...rest]));
}

