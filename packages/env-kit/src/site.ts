// SPDX-License-Identifier: Apache-2.0
/**
 * Site values (hosts, addresses, accounts, owner identity) are discovered, never stored: see discover.ts. This module
 * keeps the `@@a.b.c@@` token vocabulary that tracked configs use and expands it from the discovery cache; the only
 * optional override is `~/.config/aphrody/site.toml` (APHRODY_SITE), for a value no protocol answers (OVH account id).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverGet, getCached } from "./discover.ts";

export function sitePath(env: Record<string, string | undefined> = process.env): string {
  return env.APHRODY_SITE || join(env.HOME || env.USERPROFILE || homedir(), ".config", "aphrody", "site.toml");
}

type Override = Record<string, Record<string, unknown>>;
/** The optional override file, or null when absent. */
export function loadOverride(path = sitePath()): Override | null {
  return existsSync(path) ? (Bun.TOML.parse(readFileSync(path, "utf8")) as Override) : null;
}

function overrideGet(path: string, o: Override | null): string | undefined {
  let v: unknown = o;
  for (const k of path.split(".")) v = (v as Record<string, unknown> | undefined)?.[k];
  return typeof v === "string" ? v : undefined;
}

/** Value of a dotted path: the override file first, else the discovery cache (run `bun discover.ts warm` to fill it). */
export function siteGet(path: string): string | undefined {
  return overrideGet(path, loadOverride()) ?? getCached(path);
}

/** The ssh alias of a role: the role itself, a Host entry of ~/.ssh/config. */
export const sshAlias = (role: string): string => role;

const TOKEN = /@@([A-Za-z0-9_.-]+)@@/g;

/** Replaces every `@@a.b.c@@` token by its value, discovering what the cache lacks; throws on a value nothing answers. */
export async function expand(text: string): Promise<string> {
  if (!text.includes("@@")) return text;
  const vals = new Map<string, string>();
  for (const m of text.matchAll(TOKEN)) {
    const p = m[1]!;
    if (vals.has(p)) continue;
    const v = overrideGet(p, loadOverride()) ?? (await discoverGet(p));
    if (v === undefined) throw new Error(`nothing answers for ${p} (ssh config, DNS, gh, gcloud, Cloudflare API); override in ${sitePath()}`);
    vals.set(p, v);
  }
  return text.replace(TOKEN, (_, p: string) => vals.get(p)!);
}

/** Text of a tracked config that carries tokens (deploy.toml, cluster.toml, ...), expanded. */
export async function readExpanded(path: string): Promise<string> {
  return expand(readFileSync(path, "utf8"));
}
