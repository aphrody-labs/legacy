// SPDX-License-Identifier: Apache-2.0
/**
 * Private site configuration: identity, accounts, hosts, Windows paths. The real file lives outside
 * the repository (`~/.config/aphrody/site.toml`, overridable with `APHRODY_SITE`); only
 * `packages/env-kit/site.example.toml` is committed. Fleet roles (fr1, fr2, prd, pc) resolve here to an ssh alias,
 * an address and a user, so no tracked file carries a host value.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SiteHost {
  ssh?: string;
  aliases?: string[];
  hostname?: string;
  public_ip?: string;
  mesh_ip?: string;
  user?: string;
  src_root?: string;
  [key: string]: unknown;
}

export interface Site {
  identity?: Record<string, unknown>;
  accounts?: Record<string, unknown>;
  windows?: Record<string, unknown>;
  network?: Record<string, unknown>;
  hosts?: Record<string, SiteHost>;
}

export function sitePath(env: Record<string, string | undefined> = process.env): string {
  return env.APHRODY_SITE || join(env.HOME || env.USERPROFILE || homedir(), ".config", "aphrody", "site.toml");
}

/** The parsed site file, or `null` when it is absent (CI, fresh clone). */
export function loadSite(path = sitePath()): Site | null {
  if (!existsSync(path)) return null;
  return Bun.TOML.parse(readFileSync(path, "utf8")) as Site;
}

/** The host entry of a role, or throws with the path to create. */
export function host(role: string, site: Site | null = loadSite()): SiteHost {
  const h = site?.hosts?.[role];
  if (!h) throw new Error(`role "${role}" not in ${sitePath()} (copy packages/env-kit/site.example.toml there)`);
  return h;
}

/** The ssh alias to use for a role. */
export function sshAlias(role: string, site?: Site | null): string {
  const h = host(role, site);
  return h.ssh ?? h.aliases?.[0] ?? h.public_ip ?? role;
}

/** Every string value of the file (identity, accounts, hosts, paths): the list the hygiene rule searches for. */
export function siteValues(site: Site | null = loadSite()): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") v.length >= 4 && out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(site);
  return [...out];
}
