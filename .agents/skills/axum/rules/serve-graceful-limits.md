---
title: Serve with graceful shutdown and bounded connections
impact: MEDIUM
impactDescription: deploys drain instead of cutting requests
tags: serve, runtime
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
