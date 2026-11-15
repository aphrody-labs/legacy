# Deployment

## Image

`docker/app.Dockerfile` builds every production image on Alpine from the repository root; the Rust suite is vendored
in `vendor/suite`. Stages (`--target`):

- `precompiled`: API and worker, native library already built (`native/`), copied from
  `ay build -t linux-musl --release --dylib -- -p auto-ffi`;
- `application`: reference build, native library compiled in the image (`natif` stage, `rust:1.99-alpine`);
- `web`: front end, without Chromium, OCR or native library;
- `sauvegarde`: encrypted `pg_dump` (host cron).

The runtime is the official Bun Alpine image (`BUN_IMAGE`, default `oven/bun:1.4.4-alpine`). `Bun.Video` belongs to
the Aphrody fork and is absent there: the video nodes fail with a clear message.

```sh
docker build --target precompiled -t auto-app:<version> .
```

The image runs as uid 10001 (`auto`), listens on `PORT` (3000 for the API, 3001 for the web image) and exposes
`/health`. The worker uses the same image: `docker run … auto-app bun apps/worker/src/index.ts`.

## Variables

File servers and quote extraction: see [ARRIVALS.md](ARRIVALS.md) for the read-only mounts,
`AUTO_DOSSIERS_RACINES` and the OCR/LLM configuration shared by the API and the worker.

| Variable                                                                             | Role                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                       | Application Postgres (Neon: pooled `-pooler` endpoint); migrations applied at startup                          |
| `DATABASE_URL_DIRECT`                                                                | Direct (unpooled) endpoint for migrations and `pg_dump`; optional outside Neon                                 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`  | S3-compatible object storage for legal archiving (MinIO, R2...); absent: archiving disabled (503)              |
| `AUTO_CLE_MAITRE`                                                                    | Master key (32 bytes in base64): encrypts the TOTP, PA and mail secrets. Required in production                |
| `AUTO_URL_APP`                                                                       | Public URL (`https://auto.aphrody.com`): also the Better Auth origin (cookies, OAuth, passkeys)                |
| `BETTER_AUTH_SECRET`, `AUTO_GOOGLE_*`, `AUTO_MICROSOFT_*`, `AUTO_ORIGINES_CONFIANCE` | Authentication, optional (see `AUTH.md`)                                                                       |
| `AUTO_EMAIL_OPERATEUR`                                                               | Operator contact (`contact@aphrody.com`)                                                                       |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`                                              | Event delivery by the worker                                                                                   |
| `STRIPE_*`, `AUTO_TENANT_OPERATEUR`                                                  | Subscription (see `STRIPE.md`)                                                                                 |
| `AUTO_SMTP_*`                                                                        | Transactional relay (see `MAIL.md`)                                                                            |
| `AUTO_IA_URL`                                                                        | Default OpenAI-compatible API of the AI nodes (default `http://localhost:11434/v1`)                            |
| `AUTO_HOTES_PERMIS`                                                                  | Internal hosts reachable by the workflows in production (e.g. `ollama`); others are refused                    |
| `AUTO_RESEAU_LOCAL`                                                                  | `permis`: the whole local network is reachable by the workflows (trusted-account installations only)           |

Full self-hosting (Auto, n8n, Hermes, Obsidian, Ollama and the admin console): see `box/README.md`.

Secrets are never in the repository: an environment file outside the repository (`--env-file`), or the
host's secret manager.

## auto.aphrody.com (Cloudflare Tunnel)

The name `auto.aphrody.com` (zone `aphrody.com`) points through a proxied CNAME to the Cloudflare tunnel
`auto` (`f8ba0d09-4ce8-4a9b-977d-b2e64acd2b2d.cfargotunnel.com`). The tunnel is managed remotely
(`config_src: cloudflare`) with the rule `auto.aphrody.com → http://auto-web:3001`. No inbound port is
open: the `cloudflared` connector opens the outbound connection.

Production (since 2026-10-22): OVH server `vps` (Ubuntu, Docker), reached through the private WireGuard tunnel
(`ssh <fr1>`). The stack is isolated from the other services of the server: Docker network `auto-prod`, no port
published on the host, the `cloudflared` connector is the only entry point.

Database (since 2026-11-03): **Neon**, project `auto` (`small-forest-38471112`) of organization
`org-long-shape-78978832`, region `aws-eu-central-1`, Postgres 18, database `auto`, owner role `auto`. Production
branch: `main` (default). The API and the worker use the pooled URL (PgBouncer, transaction mode:
`SET LOCAL ROLE auto_app` and `set_config(..., true)` stay inside the transaction); migrations and `pg_dump` use
the direct URL. The roles `auto_app` and `auto_worker` (NOLOGIN, NOBYPASSRLS) are created by migrations 001 and
005; no extension or superuser statement is required.

| Container      | Role                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| `auto-api`     | `/v1` API (migrations applied at startup)                                                |
| `auto-worker`  | Job queue, reminders, PA and mail polling                                                |
| `auto-web`     | Front end and proxy of `/v1`, `/api/auth`, `/.well-known`, `/mcp` to `auto-api` (port 3001) |
| `auto-tunnel`  | Cloudflare connector, rule `auto.aphrody.com → http://auto-web:3001`                     |
| `auto-minio`   | S3 object storage for archiving, `auto-prod` network only (`S3_ENDPOINT`)                |
| `auto-pg-prod` | Former Postgres 18 database, no writes since 2026-11-03: rollback point                  |

Secrets on the server, in `~/auto` (mode 700): `prod.env` (read by the containers: `DATABASE_URL`,
`DATABASE_URL_DIRECT`, `AUTO_CLE_MAITRE` generated in place...), `neon.env` (`NEON_API_KEY`, `NEON_ORG_ID`,
`NEON_PROJECT_ID`: read by the release only, never by the containers), `tunnel.token`. The same Neon URLs are in
the GitHub secrets `NEON_DATABASE_URL` and `NEON_DATABASE_URL_DIRECT` (repository `aphrody-labs/auto`). A copy of
`prod.env` is kept by the operator, off the server: `~/.auto/prod-vps.env` (the master key is required to decrypt
the backups).

Operation through `ay ssh` (host `AUTO_HOTE`, default `fr1`):

```sh
bun run prod etat       # host, auto-* containers, public probe
bun run prod deployer   # fast path (TS sources, image rebuilt on vps) or full path if the native part changes
```

The worker exposes no port: it runs with `--no-healthcheck` (see `scripts/prod.ts`).

Release: `bun run release:vps -- deployer` (`scripts/deployer-vps.ts`) prepares the image then runs
`scripts/release-vps.ts` on the VPS, which qualifies the release on a copy-on-write Neon branch of production
(`candidat-<version>`, deleted afterwards) before migrating and recreating the containers.
`release-vps.ts <version> relancer` recreates the containers of the release in place with the current `prod.env`
(database change, secret rotation). `/health` returns `{ ok, version, commit }`: `version` is the release
identifier, `commit` the Git commit delivered (`AUTO_VERSION`, `AUTO_COMMIT`). Shared Neon tools:
`scripts/neon.ts` (project, branches, pooled or direct URL; no URL is printed).

Backups: `~/auto/sauvegarde.sh` (versioned source: `scripts/vps-sauvegarde.sh`, daily cron at 3:15 am) runs
`scripts/sauvegarde.ts`: a `pg_dump` of Neon (`DATABASE_URL_DIRECT`) encrypted with AES-256-GCM in
`~/auto/sauvegardes`, 14 kept, log in `~/auto/sauvegarde.log`. Restore verified on 2026-10-24 in a throwaway
database (55 tables, then the test database was dropped). Bun loads the secrets with `--env-file`, without
interpreting `prod.env` as shell.
Off-site copy after each backup: `rsync --delete` to `offsite:/srv/offsite/vps/auto-sauvegardes/`.
Neon also keeps the branch history (point-in-time restore); the branch `avant-bascule-20261103t223215z` freezes
production as restored during the cutover.

Cutover of 2026-11-03: freeze (stop `auto-worker` then `auto-api`), `pg_dump -Fc` of `auto-pg-prod`,
`pg_restore --no-owner --single-transaction` into the `main` branch (roles `auto_app` and `auto_worker` created
beforehand), identical comparison of the row counts of each table, of `schema_migration`, the sequences, the RLS
policies, the grants and the functions, then restart with `release-vps.ts relancer`. Rollback: restore
`~/auto/prod.env.avant-neon-20261103T223215Z`, then `release-vps.ts <version> relancer`; `auto-pg-prod` was not
modified.

Archiving of frozen copies (`/v1/conformite/archivage`): any S3-compatible storage configured by `S3_ENDPOINT`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_REGION` (`Bun.S3Client` client, no
MinIO-specific assumption). In production: MinIO `auto-minio` on the `auto-prod` network, bucket `auto-archives`
with object lock (default retention GOVERNANCE, 11 years), `S3_*` variables in `~/auto/prod.env`. Test run of
2026-10-22 with the production image (throwaway database, bucket `auto-recette` with 1-day retention):
`POST /v1/conformite/archivage` archives the issued Factur-X invoice under a GOVERNANCE lock, second pass empty.

Still to do:

- Microsoft, Stripe and PA: remaining configuration and qualification (see `PRODUCTION.md`, `STRIPE.md`, `PA.md`).

The Zimbra relay `auto@aphrody.com` is operational on the VPS: SMTP TLS, IMAP reception and Gmail delivery with
SPF/DKIM/DMARC validated. Google is published in production and tested. The active auth/mail image and the
rollback means are described in `PRODUCTION.md`.

The local preproduction (operator's machine, dev database `auto-pg` without `fsync`) is stopped; the same
`docker/app.Dockerfile` serves the self-hosted mode through docker compose.
