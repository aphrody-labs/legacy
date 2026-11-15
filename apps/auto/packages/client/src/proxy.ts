// Same-origin proxy to the API (`/v1`, Better Auth, MCP), shared by the front end and the operator console.

/** Hop-by-hop HTTP headers: never forwarded by the proxy. */
const SAUT = ["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length"];

/**
 * Proxy to the API: same origin for the browser, so the `auto.session_token` cookie (HttpOnly, Secure,
 * SameSite=Lax) and `Content-Type` anti-CSRF work without CORS.
 */
export function proxifier(api: string | URL) {
  const base = new URL(api);
  return async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    const cible = new URL(u.pathname + u.search, base);
    const entree = new Headers(req.headers);
    for (const h of SAUT) entree.delete(h);
    entree.delete("accept-encoding");
    // Public origin as seen by the browser: the API uses it for the links it builds (quote, payment).
    entree.set("x-forwarded-host", u.host);
    entree.set("x-forwarded-proto", u.protocol.replace(":", ""));
    const corps = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    let res: Response;
    try {
      res = await fetch(cible, { method: req.method, headers: entree, body: corps, redirect: "manual" });
    } catch {
      return Response.json({ erreur: "API injoignable" }, { status: 502 });
    }
    const sortie = new Headers(res.headers);
    for (const h of [...SAUT, "content-encoding"]) sortie.delete(h);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: sortie });
  };
}
