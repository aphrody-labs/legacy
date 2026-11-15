# Aphrody AI router: roadmap

Goal (owner, 2026-11-15): one free, open-source, cross-provider AI router with a C ABI, reachable from every surface
(API, lib, CLI, TUI, GUI, shell, terminal, desktop, mobile, serverless, cloud, self-hosted), in the Google design
language (Material 3, design.google).

## What exists (verified 2026-11-15)

| Layer | Where | State |
|---|---|---|
| Engine: catalog of every offer (models.dev, litellm prices, OpenRouter, HF router, Arena), policies `auto`, `auto:cheap`, `auto:code`, failover walk on 429/5xx/quota | `packages/ai-os/src/router/` | done, Bun |
| HTTP API: OpenAI `/v1/chat/completions`, Anthropic `/v1/messages`, `/v1/models` | `router/http.ts`, served by the relay (`relay/server.ts`, 127.0.0.1:8790, bearer or OAuth 2.1) | done |
| C ABI client: `ay_router_open/request/chat/models/close` | `src/include/ay/router.h`, `src/router/` | done; Linux (fr2) and Windows (`make router-windows`, SDK 10.0.26100) |
| CLI | `ay-router models`, `ay-router chat [model] "<prompt>"` | done (C) |
| Design tokens: M3 from seed #135B82, CSS/JSON/Rust/Zig/C/ANSI adapters | `packages/design/tokens/` | done |
| Catalog site in M3 + TUI style, generated from data | `infra/prd/open/render.ts` | done, deploy to R2 pending |

## Market position (web research 2026-11-15)

Open-source gateways are proxies, not libraries: LiteLLM (Python, MIT, also a Rust build), Bifrost (Go, Apache-2.0),
Portkey (TS, Workers), LLM Gateway (AGPLv3), Envoy-based Agent Router. None ships a C ABI; that is the gap this
router fills. Google ships M3 for Android, iOS, Web, Flutter, not Rust; Rust M3 options are FerroUI
(`ferroui-themes-material`, M3 Expressive), egui-material3, a Slint fork (plan only).

## Order of work

1. **Embedded engine, no server needed.** The C ABI currently needs a running relay. Add an in-process mode:
   `ay_router_open("embed", 0, NULL)` spawns `bun packages/ai-os/src/router/cli.ts serve --stdio` (or links the
   AOT binary) so a C, Rust, Swift or Kotlin app gets routing with zero setup. Tests: `bun test packages/ai-os`.
2. **TLS.** Direct HTTPS from the C client through the OS stack (Schannel on Windows, Secure Transport/Network on
   Apple, BoringSSL already in `src/boringssl` elsewhere) so serverless/mobile callers skip the relay.
3. **Streaming in C.** `ay_router_chat_stream(r, ..., cb, user)` delivering SSE deltas; the CLI prints tokens live.
4. **Bindings generated from `router.h`.** Rust (`bindgen`, crate `crates/ay-router-sys`), Bun (`bun:ffi`),
   Kotlin/JNI (reuse `src/android/jni.c` pattern), Swift module map, C# `LibraryImport`. One header, no hand bindings.
5. **Surfaces.**
   - TUI: opentui (in `aphrody-labs/open`) chat pane on the router, M3 ANSI tokens (`tokens/ansi.json`).
   - Desktop GUI: Rust, M3 tokens from `tokens/tokens.rs`; FerroUI material theme evaluated first (M3 Expressive).
   - Mobile: Android via `make android-x64` + JNI; iOS via the Swift module.
   - Serverless: Cloudflare Worker proxying `/v1/*` to the relay origin over the existing tunnel; Vercel kept at $0.
   - Shell: `ay ai` subcommand wrapping the same ABI.
6. **Free tier policy.** `auto:free` virtual model ranking offers with price 0 (OpenRouter `:free`, Workers AI free
   allocation, local llama.cpp/Ollama) before any paid one; quota exhaustion moves to the next free offer.
7. **Release.** `bun build --compile` binaries + `libayrouter` for linux-x64, windows-x64, macos-arm64, android;
   R2 bucket `aphrody-open` + open.aphrody.com docs page rendered from `router.h`.

## Done criteria

Each step ends with a real test (C smoke against a live relay, `bun test`, cargo test on fr1), a commit through
`scripts/commit.ts`, and a Gemini Carbon High verdict archived in `docs/reviews/`.
