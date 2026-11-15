---
title: Set body limits explicitly per route
impact: HIGH
impactDescription: the default caps Bytes/Json/Multipart at 2 MB
tags: limits, security
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
