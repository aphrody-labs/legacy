---
title: Use an origin allowlist and validate the CORS config
impact: MEDIUM
impactDescription: credentials with * is rejected by browsers
tags: cors, security
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
