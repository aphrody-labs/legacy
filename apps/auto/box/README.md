# Aphrody Box

A single command installs a ready-to-use set of applications on your machine or server:

| Application  | Role                                                                                         | Address                  |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------ |
| **Console**  | Dashboard: state of each service, logs, restart, AI models, credentials                      | `http://<machine>:8080`  |
| **Auto**     | Automations, invoices and quotes                                                             | `http://<machine>:8081`  |
| **n8n**      | Workflow editor (more than 400 applications)                                                 | `http://<machine>:5678`  |
| **Hermes**   | AI assistant that acts for you: memory, tools, Telegram, Discord, Slack                      | `http://<machine>:9119`  |
| **Obsidian** | Your notes in the browser                                                                    | `https://<machine>:3001` |
| **Mail**     | The mails sent by the box                                                                    | `http://<machine>:8025`  |

Everything runs on the machine: the AI models are served by **Ollama**, no data leaves for an AI provider.

## Install

You need [Docker](https://docs.docker.com/engine/install/) (Docker Desktop on Windows and macOS), 16 GB of memory
recommended and 25 GB of free disk.

Without a graphics card, Hermes is slow: each turn sends it about 12,000 tokens of instructions and tools, which the
processor takes several minutes to process. An NVIDIA card, or a remote OpenAI-compatible model set in
`donnees/hermes/config.yaml`, makes it interactive. Hermes requires a model with at least 64,000 tokens of context
(`qwen3:4b`, the default model, accepts 262,144).

Linux and macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/aphrody-labs/auto/main/box/installer.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/aphrody-labs/auto/main/box/installer.ps1 | iex
```

At the end, the script prints the console address and its password. The credentials of each application are in the
console, "Access" section.

The first start downloads the images and the `qwen3:4b` model (2.5 GB): allow a few minutes. The console shows each
service going from "Starting" to "Running".

The console follows the language of your browser (`Accept-Language`) among the catalogs it ships in `console/locales`;
English is the source and French is provided.

## What is already set up

- **n8n**: owner account created (your email and the password shown in "Access"), "Box Ollama" and "Box Hermes"
  credentials already registered, `coffre` folder readable and writable (`/coffre`).
- **Hermes**: wired to Ollama, dashboard protected by a password, OpenAI-compatible API on port 8642
  (key in "Access"), vault visible in `/opt/data/coffre`.
- **Obsidian**: the `coffre` vault is opened by default; these are Markdown files of the box's `coffre` folder,
  which you can back up or synchronize.
- **Auto**: AI nodes linked to Ollama; mails (sign-up, invoices) arrive in "Mail" as long as no real relay is
  configured.
- **Home services**: Auto workflows drive Home Assistant, drop files in Nextcloud and notify through ntfy, Gotify,
  Matrix or Mastodon. To reach devices of the local network, add `BOX_RESEAU_LOCAL='permis'` to `.env`, only if you
  control every account of the box.
- **NVIDIA graphics card** detected and used by Ollama if the NVIDIA Container Toolkit is installed.

## On a domain, over HTTPS

Point `*.mydomain.com` to the machine (ports 80 and 443 open), then:

```sh
BOX_DOMAINE=mydomain.com BOX_EMAIL=you@mydomain.com sh installer.sh
```

Each application has its subdomain (`console.`, `auto.`, `n8n.`, `agent.`, `notes.`, `courrier.`), with Let's Encrypt
certificates renewed automatically.

## Day to day

| Need                 | Command, in the box folder                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Stop                 | `docker compose stop`                                                                                      |
| Restart              | `docker compose up -d`                                                                                     |
| Update               | `BOX_MAJ=1 sh installer.sh` (your data and `.env` are kept)                                                |
| Back up              | copy `.env`, `coffre/` and `donnees/`, and `docker compose exec postgres pg_dumpall -U auto > backup.sql`  |
| Send real mails      | fill in `AUTO_SMTP_*` in `.env`, then `docker compose up -d`                                               |

The `.env` file holds all the secrets of the box: do not share it.

## For developers

The console is written in Rust: [Leptos](https://leptos.dev) (server rendering then WebAssembly hydration), axum,
client of the Docker engine through its Unix socket. `console/` is built with `cargo leptos build --release` or
`docker build console`; `cargo test --features ssr --lib` runs its tests. The secret preparer is the
`aphrody-box preparer` subcommand.
