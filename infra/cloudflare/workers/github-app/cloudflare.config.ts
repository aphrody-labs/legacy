// Webhook Worker of the "aphrody" GitHub App. Deployment: `cf deploy --dry-run`
// then `cf deploy` (token: ay auth mint cloudflare --perm "Workers Scripts Write,Queues Write"). The secret
// GITHUB_WEBHOOK_SECRET is set by `ay auth github-app create` (wrangler secret put, value on stdin).
import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
import type { GithubEvent } from "./src/index.ts";

export default defineConfig({
  worker: {
    name: "aphrody-github",
    entrypoint,
    compatibilityDate: "2026-11-01",
    workersDev: true,
    env: {
      GITHUB_WEBHOOK_SECRET: bindings.secret(),
      EVENTS: bindings.queue<GithubEvent>({ name: "github-events" }),
    },
  },
});
