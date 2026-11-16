# Cloudflare edge recipes (imported by the root justfile).

# Cloudflare edge (device/cloudflare, docs/infra/FR2-CLOUDFLARE.md): read-only diff of cloudflare.toml vs live
[group('cloudflare')]
cf-plan section="":
    bun system/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN -- bun device/cloudflare/cf.ts plan {{section}}

# Apply one section of cloudflare.toml (dns|tunnels|rules|access), vault token, fails hard if it is invalid
[group('cloudflare')]
cf-apply section only="":
    bun system/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN -- bun device/cloudflare/cf.ts apply {{section}} {{ if only != "" { "--only " + only } else { "" } }}

# Custom AOP for fr2 origins proxied by Cloudflare (dbfr): rotate CA + edge client certificate, then prune after convergence
[group('cloudflare')]
cf-aop host="dbfr.aphrody.com":
    bun system/env-kit/src/cli.ts secret exec CF_AOP_TOKEN -- bun device/cloudflare/aop.ts {{host}}

[group('cloudflare')]
cf-aop-prune host="dbfr.aphrody.com":
    bun system/env-kit/src/cli.ts secret exec CF_AOP_TOKEN -- bun device/cloudflare/aop.ts --prune {{host}}

# Short-lived SSH certificates for the Access browser terminals: per-app CA trusted by sshd on fr2/prd (idempotent)
[group('cloudflare')]
cf-ssh-ca:
    bun system/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN -- bun device/cloudflare/ssh-ca.ts

# Rotate the per-host least-privilege fleet tokens (fleet-<host>-dns) into /etc/aphrody/secrets.env of fr2/prd
[group('cloudflare')]
cf-fleet-token:
    bun system/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN -- bun device/cloudflare/fleet-token.ts fr2 prd

# Re-run every Cloudflare/fr2 edge check (DNS, headers, TLS, tunnels, Access, closed origin, WAF, cache); exit 1 on regression
[group('cloudflare')]
cf-proof *args:
    bun system/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN CF_PROOF_TOKEN -- bun device/cloudflare/proof.ts {{args}}
