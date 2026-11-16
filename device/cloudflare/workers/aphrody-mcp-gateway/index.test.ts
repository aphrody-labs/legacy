import { expect, test } from "bun:test";
import gw, { type Env } from "./index.ts";

const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const O = "https://mcp.test";

function setup(email = "owner@example.test") {
  const seen: Request[] = [];
  const origin = Bun.serve({
    port: 0,
    async fetch(r) {
      seen.push(r.clone());
      const b: any = await r.json();
      return Response.json({ jsonrpc: "2.0", id: b.id, result: { tools: [{ name: "memory_search" }] } });
    },
  });
  const env: Env = { ORIGIN_URL: `http://127.0.0.1:${origin.port}`, OAUTH_SECRET: "s".repeat(32), RELAY_TOKEN: "relay-secret", GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", OWNER_GOOGLE_ACCOUNT: "Owner@Example.test" };
  const real = globalThis.fetch;
  // Google token endpoint stub: returns an id_token for `email`; everything else goes to the real fetch (mock origin).
  globalThis.fetch = (async (i: any, init?: any) => {
    if (String(i).startsWith("https://oauth2.googleapis.com/token")) {
      const p = b64u(new TextEncoder().encode(JSON.stringify({ aud: "gid", email, email_verified: true })).buffer as ArrayBuffer);
      return Response.json({ id_token: `h.${p}.s` });
    }
    return real(i, init);
  }) as typeof fetch;
  return { env, seen, done: () => { globalThis.fetch = real; origin.stop(true); } };
}
const call = (env: Env, path: string, init?: RequestInit) => gw.fetch(new Request(O + path, init), env);

async function login(env: Env) {
  const reg = await (await call(env, "/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://gemini.test/cb"], client_name: "t" }) })).json() as any;
  const verifier = "v".repeat(64);
  const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const a = await call(env, `/authorize?${new URLSearchParams({ client_id: reg.client_id, redirect_uri: "https://gemini.test/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" })}`);
  expect(a.status).toBe(302);
  const g = new URL(a.headers.get("location")!);
  expect(g.host).toBe("accounts.google.com");
  const cb = await call(env, `/google/callback?code=gc&state=${g.searchParams.get("state")}`);
  const back = new URL(cb.headers.get("location")!);
  return { reg, verifier, back };
}

test("full OAuth + MCP proxy", async () => {
  const { env, seen, done } = setup();
  try {
    expect((await call(env, "/mcp", { method: "POST", body: "{}" })).status).toBe(401);
    const md = await (await call(env, "/.well-known/oauth-authorization-server")).json() as any;
    expect(md.code_challenge_methods_supported).toEqual(["S256"]);
    const { reg, verifier, back } = await login(env);
    expect(back.searchParams.get("state")).toBe("xyz");
    const t = await (await call(env, "/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: reg.client_id, redirect_uri: "https://gemini.test/cb", code_verifier: verifier, resource: `${O}/mcp` }) })).json() as any;
    expect(t.token_type).toBe("Bearer");
    const r = await call(env, "/mcp", { method: "POST", headers: { authorization: `Bearer ${t.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect((await r.json() as any).result.tools[0].name).toBe("memory_search");
    expect(seen[0].headers.get("authorization")).toBe("Bearer relay-secret");
    const rt = await (await call(env, "/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: reg.client_id }) })).json() as any;
    expect(rt.access_token).toBeTruthy();
    // A refresh token is not an access token.
    expect((await call(env, "/mcp", { method: "POST", headers: { authorization: `Bearer ${t.refresh_token}` }, body: "{}" })).status).toBe(401);
  } finally { done(); }
});

test("a2a is proxied with the same token, unauthenticated refused", async () => {
  const { env, seen, done } = setup();
  try {
    expect((await call(env, "/a2a", { method: "POST", body: "{}" })).status).toBe(401);
    const { reg, verifier, back } = await login(env);
    const t = await (await call(env, "/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: reg.client_id, redirect_uri: "https://gemini.test/cb", code_verifier: verifier }) })).json() as any;
    const r = await call(env, "/a2a", { method: "POST", headers: { authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "message/send" }) });
    expect(r.status).toBe(200);
    expect(new URL(seen[0].url).pathname).toBe("/a2a");
  } finally { done(); }
});

test("other Google account denied, bad PKCE rejected", async () => {
  const s = setup("intruder@example.test");
  try {
    const { back } = await login(s.env);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("code")).toBeNull();
  } finally { s.done(); }
  const ok = setup();
  try {
    const { reg, back } = await login(ok.env);
    const bad = await call(ok.env, "/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: reg.client_id, redirect_uri: "https://gemini.test/cb", code_verifier: "w".repeat(64) }) });
    expect(bad.status).toBe(400);
  } finally { ok.done(); }
});
