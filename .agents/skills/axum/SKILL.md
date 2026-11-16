---
name: axum
description: Axum 0.8 and tower-http 0.7 rules for writing, reviewing or porting Rust HTTP services (routes, extractors, state, body limits, error envelopes, middleware order, CORS, tracing, graceful shutdown, in-process tests). Use when code imports axum or tower_http, when porting a TypeScript/Bun route to Rust (Shenron crates/shenron-api), or on "add an endpoint", "axum middleware", "port this route to Rust".
license: MIT
metadata:
  author: aphrody
  version: "1.0.0"
---

# Axum

Rules for Axum 0.8 services, checked against the aphrody-labs forks (`third_party/axum`, `third_party/tower-http`, `third_party/tower`; commits: `git -C third_party/<name> log -1`). There are 13 rules in 8 categories, ordered by impact. Full text with examples: `AGENTS.md`, compiled from `rules/` by `bun .agents/skills/axum/scripts/compile.ts`.

## When to Apply

- Adding or changing a route, extractor, middleware or server setup in a crate that depends on `axum`.
- Porting a route from the Shenron TypeScript host (`../shenron/packages/api`) to `../shenron/crates/shenron-api`. The golden cases are in `../shenron/data/api/fixtures`; see `../shenron/docs/decisions/0004-migration-typescript-rust.md`.
- Reviewing an HTTP service for limits, error envelopes, CORS or layer order.

## Rule Categories by Priority

| Priority | Category                 | Impact        | Prefix        |
| -------- | ------------------------ | ------------- | ------------- |
| 1        | Routing                  | CRITICAL      | `routing-`    |
| 2        | Extractors and limits    | CRITICAL-HIGH | `extract-`    |
| 3        | Errors and responses     | HIGH          | `error-`      |
| 4        | Middleware               | HIGH-MEDIUM   | `middleware-` |
| 5        | Testing                  | HIGH          | `test-`       |
| 6        | Serving                  | MEDIUM        | `serve-`      |
| 7        | HTTP layers (tower-http) | MEDIUM        | `http-`       |
| 8        | Build                    | LOW-MEDIUM    | `build-`      |

## Quick Reference

- `routing-path-syntax`: `/{param}` and `/{*rest}`; the 0.7 `:param` syntax panics at startup.
- `extract-body-last`: the body extractor (`Json`, `String`, `Bytes`, `Form`, `Multipart`) is the last argument.
- `extract-state-fromref`: use `State` plus `FromRef` substates, not `Extension`.
- `extract-body-limit`: the default limit is 2 MB; set `DefaultBodyLimit::max` per route from the contract.
- `error-into-response`: one `ApiError: IntoResponse` writes the envelope; `WithRejection` covers extractor errors.
- `middleware-order`: `Router::layer` runs bottom to top, and `ServiceBuilder` top to bottom.
- `middleware-route-layer`: put auth on `route_layer` so unknown paths stay 404.
- `middleware-from-fn`: app logic goes in `from_fn_with_state`; standard concerns use tower-http layers.
- `test-oneshot-golden`: run `tower::ServiceExt::oneshot` against golden cases, without a socket.
- `serve-graceful-limits`: `with_graceful_shutdown`; on 0.9 (main), the header read timeout and `limit_connections`.
- `http-cors-allowlist`: `AllowOrigin::list`; `CorsLayer::validate()` on tower-http main.
- `http-trace-matched-path`: label spans with `MatchedPath`, and never log headers or bodies.
- `build-features-minimal`: `default-features = false` and an explicit feature list.

## Sources

- Forks: `aphrody-labs/axum`, `aphrody-labs/tower-http` and `aphrody-labs/tower`, listed in `third_party/forks.txt` and synced by `bun scripts/vcs.ts fork sync <repo>`.
- Feature matrix and code graphs: `docs/axum/FEATURES.md` and `docs/axum/graph/`.
