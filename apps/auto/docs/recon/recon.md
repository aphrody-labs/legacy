# Recon map

Scope: core loop = quote -> invoice (Factur-X) -> send -> reminder -> collection; credit note to correct. Web first
(mobile = responsive). Target: French freelancers and very small businesses.
Out of scope for v1: accounting/banking, payroll, URSSAF online filing, project management.

## 1. Screen inventory

States: V empty, C loading, R filled, E error, P permission denied.

| ID  | Screen                       | Access                   | Purpose                                                 | Key components                                          | States                             |
| --- | ---------------------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- |
| S01 | Sign-up / sign-in            | /connexion               | create an account                                       | form, SIREN lookup                                      | E                                  |
| S02 | Company onboarding           | after S01                | legal identity (SIRET, VAT, exemption, IBAN, mentions)  | stepper, validated SIRET                                | E                                  |
| S03 | Dashboard                    | /                        | outstanding, overdue, collected, to do                  | KPI cards, "to process" list, monthly chart             | V, C, R                            |
| S04 | Invoice list                 | /factures                | filter, sort, actions                                   | table, status filters, search, badge                    | V, C, R, E                         |
| S05 | Quote list                   | /devis                   | same + conversion                                       | table, badge                                            | V, C, R                            |
| S06 | Document editor              | /documents/nouveau, /:id | lines, VAT, mentions, preview                           | line editor, totals, PDF preview, customer picker       | draft, issued (read-only), E       |
| S07 | Document detail              | /documents/:id           | timeline, PDF, payments, actions                        | status header, history, contextual buttons              | R, P                               |
| S08 | Send                         | modal from S07           | e-mail + Factur-X attachment                            | form, preview                                           | E                                  |
| S09 | Credit note                  | from S07                 | full/partial credit note                                | prefilled editor                                        | E                                  |
| S10 | Customers                    | /clients                 | directory                                               | table, search                                           | V, R                               |
| S11 | Customer record              | /clients/:id             | contact details, history, outstanding                   | form, document list                                     | R                                  |
| S12 | Catalog                      | /catalogue               | reusable items                                          | table, form                                             | V, R                               |
| S13 | Invoicing settings           | /parametres/facturation  | templates, numbering, mentions, reminders               | forms, preview                                          | R                                  |
| S14 | Team and roles               | /parametres/equipe       | members, roles                                          | table, invitation                                       | P                                  |
| S15 | Audit log                    | /parametres/audit        | chain verification                                      | list, verify button                                     | R                                  |
| S16 | Public quote/payment page    | customer link            | accept, refuse, sign, pay                               | preview, buttons                                        | C, E                               |
| S17 | API tokens                   | /parametres/api          | keys                                                    | table, creation                                         | V, R                               |

## 2. Flows

- F01 First invoice: S01 -> S02 -> S06 -> S07 -> S08. Target: 6 clicks with an existing customer.
- F02 Quote to invoice: S05 -> S07 (accepted) -> Convert -> S06 prefilled -> issue. 3 clicks. Edges: expired or
  refused quote.
- F03 Down payment then balance: accepted quote -> down payment (386) -> balance invoice with deduction.
- F04 Correction: issued invoice -> S09 credit note -> new invoice. No change to an issued invoice.
- F05 Reminder: overdue invoice -> automatic/manual reminder -> payment -> paid.
- F06 Manual payment: S07 -> Mark as paid (date, method).
- F07 Customer signature of a quote: S16 -> accepted -> notification.
- F08 Integrity check: S15 -> /v1/audit/verification.
- F09 Integration: S17 -> token -> /v1/documents.

## 3. Components

Button (primary, secondary, danger, ghost; rest, hover, focus, active, disabled, loading); text/amount field
(error, help); customer combobox; date picker; table (sort, selection, empty, skeleton); status badge; line
editor; KPI card; modal; toast; stepper; tabs; timeline; PDF preview; filter bar; pagination; action menu; warning
banner (VAT exemption, missing mentions).

## 4. Inferred model against `@auto/domain`

| Entity observed                                                      | auto equivalent                                                                   | Gap / action                                                                                                | Confidence |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| Quote, invoice, credit note, proforma                                | `Type`: devis, facture, acompte, avoir                                            | proforma absent (could)                                                                                     | high       |
| Views To process / Upcoming / Overdue / Collected                    | `Statut`: brouillon, emis, envoye, accepte, refuse, depose, rejete, paye, annule  | "overdue" must be derived (past due and unpaid), not stored; add "partially paid"                           | high       |
| Lines                                                                | `Ligne`                                                                           | per-line/global discount absent (should)                                                                    | high       |
| Customer / issuer                                                    | `Partie`                                                                          | no persistent identity: a `client` table is needed                                                          | high       |
| Catalog                                                              | absent                                                                            | `article` entity (should)                                                                                   | medium     |
| Document templates (logo, color, language, deadlines, bank account)  | absent                                                                            | `modele` per tenant                                                                                         | high       |
| Terms, penalties, EUR 40 indemnity                                   | `conditionsPaiement`, `penalitesRetard`, `INDEMNITE_RECOUVREMENT_CENTS`           | covered                                                                                                     | high       |
| VAT exemption                                                        | `franchiseTva`, `MENTION_FRANCHISE`                                               | covered                                                                                                     | high       |
| Quote -> invoice, linked credit note                                 | `origine`, `devisVersFacture`, `avoirTotal`                                       | partial credit note absent (must)                                                                           | high       |
| Payment                                                              | absent                                                                            | `paiement` entity (must)                                                                                    | high       |
| Reminders                                                            | absent                                                                            | `regle_relance`, `relance_envoyee` (should)                                                                 | medium     |
| Recurrence                                                           | absent                                                                            | could                                                                                                       | medium     |
| Quote signature                                                      | `accepte` only                                                                    | proof (timestamp, fingerprint) to add (should)                                                              | medium     |
| Chained audit, gapless numbering, RLS                                | present (store, tenancy)                                                          | differentiator: expose in S15                                                                               | high       |

## 5. Not cloneable

Approved platform accreditation (DGFiP registration, e-reporting): connection to a partner PA; bank aggregation
(PSD2); URSSAF online filing; qualified electronic signature; competitors' brands and visuals.

## 6. Sizing

17 screens, 9 flows, 6 new entities (client, article, modele, paiement, regle_relance, relance_envoyee). Size: L
for the complete v1, M for the F01 + F02 + F04 slice.
Hard parts: 1) line editor with totals exact to the cent (domain already ready); 2) Factur-X sending + PA
connection; 3) scheduled reminders and payment matching.
Next: `replica-architect` on the F01/F02/F04 slice.
