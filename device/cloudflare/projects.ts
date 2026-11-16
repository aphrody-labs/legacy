#!/usr/bin/env bun
// Sync check of projects.toml against the live account: every Worker, R2 bucket, tunnel and zone belongs to exactly
// one project, every listed resource exists. Read-only. Exit 1 on drift.
//   bun device/cloudflare/projects.ts            (token: CLOUDFLARE_API_TOKEN, see lib.ts)
import { join } from "node:path";
import { api, cfg } from "./lib.ts";

interface Project {
  repo: string;
  zones: string[];
  tunnel: string;
  workers: string[];
  buckets: string[];
}
const manifest = Bun.TOML.parse(await Bun.file(join(import.meta.dir, "projects.toml")).text()) as { project: Record<string, Project> };
const A = cfg.account;

const [workers, buckets, tunnels, zones] = await Promise.all([
  api<{ id: string }[]>("GET", `/accounts/${A}/workers/scripts`).then((l) => l.map((w) => w.id)),
  api<{ buckets: { name: string }[] }>("GET", `/accounts/${A}/r2/buckets`).then((r) => r.buckets.map((b) => b.name)),
  api<{ name: string }[]>("GET", `/accounts/${A}/cfd_tunnel?is_deleted=false`).then((l) => l.map((t) => t.name)),
  api<{ name: string }[]>("GET", `/zones?account.id=${A}&per_page=50`).then((l) => l.map((z) => z.name)),
]);

const kinds = {
  workers: { live: workers, listed: (p: Project) => p.workers },
  buckets: { live: buckets, listed: (p: Project) => p.buckets },
  tunnels: { live: tunnels, listed: (p: Project) => (p.tunnel ? [p.tunnel] : []) },
  zones: { live: zones, listed: (p: Project) => p.zones },
} as const;

let drift = 0;
for (const [kind, { live, listed }] of Object.entries(kinds)) {
  const owners = new Map<string, string[]>();
  for (const [name, p] of Object.entries(manifest.project)) for (const r of listed(p)) owners.set(r, [...(owners.get(r) ?? []), name]);
  for (const r of live) {
    const o = owners.get(r) ?? [];
    if (o.length !== 1) (drift++, console.log(`DRIFT ${kind} ${r}: ${o.length ? `in several projects (${o.join(", ")})` : "in no project"}`));
  }
  for (const r of owners.keys()) if (!live.includes(r)) (drift++, console.log(`DRIFT ${kind} ${r}: listed but not in the account`));
}
console.log(drift ? `${drift} drift(s)` : `ok: ${workers.length} workers, ${buckets.length} buckets, ${tunnels.length} tunnels, ${zones.length} zones, ${Object.keys(manifest.project).length} projects`);
process.exit(drift ? 1 : 0);
