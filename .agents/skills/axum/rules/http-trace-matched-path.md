---
title: Label traces and metrics with MatchedPath
impact: LOW-MEDIUM
impactDescription: bounded cardinality
tags: tracing, metrics
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
