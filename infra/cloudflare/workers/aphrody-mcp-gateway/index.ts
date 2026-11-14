// Public MCP gateway (mcp.aphrody.com): OAuth 2.1 authorization server (PKCE S256, DCR RFC 7591, RFC 8414/9728 metadata,
// login = Google OIDC restricted to the owner account) in front of the MCP relay origin (Streamable HTTP, through the
// Cloudflare tunnel). Stateless: client ids, codes and tokens are HMAC-signed blobs, no KV needed.
// Secrets (wrangler/cf secrets, never in this file): OAUTH_SECRET, RELAY_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// OWNER_GOOGLE_ACCOUNT (= vault APHRODY_OWNER_GOOGLE_ACCOUNT); optional CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET.
// Vars: ORIGIN_URL (https://mcp-origin.aphrody.com). Optional binding: ARCHIVE (R2, authenticated GET /archive/<key>).

export interface Env {
  ORIGIN_URL: string;
  OAUTH_SECRET: string;
  RELAY_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OWNER_GOOGLE_ACCOUNT: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  ARCHIVE?: { get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null> };
}

const SCOPE = "mcp";
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const now = () => Math.floor(Date.now() / 1000);

async function hmac(secret: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const eq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
/** Signed blob `kind.payload.sig`; the kind is part of the MAC so a token cannot be replayed as another kind. */
async function seal(env: Env, kind: string, body: Record<string, unknown>, ttl: number): Promise<string> {
  const p = b64u(enc.encode(JSON.stringify({ ...body, exp: now() + ttl })));
  return `${kind}.${p}.${await hmac(env.OAUTH_SECRET, `${kind}.${p}`)}`;
}
async function open(env: Env, kind: string, tok: string | null): Promise<any | null> {
  const [k, p, sig] = (tok ?? "").split(".");
  if (k !== kind || !p || !sig || !eq(sig, await hmac(env.OAUTH_SECRET, `${kind}.${p}`))) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return o.exp > now() ? o : null;
  } catch {
    return null;
  }
}

const json = (o: unknown, status = 200, h: HeadersInit = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const oerr = (error: string, desc: string, status = 400) => json({ error, error_description: desc }, status);

function meta(origin: string) {
  return {
    as: {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE],
      authorization_response_iss_parameter_supported: true,
    },
    rs: { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"] },
  };
}

// Per-isolate sliding window (best effort); the hard limit is the Workers rate-limit rule on the zone.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowS = 60): boolean {
  const t = now();
  const a = (hits.get(key) ?? []).filter((x) => x > t - windowS);
  a.push(t);
  hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return a.length > max;
}

const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

async function register(env: Env, req: Request): Promise<Response> {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return oerr("invalid_client_metadata", "JSON body required");
  }
  const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
  const ok = (u: string) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" || (x.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(x.hostname));
    } catch {
      return false;
    }
  };
  if (!uris.length || uris.length > 10 || !uris.every(ok)) return oerr("invalid_redirect_uri", "https or loopback redirect_uris required");
  const name = String(b.client_name ?? "mcp-client").slice(0, 80);
  const client_id = await seal(env, "cid", { uris, name }, 365 * 86400);
  return json({ client_id, client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: SCOPE }, 201);
}

async function authorize(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams;
  const client = await open(env, "cid", q.get("client_id"));
  const ru = q.get("redirect_uri") ?? "";
  if (!client || !client.uris.includes(ru)) return new Response("invalid client or redirect_uri", { status: 400 });
  const back = (e: string) => {
    const u = new URL(ru);
    u.searchParams.set("error", e);
    if (q.get("state")) u.searchParams.set("state", q.get("state")!);
    u.searchParams.set("iss", url.origin);
    return Response.redirect(u.toString(), 302);
  };
  if (q.get("response_type") !== "code") return back("unsupported_response_type");
  if (!q.get("code_challenge") || q.get("code_challenge_method") !== "S256") return back("invalid_request");
  const st = await seal(env, "gst", { cid: q.get("client_id"), ru, state: q.get("state") ?? "", cc: q.get("code_challenge"), res: q.get("resource") ?? "" }, 600);
  const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  g.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/google/callback`,
    response_type: "code",
    scope: "openid email",
    state: st,
    prompt: "select_account",
  }).toString();
  return Response.redirect(g.toString(), 302);
}

async function googleCallback(env: Env, url: URL): Promise<Response> {
  const st = await open(env, "gst", url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!st || !code) return new Response("invalid login state", { status: 400 });
  const back = (p: Record<string, string>) => {
    const u = new URL(st.ru);
    for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
    if (st.state) u.searchParams.set("state", st.state);
    u.searchParams.set("iss", url.origin);
    return Response.redirect(u.toString(), 302);
  };
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/google/callback`, grant_type: "authorization_code" }),
  });
  if (!r.ok) return back({ error: "access_denied" });
  // The id_token comes straight from Google's token endpoint over TLS: OIDC Core 3.1.3.7 allows skipping the signature check.
  const idt = ((await r.json()) as any).id_token as string | undefined;
  let c: any = {};
  try {
    c = JSON.parse(new TextDecoder().decode(unb64u(idt!.split(".")[1])));
  } catch {}
  const owner = (env.OWNER_GOOGLE_ACCOUNT ?? "").trim().toLowerCase();
  const allowed = c.aud === env.GOOGLE_CLIENT_ID && c.email_verified === true && owner && String(c.email).toLowerCase() === owner;
  log({ ev: "login", allowed: !!allowed });
  if (!allowed) return back({ error: "access_denied" });
  return back({ code: await seal(env, "cod", { cid: st.cid, ru: st.ru, cc: st.cc, res: st.res }, 60) });
}

async function token(env: Env, req: Request, origin: string): Promise<Response> {
  const f = new URLSearchParams(await req.text());
  const grant = f.get("grant_type");
  const issue = async (cid: string, res: string) => {
    const aud = `${origin}/mcp`;
    if (res && res !== aud) return oerr("invalid_target", "resource must be the MCP endpoint");
    return json({
      access_token: await seal(env, "acc", { cid, aud }, 3600),
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: await seal(env, "ref", { cid, aud }, 30 * 86400),
      scope: SCOPE,
    });
  };
  if (grant === "authorization_code") {
    const c = await open(env, "cod", f.get("code"));
    if (!c || c.cid !== f.get("client_id") || c.ru !== f.get("redirect_uri")) return oerr("invalid_grant", "bad code");
    const v = f.get("code_verifier") ?? "";
    const h = b64u(await crypto.subtle.digest("SHA-256", enc.encode(v)));
    if (v.length < 43 || !eq(h, c.cc)) return oerr("invalid_grant", "PKCE mismatch");
    return issue(c.cid, f.get("resource") ?? c.res);
  }
  if (grant === "refresh_token") {
    const r = await open(env, "ref", f.get("refresh_token"));
    if (!r || r.cid !== f.get("client_id")) return oerr("invalid_grant", "bad refresh token");
    return issue(r.cid, f.get("resource") ?? "");
  }
  return oerr("unsupported_grant_type", "authorization_code or refresh_token");
}

async function bearer(env: Env, req: Request, origin: string): Promise<boolean> {
  const m = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  const t = await open(env, "acc", m?.[1] ?? null);
  return !!t && t.aud === `${origin}/mcp`;
}

function originHeaders(env: Env, req: Request): Headers {
  const h = new Headers();
  for (const k of ["accept", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id"]) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set("authorization", `Bearer ${env.RELAY_TOKEN}`);
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    h.set("cf-access-client-id", env.CF_ACCESS_CLIENT_ID);
    h.set("cf-access-client-secret", env.CF_ACCESS_CLIENT_SECRET);
  }
  return h;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const o = url.origin;
    const p = url.pathname;
    const ip = req.headers.get("cf-connecting-ip") ?? "?";
    if (limited(`${ip}:${p.startsWith("/mcp") ? "mcp" : "oauth"}`, p.startsWith("/mcp") ? 600 : 60)) return json({ error: "rate_limited" }, 429, { "retry-after": "30" });

    if (p === "/healthz" || p === "/") return json({ ok: true, service: "aphrody-mcp-gateway", mcp: `${o}/mcp`, a2a: `${o}/a2a` });
    if (p.startsWith("/.well-known/oauth-protected-resource")) return json(meta(o).rs);
    if (p.startsWith("/.well-known/oauth-authorization-server") || p === "/.well-known/openid-configuration") return json(meta(o).as);
    if (p === "/register" && req.method === "POST") return register(env, req);
    if (p === "/authorize" && req.method === "GET") return authorize(env, url);
    if (p === "/google/callback") return googleCallback(env, url);
    if (p === "/token" && req.method === "POST") return token(env, req, o);

    // Agent card (A2A discovery) is public metadata: relay card with its url rewritten to the gateway.
    if (p === "/.well-known/agent-card.json" && req.method === "GET") {
      const c = await fetch(`${env.ORIGIN_URL.replace(/\/$/, "")}/.well-known/agent-card.json`, { headers: originHeaders(env, req) });
      if (!c.ok) return json({ error: "origin_unavailable" }, 502);
      const card: any = await c.json();
      return json({ ...card, url: `${o}/a2a`, supportedInterfaces: undefined });
    }
    const needAuth = p === "/mcp" || p === "/a2a" || p.startsWith("/archive/");
    if (!needAuth) return json({ error: "not_found" }, 404);
    if (!(await bearer(env, req, o))) {
      log({ ev: "401", path: p });
      return new Response("unauthorized", { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${o}/.well-known/oauth-protected-resource", scope="${SCOPE}"` } });
    }
    if (p.startsWith("/archive/")) {
      const key = decodeURIComponent(p.slice(9));
      if (!env.ARCHIVE || !/^[\w.\-]+(\/[\w.\-]+)*$/.test(key) || key.includes("..")) return json({ error: "not_found" }, 404);
      const obj = await env.ARCHIVE.get(key);
      return obj ? new Response(obj.body, { headers: { "content-type": "text/markdown; charset=utf-8", etag: obj.httpEtag, "cache-control": "private, max-age=300" } }) : json({ error: "not_found" }, 404);
    }
    const up = await fetch(`${env.ORIGIN_URL.replace(/\/$/, "")}${p}`, {
      method: req.method,
      headers: originHeaders(env, req),
      body: req.method === "GET" || req.method === "DELETE" ? undefined : req.body,
    });
    log({ ev: "mcp", status: up.status, method: req.method });
    const h = new Headers();
    for (const k of ["content-type", "mcp-session-id", "cache-control"]) {
      const v = up.headers.get(k);
      if (v) h.set(k, v);
    }
    return new Response(up.body, { status: up.status, headers: h });
  },
};
