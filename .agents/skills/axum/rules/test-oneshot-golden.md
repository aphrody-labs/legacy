---
title: Test the Router in process against golden cases
impact: HIGH
impactDescription: parity with the TypeScript host is proven per case
tags: testing, migration
---

## Test the Router in process against golden cases

**Impact: HIGH (parity with the TypeScript host is proven per case)**

`tower::ServiceExt::oneshot` drives the `Router` without a socket. Shenron replays `data/api/fixtures/*.json` (recorded from the TypeScript host) and compares status, recorded headers and JSON (`crates/shenron-api/tests/parity.rs`).

**Incorrect:**

```rust
// start the server on a port, curl it, compare by eye
```

**Correct:**

```rust
let res = app.clone().oneshot(Request::get(path).body(Body::empty())?).await?;
```

Reference: [tests/parity.rs](https://github.com/aphrody-labs/shenron/blob/main/crates/shenron-api/tests/parity.rs)
