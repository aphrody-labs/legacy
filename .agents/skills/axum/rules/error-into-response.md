---
title: One error type that implements IntoResponse
impact: HIGH
impactDescription: one place maps failures to the contract envelope
tags: errors, responses
---

## One error type that implements IntoResponse

**Impact: HIGH (one place maps failures to the contract envelope)**

Handlers return `Result<T, ApiError>`; `ApiError: IntoResponse` writes the contract envelope `{ error, code, message }` with its status. Wrap extractors with `axum_extra::extract::WithRejection<E, ApiError>` so a bad query or body also yields the envelope instead of axum's plain-text rejection.

**Incorrect:**

```rust
async fn h(Query(q): Query<Q>) -> Response { /* axum rejection: text/plain 400 */ }
```

**Correct:**

```rust
async fn h(WithRejection(Query(q), _): WithRejection<Query<Q>, ApiError>) -> Result<Json<R>, ApiError>
```

Reference: [extract/with_rejection.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum-extra/src/extract/with_rejection.rs)
