const SEC = {
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000",
  "referrer-policy": "strict-origin-when-cross-origin",
};
async function fetchKey(env, key, req) {
  return env.BUCKET.get(key, { range: req.headers, onlyIf: req.headers });
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
    let path = decodeURIComponent(url.pathname);
    // Release binaries: /dist/<file> -> bucket key dist/<file>, always a download.
    const dist = path.startsWith("/dist/") && !path.endsWith("/");
    const base = dist ? "" : (env.PREFIX || "").replace(/\/$/, "");
    if (path.endsWith("/")) path += "index.html";
    let obj = await fetchKey(env, base + path, req);
    if (dist && !obj) return new Response("not found", { status: 404, headers: SEC });
    if (!obj && !path.split("/").pop().includes("."))
      obj = await fetchKey(env, base + path + "/index.html", req);
    let status = 200;
    if (!obj && env.SPA === "1")
      obj = await fetchKey(env, base + "/index.html", req);
    if (!obj) {
      obj = await env.BUCKET.get(base + "/404.html");
      status = 404;
      if (!obj) return new Response("not found", { status, headers: SEC });
    }
    const h = new Headers(SEC);
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("accept-ranges", "bytes");
    if (dist) {
      const name = path.split("/").pop().replace(/"/g, "");
      h.set("content-disposition", `attachment; filename="${name}"`);
    }
    if (!("body" in obj))
      return new Response(null, { status: 304, headers: h });
    if (obj.range && req.headers.has("range")) {
      const { offset = 0, length } = obj.range;
      h.set(
        "content-range",
        `bytes ${offset}-${offset + length - 1}/${obj.size}`,
      );
      status = 206;
    }
    if (!h.has("cache-control"))
      h.set(
        "cache-control",
        path.endsWith(".html") ? "public, max-age=60" : "public, max-age=3600",
      );
    return new Response(req.method === "HEAD" ? null : obj.body, {
      status,
      headers: h,
    });
  },
};
