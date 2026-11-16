// API extension point: each batch adds its routes in apps/api/src/modules/<batch>.ts.
import type { Sql } from "@auto/store";
import type { Action, Auth, AuthAuto } from "@auto/tenancy";
import type { Emetteur } from "@auto/services";

export interface Contexte {
  sql: Sql;
  publier: Emetteur;
  /** Public route: business errors converted to JSON responses. */
  pub: <R extends Request>(fn: (req: R) => Promise<Response>) => (req: R) => Promise<Response>;
  /** Authenticated route: required right, caller resolved (the transaction is still to be opened with withTenant). */
  auth: <R extends Request>(
    action: Action,
    fn: (req: R, a: Auth) => Promise<Response>,
  ) => (req: R) => Promise<Response>;
  /** Better Auth instance of the API. */
  ba: AuthAuto;
}

/**
 * Public origin of the application for links sent to clients: `AUTO_URL_APP` in production, otherwise
 * the host forwarded by the front proxy (`x-forwarded-host`), otherwise the request origin.
 */
export function origineApp(req: Request): string {
  if (Bun.env.AUTO_URL_APP) return Bun.env.AUTO_URL_APP.replace(/\/+$/, "");
  const hote = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  return hote && /^[\w.-]+(:\d+)?$/.test(hote) ? `${proto}://${hote}` : new URL(req.url).origin;
}

/** Routes in the `Bun.serve({ routes })` format. */
export type Module = (c: Contexte) => Record<string, unknown>;

/**
 * OpenAPI 3.1 description of a module's routes (`export const openapi: Chemins`), paths in the
 * `/v1/x/{id}` format: merged into GET /v1/openapi.json; openapi.test.ts requires every route documented.
 */
export type Chemins = Record<string, Record<string, unknown>>;
