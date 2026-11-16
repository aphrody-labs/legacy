// Common tools of the unixwin suite: real binaries of the workstation (installed niubash, embedded WinuxCmd, reference bash and
// coreutils), launched by Bun.spawn (raw bytes) or by Bun Shell ($). No binary is simulated:
// a missing binary makes the test "skip" with the reason.
import { existsSync } from "node:fs";
import { join } from "node:path";

const win = process.platform === "win32";
const local = process.env.LOCALAPPDATA ?? "";
const niuRoot = join(local, "Programs", "Niubash");

const first = (...c: (string | null | undefined)[]) =>
  c.find((p) => p && existsSync(p)) ?? null;

export const NIU = first(
  process.env.NIU,
  win ? join(niuRoot, "niu.exe") : Bun.which("niu"),
);
export const WINUXCMD = first(
  process.env.WINUXCMD,
  win ? join(niuRoot, "winuxcmd", "usr", "bin", "winuxcmd.exe") : null,
  Bun.which("winuxcmd"),
);
// Bash oracle: GNU bash 5.3 (Git for Windows on Windows, system bash elsewhere).
export const BASH_REF = first(
  process.env.BASH_REF,
  win ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash",
);
// Reference coreutils: uutils (Microsoft's Coreutils for Windows, multicall binary).
export const UUTILS = first(process.env.UUTILS, Bun.which("coreutils"));

export type Run = { out: string; err: string; code: number; bytes: Uint8Array };

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// Neutral environment, identical for the implementation and the oracle: UTF-8 locale, no rc, no fallback.
export const baseEnv = (extra: Record<string, string> = {}) => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (
      v !== undefined &&
      !/^(BASH_ENV|NIU_ENV|ENV|NIU_ROOT_FALLBACK|RUBASH_ROOT_FALLBACK|PROMPT_COMMAND)$/.test(
        k,
      )
    )
      env[k] = v;
  return { ...env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8", ...extra };
};

export async function spawn(
  argv: string[],
  opts: {
    stdin?: string | Uint8Array;
    env?: Record<string, string>;
    cwd?: string;
  } = {},
): Promise<Run> {
  const p = Bun.spawn(argv, {
    stdin: opts.stdin === undefined ? "ignore" : new Response(opts.stdin),
    stdout: "pipe",
    stderr: "pipe",
    env: opts.env ?? baseEnv(),
    cwd: opts.cwd,
    windowsHide: true,
    timeout: 30_000,
  });
  const [o, e, code] = await Promise.all([
    new Response(p.stdout).bytes(),
    new Response(p.stderr).bytes(),
    p.exited,
  ]);
  return { out: decode(o), err: decode(e), code, bytes: o };
}

export const niu = (script: string, opts: Parameters<typeof spawn>[1] = {}) =>
  spawn([NIU!, "-c", script], opts);
export const bashRef = (
  script: string,
  opts: Parameters<typeof spawn>[1] = {},
) => spawn([BASH_REF!, "--norc", "--noprofile", "-c", script], opts);
