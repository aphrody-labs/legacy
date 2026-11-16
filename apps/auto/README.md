# auto

<!-- catalog:begin unit -->
| Type | Path |
| :-- | :-- |
| App | `apps/auto` |

**Commands**

```sh
bun run --cwd apps/auto dev
bun run --cwd apps/auto migrate
bun run --cwd apps/auto worker
bun run --cwd apps/auto openapi
bun run --cwd apps/auto test
bun run --cwd apps/auto check
bun run --cwd apps/auto lint
bun run --cwd apps/auto fmt
```

Part of Aphrody: [aphrody-labs/ay](../../README.md), [Catalog](../../docs/reference/catalog/app.md).
<!-- catalog:end -->

Multi-tenant automation platform for freelancers and small businesses: n8n-style visual workflows (triggers on events, cron or webhooks; HTTP, web, RSS, spreadsheets, Slack, Discord, Telegram, mail, AI models, data actions), with business management built in as an event source: e-invoicing, purchasing, mail, employees, office documents, AI agents. A single `/v1` API, several surfaces: web app, desktop app, mobile app, CLI, MCP server, Claude Code plugin and Chrome extension.

User-facing text is English at the source and translated through the catalogs of `frameworks/i18n-ts` (Unicode MessageFormat 2); locales are whatever catalogs are present, and the source locale comes from `frameworks/i18n-ts/locales/config.json`. French legal and fiscal terms (Factur-X, SIRET, TVA, FEC, URSSAF) stay as data. Many docs, file names and code identifiers are still French (see [docs/I18N.md](docs/I18N.md)).

## Surfaces

Standalone server distribution, Docker images and production Compose: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).
Production: OVH server `vps` (Docker containers behind a Cloudflare Tunnel) and **Neon** PostgreSQL
(project `auto`, `aws-eu-central-1`): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

| Surface                | Who and what for                                                            | Folder                     |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------- |
| Web app (SaaS)         | Public site, sign-up, full app at https://auto.aphrody.com                  | `apps/web`                 |
| Operator console       | Companies, suspension, outbox, audit                                        | `apps/admin`               |
| Desktop app            | Native Tauri 2 shell (Windows, macOS, Linux) around the web app             | `apps/desktop`             |
| Mobile app             | Android APK (same Tauri shell) and installable web app (PWA)                | `apps/desktop`, `apps/web` |
| `auto` CLI             | Agent, MCP server, workflows as code (`auto flux`, n8n import)              | `apps/cli`                 |
| Claude Code plugin     | Remote `auto` MCP server (OAuth) and usage skill                            | `apps/plugin`              |
| Chrome extension       | Right-click an online supplier invoice: it is sent to auto                  | `apps/extension`           |
| API and worker         | `/v1` HTTP API documented in OpenAPI; job queue, reminders, mail polling    | `apps/api`, `apps/worker`  |

## Scope

Online: https://auto.aphrody.com (production on an OVH server, see `docs/DEPLOYMENT.md`). API documented in OpenAPI
3.1: `GET /v1/openapi.json` and `docs/openapi.json`.

| Domain                       | Content                                                                                                                                              | Component                                                    | Status                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Automations                  | Visual workflows, 27 nodes, expressions, encrypted secrets, history, templates, n8n import (`docs/AUTOMATISATIONS.md`)                               | `frameworks/automate`, `/v1/automatisations`                   | in place                                         |
| Invoicing                    | Quotes, invoices, deposits, partial credit notes, discounts, customers and products, payments, D+7/D+30 reminders, Factur-X EN 16931 frozen at issue | `packages/domain`, `crates/auto-facturx`, `crates/auto-docs` | in place                                         |
| Templates                    | Accent colour, logo, footer per company, PDF/A-3b preserved                                                                                          | `/v1/parametres/gabarit`                                     | in place                                         |
| E-invoicing                  | Approved platform: submission, lifecycle statuses, reception, directory, e-reporting; `mock` and B2Brouter adapters                                  | `packages/pa`, `/v1/pa`                                      | in place (to qualify in sandbox, `docs/PA.md`)   |
| Mail                         | The company's IMAP/SMTP mailbox (OVH, Google, Microsoft… presets), sorted polling, document sending, transactional relay                             | `packages/mail`, `/v1/mail`                                  | in place                                         |
| Supplier invoices            | Factur-X read directly, otherwise OCR + local LLM constrained by a schema, checks, "to verify" queue; fed by the API, mail and the PA                | `packages/ingest`, `/v1/factures-recues`                     | in place                                         |
| Excel and accounting         | Guided imports (customers, products), sales journal, receivables, FEC                                                                                | `crates/auto-sheets`, `/v1/imports`, `/v1/exports`           | in place                                         |
| Employees                    | Records and contracts, absences with approval, public holidays, paid-leave balance; expense reports and HR documents to come                         | `rh.ts`, `/v1/employes`, `/v1/absences`                      | in place (partial)                               |
| Accounts                     | Better Auth: sign-up (Sirene), companies, roles, invitations, 2FA, passkeys, magic link, API keys, MCP OAuth ([AUTH.md](docs/AUTH.md))               | `packages/tenancy`                                           | in place                                         |
| Subscription                 | Free, Pro (EUR 14 excl. VAT), Business (EUR 39 excl. VAT) plans, quotas, Stripe, subscription invoices in Factur-X                                   | `packages/billing`, `/v1/abonnement`                         | in place (Stripe in test mode)                   |
| Online quotes and payment    | Signed link: the customer accepts or declines a quote, downloads the PDF and pays invoices by card on the company's Stripe account                   | `/v1/public`, `apps/web` (`/devis`, `/facture`)              | in place (Stripe in test mode)                   |
| Agents                       | `auto agent` CLI and `auto mcp` MCP server on the API, with the user's permissions                                                                   | `apps/cli`, `apps/plugin` (`docs/AGENT.md`)                  | in place                                         |
| Chrome extension             | Right-click an online PDF or Factur-X invoice: sent to auto; counter of invoices to verify                                                           | `apps/extension` (`CHROMEWEBSTORE.md`)                       | in place (store submission to do)                |
| Automation                   | Signed event outbox, worker with retries, `Bun.cron`; operator n8n and per-company webhook subscriptions                                             | `apps/worker`, `infra/n8n`, `/v1/webhooks`                   | in place                                         |
| Compliance                   | Tenant export and deletion (10-year legal retention), locked S3 archiving, backups, metrics, GDPR documents                                          | `/v1/conformite`, `docs/conformite/`                         | in place (documents to be validated by a lawyer) |
| Word, PowerPoint, video, RAG | Generated documents and presentations, presentation videos, search over the company's data                                                           | wordcraft, deckcraft, `Bun.Video`, `aphrody-rag-core`        | planned                                          |

Suite building blocks: see `docs/SUITE.md`. Invariants and technical decisions: see `docs/ARCHITECTURE.md`.

Presentation videos from the real screens and database: `bun run video:tout`, see [docs/VIDEO.md](docs/VIDEO.md).

Suppliers, job sites, analytical assignments, delivery notes and order confirmations:
see [docs/CONSTRUCTION-SITES.md](docs/CONSTRUCTION-SITES.md).

## Repository

Repository layout: `apps/` only holds thin entry points (one surface or one deployed service);
everything shared lives in `packages/` (TypeScript) or `crates/` (Rust). An app never depends on
another app, except as a test dependency (`@auto/api/app` to mount the API in an end-to-end test).
`apps/standalone` is the distribution exception: its launcher assembles the existing entry points into an
executable with an embedded runtime, without reimplementing their logic.

| Folder                                                                                | Content                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/domain`                                                                     | Business rules, totals, VAT, HR, accounting entries and FEC                  |
| `packages/store`                                                                      | Postgres (Bun.sql), migrations, RLS, outbox                                  |
| `packages/tenancy`                                                                    | Accounts, roles, invitations, 2FA, secret encryption                         |
| `packages/services`                                                                   | Services shared by the API and the worker: events, stores, mail, PA          |
| `packages/pa`, `packages/mail`, `packages/ingest`, `packages/billing`                 | Approved platform, mail protocols, ingestion, subscription                    |
| `packages/agent`                                                                      | API tools, LLM agent loop, MCP server (CLI and plugin)                        |
| `packages/client`                                                                     | Typed HTTP client of the API and same-origin proxy (web, admin)               |
| `packages/ui`                                                                         | Material 3 design system: tokens, React components, formats, base styles      |
| `frameworks/i18n-ts`                                                                       | Catalogs (Unicode MessageFormat 2), translator, locale negotiation            |
| `crates/auto-facturx`, `crates/auto-docs`, `crates/auto-modele`, `crates/auto-sheets` | Factur-X, PDF rendering, shared model, spreadsheets                           |
| `crates/auto-ffi`, `system/native`                                                  | bun:ffi bridge to Rust                                                        |
| `infra/n8n`, `docker/`                                                                | n8n workflows, production and build images                                    |
| `docs/`                                                                               | Architecture, deployment, PA, mail, agent, pricing, compliance, OpenAPI       |

## Getting started

```sh
docker compose up -d postgres   # Postgres 18 on port 5433
bun install
bun run build:native   # auto-ffi library (Docker), required by the API
bun run migrate
bun run dev
```

Authentication (Better Auth, roles, 2FA, API keys, remote MCP): see `docs/AUTH.md`.

Claude Code on auto's remote MCP server (OAuth sign-in in the browser, no token to copy):

```sh
claude mcp add --transport http auto https://auto.aphrody.com/mcp
```

or the `apps/plugin` plugin, which declares this server and the usage skill.

Automation (n8n at http://localhost:5678): see `docs/N8N.md`.

```sh
docker compose up -d --wait n8n
bun run e2e:n8n       # invoice issued → n8n → archived Factur-X
```

## Gates

```sh
bun run gates        # check, lint, fmt, tests (Postgres required)
bun run gates:rust   # fmt, clippy, Rust tests in the Linux container
bun run validate:facturx
```

Runtime: [Aphrody](https://aphrody.app) (Bun fork) for native `bun check`, `bun lint` and `bun fmt`.

## License

Apache-2.0 (see `LICENSE` and `NOTICE`). npm packages published as `@aphrody/auto-*`.
