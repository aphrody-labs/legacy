---
title: Put early-return middleware on route_layer
impact: MEDIUM
impactDescription: unknown paths stay 404 instead of 401
tags: middleware, auth
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
