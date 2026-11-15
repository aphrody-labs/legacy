// SPDX-License-Identifier: Apache-2.0
/**
 * Google OAuth loopback bootstrap (zero-dependency, Bun built-ins).
 *
 * Secure and user-friendly by design: the user clicks "Allow" on Google's own consent page in their
 * browser; no password, code or token ever passes through this process's input. We run a localhost
 * redirect listener, receive the one-time `code`, exchange it for a long-lived `refresh_token`, and
 * hand that token back to the caller to store in the vault. Google's "installed app" (desktop) client
 * is required because only that client type allows the loopback redirect used here.
 *
 * Reference (checked 2026-11): developers.google.com/identity/protocols/oauth2/native-app
 */

import { readFileSync } from "node:fs";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Minimal scopes per surface; add only what the automation truly needs. */
export const GOOGLE_SCOPES: Record<string, string[]> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  drive: ["https://www.googleapis.com/auth/drive.readonly"],
};

export interface GoogleTokens {
  refresh_token: string;
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

const html = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b1020;color:#e6edf3;font:16px system-ui">` +
  `<div style="text-align:center;max-width:36rem;padding:2rem">${body}</div>`;

/**
 * Runs the loopback consent flow and returns Google's tokens (including the refresh token).
 * Opens the consent URL with the provided launcher; the caller never sees the user's credentials.
 */
export async function googleOAuthLoopback(opts: {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  openBrowser: (url: string) => void;
  /** Loopback port; 0 lets the OS pick a free one. */
  port?: number;
  /** Abort if the user never approves (default 300 s). */
  timeoutMs?: number;
}): Promise<GoogleTokens> {
  const state = crypto.randomUUID();
  let resolveCode: (code: string) => void;
  let rejectCode: (err: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/")
        return new Response("not found", { status: 404 });
      const err = url.searchParams.get("error");
      if (err) {
        rejectCode(new Error(`consent refused: ${err}`));
        return new Response(
          html(
            "Denied",
            "<h1>Access denied.</h1><p>You can close this window.</p>",
          ),
          {
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      }
      if (url.searchParams.get("state") !== state) {
        return new Response("bad state", { status: 400 });
      }
      const code = url.searchParams.get("code");
      if (!code) return new Response("no code", { status: 400 });
      resolveCode(code);
      return new Response(
        html(
          "Signed in",
          "<h1>Authorization received.</h1><p>You can close this window and return to the terminal.</p>",
        ),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    },
  });

  try {
    const redirectUri = `http://127.0.0.1:${server.port}`;
    const authUrl =
      `${AUTH_ENDPOINT}?` +
      new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: opts.scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();

    opts.openBrowser(authUrl);

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error("timed out waiting for Google consent")),
        opts.timeoutMs ?? 300_000,
      ),
    );
    const code = await Promise.race([codePromise, timeout]);

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!res.ok)
      throw new Error(
        `token exchange failed: ${res.status} ${await res.text()}`,
      );
    const tokens = (await res.json()) as GoogleTokens;
    if (!tokens.refresh_token) {
      throw new Error(
        "Google returned no refresh_token (revoke prior grant at myaccount.google.com, then retry)",
      );
    }
    return tokens;
  } finally {
    server.stop(true);
  }
}

/** Exchanges a stored refresh token for a short-lived access token (unattended, no user action). */
export async function googleAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok)
    throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ---- Service account (RS256 JWT bearer, unattended) -------------------------------------------------------------
// Reference (checked 2026-11): developers.google.com/identity/protocols/oauth2/service-account#httprest

export const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

export type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

const unquote = (s: string) => {
  const t = s.trim();
  const q = t[0];
  return (q === '"' || q === "'") && t.at(-1) === q && t.length > 1
    ? t.slice(1, -1)
    : t;
};

/** PEM with literal `\n` sequences (dotenv, shell exports) back to real newlines. */
export const normalizePem = (k: string) =>
  unquote(k).replace(/\\r/g, "").replace(/\\n/g, "\n").trim();

/**
 * Service-account JSON as found in `.env` files: plain, wrapped in quotes, with escaped quotes (`{\"type\":...}`)
 * and `\n` sequences inside private_key, or with raw newlines inside the key (invalid JSON, recovered by pattern).
 * Never logs the content; errors name the missing field only.
 */
export function parseServiceAccount(raw: string): ServiceAccount {
  let text = unquote(raw);
  let obj: any;
  const tries = [text, text.replace(/\\"/g, '"')];
  for (const t of tries) {
    try {
      let v: any = JSON.parse(t);
      if (typeof v === "string") v = JSON.parse(v);
      if (v && typeof v === "object") {
        obj = v;
        break;
      }
    } catch {}
  }
  if (!obj) {
    const flat = text.replace(/\\"/g, '"');
    const email = flat.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1];
    const key = flat.match(
      /"private_key"\s*:\s*"([\s\S]*?-----END [A-Z ]*-----)(?:\\n|\n)?"/,
    )?.[1];
    if (email && key)
      obj = {
        client_email: email,
        private_key: key,
        project_id: flat.match(/"project_id"\s*:\s*"([^"]+)"/)?.[1],
        token_uri: flat.match(/"token_uri"\s*:\s*"([^"]+)"/)?.[1],
      };
  }
  if (!obj || typeof obj.client_email !== "string")
    throw new Error("service account: client_email missing or JSON unreadable");
  if (typeof obj.private_key !== "string")
    throw new Error("service account: private_key missing");
  return {
    client_email: obj.client_email,
    private_key: normalizePem(obj.private_key),
    project_id: obj.project_id,
    token_uri: obj.token_uri,
  };
}

/**
 * Credentials from the environment: GOOGLE_SERVICE_ACCOUNT (JSON), GOOGLE_APPLICATION_CREDENTIALS (file path or JSON),
 * then GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY. An authorized-user ADC file is not a service account: skipped.
 */
export function loadServiceAccount(
  env: Record<string, string | undefined> = Bun.env,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
): ServiceAccount | undefined {
  const sources: (() => ServiceAccount | undefined)[] = [
    () =>
      env.GOOGLE_SERVICE_ACCOUNT?.trim()
        ? parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT)
        : undefined,
    () => {
      const v = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
      if (!v) return undefined;
      const text = unquote(v).startsWith("{") ? v : read(unquote(v));
      return /"type"\s*:\s*"authorized_user"/.test(text)
        ? undefined
        : parseServiceAccount(text);
    },
    () =>
      env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY
        ? {
            client_email: unquote(env.GOOGLE_CLIENT_EMAIL),
            private_key: normalizePem(env.GOOGLE_PRIVATE_KEY),
          }
        : undefined,
  ];
  for (const s of sources) {
    try {
      const a = s();
      if (a) return a;
    } catch {}
  }
  return undefined;
}

export const serviceAccountProject = (
  a: ServiceAccount,
  env: Record<string, string | undefined> = Bun.env,
) => env.GOOGLE_CLOUD_PROJECT?.trim() || a.project_id;

const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : new Uint8Array(b as ArrayBuffer))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Signed RS256 assertion (header.claims.signature). */
export async function signJwt(
  a: ServiceAccount,
  scope: string,
  nowS: number,
  ttlS = 3600,
): Promise<string> {
  const der = Buffer.from(
    a.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
    "base64",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: a.client_email,
      scope,
      aud: a.token_uri ?? TOKEN_ENDPOINT,
      iat: nowS,
      exp: nowS + ttlS,
    }),
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${claims}`),
  );
  return `${head}.${claims}.${b64url(sig)}`;
}

const cache = new Map<string, { token: string; until: number }>();
const inflight = new Map<string, Promise<string>>();

/**
 * Access token of a service account, cached until 60 s before expiry; concurrent callers share one exchange.
 * `fetch` and `now` are injectable (tests); the account defaults to loadServiceAccount().
 */
export async function serviceAccountToken(
  o: {
    account?: ServiceAccount;
    scope?: string | string[];
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<string> {
  const a = o.account ?? loadServiceAccount();
  if (!a) throw new Error("no Google service account in the environment");
  const scope = [o.scope ?? CLOUD_PLATFORM_SCOPE].flat().join(" ");
  const k = `${a.client_email}\n${scope}`;
  const now = (o.now ?? Date.now)();
  const hit = cache.get(k);
  if (hit && hit.until > now + 60_000) return hit.token;
  const pending = inflight.get(k);
  if (pending) return pending;
  const p = (async () => {
    const res = await (o.fetch ?? fetch)(a.token_uri ?? TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: await signJwt(a, scope, Math.floor(now / 1000)),
      }).toString(),
    });
    const text = await res.text();
    let j: any = {};
    try {
      j = JSON.parse(text);
    } catch {}
    if (!res.ok || typeof j.access_token !== "string")
      throw new Error(
        `google token endpoint: HTTP ${res.status} ${String(j.error_description ?? j.error ?? "no access_token").slice(0, 200)}`,
      );
    cache.set(k, {
      token: j.access_token,
      until: now + Number(j.expires_in ?? 3600) * 1000,
    });
    return j.access_token as string;
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Forgets cached tokens (tests, after a 401). */
export const clearServiceAccountTokens = () => cache.clear();
