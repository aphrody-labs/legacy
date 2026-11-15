# Arrivals from a file server

The connector is built into the existing API and worker. It uses the rights of the system account that runs auto.
SMB/NFS credentials are managed by the system mount, never sent from the browser.

## Operator configuration

### Dedicated folders prepared automatically

`AUTO_DOSSIERS_PARENT` enables a dedicated space: each company gets exclusively the subfolder named after its
UUID, under the alias `arrivages`. The worker creates seven sources on the first poll: customers,
suppliers/documents, suppliers/quotes, suppliers/invoices, sites, deliveries and orders. A source that was
disabled or modified is not reset on later polls. Suspended or deleted companies are excluded.

The parent is mounted **read-only in the API** and writable in the worker, to create the empty folders. The
scanner stays read-only on the documents. On Linux, prepare this parent with owner 10001 and the operator group,
mode 2770; the folders created inherit this group.

```sh
bun scripts/arrivages.ts preparer
bun scripts/arrivages.ts verifier
bun scripts/arrivages.ts synchroniser COMPANY_UUID
```

The verification queries the real model catalog and checks the OCR tools; it logs neither secrets nor document
content. A pre-existing file server can still be attached with the explicit aliases below, without enabling this
preparation mode.

Mount the share read-only on the machine or container **of the API and of the worker**. Then declare
`AUTO_DOSSIERS_RACINES` in their environment, with the real company identifier obtained through `/v1/moi`:

```json
{ "comptabilite": { "tenantId": "COMPANY_UUID", "chemin": "/mnt/comptabilite" } }
```

On Windows, a UNC path accessible to the service account also works:

```json
{ "comptabilite": { "tenantId": "COMPANY_UUID", "chemin": "\\\\serveur\\comptabilite" } }
```

Each alias belongs to one specific company. Other companies do not see it. An administrator can only choose a
declared alias and a relative subfolder; absolute paths, `..` and escapes from the root are refused. Symbolic
links and junctions met during the poll are ignored.

For Docker, mount the share on the host, then add a read-only volume to both the API and worker services:

```yaml
environment:
  AUTO_DOSSIERS_RACINES: '{"comptabilite":{"tenantId":"COMPANY_UUID","chemin":"/mnt/comptabilite"}}'
volumes:
  - /srv/partages/comptabilite:/mnt/comptabilite:ro
```

Apply the migrations with the existing process, then restart the API and the worker with the same environment.
In **File server**, connect a folder and run **Sync**. The screen shows the new files, the unchanged files, the
errors and the last poll. Disabling a source stops future polls without erasing its copies. Changing its segment
immediately requalifies the access to the copies already indexed.

## Automatic extraction

For a "Extract quotes" source, choose the suppliers segment. Configure the existing OpenAI-compatible service with
`AUTO_LLM_URL`, `AUTO_LLM_MODEL` and optionally `AUTO_LLM_KEY`. The same service and the same quotas as invoice
ingestion are reused. OCR uses the tools already installed; the native text of PDFs is also supported. Without
usable OCR or a configured model, the original is kept with an anomaly and manual entry remains possible. After
fixing the configuration, retry the extraction from the quote review. An identical drop does not rerun the model
or create a duplicate.

The existing mail poll recognizes the PDF/image attachments with "devis" (quote) in their name or in the subject.
A Factur-X attachment or one explicitly named "facture" (invoice) keeps the invoice path, even in a mixed message.
The data of the document is treated as untrusted, then checked before validation.

PDF, PNG/JPEG, DOCX, XLSX, CSV, XML and TXT can be indexed. Limits: 20 MB per document and 2,000 entries per
poll. Split very large folders into several sources; the limit is reported, with no deletion of originals. The
copies are immutable and kept according to the retention rules of the company. Disabling a source does not erase
its history. The interface lists the 500 most recent copies; the global search queries the whole authorized
index.

## Checks

```sh
bun check
bun lint apps packages scripts
bun test apps/api/src/modules/arrivages.test.ts apps/web/e2e/arrivages.test.ts
```

The tests use temporary databases and folders: real file polling, deduplication, deterministic simulated
extraction, recovery after failure, single draft creation and refusal of cross-company/per-segment access. They
make no connection to a customer share whose mount has not been configured.

## Auto installation on the VPS

The production parent is `/home/ubuntu/auto/arrivages`, the acceptance one `/home/ubuntu/auto/recette/arrivages`.
They are distinct and mounted at `/mnt/arrivages` of their environment. Files are dropped through the existing
operator SFTP access, in the UUID folder of the company and the relevant subfolder. No right was added to the
Samba share `games`.

The base model Qwen3-4B-Instruct-2507 Q4_K_M already present on `dbfr` is served without the specialized Shenron
adapter, by the container `auto-extraction-ia`, limited to two CPUs and 4 GiB. The existing service is kept.
Port 8798 listens only on the loopback of dbfr. The systemd service `auto-ia-tunnel` of the VPS links this port to
the private Docker gateways: production `172.26.0.1:18799`, acceptance `172.27.0.1:18799`.
Both UFW rules are limited to their Docker interfaces and subnets; no AI port is open publicly.

`AUTO_LLM_MODEL=auto-extraction` and `AUTO_LLM_TIMEOUT_MS=300000` account for CPU inference. The Box
automatically reuses its Ollama and `BOX_MODELE` for the extractions; explicit `AUTO_LLM_*` values take
precedence. The French OCR data is included in the full images and the fast updates.

Before each container replacement, the configuration and the environment were kept as private files under
`~/auto/activation-arrivages-*`. The old containers are kept stopped under a name `*-avant-arrivages*`, to allow
rollback. Do not publish these folders: they contain secrets.
