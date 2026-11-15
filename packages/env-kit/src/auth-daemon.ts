/**
 * `ay auth daemon`: a single authentication service per host, instead of sign-in retries.
 *
 * - Probes the real state of each credential every `--every` minutes (5 by default): `auth-state.json` is
 *   never older than that period, and `ay auth status` stays a direct probe (no cache).
 * - Refreshes on its own whatever refreshes without a human (`repair` without a browser: keychain gh token, CI secrets,
 *   tunnels, ssh keys); tokens with a refresh token (gcloud, service-account impersonation, codex, claude
 *   setup-token) renew inside their CLI at each probe.
 * - Last resort: a credential that requires a click is reported once per 24 h, all grouped in a
 *   single notification; no page is opened, no sign-in relaunched. The owner answers with
 *   `ay auth daemon --ack <target>`: a single sign-in is then launched for that target.
 * Files: <state>/auth-state.json (last probe), <state>/auth-prompts.json (last reports).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AuthOptions,
  type Check,
  collectChecks,
  type Manifest,
  runAuth,
} from "./auth";
import { secretGet, secretList } from "./secret-store";

const DAY = 86_400_000;

/** The PC holds the reference vault: CI secrets, OIDC, fleet, tunnels and API tokens are probed and pushed from it. */
const PC =
  process.platform === "win32" || process.env.AY_AUTH_REFRESH_ALL === "1";
/**
 * Credentials a Linux runner needs (infra/agents/runner.ts: gh for push, claude and codex for the
 * tasks); the other CLIs (cf, wrangler, vercel, gcloud, gh admin scopes) are the PC's business, which pushes the
 * values. AY_AUTH_TARGETS (comma-separated list) replaces this list.
 */
export const RUNNER_TARGETS = (process.env.AY_AUTH_TARGETS ?? "gh,claude,codex")
  .split(",")
  .filter(Boolean);
export const scope = (checks: Check[], pc = PC) =>
  pc
    ? checks
    : checks.filter(
        (c) => c.kind === "store" || RUNNER_TARGETS.includes(c.target),
      );

export const stateDir = () =>
  process.env.AY_AUTH_STATE ??
  (process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? homedir(), "aphrody", "auth")
    : join(
        process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
        "aphrody",
        "auth",
      ));

const readJson = <T>(p: string, d: T): T => {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return d;
  }
};
const writeJson = (p: string, v: unknown) => {
  writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 2), { mode: 0o600 });
  renameSync(`${p}.tmp`, p);
};

const key = (c: Check) => `${c.host}/${c.target}`;
/** Credential that waits for a human gesture (not a mere missing tool). */
// Only a person's credentials (CLI, browser, API tokens) can require their gesture; CI, OIDC, fleet
// or unit gaps are agent work, kept in auth-state.json but never reported to the owner.
const OWNER_KINDS = new Set(["cli", "browser", "token", "store"]);
export const needsOwner = (c: Check) =>
  OWNER_KINDS.has(c.kind) && (c.status === "action" || c.status === "invalid");

/** Targets to report now: at most once per 24 h each. */
export function due(
  checks: Check[],
  prompts: Record<string, number>,
  now = Date.now(),
): Check[] {
  return checks.filter(
    (c) => needsOwner(c) && now - (prompts[key(c)] ?? 0) >= DAY,
  );
}

function notify(title: string, lines: string[]) {
  const body = lines.slice(0, 12).join("\n");
  if (process.platform === "win32") {
    // Native Windows notification (a single, grouped one); no browser.
    const esc = (s: string) =>
      s.replace(/[<>&'"]/g, (m) => `&#${m.charCodeAt(0)};`);
    const xml = `<toast><visual><binding template='ToastGeneric'><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual></toast>`;
    const ps = `$x=New-Object Windows.Data.Xml.Dom.XmlDocument; $x.LoadXml('${xml.replace(/'/g, "''")}'); [Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] > $null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('aphrody auth').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
    spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      windowsHide: true,
      timeout: 30_000,
    });
  }
  const out = join(stateDir(), "auth-pending.md");
  writeFileSync(
    out,
    `# ${title}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
    { mode: 0o600 },
  );
}

export async function pass(m: Manifest, o: AuthOptions, refresh: boolean) {
  const at = new Date().toISOString();
  // Vault values on each pass: a token rotated elsewhere does not leave a stale copy in the environment.
  for (const n of secretList()) {
    // Value without a line ending: systemd-creds often returns a trailing \n, refused in an HTTP header.
    const v = secretGet(n)?.trim();
    if (v) process.env[n] = v;
  }
  // Refresh without a human first, then the probe that is authoritative.
  // The PC (reference vault) repairs everything; the other hosts only their CLIs and their storage, so that no
  // host pushes its copies to the GitHub secrets or the fleet.
  const only = PC ? o.only : ["cli", "store"];
  if (refresh)
    await collectChecks(m, { ...o, only, browser: false }, true).catch(
      () => [],
    );
  const checks = scope(
    await collectChecks(
      m,
      { ...o, only: PC ? o.only : ["cli", "store"], browser: false },
      false,
    ),
  );
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "auth-state.json"), { at, checks });
  const pf = join(dir, "auth-prompts.json");
  const prompts = readJson<Record<string, number>>(pf, {});
  const now = Date.now();
  const d = due(checks, prompts, now);
  if (d.length) {
    notify(
      `${d.length} credential(s) to reconnect`,
      d.map(
        (c) =>
          `${key(c)} : ${c.fix ?? c.proof} ; puis ay auth daemon --ack ${c.target}`,
      ),
    );
    for (const c of d) prompts[key(c)] = now;
    writeJson(pf, prompts);
  }
  return {
    at,
    total: checks.length,
    owner: checks.filter(needsOwner).map(key),
    notified: d.map(key),
  };
}

export async function daemon(m: Manifest, o: AuthOptions): Promise<number> {
  const a = o.args ?? [];
  const opt = (n: string) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const ack = opt("--ack");
  if (ack) {
    // Owner signal: a single sign-in for this target, never a loop.
    return runAuth("login", {
      ...o,
      args: [ack.replace(/^gcloud:.*/, "gcloud")],
    });
  }
  const every = Math.max(1, Number(opt("--every") ?? 5)) * 60_000;
  const refreshEvery = Math.max(every, Number(opt("--refresh") ?? 30) * 60_000);
  let lastRefresh = 0;
  do {
    const refresh = Date.now() - lastRefresh >= refreshEvery;
    if (refresh) lastRefresh = Date.now();
    const r = await pass(m, o, refresh);
    console.log(JSON.stringify(r));
    if (a.includes("--once")) break;
    await Bun.sleep(every);
  } while (true);
  return 0;
}

/** Last probe if it is younger than `maxAgeMs` (5 min by default), otherwise undefined: never a stale state. */
export function lastState(
  maxAgeMs = 5 * 60_000,
): { at: string; checks: Check[] } | undefined {
  const p = join(stateDir(), "auth-state.json");
  if (!existsSync(p)) return undefined;
  const s = readJson<{ at: string; checks: Check[] } | undefined>(p, undefined);
  return s && Date.now() - Date.parse(s.at) <= maxAgeMs ? s : undefined;
}
