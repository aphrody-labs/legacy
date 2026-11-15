---
title: Know the layer order
impact: HIGH
impactDescription: auth after a cache layer leaks private answers
tags: middleware
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
