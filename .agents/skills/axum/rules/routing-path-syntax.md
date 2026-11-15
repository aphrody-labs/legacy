---
title: Use {param} and {*rest} path captures
impact: CRITICAL
impactDescription: the 0.7 syntax panics at startup
tags: routing, migration
---

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
