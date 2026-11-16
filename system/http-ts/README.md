# Aphrody HTTP transport

<!-- catalog:begin unit -->
> Portable in-process JSON transport shared by Aphrody service clients

| Type | Path |
| :-- | :-- |
| Bun package | `system/http-ts` |

**Commands**

```sh
bun run --cwd system/http-ts typecheck
bun run --cwd system/http-ts test
bun run --cwd system/http-ts lint
```

Part of Aphrody: [aphrody-labs/ay](../../README.md), [Catalog](../../docs/reference/catalog/package.md).
<!-- catalog:end -->

`@aphrody/http` owns the portable HTTP/JSON mechanism used by Aphrody compute and
OCR clients and by consumers such as the Shenron API. It has no production dependencies, environment
lookup, subprocess, service or domain store.

`requestJson(url, init, { timeoutMs, fetch?, readErrorBody?, emptyStatus? })`
makes one request. The deadline and caller signal cover headers and body.
Redirects are refused; discarded error/absence bodies are cancelled.
Successful JSON is returned as `unknown` for the caller's schema.
`JsonTransportError` distinguishes request, body and JSON failures and retains
the original cause. Callers own any user-facing error policy and redaction.

API clients retain their paths, signing, credentials, schemas, pagination and
domain errors. AI clients retain personas, model selection, grounding,
embedding batches and their existing failure contracts. No automatic retry.

Run `bun test`, `bun run typecheck`, and scoped oxlint/oxfmt from this package.
The tests use ephemeral loopback HTTP servers and synthetic inputs.
