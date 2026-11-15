# Axum rules (compiled)

Generated from `rules/` by `scripts/compile.ts`; edit the rules, not this file.

Axum 0.8 and tower-http 0.7 rules for AI agents writing or porting HTTP services in Rust, read from the aphrody-labs forks (axum 2449f160, tower-http 8569ec8b, tower df06d70d). 13 rules across 8 categories, each with an incorrect and a correct example and the source file it was checked against. Used by the Shenron TypeScript to Rust migration (crates/shenron-api).

## Sections

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

## Use {param} and {*rest} path captures

**Impact: CRITICAL (the 0.7 syntax panics at startup)**

axum 0.8 upgraded matchit to 0.8: captures are `/{single}` and `/{*many}`. The old `/:single` and `/*many` syntax panics when the route is added, so a stale route only fails at boot.

**Incorrect:**

```rust
Router::new().route("/api/public/lexicon/:id", get(term))
```

**Correct:**

```rust
Router::new().route("/api/public/lexicon/{id_or_form}", get(term))
```

Reference: [axum/CHANGELOG.md](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/CHANGELOG.md)

---

## Put the body-consuming extractor last

**Impact: CRITICAL (compile error otherwise)**

Only the last handler argument may implement `FromRequest` (it consumes the body: `Json`, `String`, `Bytes`, `Form`, `Multipart`). Every other argument implements `FromRequestParts` (`State`, `Path`, `Query`, `HeaderMap`).

**Incorrect:**

```rust
async fn save(Json(body): Json<Save>, State(db): State<Db>) {}
```

**Correct:**

```rust
async fn save(State(db): State<Db>, Json(body): Json<Save>) {}
```

Reference: [docs/extract.md](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/docs/extract.md)

---

## Set body limits explicitly per route

**Impact: HIGH (the default caps Bytes/Json/Multipart at 2 MB)**

`DefaultBodyLimit` defaults to 2 097 152 bytes for `Bytes`, `String`, `Json` and `Multipart`. Lower it to the contract's `maxBodyBytes` on small JSON routes, and raise it only on upload routes; `tower_http::limit::RequestBodyLimitLayer` also bounds streaming bodies.

**Incorrect:**

```rust
.route("/api/v1/account/favorites", post(save)) // 2 MB accepted
```

**Correct:**

```rust
.route("/api/v1/account/favorites", post(save).layer(DefaultBodyLimit::max(FAVORITES_BODY_MAX)))
```

Reference: [extract/default_body_limit.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum-core/src/extract/default_body_limit.rs)

---

## Share state with State and FromRef, not Extension

**Impact: HIGH (missing state is a compile error, not a 500)**

`Router::with_state` plus `State<T>` is checked at compile time. `FromRef` lets one handler take a substate (`State<&'static Lexicon>`) of a larger `AppState`. `Extension` fails at run time when the layer is missing.

**Incorrect:**

```rust
Router::new().route("/x", get(h)).layer(Extension(db)) // h: Extension<Db>
```

**Correct:**

```rust
#[derive(Clone, FromRef)] struct App { db: Db, lexicon: &'static Lexicon }
Router::new().route("/x", get(h)).with_state(app) // h: State<Db>
```

Reference: [extract/state.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/extract/state.rs)

---

## One error type that implements IntoResponse

**Impact: HIGH (one place maps failures to the contract envelope)**

Handlers return `Result<T, ApiError>`; `ApiError: IntoResponse` writes the contract envelope `{ error, code, message }` with its status. Wrap extractors with `axum_extra::extract::WithRejection<E, ApiError>` so a bad query or body also yields the envelope instead of axum's plain-text rejection.

**Incorrect:**

```rust
async fn h(Query(q): Query<Q>) -> Response { /* axum rejection: text/plain 400 */ }
```

**Correct:**

```rust
async fn h(WithRejection(Query(q), _): WithRejection<Query<Q>, ApiError>) -> Result<Json<R>, ApiError>
```

Reference: [extract/with_rejection.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum-extra/src/extract/with_rejection.rs)

---

## Write app middleware with from_fn, standard concerns with tower-http

**Impact: MEDIUM (no hand-written Service/Future types)**

`axum::middleware::from_fn` and `from_fn_with_state` turn an async fn into a layer (rate limit, public cache key, owner resolution). CORS, compression, timeouts, request ids, tracing, sensitive headers and CSRF already exist as tower-http layers behind features.

**Incorrect:**

```rust
impl<S> Service<Request> for RateLimit<S> { /* manual poll_ready and future */ }
```

**Correct:**

```rust
.layer(from_fn_with_state(limiter, rate_limit)) // async fn rate_limit(State(l), req, next) -> Response
```

Reference: [middleware/from_fn.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/middleware/from_fn.rs)

---

## Know the layer order

**Impact: HIGH (auth after a cache layer leaks private answers)**

Successive `Router::layer` calls wrap the routes like an onion: the last layer added runs first on the request. `tower::ServiceBuilder` reads top to bottom: the first layer listed runs first. Group layers in one `ServiceBuilder` so the order reads as it executes.

**Incorrect:**

```rust
router.layer(cache).layer(trace).layer(auth) // auth runs before trace, cache last: order hidden
```

**Correct:**

```rust
router.layer(ServiceBuilder::new().layer(trace).layer(cors).layer(auth).layer(cache))
```

Reference: [docs/middleware.md](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/docs/middleware.md)

---

## Put early-return middleware on route_layer

**Impact: MEDIUM (unknown paths stay 404 instead of 401)**

`route_layer` only runs when a route matched, and only for routes added before the call. Authorization there keeps a 404 for unknown paths; `layer` would answer 401 for every path.

**Incorrect:**

```rust
Router::new().route("/api/v1/memory", get(list)).layer(from_fn(require_owner))
```

**Correct:**

```rust
Router::new().route("/api/v1/memory", get(list)).route_layer(from_fn_with_state(state, require_owner))
```

Reference: [routing/route_layer.md](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/docs/routing/route_layer.md)

---

## Test the Router in process against golden cases

**Impact: HIGH (parity with the TypeScript host is proven per case)**

`tower::ServiceExt::oneshot` drives the `Router` without a socket. Shenron replays `data/api/fixtures/*.json` (recorded from the TypeScript host) and compares status, recorded headers and JSON (`crates/shenron-api/tests/parity.rs`).

**Incorrect:**

```rust
// start the server on a port, curl it, compare by eye
```

**Correct:**

```rust
let res = app.clone().oneshot(Request::get(path).body(Body::empty())?).await?;
```

Reference: [tests/parity.rs](https://github.com/aphrody-labs/shenron/blob/main/crates/shenron-api/tests/parity.rs)

---

## Serve with graceful shutdown and bounded connections

**Impact: MEDIUM (deploys drain instead of cutting requests)**

`axum::serve(listener, app).with_graceful_shutdown(signal)` drains in-flight requests on SIGTERM. On axum main (0.9, unreleased) `serve` applies hyper's 30 s header read timeout, and `ListenerExt::limit_connections(n)` caps concurrent connections; on 0.8 add `tower_http::timeout::TimeoutLayer`.

**Incorrect:**

```rust
axum::serve(listener, app).await
```

**Correct:**

```rust
axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await
```

Reference: [serve/mod.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/serve/mod.rs)

---

## Use an origin allowlist and validate the CORS config

**Impact: MEDIUM (credentials with * is rejected by browsers)**

`CorsLayer` with `AllowOrigin::list` mirrors the host's `cors.allowedOrigins`. tower-http main adds `CorsLayer::validate()`, which returns `CorsConfigurationError` for combinations that would panic later (credentials with `*`).

**Incorrect:**

```rust
CorsLayer::very_permissive()
```

**Correct:**

```rust
CorsLayer::new().allow_origin(AllowOrigin::list(origins)).vary([ORIGIN])
```

Reference: [cors/mod.rs](https://github.com/aphrody-labs/tower-http/blob/8569ec8b99f661eb0a4406a2e032504188d9f3fd/tower-http/src/cors/mod.rs)

---

## Label traces and metrics with MatchedPath

**Impact: LOW-MEDIUM (bounded cardinality)**

`TraceLayer::new_for_http()` with a span that records `MatchedPath` (`/api/public/lexicon/{idOrForm}`) instead of the raw URI keeps one series per route. Never log headers or bodies (`SetSensitiveHeadersLayer`).

**Incorrect:**

```rust
info_span!("http", uri = %req.uri())
```

**Correct:**

```rust
info_span!("http", route = req.extensions().get::<MatchedPath>().map(MatchedPath::as_str))
```

Reference: [extract/matched_path.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/extract/matched_path.rs)

---

## Turn default features off and list what you use

**Impact: LOW-MEDIUM (smaller builds, no surprise on 0.9)**

axum 0.8.9 defaults to form, http1, json, matched-path, original-uri, query, tokio, tracing (tower-log leaves the defaults on main). tower-http has no default feature. Declare `default-features = false` and the exact list in `[workspace.dependencies]`.

**Incorrect:**

```rust
axum = "0.8"
```

**Correct:**

```rust
axum = { version = "0.8", default-features = false, features = ["json", "query", "tokio", "http1", "http2"] }
```

Reference: [axum/Cargo.toml](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/Cargo.toml)
