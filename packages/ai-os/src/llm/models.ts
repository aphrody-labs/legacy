// Providers and models discovered at run time, never hardcoded: each provider is active if its access exists
// (environment variable, authenticated CLI or a local server that answers) and its model list comes from its API.
// Single model bridge of @aphrody/ai-os (agent, relay, search, gateway): `provider/model`, OpenAI-compatible
// API call (chat/completions, tools, embeddings) or by CLI; see model.ts.
//
//   provider      access                                        model list                                call
//   ollama        OLLAMA_HOST or 127.0.0.1:11434 that answers   GET /api/tags                              /v1/chat/completions
//   fabric        AI_FABRIC_URL or 127.0.0.1:8090 that answers  GET /v1/models (llama.cpp RPC coordinator) /v1/chat/completions
//   openai-compat RELAY_OPENAI_ENDPOINTS="nom=url,…" (llama.cpp llama-server, vLLM, mistral.rs, LM Studio, LiteLLM proxy…)
//                                                               GET /v1/models                             /v1/chat/completions
//   openrouter    OPENROUTER_API_KEY                            GET /api/v1/models                         /api/v1/chat/completions
//   huggingface   HF_TOKEN                                      GET router.huggingface.co/v1/models        router /v1/chat/completions
//   vercel        AI_GATEWAY_API_KEY                            GET ai-gateway.vercel.sh/v1/models         /v1/chat/completions
//   cloudflare    CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID  GET /ai/models/search (Text Generation)    /ai/v1/chat/completions
//   antigravity   authenticated agy CLI                         agy models                                 agy -p
//   claude        authenticated claude CLI                      (CLI alias)                                claude -p
//   google-vertex service account (GOOGLE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)
//                                                               GET publishers/google/models, else the models.dev catalog  Vertex /endpoints/openapi/chat/completions
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  loadServiceAccount,
  serviceAccountProject,
  serviceAccountToken,
} from "../../../env-kit/src/google-auth.ts";
import { outboundFetch } from "../relay/outbound.ts";
import { agy, claude, opencode } from "./agents";

export type Model = {
  id: string;
  provider: string;
  name?: string;
  context?: number;
};
export type Provider = {
  id: string;
  /** Runs on this machine or this fleet: free to call (router price 0). */
  local?: boolean;
  available: () => Promise<boolean>;
  list: () => Promise<Model[]>;
  chat?: {
    base: () => string;
    /** Async when the credential is minted per call (service-account bearer). */
    headers: () => Record<string, string> | Promise<Record<string, string>>;
    path?: string;
    /** Wire name of a listed model (Vertex wants `google/<model>`). */
    model?: (listed: string) => string;
  };
  ask?: (model: string, prompt: string) => Promise<string>;
};

/** Hosted bases shared with the router catalog (router/config.ts). */
export const BASES = {
  openrouter: "https://openrouter.ai/api",
  huggingface: "https://router.huggingface.co",
} as const;

const env = (k: string) => Bun.env[k];
const getJson = async (
  url: string,
  headers: Record<string, string> = {},
  ms = 4000,
) => {
  // Model lists: reads, cached for the relay's short TTL (relay/outbound.ts).
  const r = await outboundFetch(url, {
    headers,
    signal: AbortSignal.timeout(ms),
    deterministic: true,
  });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.json() as Promise<any>;
};
const run = async (argv: string[]) => {
  const p = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: 15_000,
  });
  const [out, , code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { out, code };
};
const bearer = (k: string | undefined): Record<string, string> =>
  k ? { authorization: `Bearer ${k}` } : {};
const openaiList = (provider: string, j: any): Model[] =>
  (j.data ?? []).map((m: any) => ({
    id: `${provider}/${m.id}`,
    provider,
    name: m.name ?? m.id,
    context: m.context_length ?? m.context_window,
  }));

/** Directory of the models.dev catalog kept in apps/open (MODELS_DEV_DIR overrides). */
export const catalogDir = () =>
  Bun.env.MODELS_DEV_DIR ??
  join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "..",
    "apps",
    "open",
    "packages",
    "models.dev",
  );

/**
 * Text-generation models of a provider read from the models.dev catalog (providers/<id>/models/*.toml, top level
 * only), the offline source when a provider cannot list its models (billing off, API key denied).
 * `family` restricts file names (regular expression); context comes from the base model file.
 */
export function catalogModels(
  provider: string,
  family = "^gemini",
  dir = catalogDir(),
  textOnly = true,
): Model[] {
  const root = join(dir, "providers", provider, "models");
  if (!existsSync(root)) return [];
  const re = new RegExp(family, "i");
  const out: Model[] = [];
  for (const f of readdirSync(root)) {
    if (!f.endsWith(".toml") || !re.test(f)) continue;
    try {
      const t: any = Bun.TOML.parse(readFileSync(join(root, f), "utf8"));
      const base = t.base_model && join(dir, "models", `${t.base_model}.toml`);
      const b: any =
        base && existsSync(base)
          ? Bun.TOML.parse(readFileSync(base, "utf8"))
          : {};
      const output: string[] = t.modalities?.output ??
        b.modalities?.output ?? ["text"];
      if (textOnly && (output.length !== 1 || output[0] !== "text")) continue;
      const stem = relative(root, join(root, f)).replace(/\.toml$/, "");
      out.push({
        id: `${provider}/${stem}`,
        provider,
        name: t.name ?? b.name ?? stem,
        context: t.limit?.context ?? b.limit?.context,
      });
    } catch {}
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Vertex OpenAI-compatible base of a project and location (`global` has its own host). */
export const vertexBase = (project: string, location: string) =>
  `${location === "global" ? "https://aiplatform.googleapis.com" : `https://${location}-aiplatform.googleapis.com`}/v1/projects/${project}/locations/${location}/endpoints/openapi`;

function compat(id: string, base: string, key?: string): Provider {
  return {
    id,
    available: async () =>
      !!(await getJson(`${base}/v1/models`, bearer(key), 1500).catch(
        () => null,
      )),
    list: async () =>
      openaiList(id, await getJson(`${base}/v1/models`, bearer(key))),
    chat: { base: () => base, headers: () => bearer(key) },
  };
}

export function providers(): Provider[] {
  const out: Provider[] = [];
  const ollama = env("OLLAMA_HOST")
    ? env("OLLAMA_HOST")!.startsWith("http")
      ? env("OLLAMA_HOST")!
      : `http://${env("OLLAMA_HOST")}`
    : "http://127.0.0.1:11434";
  out.push({
    id: "ollama",
    local: true,
    available: async () =>
      !!(await getJson(`${ollama}/api/tags`, {}, 1500).catch(() => null)),
    list: async () =>
      ((await getJson(`${ollama}/api/tags`)).models ?? []).map((m: any) => ({
        id: `ollama/${m.name}`,
        provider: "ollama",
        name: m.name,
      })),
    chat: { base: () => ollama, headers: () => ({}) },
  });
  // Distributed inference fabric (src/fabric, infra/ai/fabric.toml): llama-server coordinator + WireGuard rpc-server.
  // Gone from the list as soon as the coordinator stops answering: selection switches to the other providers.
  out.push({
    ...compat(
      "fabric",
      (env("AI_FABRIC_URL") ?? "http://127.0.0.1:8090")
        .replace(/\/+$/, "")
        .replace(/\/v1$/, ""),
    ),
    local: true,
  });
  for (const pair of (env("RELAY_OPENAI_ENDPOINTS") ?? "")
    .split(",")
    .filter(Boolean)) {
    const eq = pair.indexOf("=");
    const [name, url] = eq > 0 ? [pair.slice(0, eq), pair.slice(eq + 1)] : [];
    if (name && url)
      out.push(
        compat(
          name,
          url.replace(/\/+$/, "").replace(/\/v1$/, ""),
          env(`RELAY_${name.toUpperCase().replace(/\W/g, "_")}_KEY`),
        ),
      );
  }
  if (env("OPENAI_API_KEY"))
    out.push(
      compat(
        "openai",
        (env("OPENAI_BASE_URL") ?? "https://api.openai.com")
          .replace(/\/+$/, "")
          .replace(/\/v1$/, ""),
        env("OPENAI_API_KEY"),
      ),
    );
  if (env("ANTHROPIC_API_KEY")) {
    const abase = (env("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com")
      .replace(/\/+$/, "")
      .replace(/\/v1$/, "");
    const aheaders = (): Record<string, string> => ({
      "x-api-key": env("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      authorization: `Bearer ${env("ANTHROPIC_API_KEY")!}`,
    });
    out.push({
      id: "anthropic",
      available: async () => true,
      list: async () =>
        openaiList(
          "anthropic",
          await getJson(`${abase}/v1/models`, aheaders()),
        ),
      chat: { base: () => abase, headers: aheaders },
    });
  }
  const gkey = env("GEMINI_API_KEY") || env("GOOGLE_API_KEY");
  if (gkey) {
    const gbase = "https://generativelanguage.googleapis.com/v1beta/openai";
    out.push({
      id: "google",
      available: async () => true,
      // Key denied on the list endpoint (API not enabled): the catalog keeps the models rankable, the call
      // reports the real health state.
      list: async () => {
        try {
          return openaiList(
            "google",
            await getJson(`${gbase}/models`, bearer(gkey)),
          );
        } catch (e) {
          const c = catalogModels("google");
          if (!c.length) throw e;
          return c;
        }
      },
      chat: {
        base: () => gbase,
        headers: () => bearer(gkey),
        path: "/chat/completions",
      },
    });
  }
  // Vertex AI with a service account: bearer minted per call (env-kit/google-auth.ts, cached until expiry).
  // Billing off, API disabled and quota come back as HTTP errors that orch/classify.ts turns into cooldown classes.
  const sa = loadServiceAccount();
  const vproject = sa && serviceAccountProject(sa);
  if (sa && vproject) {
    const location = env("GOOGLE_CLOUD_LOCATION")?.trim() || "global";
    const vbase = vertexBase(vproject, location);
    const host =
      location === "global"
        ? "https://aiplatform.googleapis.com"
        : `https://${location}-aiplatform.googleapis.com`;
    const auth = async () => bearer(await serviceAccountToken({ account: sa }));
    out.push({
      id: "google-vertex",
      available: async () => true,
      list: async () => {
        try {
          const found: Model[] = [];
          let page = "";
          for (let i = 0; i < 5; i++) {
            const j = await getJson(
              `${host}/v1beta1/publishers/google/models?pageSize=200${page}`,
              await auth(),
              8000,
            );
            for (const m of j.publisherModels ?? [])
              found.push({
                id: `google-vertex/${String(m.name).split("/").pop()}`,
                provider: "google-vertex",
                name: m.name,
              });
            if (!j.nextPageToken) break;
            page = `&pageToken=${encodeURIComponent(j.nextPageToken)}`;
          }
          // Live ids filtered by the catalog's text-generation set (the API lists image, speech and embedding models too).
          const text = catalogModels("google-vertex");
          const known = new Set(text.map((m) => m.id));
          const all = new Set(
            catalogModels("google-vertex", "^", catalogDir(), false).map(
              (m) => m.id,
            ),
          );
          const live = found
            .filter(
              (m) =>
                /\/gemini/i.test(m.id) && (known.has(m.id) || !all.has(m.id)),
            )
            .map((m) => ({
              ...m,
              context: text.find((t) => t.id === m.id)?.context,
            }));
          if (live.length) return live;
        } catch {}
        return catalogModels("google-vertex");
      },
      chat: {
        base: () => vbase,
        headers: auth,
        path: "/chat/completions",
        model: (m) => (m.includes("/") ? m : `google/${m}`),
      },
    });
  }
  if (env("OPENROUTER_API_KEY"))
    out.push({
      id: "openrouter",
      available: async () => true,
      list: async () =>
        openaiList(
          "openrouter",
          await getJson(`${BASES.openrouter}/v1/models`),
        ),
      chat: {
        base: () => BASES.openrouter,
        headers: () => bearer(env("OPENROUTER_API_KEY")),
      },
    });
  if (env("HF_TOKEN"))
    out.push(compat("huggingface", BASES.huggingface, env("HF_TOKEN")));
  if (env("AI_GATEWAY_API_KEY"))
    out.push(
      compat(
        "vercel",
        "https://ai-gateway.vercel.sh",
        env("AI_GATEWAY_API_KEY"),
      ),
    );
  if (env("CLOUDFLARE_API_TOKEN") && env("CLOUDFLARE_ACCOUNT_ID")) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai`;
    out.push({
      id: "cloudflare",
      available: async () => true,
      list: async () =>
        (
          (
            await getJson(
              `${base}/models/search?task=Text%20Generation&per_page=200`,
              bearer(env("CLOUDFLARE_API_TOKEN")),
              8000,
            )
          ).result ?? []
        ).map((m: any) => ({
          id: `cloudflare/${m.name}`,
          provider: "cloudflare",
          name: m.name,
        })),
      chat: {
        base: () => base,
        headers: () => bearer(env("CLOUDFLARE_API_TOKEN")),
        path: "/v1/chat/completions",
      },
    });
  }
  out.push({
    id: "antigravity",
    available: async () => !!Bun.which("agy"),
    list: async () => {
      const r = await run(["agy", "models"]);
      if (r.code !== 0) throw new Error(`agy models : code ${r.code}`);
      return r.out
        .split(/\r?\n/)
        .map((l) => l.split("\t"))
        .filter((c) => c.length >= 2 && /^[\w.-]+$/.test(c[0]!))
        .map(([id, name]) => ({
          id: `antigravity/${id}`,
          provider: "antigravity",
          name,
        }));
    },
    ask: async (model, prompt) => (await agy(prompt, model || undefined)).text,
  });
  out.push({
    id: "claude",
    available: async () => !!Bun.which("claude"),
    list: async () => [
      {
        id: "claude/default",
        provider: "claude",
        name: "Claude Code default model",
      },
    ],
    ask: async (model, prompt) =>
      (await claude(prompt, model === "default" ? undefined : model)).text,
  });
  out.push({
    id: "opencode",
    available: async () => !!Bun.which("opencode"),
    list: async () => {
      const r = await run(["opencode", "models"]);
      if (r.code !== 0)
        return [
          {
            id: "opencode/default",
            provider: "opencode",
            name: "OpenCode default",
          },
        ];
      return r.out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[\w.-]+\/[\w.:-]+$/.test(l))
        .map((m) => ({
          id: `opencode/${m}`,
          provider: "opencode",
          name: m,
        }));
    },
    ask: async (model, prompt) =>
      (await opencode(prompt, model === "default" ? undefined : model)).text,
  });
  return out;
}

/** Models of all active providers (unreachable providers are reported, not blocking). */
export async function listModels(filter?: string) {
  const res = await Promise.all(
    providers().map(async (p) => {
      if (!(await p.available().catch(() => false)))
        return { provider: p.id, available: false, models: [] as Model[] };
      try {
        return { provider: p.id, available: true, models: await p.list() };
      } catch (e: any) {
        return {
          provider: p.id,
          available: true,
          error: e.message,
          models: [] as Model[],
        };
      }
    }),
  );
  // Filter = case-insensitive substring (no regular expression coming from an MCP/A2A client).
  const f = filter?.toLowerCase();
  return res.map((r) => ({
    ...r,
    models: f
      ? r.models.filter((m) => m.id.toLowerCase().includes(f))
      : r.models,
  }));
}
