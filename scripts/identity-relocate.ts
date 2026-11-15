#!/usr/bin/env bun
// identity-relocate: moves the checkout folder to the name of the product identity (tools/identity.toml) in one pass.
//
//   bun scripts/identity-relocate.ts [--dry-run] [--to PATH] [--from PATH] [--force] [--sandbox]
//
// Idempotent: every phase prints `plan`, `done` or `skip`; a second run finds nothing left to do.
//   1. discover   services, scheduled tasks and user environment variables that name the old root; processes running from it;
//                 the Claude Code project folders keyed by the path (`C:\src` -> `C--src`, `C--src-apps`, ...)
//   2. stop       those services and tasks (the processes of the old root must be gone, else abort unless --force)
//   3. move       the folder (--to, default <parent>/<product.name>)
//   4. rewrite    service ImagePath and Environment, task actions, user environment variables
//   5. memory     Claude Code project memory folders renamed to the key of the new path (merged when the target exists)
//   6. agents     `just agents-sync` from the new root (plugins, MCP, skills of every agent CLI)
//   7. restart    services started, tasks enabled again (the ones that were running are started)
//   8. check      a real relay call (GET /health on RELAY_PORT) and `identity.ts check` at the new root
// --dry-run changes nothing and prints what each phase would do. --sandbox is for a copy: only phase 3 and the identity check
// (the services, tasks, memory and relay belong to the real root). Services and the registry need an elevated shell.
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { findRoot, loadIdentity } from "./identity.ts";

const argv = Bun.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const dry = flag("--dry-run");
const sandbox = flag("--sandbox");
const win = process.platform === "win32";

const from = resolve(opt("--from") ?? findRoot(import.meta.dir));
// After a first run the old root is gone: the identity is then read at the target given with --to.
const target = opt("--to");
if (!existsSync(from) && !target) throw new Error(`${from} does not exist (already moved?): pass --to`);
const id = loadIdentity(existsSync(from) ? from : resolve(target!));
const to = resolve(target ?? join(dirname(from), id.product.name));
process.chdir(tmpdir()); // the folder to move must not be the working directory

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The old root written with either separator, any case, ending at a path boundary. */
const fromRe = new RegExp(`${from.split(/[\\/]+/).map(esc).join("[\\\\/]+")}(?=[\\\\/"'\\s;,]|$)`, "gi");
const rewrite = (s: string) =>
  s.replace(fromRe, (m) => (m.includes("\\") ? to : to.replaceAll("\\", "/")));
const mentions = (s: string | undefined) => !!s && (fromRe.lastIndex = 0, fromRe.test(s));

const log = (phase: string, state: "plan" | "done" | "skip" | "warn", msg: string) =>
  console.log(`${phase.padEnd(9)} ${state.padEnd(4)} ${msg}`);

const ps = (script: string): string => {
  const r = Bun.spawnSync(["pwsh", "-NoProfile", "-NonInteractive", "-Command", script], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode) throw new Error(`pwsh: ${r.stderr.toString().trim().slice(0, 300)}`);
  return r.stdout.toString().trim();
};
const psJson = <T>(script: string): T[] => {
  const out = ps(`${script} | ConvertTo-Json -Depth 5 -Compress`);
  if (!out) return [];
  const v = JSON.parse(out);
  return Array.isArray(v) ? v : [v];
};
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** Claude Code names a project folder after the path: every `:`, `\` and `/` becomes `-`. */
const projectKey = (p: string) => p.replace(/[:\\/]/g, "-");
const projectsDir = join(homedir(), ".claude", "projects");

type Svc = { Name: string; State: string; ImagePath: string; Environment: string[] };
type Task = { TaskName: string; TaskPath: string; State: string; Actions: { Execute: string; Arguments: string; WorkingDirectory: string }[] };

// 1. discover
const services: Svc[] = [];
const tasks: Task[] = [];
let envVars: [string, string][] = [];
if (win && !sandbox) {
  for (const s of psJson<Svc>(
    `Get-CimInstance Win32_Service | ForEach-Object { $k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $_.Name; $e = (Get-ItemProperty $k -ErrorAction SilentlyContinue).Environment; [pscustomobject]@{ Name = $_.Name; State = $_.State; ImagePath = (Get-ItemProperty $k).ImagePath; Environment = @($e) } }`,
  ))
    if (mentions(s.ImagePath) || (s.Environment ?? []).some(mentions)) services.push(s);
  for (const t of psJson<Task>(
    `Get-ScheduledTask | ForEach-Object { [pscustomobject]@{ TaskName = $_.TaskName; TaskPath = $_.TaskPath; State = [string]$_.State; Actions = @($_.Actions | ForEach-Object { [pscustomobject]@{ Execute = $_.Execute; Arguments = $_.Arguments; WorkingDirectory = $_.WorkingDirectory } }) } }`,
  ))
    if (t.Actions.some((a) => mentions(a.Execute) || mentions(a.Arguments) || mentions(a.WorkingDirectory))) tasks.push(t);
  envVars = Object.entries(
    JSON.parse(ps(`[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json -Compress`)) as Record<string, string>,
  ).filter(([, v]) => mentions(v));
}
const projects = !sandbox && existsSync(projectsDir)
  ? readdirSync(projectsDir).filter((d) => d === projectKey(from) || d.startsWith(`${projectKey(from)}-`))
  : [];
const running = win && !sandbox && existsSync(from)
  ? psJson<{ ProcessId: number; Name: string }>(
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match ${q(from.split(/[\\/]+/).map(esc).join("[\\\\/]+"))} -and $_.ProcessId -ne ${process.pid} } | Select-Object ProcessId, Name`,
    )
  : [];

log("discover", "plan", `${from} -> ${to}`);
log("discover", "plan", `${services.length} services, ${tasks.length} tasks, ${envVars.length} user variables, ${projects.length} Claude project folders, ${running.length} processes`);
for (const s of services) log("discover", "plan", `service ${s.Name} (${s.State})`);
for (const t of tasks) log("discover", "plan", `task ${t.TaskPath}${t.TaskName} (${t.State})`);

// 2. stop
if (running.length && !flag("--force") && existsSync(from)) {
  log("stop", "warn", `processes run from ${from}: ${running.map((p) => `${p.Name}#${p.ProcessId}`).slice(0, 12).join(" ")}; stop the sessions or pass --force`);
  if (!dry) process.exit(1);
}
const wasRunning = {
  services: services.filter((s) => s.State === "Running").map((s) => s.Name),
  tasks: tasks.filter((t) => t.State === "Running").map((t) => `${t.TaskPath}${t.TaskName}`),
};
if (!dry && existsSync(from)) {
  for (const s of services) ps(`Stop-Service -Name ${q(s.Name)} -Force -ErrorAction SilentlyContinue`);
  for (const t of tasks) ps(`Stop-ScheduledTask -TaskPath ${q(t.TaskPath)} -TaskName ${q(t.TaskName)} -ErrorAction SilentlyContinue; Disable-ScheduledTask -TaskPath ${q(t.TaskPath)} -TaskName ${q(t.TaskName)} | Out-Null`);
  log("stop", "done", `${services.length} services, ${tasks.length} tasks`);
} else log("stop", dry ? "plan" : "skip", `${services.length} services, ${tasks.length} tasks`);

// 3. move
if (from.toLowerCase() === to.toLowerCase()) log("move", "skip", "the root already has this name");
else if (!existsSync(from) && existsSync(to)) log("move", "skip", `${to} exists, ${from} does not: already moved`);
else if (existsSync(from) && existsSync(to)) {
  log("move", "warn", `both ${from} and ${to} exist; nothing moved`);
  if (!dry) process.exit(1);
} else if (dry) log("move", "plan", `rename ${from} -> ${to}`);
else {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  log("move", "done", `${from} -> ${to}`);
}

if (!sandbox) {
  // 4. rewrite
  for (const s of services) {
    const env = (s.Environment ?? []).filter(Boolean).map(rewrite);
    const img = rewrite(s.ImagePath);
    if (dry) log("rewrite", "plan", `service ${s.Name}: ${env.filter((e, i) => e !== s.Environment[i]).join(" ") || "ImagePath only"}`);
    else {
      const key = `HKLM:\\SYSTEM\\CurrentControlSet\\Services\\${s.Name}`;
      ps(`Set-ItemProperty -Path ${q(key)} -Name ImagePath -Value ${q(img)}; Set-ItemProperty -Path ${q(key)} -Name Environment -Type MultiString -Value @(${env.map(q).join(",")})`);
      log("rewrite", "done", `service ${s.Name}`);
    }
  }
  for (const t of tasks) {
    const actions = t.Actions.map((a) => `New-ScheduledTaskAction -Execute ${q(rewrite(a.Execute ?? ""))} -Argument ${q(rewrite(a.Arguments ?? ""))}${a.WorkingDirectory ? ` -WorkingDirectory ${q(rewrite(a.WorkingDirectory))}` : ""}`);
    if (dry) log("rewrite", "plan", `task ${t.TaskPath}${t.TaskName}: ${rewrite(t.Actions[0]?.Arguments ?? "").slice(0, 110)}`);
    else {
      ps(`Set-ScheduledTask -TaskPath ${q(t.TaskPath)} -TaskName ${q(t.TaskName)} -Action @(${actions.join(",")}) | Out-Null`);
      log("rewrite", "done", `task ${t.TaskPath}${t.TaskName}`);
    }
  }
  for (const [k, v] of envVars) {
    if (dry) log("rewrite", "plan", `user variable ${k}=${rewrite(v)}`);
    else {
      ps(`[Environment]::SetEnvironmentVariable(${q(k)}, ${q(rewrite(v))}, 'User')`);
      log("rewrite", "done", `user variable ${k}`);
    }
  }

  // 5. memory
  const base = projectKey(from);
  const newBase = projectKey(to);
  for (const d of projects) {
    const target = join(projectsDir, newBase + d.slice(base.length));
    if (dry) log("memory", "plan", `${d} -> ${basename(target)}`);
    else if (!existsSync(target)) {
      renameSync(join(projectsDir, d), target);
      log("memory", "done", `${d} -> ${basename(target)}`);
    } else {
      for (const f of readdirSync(join(projectsDir, d)))
        if (!existsSync(join(target, f))) renameSync(join(projectsDir, d, f), join(target, f));
      log("memory", "done", `${d} merged into ${basename(target)}`);
    }
  }
  if (!projects.length) log("memory", "skip", "no project folder for the old root");

  // 6. agents
  const newRoot = to;
  if (dry) log("agents", "plan", `just agents-sync (cwd ${newRoot})`);
  else {
    const r = Bun.spawnSync(["just", "agents-sync"], { cwd: newRoot, stdout: "pipe", stderr: "pipe" });
    log("agents", r.exitCode ? "warn" : "done", `just agents-sync exit ${r.exitCode}`);
  }

  // 7. restart
  for (const t of tasks)
    if (dry) log("restart", "plan", `task ${t.TaskPath}${t.TaskName}`);
    else {
      ps(`Enable-ScheduledTask -TaskPath ${q(t.TaskPath)} -TaskName ${q(t.TaskName)} | Out-Null`);
      if (wasRunning.tasks.includes(`${t.TaskPath}${t.TaskName}`)) ps(`Start-ScheduledTask -TaskPath ${q(t.TaskPath)} -TaskName ${q(t.TaskName)}`);
    }
  for (const s of services)
    if (dry) log("restart", "plan", `service ${s.Name}`);
    else if (wasRunning.services.includes(s.Name)) ps(`Start-Service -Name ${q(s.Name)}`);
  if (!dry) log("restart", "done", `${services.length} services, ${tasks.length} tasks`);
}

// 8. check
let bad = 0;
const checkRoot = dry ? from : to;
const idc = Bun.spawnSync(["bun", join(checkRoot, "scripts", "identity.ts"), "check", "--root", checkRoot], { stdout: "pipe", stderr: "pipe" });
log("check", idc.exitCode ? "warn" : "done", `identity.ts check exit ${idc.exitCode}`);
if (!sandbox) {
  const port = services.flatMap((s) => s.Environment ?? []).find((e) => e.startsWith("RELAY_PORT="))?.slice(11) ?? "8790";
  if (dry) log("check", "plan", `GET http://127.0.0.1:${port}/health`);
  else {
    try {
      const h = (await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(15000) })).json()) as { name?: string };
      log("check", h.name ? "done" : "warn", `relay /health: ${JSON.stringify(h)}`);
      if (!h.name) bad++;
    } catch (e) {
      log("check", "warn", `relay /health: ${(e as Error).message}`);
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
