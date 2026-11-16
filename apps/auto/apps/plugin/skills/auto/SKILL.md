---
name: auto
description: Automate and manage the user's company in auto (n8n-like automation workflows, quotes, Factur-X invoices, payments, reminders, received supplier invoices, absences, exports) with the MCP tools of the "auto" server. Use as soon as the user talks about automating a task, workflows, their quotes, invoices, clients, unpaid invoices, reminders, received invoices or leave.
---

# auto

The `mcp__auto__*` tools act on the user's auto account, in the company chosen during the OAuth
authorization, with their rights only.

- Search before creating: `chercher_client`, then `creer_devis` or `creer_facture` with the `clientId` found.
- Amounts are in cents, VAT in tenths of a point (200 = 20%).
- `creer_facture` creates a draft. `emettre_document` gives it its final number and freezes the Factur-X: this is
  irreversible, ask the user for confirmation before calling it.
- Unpaid invoices: `lister_relances` at today's date, then `relancer` at the level indicated.
- Supplier invoices: `lister_factures_recues` (status `a_verifier` for those to check).

## Workflows

- `catalogue_automatisation` first: node types, parameters (JSON Schema) and templates. Start from a close
  template rather than a blank page.
- A definition has a single trigger (`declencheur.manuel`, `.evenement`, `.planifie`, `.webhook`), nodes
  `{ id, type, nom, parametres, position: [x, y] }` spaced 280 px apart in x, and connections `{ de, sortie, vers }`
  (`logique.si`: output 0 true, 1 false), without cycle.
- Expressions: `{{ $json.champ }}`, `{{ $noeud.<id>.json.champ }}`, filters `| centimes`, `| date`, `| defaut:'x'`.
  Tokens and webhook URLs go in secrets (`{{ $secret.nom }}`, created by the user in auto),
  never in clear in the definition.
- `creer_automatisation` creates the workflow inactive; `executer_automatisation` to try it, `lire_execution`
  to see each step. Activate it only after the user agrees.
- Workflow as code: `auto flows import workflow.json`.

Configuration: the plugin declares the remote MCP server `https://auto.aphrody.com/mcp` (variable
`AUTO_MCP_URL` for another instance). On the first call, Claude Code opens the browser: sign in to auto,
choose the company, authorize; the token renews itself. Revocation: auto, Settings, Security,
Authorized applications. Without a browser (CI, scripts): `claude mcp add auto -e AUTO_TOKEN=auto_… -- auto mcp`
with an API key created in Settings, API keys.
