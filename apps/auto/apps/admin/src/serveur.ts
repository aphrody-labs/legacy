// Operator console: imported HTML page (native Bun bundling) and the same same-origin `/v1` proxy as the front.
// It has no rights of its own: the operator signs in with their operator-tenant account (contact@aphrody.com).
import { proxifier } from "@auto/client/proxy";
import console_ from "../public/index.html";
import { translator } from "./i18n";

export interface OptionsAdmin {
  /** Base URL of the API (`AUTO_API_URL`). */
  api: string | URL;
}

export function routesAdmin(o: OptionsAdmin) {
  const proxy = proxifier(o.api);
  return {
    "/": console_,
    "/v1/*": proxy,
    "/health": proxy,
    // Better Auth admin plugin (accounts, bans, sessions).
    "/api/auth/*": proxy,
  };
}

export function demarrerAdmin(o: OptionsAdmin & { port?: number; development?: boolean }) {
  return Bun.serve({
    port: o.port ?? 0,
    development: o.development ?? false,
    routes: routesAdmin(o),
    fetch: (req) =>
      new Response(translator(req.headers.get("accept-language")).t("page.not_found"), { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }),
  });
}
