---
title: Share state with State and FromRef, not Extension
impact: HIGH
impactDescription: missing state is a compile error, not a 500
tags: state, extractors
---

## Share state with State and FromRef, not Extension

**Impact: HIGH (missing state is a compile error, not a 500)**

`Router::with_state` plus `State<T>` is checked at compile time. `FromRef` lets one handler take a substate (`State<&'static Lexicon>`) of a larger `AppState`. `Extension` fails at run time when the layer is missing.

**Incorrect:**

```rust
Router::new().route("/x", get(h)).layer(Extension(db)) // h: Extension<Db>
```

**Correct:**

```rust
#[derive(Clone, FromRef)] struct App { db: Db, lexicon: &'static Lexicon }
Router::new().route("/x", get(h)).with_state(app) // h: State<Db>
```

Reference: [extract/state.rs](https://github.com/aphrody-labs/axum/blob/2449f1600c6626a9b8b7dbcc3500bf64995968e1/axum/src/extract/state.rs)
