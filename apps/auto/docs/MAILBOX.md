# Unified personal mailbox and Auto administration

State of 2026-10-25: first batch deployed on the VPS, Aphrody connected and qualified end to end.
The Gmail and Outlook read consents are not yet granted to Auto.

## Personal access

`/app/courrier` works with a Better Auth session, even without a company or SIRET. The tables
`courrier_compte`, `courrier_message`, `courrier_piece` and `courrier_oauth` of migration 024 are isolated
per user and namespace through RLS. The personal namespace is the user UUID, distinct from the business tenants.
The administration methods do not read these tables and agent keys are not human sessions.

The configured owner is `AUTO_COURRIER_PROPRIETAIRE`. Its SSO aliases explicitly present in
`AUTO_SUPER_ADMIN_EMAILS`, verified and with the global admin role, open the same main personal space.
Other users each have their own space. An unverified address is never promoted implicitly.

## Connections

- Gmail: scope `https://www.googleapis.com/auth/gmail.readonly`, offline access; random single-use state valid
  ten minutes, PKCE S256, AES-GCM tokens bound to the user. First paginated sync, then incremental history; an
  expired history (404) triggers a full resync.
- Outlook: scopes `offline_access`, `User.Read`, `Mail.Read`, personal and work accounts; Inbox delta, immutable
  identifiers and MIME for attachments. Cursors stay on Graph and under `/v1.0/me/`.
- Aphrody: `auto@aphrody.com` through OVH IMAP 993 TLS, `EXAMINE` and `BODY.PEEK[]`, without marking as read or
  deleting on the server. The existing OVH credentials are reused only for the configured owner.
- The read state is local to Auto. Mail is shown as text, without active HTML or remote image loading.
- Messages are sent with Resend, sender `Auto <auto@notifications.aphrody.com>`, replies to
  `auto@aphrody.com`, and kept in the "Sent with Resend" folder (Envoyés avec Resend).

The existing OAuth clients are reused. The callbacks are the URIs **already registered**:

```
https://auto.aphrody.com/api/auth/callback/google
https://auto.aphrody.com/api/auth/callback/microsoft
```

Only states prefixed `courrier_` are handled by the mail module; the others stay with Better Auth.
Signing in to Auto is not an authorization to read the mailboxes. The provider consents must be granted
separately. Gmail API is already enabled in the Google project `aphrody`.

Sync is scheduled every five minutes. Catch-up batches are re-queued immediately and processed by a separate
mail worker with a ten-minute lease and an account lock. Disconnecting erases the stored tokens and keeps the
messages already synced. No remote HTTP redirect is followed with a token. No key is returned in account lists
or errors.

## Super administrator and agents

Migration 025 adds SHA-256-hashed agent keys, with owner, name, expiry and revocation.
`AUTO_SUPER_ADMIN_EMAILS` promotes only the **verified** accounts of this list to the global `admin` role.
The `/app/administration` console is reachable without a company. The operator routes accept a super-admin
session or a valid agent token, log agent access and give no access to personal mailboxes. Creating or revoking
an agent requires the session of a human super administrator.

Non-secret configuration required on the VPS, besides the existing SMTP/Resend/OAuth secrets:

```dotenv
AUTO_COURRIER_PROPRIETAIRE=<emails>
AUTO_SUPER_ADMIN_EMAILS=<emails>,<emails-2>
```

At the last production check, Gmail is verified and Outlook is not marked verified in Auto. Do not force that
field to bypass a verification. Outlook mail can be connected to the Auto Gmail account through its own OAuth
consent, independently of its authentication role in Auto.

After migration and startup, `scripts/administration-provisionner.ts <private-file>` creates the named accesses
"Codex — administration Auto" and "Automatisations — administration Auto", expiring in 365 days.
It never prints their values and refuses to replace an existing file. Use a folder outside the repository with
mode 0700, a umask of 077, then check that the file is 0600. Do not add these keys to the API/web container
environments.

## Checks

Targeted tests: 8 tests, 84 assertions (private OAuth state/replay, PKCE, Gmail pagination and history, refresh
token rotation, Outlook delta/MIME/attachments and rejection of hostile cursors, RLS on accounts/messages/
attachments, administration and agent revocation).
8 OpenAPI/scheduling tests, 33 more assertions. Global typecheck: 327 files without error.
Chrome E2E: personal account without a company, reading, search, download, hostile text escaped, 390 px mobile
and administration refused to a non-admin: 9 assertions.

The Resend sending and reception already qualified before this batch are documented in `RESEND.md`.
Real acceptance run of the first batch (`20261024T232255Z-99038b58`):

- Normal Google sign-in of the owner and private display without a company confirmed in Chrome.
- Super-admin console reachable; keys "Codex" and "Automatisations" active, expiring on 2027-10-25.
  File `vps:~/auto/credentials/admin-agents.env`, mode 0600, separate from the API/worker/web environments.
- Codex key: `/v1/admin/tenants` HTTP 200; `/v1/courrier/messages` HTTP 401; `/v1/admin/agents` HTTP 403.
- Mailbox `auto@aphrody.com` connected through the interface, first IMAP sync: four messages with attachments.
- Real send from the Auto form through Resend, control subject "Qualification boîte unifiée Auto
  2026-10-24T23:30:13.975Z". Message shown in Sent, received on OVH, then synced and read in Auto.
  After the check: five received messages and one sent message. Nothing sent to a third party.

The Gmail/Outlook acceptance and that of the real native shells remain to be completed. The second batch also
encrypts the future Better Auth OAuth tokens (`account.encryptOAuthTokens=true`), on top of the AES-GCM
encryption already active on the tokens of the mail accounts. Better Auth 1.7.12 keeps reading the old
plaintext sign-in tokens until they are renewed; no token is published in this evidence.

## Native shells: a separate authentication limit

The browser/PWA keeps its cookie during the OAuth return. The Tauri desktop shell opens external origins in the
system browser: the cookies of that browser are not those of the WebView. A Google sign-in done in that browser
therefore does not prove a sign-in in the shell. Do not inject a token in the URL and do not remove the session
check of the mail callback.

A WebView already signed in and a browser signed in to the same Auto account can share the mail configuration
on the server side; the WebView reloads the accounts every 60 seconds. This condition must be verified before
qualifying the native mail connection. The initial native OAuth sign-in remains a path to qualify.

The second batch implements the official Better Auth 1.7.12 `deviceAuthorization` plugin (RFC 8628), its schema
`026_connexion_appareil.sql`, the code/approval/poll interface and the HttpOnly cookie set through the official
hook. It is off by default until its native qualification: see `DEVICES.md`. The API and Chrome with two isolated
contexts are tested, including expiry, denial, replay and concurrent consumption. The tests in the real
Windows/Android shells remain distinct from the browser test.
