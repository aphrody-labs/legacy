---
title: Put the body-consuming extractor last
impact: CRITICAL
impactDescription: compile error otherwise
tags: extractors
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
