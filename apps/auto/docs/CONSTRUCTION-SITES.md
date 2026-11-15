# Suppliers, construction sites and analytics

These features extend the `auto` application and its `/v1` API. Data is stored in Postgres, isolated per company
with `withTenant`, forced RLS and composite foreign keys. No browser storage or separate billing service is
needed. Writes require the `ecrire` right; reads stay open to the roles allowed to read.

## Journey

1. Create the records in **Clients** and **Fournisseurs** (suppliers). The supplier file gathers its filed received
   invoices, its contact details, its delivery notes and order confirmations.
2. Create a **Chantier** (construction site) linked to a customer: unique analytical code, address, budget excl.
   VAT, progress, dates and status.
3. From the site, **Create a quote** or an invoice picks up the customer and the analytical code in the existing
   editor. Lines, discounts, VAT, issuing, PDF and Factur-X reuse the existing rules.
4. In **Received invoices**, use **File** (Classer) to choose a supplier and optionally a site. The existing
   ingestion by API, mail, extension and platform is unchanged.
5. In **Deliveries and orders**, enter the supplier reference, the site, the date, the lines and any reservations.
   A document can be matched with a received invoice; the assignment must be consistent.
6. Archive suppliers, sites or documents from their form. Archives stay readable and keep taking part in the
   history and the calculations. They can be restored by unchecking "archived".

## Analytics

- A sale or a purchase is assigned to **a single site**, with no split by line or percentage.
- **Sales excl. VAT**: issued invoices and down payments, with credit notes deducted. Credit notes automatically
  follow the site of their original invoice, even without a manual assignment. An invoice settled by a credit
  note stays offset in the calculation; a cancelled invoice without a credit note is excluded. Quotes and drafts
  are excluded.
- **Purchases excl. VAT**: validated received invoices in EUR assigned to the site; supplier credit notes
  deducted. A missing extraction or a different currency is reported and excluded. Rejected invoices and those to
  check are excluded.
- **Balance excl. VAT**: sales excl. VAT minus purchases excl. VAT. It is not a net margin: labor and charges that
  were not entered are not in it.
- **Unbilled orders excl. VAT**: validated confirmations, as long as no matched invoice is validated. Delivery
  notes create no extra charges. These commitments stay separate from the balance.
- A CSV export of the file gives the analytical code, the sales and the purchases, including their status.
- **Exports → The five management spaces** gives an Excel file with five sheets, with numeric amounts formatted
  in euros, dates, frozen headers and archives included. The PDF report uses the same data, without reproducing
  the layout of a pre-existing workbook. It is limited to 10,000 lines; the full workbook is not truncated.

Assignments are separate metadata: changing an assignment changes neither the issued document nor its
PDF/Factur-X copy. The customer of the site must match the registered customer of the document. A site with
assigned documents cannot change customer. Each classification change is audited.

## API and storage

Migration: `packages/store/migrations/022_chantiers.sql` (new migration, no earlier migration modified).
Applied in development with `bun run migrate`. Do not apply in production outside the usual deployment process.

| Routes                                     | Use                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `/v1/fournisseurs`, `/:id`, `/:id/dossier` | Directory, update and supplier file                              |
| `/v1/chantiers`, `/:id`                    | Directory, update, documents, purchases, files and analytics     |
| `/v1/documents/:id/chantier`               | Read or change the assignment of a sale                          |
| `/v1/factures-recues/:id/affectation`      | File a received purchase                                         |
| `/v1/pieces-chantier`, `/:id`              | Create, read, match and archive the documents                    |

The full bodies and rights are in `docs/openapi.json`. The new tables and their source documents are part of the
tenant export and retention cycle. Purging respects the order of references.

Delivery notes and confirmations are structured records entered by hand; this version adds neither OCR extraction
of these two document types nor a specific PDF generation for these records.

## Search and organization of the spaces

`/app/livraisons` and `/app/commandes` are two distinct spaces. `/app/pieces` keeps a cross-cutting view.
`/app/recherche` finds quotes, invoices, purchases and documents, including archived ones, by reference, third
party, site or already extracted text. Agents have the tools `chercher_piece_gestion` and `consulter_chantier`,
with the token and rights of the user. The Excel and PDF exports go through `/v1/exports/gestion.xlsx` and
`/v1/exports/gestion.pdf`; search goes through `/v1/recherche-gestion?q=…`.

## File server and received quotes

Migration `023_arrivages_segments.sql` adds the sources, the indexed copies, the received quotes and the
per-member restrictions. In **File server** (Serveur de fichiers), an administrator chooses an allowed mount, a
subfolder and a processing: indexing only, invoice extraction or quote extraction. The worker polls the active
folders every five minutes; **Sync** (Synchroniser) also triggers a manual poll. The connector reads SMB/UNC or
NFS shares mounted by the system, as well as local folders. Configuration and Docker example:
[ARRIVALS.md](ARRIVALS.md).

The originals are never moved or deleted. A SHA-256 fingerprint avoids duplicates; a new version creates an
additional copy. The copies stay readable if the server becomes unavailable. Indexed files and their content join
the global search and its per-segment restrictions.

**Received quotes** (Devis reçus) accepts PDFs and images, from a drop, a source or an attachment identified as a
quote. The configured OCR and model extract the issuer, the reference, the dates, the services and the amounts.
The document stays **To check** (À vérifier), even if the extraction succeeds. The form lets you correct and
validate; **Retry the extraction** (Relancer l'extraction) reprocesses the original after a failure. After
validation and an explicit choice of a customer, a single customer draft can be prefilled. This draft reuses the
existing editor; no invoice is issued automatically. Discounts or roundings that do not fit the lines must be
redone by hand.

## Per-segment permissions

In **Settings → Members → Per-segment permissions**, an owner or administrator assigns the customer, supplier,
site analytics, delivery and order spaces to each other member. These restrictions add to the existing role: they
never grant a write right the role lacks. Without a stored restriction, the existing access is kept; an empty
selection removes the five spaces. Owners and administrators keep all segments.

Each request rereads the rights: sessions, API keys and agents are affected immediately. Search, downloads, files
and exports filter the accessible documents. The minimal reference lists stay shared so that a delivery can be
attached to a supplier or a site; they do not give access to their files. Analytics gives access to the aggregates
excl. VAT, but the detailed customer and supplier documents require their segment. The cross-cutting features
mail, PA, automations, knowledge and compliance require the five segments. The management exports only contain the
authorized sheets.

## Checks

```sh
bun check
bun lint apps packages scripts
bun test packages/store/src/chantiers.test.ts apps/api/src/modules/chantiers.test.ts apps/api/src/openapi.test.ts
bun test apps/web/e2e/chantiers.test.ts
```

The tests use a throwaway database. The browser journey reuses the existing Chrome bench and checks the screens
at 375, 768 and 1440 pixels, the dark theme, reduced animations and JavaScript errors.
