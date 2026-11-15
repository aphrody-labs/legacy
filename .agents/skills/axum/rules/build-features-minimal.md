---
title: Turn default features off and list what you use
impact: LOW-MEDIUM
impactDescription: smaller builds, no surprise on 0.9
tags: cargo, build
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
