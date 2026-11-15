# What auto takes from open source

Review of the workflow automation references and what auto takes from them, then of the Bun, Bun OS, Aphrody and
Craft building blocks actually used. "Taken" points to code in the repository; "missing" is a known gap.

## Automation platforms

| Project      | Idea retained                                                            | In auto                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| n8n          | Node graph, `json` items, `{{ }}` expressions, multiple outputs          | Taken: `packages/automate` engine, n8n workflow import (`importerN8n`), n8n itself in the Aphrody Box                                             |
| n8n          | "Retry On Fail", "Continue On Fail", Code node                           | Taken: `tentatives` and `delaiEssaiMs` per node (doubling wait), `continuerSurErreur`, Code node in QuickJS isolated in a Worker                  |
| Activepieces | Pieces typed by schema, catalog exposed to the AI                        | Taken: Zod parameters, JSON Schema catalog (`GET /v1/automatisations/catalogue`), MCP tools to create and run                                     |
| Node-RED     | Community nodes for home and IoT services                                | Taken: Home Assistant, ntfy, Gotify, Matrix, Mastodon, Nextcloud (documented HTTP APIs, no SDK)                                                   |
| Windmill     | Fast native engine and execution, isolated scripts                       | Taken: native computation in Rust (Craft crates through FFI), scripts without `eval` (QuickJS, 64 MB, 5 s)                                        |
| Huginn       | Agents that watch the web and react                                      | Taken: RSS/Atom feeds (`Bun.XML`), selector extraction (`HTMLRewriter`), "only new ones" with persistent memory                                   |
| Temporal     | Durable execution, resumption                                            | Partial: Postgres job queue with worker retry, runs kept (200 per workflow). Missing: resuming a workflow midway                                  |
| Kestra       | Versioned declarative workflows                                          | Taken: validated JSON definitions, 50 versions per workflow, reversible restore (the replaced state becomes a version)                            |

Sub-workflows (n8n "Execute Workflow"): taken by the `auto.workflow` node. Versions (Kestra, n8n): taken, 50
versions per workflow and reversible restore. Missing, tracked: resuming an interrupted run.

## Self-hosted services of the Aphrody Box

| Project                      | Role                                       |
| ---------------------------- | ------------------------------------------ |
| n8n                          | Workflow editor, 400 integrations          |
| Hermes Agent (Nous Research) | Agent with memory, tools and messaging     |
| Ollama                       | Local AI models, OpenAI-compatible API     |
| Obsidian (linuxserver image) | Markdown notes in the browser              |
| Mailpit                      | Test e-mails                               |
| Caddy                        | Automatic HTTPS                            |
| PostgreSQL                   | Database                                   |

Box console: Leptos (server rendering and WebAssembly hydration) and axum.

## Bun OS runtime (Aphrody fork of Bun)

Native APIs used in place of npm packages: `Bun.serve` (API, front end, operator console), `Bun.SQL`
(Postgres, including the Kysely dialect of Better Auth), `Bun.Image` and `Bun.Video` (media nodes, OCR),
`Bun.WebView` (browser node), `Bun.XML` (feeds), `HTMLRewriter` (extraction), `Bun.cron` (scheduling),
`Bun.password` and `Bun.CryptoHasher` (secrets, webhook signatures), `Bun.Archive` (Chrome extension),
`Bun.Glob`. Tools: `bun check`, `bun lint`, `bun fmt`, `bun n2b`, `bun test`.

Aphrody packages: `@aphrody/bun-types`, `@aphrody/m3-tokens`, `@aphrody/m3-tailwind`, `@aphrody/bun-plugin-tailwind`.

## Craft and Aphrody crates

Aphrody suite vendored (`vendor/suite`), linked through FFI (`crates/auto-ffi`):

- PDF: `pdfcraft-create`, `-organize`, `-render`, `-redact`, `-sign`, `-annot`, `-preflight` (merge, pages, text,
  redaction, signature and verification);
- Word and PowerPoint: `wordcraft-docx`, `wordcraft-pdf`, `deckcraft-pptx`, `deckcraft-pdf`;
- Spreadsheets: `gridcraft-xlsx` (creation, reading xlsx, ods, csv);
- Knowledge base: `aphrody-rag-core` (chunking, nearest neighbors, MMR).
