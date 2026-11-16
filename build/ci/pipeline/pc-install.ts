// Register the PC file watcher as a scheduled task (survives reboot): `ay index watch <root>`.
//   bun build/ci/pipeline/pc-install.ts [root] [--remove]
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = Bun.argv.slice(2);
const remove = args.includes("--remove");
const root = resolve(
  args.find((a) => !a.startsWith("--")) ?? join(import.meta.dir, "..", ".."),
);
const ay = join(homedir(), ".local", "bin", "ay.exe");
const name = "AyIndexWatch";

const run = (...a: string[]) => {
  const r = Bun.spawnSync(["schtasks.exe", ...a], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};

if (remove) {
  console.log(run("/Delete", "/TN", name, "/F").out.trim());
} else {
  const tr = `"${ay}" index watch "${root}"`;
  // Every minute; MultipleInstances=IgnoreNew (the default) makes it a no-op while the watcher runs and a
  // relaunch after a crash, a logoff or a reboot.
  const r = run(
    "/Create",
    "/TN",
    name,
    "/SC",
    "MINUTE",
    "/MO",
    "1",
    "/RL",
    "LIMITED",
    "/F",
    "/TR",
    tr,
  );
  console.log(r.out.trim());
  if (r.code === 0) {
    console.log(run("/Run", "/TN", name).out.trim());
    console.log(run("/Query", "/TN", name).out.trim());
  }
  process.exitCode = r.code;
}
