// The only Workers entry of r2-site (apps/r2-site/wrangler/aphrody-sites.toml): one Worker serves every
// static R2 site of the aphrody zones. SITES maps a hostname to its bucket binding and serveStatic options;
// adding a site is one SITES entry plus one custom domain route, not a new Worker. serveStatic runs on the R2
// binding itself, so ranges and conditional requests use R2's native onlyIf/range.
import type { R2Like } from "@aphrody/deploy/src/serve.ts";
import { handle } from "./app.ts";

export interface Site {
  /** Name of the R2 binding that holds the site (a key of Env). */
  bucket: string;
  /** Key prefix inside the bucket, "" = bucket root. */
  prefix: string;
  /** Health name reported by /health. */
  service: string;
  /** "1" serves index.html for unknown paths. */
  spa?: "0" | "1";
  /** "1" adds CORS, CORP and Timing-Allow-Origin to every response. */
  crossOrigin?: "0" | "1";
}

type Env = { SITES: string } & Record<string, unknown>;

const parsed = new WeakMap<object, Record<string, Site>>();
function sites(env: Env): Record<string, Site> {
  let s = parsed.get(env);
  if (!s) parsed.set(env, (s = JSON.parse(env.SITES) as Record<string, Site>));
  return s;
}

export default {
  fetch(req: Request, env: Env): Promise<Response> | Response {
    const host = new URL(req.url).hostname.toLowerCase();
    const site = sites(env)[host];
    if (!site) return new Response("unknown site", { status: 404, headers: { "cache-control": "no-store" } });
    const values: Record<string, string> = {
      PREFIX: site.prefix,
      SERVICE: site.service,
      SPA: site.spa ?? "0",
      CROSS_ORIGIN: site.crossOrigin ?? "0",
    };
    return handle(req, env[site.bucket] as R2Like, { get: (k) => values[k] }, "cf");
  },
};
