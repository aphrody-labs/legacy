# Browser sign-in for native apps

Batch of 2026-10-25, Better Auth **1.7.12**, official `deviceAuthorization` plugin (RFC 8628).
This flow is off by default. `AUTO_CONNEXION_APPAREIL=1` enables the endpoints and the native button.
Migration `026_connexion_appareil.sql` must be applied before enabling it.

## Contract

- Only public client allowed: `auto-native`.
- `POST /api/auth/device/code` with `{ "client_id": "auto-native" }` returns an 8-character user code, a device
  secret of at least 40 characters, a 600-second expiry and a minimum polling interval of 5 seconds.
- Verification URL: `/app/verification-appareil?user_code=CODE`. Only the short user code is in the URL.
- The app keeps the device secret **in memory only**: no URL, no JS cookie, no localStorage.
- The authenticated verification page shows the Auto account, the client and the code to compare with the app.
  `GET /api/auth/device?user_code=CODE` binds the request to the signed-in account. Approval or denial is explicit.
- `POST /api/auth/device/approve` and `/deny` take `{ "userCode": "CODE" }` (camelCase in this API).
- The app calls `/api/auth/device/token` with POST, the RFC 8628 grant, the client and the device secret.
  It honors `authorization_pending`, `slow_down`, denial and expiry, and gives up after ten minutes.
- After the approved code is consumed atomically, the official `setSessionCookie` hook sets the HttpOnly session
  cookie on the server. The client reloads its session, then opens the requested internal path.
  The standard Bearer token of the Better Auth response is never displayed, stored or put in a URL.
- A code works once. Another user session cannot approve a request already bound. Expired codes are cleaned
  up on a new request.

RFC 8628 uses its single-use device secret; it is not the authorization-code PKCE flow.
The OAuth flow of the Gmail and Outlook mailboxes stays protected separately by PKCE S256 and its session state.

## Tauri shell

`window.__AUTO_NATIVE__ = true` is a display flag, with no native right or server privilege.
The shell only intercepts the Auto origin and the exact path `/app/verification-appareil` with `user_code`.
The "Open the browser" button navigates to that URL; the shell opens the system browser and refuses the WebView
navigation so that it keeps polling. No device secret or session token goes through that opening. The cookie
transfer is the HTTPS response received by the WebView, not a copy between browsers.

The production cutover and the tests in the real Windows/Android shells are coordinated in the deployment batch.
Chrome tests are not enough to claim the native binaries are qualified.

## Evidence in the code

- API: 3 tests, 25 assertions, including rejected client, waiting and slow-down, bound approving session,
  HttpOnly cookie, replay rejection, denial, expiry, and two concurrent polls creating a single session.
- Chrome: two isolated contexts, one without a session simulating the native flag; approval in the other context,
  then HttpOnly cookie and real access to `/v1/moi` in the first. 8 assertions; no token in URL or storage.
- Linux Bun container `fd9d7a224`: 5 device/mail API tests, 47 assertions pass. Same functional result on the
  Windows runtime `169d8c5ea`. The private-mailbox checks still apply to the new client.
