const SEC = {
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000",
  "referrer-policy": "strict-origin-when-cross-origin",
};
// Workers Cache ("cache": {"enabled": true} in wrangler.jsonc) strips Range before this
// Worker runs and slices ranges / answers conditionals from the cached full 200,
// so the Worker always returns the whole object and repeat hits never reach R2.
async function fetchKey(env, key) {
  return env.BUCKET.get(key);
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/health")
      return Response.json(
        { status: "ok", service: env.SERVICE || "r2-site" },
        { headers: SEC },
      );
    const base = (env.PREFIX || "").replace(/\/$/, "");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    let obj = await fetchKey(env, base + path);
    if (!obj && !path.split("/").pop().includes("."))
      obj = await fetchKey(env, base + path + "/index.html");
    let status = 200;
    if (!obj && env.SPA === "1")
      obj = await fetchKey(env, base + "/index.html");
    if (!obj) {
      obj = await env.BUCKET.get(base + "/404.html");
      status = 404;
      if (!obj) return new Response("not found", { status, headers: SEC });
    }
    const h = new Headers(SEC);
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("accept-ranges", "bytes");
    if (!h.has("cache-control"))
      h.set(
        "cache-control",
        path.endsWith(".html") ? "public, max-age=60" : "public, max-age=3600",
      );
    if (status !== 200) h.set("cache-control", "no-store");
    return new Response(req.method === "HEAD" ? null : obj.body, {
      status,
      headers: h,
    });
  },
};
