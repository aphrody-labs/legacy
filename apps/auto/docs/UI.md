# Interfaces

Three interfaces on the same `/v1` API: the web front end (`apps/web`), the operator console (`apps/admin`) and the
desktop shell (`apps/desktop`). Design system: `docs/design/DESIGN-SYSTEM.md` and `@auto/ui`.

## Web front end (`apps/web`)

`Bun.serve` with HTML imports (Bun native bundling, HMR in development), React 19, no Next or Vite. The server only
serves the pages and relays `/v1/*`, `/health`, `/api/auth/*`, `/.well-known/*` and `/mcp` to the API
(`@auto/client/proxy`): same origin for the browser, so the Better Auth session cookie `auto.session_token`
(HttpOnly, Secure, SameSite=Lax), its origin check and the API anti-CSRF work without CORS. Every mutation is sent
as `application/json`; authentication goes through `better-auth/react` (`src/client/auth.ts`, see
[AUTH.md](AUTH.md)).

```sh
bun run --cwd apps/api dev            # API on :3000 (Postgres required)
AUTO_API_URL=http://localhost:3000 bun run --cwd apps/web dev   # front end on :3001
```

Routes are public URL paths and stay in French.

| Route                                  | Page                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | Public home                                                                                                                                               |
| `/tarifs`                              | Free EUR 0, Pro EUR 14 excl. VAT per month (30-day trial), Business EUR 39 excl. VAT per month                                                            |
| `/mentions-legales`                    | Publisher, data, session cookie                                                                                                                           |
| `/app/inscription`                     | 3-step onboarding: account, company (SIREN prefilled), upcoming connections                                                                               |
| `/app/connexion`                       | Sign-in (password then 2FA, magic link, passkey, Google or Microsoft if configured), return to the requested page (`/app` paths only)                    |
| `/app/invitation?id=`                  | Invitation acceptance (also the old `/invitation#jeton` link)                                                                                             |
| `/app/autorisation`                    | OAuth consent of an MCP client: company bound to the token, accept or refuse                                                                              |
| `/app`                                 | Dashboard: month revenue excl. VAT, unpaid, overdue, VAT collected, to chase                                                                              |
| `/app/devis`, `factures`, `avoirs`     | Lists filterable by status (derived "overdue") and search                                                                                                 |
| `/app/documents/nouveau`               | Editor: lines, VAT, discounts, live totals; `?depuis=<id>&vers=facture` or `avoir`                                                                        |
| `/app/documents/:id`                   | Sheet: issuing, PDF, Factur-X XML, status, payments, reminders, credit note                                                                               |
| `/app/clients`, `produits`             | Directory (SIREN prefill) and catalog                                                                                                                     |
| `/app/employes[/:id]`, `/app/absences` | Records, leave balance, requests and approval                                                                                                             |
| `/app/imports`, `/app/exports`         | Guided import (preview, mapping, report); sales journal, receivables, FEC                                                                                 |
| `/app/parametres`                      | Company, security (2FA, passkeys, password, sessions, applications), template, members and invitations, API keys, subscription, audit                      |

Public footer: contact@aphrody.com. The amounts of `/tarifs` are checked against `packages/billing/src/plans.ts` by
`src/serveur.test.ts`.

### Interface rules (checklist applied)

Construction-site management: `/app/fournisseurs[/:id]`, `/app/chantiers[/:id]`, `/app/livraisons`,
`/app/commandes` and `/app/recherche` reuse the components, tokens and themes of `@auto/ui`. The site file gathers
the documents and the analytical tracking; received invoices are filed from `/app/achats`. See
[CONSTRUCTION-SITES.md](CONSTRUCTION-SITES.md).

- Colors: only the M3 roles `--md-sys-color-*` and their `--auto-*` aliases from `@auto/ui`; dark theme through
  `data-theme="sombre"` (toggle light, dark, system), `prefers-color-scheme` otherwise.
- Icons: Material Symbols (Rounded, inline SVG, `aria-hidden`), no emoji; a status is always icon and label.
- Visible focus (2 px ring), skip link, focus moved to the heading on each page, native modals (`<dialog>`: focus
  trapped, Escape, focus returned).
- Every field has a visible label; required marked; error under the field, linked by `aria-describedby`; API errors
  as a focused summary with their details.
- Targets of at least 44 px; empty, loading (`role="status"` skeleton) and error ("Retry") states on every list;
  `aria-live="polite"` toasts without stealing focus.
- `prefers-reduced-motion`: animations reduced to 0 ms.
- Tabular figures on amounts, numbers and dates; text, numbers, currencies and dates follow the UI language
  through `@auto/ui/format` (`Intl` with the negotiated locale, whole cents, `YYYY-MM-DD` dates without time zone
  shift). UI text comes from the catalogs of `packages/ui/locales`.
- Mobile: tables stacked as cards under 768 px, navigation drawer under 1024 px, never a horizontal scroll of the
  page; the editor lays itself out with container queries.
- Totals computed by `@auto/domain` (same rule as the Rust), never recomputed by hand; the missing mentions
  (`verifier`) are listed before issuing.

### Tests

```sh
bun test apps/web                       # formatting, API client, server and proxy, browser journeys
AUTO_CAPTURES=C:/temp/captures bun test apps/web/e2e
```

`e2e/parcours.test.ts` starts the real API on a throwaway Postgres database, the front end and headless Chrome
(the Playwright one already installed, `AUTO_CHROME` for another): 3-step sign-up with a simulated SIREN, quote
issued, conversion to an issued invoice, PDF read back through the proxy, dashboard; then CSV import of customers,
employee and approved absence, template, exports; public pages. Captures in light, dark and mobile in
`AUTO_CAPTURES` (default the temporary folder). Without Chrome, these tests are skipped.

### Material 3 design system

The tokens come from the published npm packages `@aphrody/m3-tokens` (color roles derived from the seed, shape,
elevation, motion, window classes), and `@aphrody/m3-tailwind`. `@auto/ui` only adds what is specific to auto:
`--auto-*` aliases, custom colors (success, warning), document statuses and business components
(`packages/ui/src/react/composants.tsx`).

## Operator console (`apps/admin`)

```sh
AUTO_API_URL=http://localhost:3000 bun run --cwd apps/admin dev   # :3002
```

One page: health (`/health`), published plans and, signed in with an operator account, its subscription invoices,
the list of companies with their plan and state, suspension and reinstatement, failed events and the integrity of
all the audit logs.

Operator routes (module `apps/api/src/modules/admin.ts`, reserved to the owner and admin of the tenant
`AUTO_TENANT_OPERATEUR`), used by the "Entreprises" section of the console:

| Route                                   | Use                                                             |
| --------------------------------------- | --------------------------------------------------------------- |
| `GET /v1/admin/tenants`                 | companies, effective plan, Stripe status, consumption of the month |
| `GET /v1/admin/tenants/:id`             | tenant sheet: members, quotas, latest issuances, audit          |
| `POST /v1/admin/tenants/:id/suspension` | suspend or reinstate a tenant (reason, trace in its audit)      |
| `GET /v1/admin/utilisateurs?email=`     | find an account and its memberships (support)                   |
| `GET /v1/membres`                       | list the members of a tenant                                    |
| `GET /v1/jetons, DELETE /v1/jetons/:id` | list and revoke API keys                                        |
| `/api/auth/admin/*` (Better Auth)       | accounts of all companies, banning, sessions                    |
| `GET /v1/admin/stripe/evenements`       | Stripe webhooks received, replayed or failed                    |
| `GET /v1/admin/evenements`              | queue of business events and their failures                     |
| `GET /v1/admin/audit`                   | verification of the audit chains of all tenants                 |

The operator is an owner or admin of the operator tenant. Reads of business data go through `withTenant` (RLS);
only the account tables, `stripe_evenement` and the outbox (role `auto_worker`) are read across tenants. A
suspended company can no longer sign in; its data stays intact.

## Desktop shell (`apps/desktop`)

Tauri 2 (`src-tauri/`, outside the root Cargo workspace): a window that loads `/app` of the instance given by
`AUTO_URL` (default `https://auto.aphrody.com`, `http://localhost:3001` for the dev front end). The shell embeds
no API or data and grants no IPC permission to the content (`capabilities/default.json`); navigation stays on the
origin of the instance, other links (mailto, Stripe Checkout) open in the system browser.

```sh
cd apps/desktop
bun run test     # Rust tests of the shell (URL, origin)
bun run dev      # cargo tauri dev, front end on :3001 started separately
bun run build    # NSIS/MSI installers, DMG, AppImage, deb
bun run icones   # regenerates src-tauri/icons from icone.svg
```

Tooling: `cargo tauri` (Tauri CLI) and, on Windows, WebView2 (present on Windows 11). The native build stays
optional for the gates: `gates:rust` only covers `crates/*`.

## Free resources

| Resource                        | Use                                                                    | Integration                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Material Symbols (Rounded, 400) | All icons (application, admin, public pages)                           | `packages/ui/scripts/symboles.ts` extracts the paths of the icons used into `symboles.gen.ts`; `@auto/ui/symboles` components |
| pattern.css                     | Patterned backgrounds: grid on the home page, dots on sign-in and sign-up | `@import` in `base.css`, class `fond-motif` + `pattern-*`                                                                  |
| Inter, Plus Jakarta Sans        | Body and headings                                                      | `@fontsource`, self-hosted                                                                                                    |
| Material 3 tokens               | Colors, roles, contrasts                                               | `@aphrody/m3-tokens` → `@auto/ui`                                                                                             |

Adding an icon: one line in `ICONES` (name in the code → Material Symbols name), then
`bun run --cwd packages/ui symboles`.

## Mobile application (Android)

The Tauri shell of `apps/desktop` also serves mobile (`mobile_entry_point`, window options reserved to desktop).

```sh
cd apps/desktop
ANDROID_HOME=… NDK_HOME=… cargo tauri android init --ci          # generates src-tauri/gen/android (git-ignored)
ANDROID_HOME=… NDK_HOME=… bun msvc exec -- cargo tauri android build --debug --apk --target aarch64
```

The Rust build scripts run on the Windows host and require the MSVC runtime library (`msvcrt.lib`).
Meanwhile, the installable web app (manifest, icons) serves as the mobile app.

Debug APK built (`dist/mobile/android/auto-debug.apk`, arm64, `com.aphrody.auto`) and launched in the emulator
`bun_pixel_api37` (production sign-in page displayed). Toolchain used, without MSVC: Rust
`stable-x86_64-pc-windows-gnu` (host), Android NDK 30, JDK 25, `as.exe` relay to the NDK clang placed next to
`dlltool` (the GNU toolset ships no assembler), `JAVA_HOME` set. Gradle accepts the SDK licenses.
Left: release signing and Play Store publication (developer account).
