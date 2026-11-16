---
name: personal-data-discovery
description: Personal and site values are discovered at run time (packages/env-kit discover.ts and discover.sh), tokens @@a.b.c@@ in configs, hygiene rule personal-data reads the discovery cache
metadata:
  type: project
---

No personal or site value is stored in the repo or in a site.toml. Roles fr1, fr2, prd are `Host` aliases of ~/.ssh/config (the only per-machine input); addresses, hostnames, users come from `ssh -G`, `ip -o addr` (tunnel = `link/none`), DNS, Cloudflare API (zones by name: `@@zones.<name>@@`), git/gh/gcloud. Tracked configs carry `@@hosts.<role>.<key>@@` tokens rendered by `site_install` (shell) or `render.ts` (TS) at install time.

**Why:** owner complaint that a public repo hardcoded his identity, PC, accounts and VPS; then "use DNS, TLS, WS, HTTP, SSH instead of hardcoding".

**How to apply:** new scripts source `/usr/local/lib/aphrody/site.sh` (hosts) or `packages/env-kit/loaders/shell/site.sh` (repo) and call `site_get hosts.<role>.<key>`. Never write an IP or hostname in a tracked file; `bun scripts/hygiene.ts --rule personal-data` must stay at 0 hits. Traps: bun reads `/tmp` as `C:\tmp` (scratch files go to the Windows TEMP path), `String.replace` expands `$&` in replacement strings (use a function), the `bunos` nginx route is an API service name and is allow-listed. Hosts get the loader via fleet-offload.sh; `/etc/hosts` `<role>.mesh` block comes from fleet-mesh-hosts.sh. Not done: Rust twin of the loader, src.lock.json literal, `/.well-known/aphrody/host` endpoint, SRV records.
