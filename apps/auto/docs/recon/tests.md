# Test plan and bug reports, apps/web and packages/ui

Build: main @ 774fce9 + the fixes of this batch. Headless Chrome, 375 and 1440 px, light and dark themes.
Automated: `apps/web/e2e/*.test.ts` (throwaway Postgres database through `testDb()`, API `creerApp`, web
`demarrerWeb`).

## Plan

| Flow                         | Cases                                                                                                                                | Automation                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| F01 Sign-up                  | H1 SIREN journey, company, account created. E1 invalid e-mail. E2 unknown SIREN. N1 e-mail already taken.                            | H1, E1: parcours.test.ts. E2, N1: to check      |
| F02 Quote, invoice, issuing  | H1 quote, issuing, conversion to invoice, discount/VAT totals. E1 empty fields. E2 emoji and accents. E3 double click.               | H1: parcours.test.ts. E1 to E3: to check        |
| F03 Payment                  | H1 partial payment then balance. N1 empty or text amount. N2 amount > amount due. E1 settled invoice: form removed.                  | paiement-relance.test.ts                         |
| F04 Reminder                 | H1 level and channel, reminder logged. E1 settled invoice: no reminder.                                                              | paiement-relance.test.ts (H1)                    |
| F05 Received invoices        | H1 filtered list, anomaly, validation.                                                                                               | recues.test.ts                                   |
| F06 Employees and leave      | H1 add employee, leave request, approval.                                                                                            | parcours.test.ts                                 |
| F07 Imports and exports      | H1 preview, mapping, import, line errors.                                                                                            | parcours.test.ts (import); exports: to check    |
| F08 Settings and theme       | H1 brand color. H2 light/dark toggle, memorization, before JS.                                                                       | parcours.test.ts, accessibilite.test.ts          |
| F09 Sign-in                  | N1 wrong password. N2 empty fields. N3 `//evil` return ignored. N4 expired session. E1 keyboard focus.                               | publiques.test.ts                                |
| F10 Isolation                | N1 document of another account: 404, no leak.                                                                                        | paiement-relance.test.ts                         |
| F11 Public pages             | H1 home, pricing, legal notice, privacy, sign-in, sign-up: contrast, names, labels, 24 px targets, overflow, h1.                     | publiques.test.ts                                |
| F12 Empty states and errors  | N1 unknown route. N2 document not found.                                                                                             | publiques.test.ts                                |
| Cross-cutting                | Signed-in screens in 4 width/theme combinations.                                                                                     | accessibilite.test.ts                            |

To check (not automated): slow or offline network, two tabs, time zones and daylight saving changes, real screen
reader, real sending of the reminder e-mails.

## Bugs

### BUG-001: the amount due and the payment list do not refresh after a partial payment

- Severity: S2
- Flow / case: F03 / F03-H1
- Screen: document sheet (`/app/documents/:id`)
- Build: 774fce9 Browser / device: headless Chromium, 1280 px

Steps

1. Issue an invoice of EUR 1,200 incl. VAT, open its sheet.
2. Enter 500 in "Amount (EUR)", click "Record the payment".

Expected: "Amount due: EUR 700.00" and the payment line appear.
Actual: the API answers 201, but the sheet still shows "Amount due: EUR 1,200.00" and "No payment recorded" until
reload (the payment loading depended only on the id and the status, unchanged as long as the invoice is not
settled).
Evidence: paiement-relance.test.ts "payment: invalid amount refused, partial then balance".
Suspected cause: `useDonnees(..., [doc.id, doc.statut])` without explicit reload.
Status: fixed (apps/web/src/client/ecrans/detail.tsx, `p.recharger()` in `payer`)

### BUG-002: the "Page not found" screen has no h1 heading

- Severity: S3
- Flow / case: F12 / F12-N1
- Screen: unknown `/app/*`
- Build: 774fce9 Browser / device: Chromium, 375 px

Steps

1. Signed in, open `/app/inconnu`.

Expected: an h1 (navigation landmark, consistent tab title).
Actual: only an h2 in the empty state, tab title unchanged.
Evidence: audit "no h1 heading". Test publiques.test.ts "screens not found".
Status: fixed (apps/web/src/client/app.tsx, `PageIntrouvable`: visually hidden h1 + `useTitrePage`)

### BUG-003: a document not found is shown as a loading error with "Retry"

- Severity: S3
- Flow / case: F12 / F12-N2, F10-N1
- Screen: `/app/documents/:id`
- Build: 774fce9 Browser / device: Chromium, 375 px

Steps

1. Open `/app/documents/<id that does not exist or belongs to another account>`.

Expected: an explicit "not found" state, back to the list.
Actual: "Unable to load / not found" with a "Retry" button that can never succeed.
Status: fixed (apps/web/src/client/ecrans/detail.tsx, empty state "Document not found" + link "Back to invoices")

### To check

- The 404 responses outside `/app` (`/nope`) are plain text "Page not found" without a styled page (server, out of
  scope of this batch).
- No anomaly of contrast, name, label, 24 px target or overflow on the signed-in screens and public pages, 375/1440
  px, light/dark (automated audit green).
