# open (aphrody-labs/open) deploy on prd

- `open.aphrody.com`: Worker `open-aphrody-com` over R2 bucket `aphrody-open` (infra/cloudflare/workers/open-aphrody-com), primary.
- `open-origin.aphrody.com`: prd mirror. Cloudflare proxied CNAME -> tunnel `mig-prd` -> ingress `http://127.0.0.1:29403` -> host nginx vhost `open-origin.conf` (loopback only, TLS ends at Cloudflare, no A record, prd IP not published). Declared in infra/cloudflare/cloudflare.toml (ingress + dns).
- `open-vercel.aphrody.com`: Vercel project `aphrody-open` (team aphrody-dev), DNS-only CNAME `cname.vercel-dns.com` (record created with `cf dns records create`, not in cloudflare.toml: that file manages proxied records).

## prd layout

- `/srv/open`: shallow deploy-only mirror (`git reset --hard` on every sync).
- `open-sync.timer` (OnBootSec=1min, every 5 min, Persistent) -> `open-sync.service` -> `open-sync.sh`: fetch, reset, then `bun site/build.ts` (env `OUT_DIR`, arg = temp dir) if `site/build.ts` exists and yields `index.html`, else `render.ts` (README.md + open.lock.json). Output goes to `/srv/open-releases/<rev>-<ts>`, then `/srv/open-www` (symlink) is swapped atomically; 3 releases are kept.
- Apply: copy this directory to `/srv/open-deploy/` on prd, then `sh /srv/open-deploy/apply.sh` (idempotent: units, vhost, nginx -t, reload, enable timer).
- nginx: `systemctl reload nginx` fails on prd with 226/NAMESPACE (PrivateTmp of the running master); `apply.sh` falls back to `nginx -s reload`.
- Brotli module is not built into prd nginx: gzip only.

## Rollback

Remove the `open-origin.aphrody.com` ingress line and DNS line from infra/cloudflare/cloudflare.toml and delete the live objects (`bun infra/cloudflare/cf.ts plan`), then `systemctl disable --now open-sync.timer` and delete `/etc/nginx/conf.d/open-origin.conf`.

## Vercel

Project `aphrody-open` (prj_TjKw4pT7mvmbjUgX8XWb3capgXcN). Git link to aphrody-labs/open is NOT done: `POST /v9/projects/aphrody-open/link` returns "you need to install the GitHub integration first" (owner action: install https://github.com/apps/vercel on the aphrody-labs org). Until then it holds a CLI deploy of the rendered index.html. Once `site/build.ts` lands: set buildCommand `bun site/build.ts`, outputDirectory as built, no vercel.ts.
