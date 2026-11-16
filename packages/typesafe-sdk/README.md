# TypeSafe AI JavaScript SDK

<!-- catalog:begin unit -->
> TypeScript SDK for the TypeSafe API

| Type | Path |
| :-- | :-- |
| Bun package | `packages/typesafe-sdk` |

**Commands**

```sh
bun run --cwd packages/typesafe-sdk build
bun run --cwd packages/typesafe-sdk typecheck
bun run --cwd packages/typesafe-sdk lint
bun run --cwd packages/typesafe-sdk lint:fix
bun run --cwd packages/typesafe-sdk test
bun run --cwd packages/typesafe-sdk test:watch
bun run --cwd packages/typesafe-sdk test:integration
bun run --cwd packages/typesafe-sdk test:coverage
```

Part of Aphrody: [aphrody-labs/aphrody](../../README.md), [Catalog](../../docs/reference/catalog/package.md).
<!-- catalog:end -->

JavaScript and TypeScript SDK for [TypeSafe AI](https://typesafe.ai).

## Quickstart

Install the SDK (Node.js 20 or newer):

```sh
npm install @typesafe-ai/sdk
```

Set `TYPESAFE_API_KEY` in your environment, then create and use the client:

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", {
      billing: null,
      technical: null,
      other: null,
    }),
  },
});

console.log(response.answers.category.choice);
```

Answer types are inferred from your questions. The package includes ESM, CommonJS, and TypeScript declarations.

## Documentation

Learn what TypeSafe can do in the [TypeSafe docs](https://docs.typesafe.ai/).
See the SDK's [client](src/client.ts) and [types](src/types.ts) for API options and defaults.
