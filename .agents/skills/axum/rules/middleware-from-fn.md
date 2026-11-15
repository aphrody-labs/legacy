---
title: Write app middleware with from_fn, standard concerns with tower-http
impact: MEDIUM
impactDescription: no hand-written Service/Future types
tags: middleware
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
