// Client of an OpenAI-compatible LLM (llama-server, Ollama, vLLM...): /chat/completions.
// No client-side cache; `cache_prompt: false` stops llama-server from reusing the prefix of a previous request
// (possibly from another tenant).

export interface AppelOutil {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AppelOutil[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface OutilLlm {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

export interface Requete {
  signal?: AbortSignal;
  messages: Message[];
  tools?: OutilLlm[];
  /** JSON Schema imposed on the response (response_format json_schema). */
  schema?: { nom: string; schema: object };
}

export interface Reponse {
  content: string | null;
  tool_calls?: AppelOutil[];
}

export interface ClientLlm {
  completer(r: Requete): Promise<Reponse>;
}

export interface ConfigLlm {
  /** API base, e.g. http://localhost:8080/v1 (llama-server) or http://localhost:11434/v1 (Ollama). */
  url: string;
  modele?: string;
  cle?: string;
  timeoutMs?: number;
}

export class ErreurLlm extends Error {}

export function configLlmDepuisEnv(env = Bun.env): ConfigLlm | null {
  if (!env.AUTO_LLM_URL) return null;
  return {
    url: env.AUTO_LLM_URL,
    modele: env.AUTO_LLM_MODEL,
    cle: env.AUTO_LLM_KEY,
    timeoutMs: env.AUTO_LLM_TIMEOUT_MS ? Number(env.AUTO_LLM_TIMEOUT_MS) : undefined,
  };
}

export function clientOpenAi(c: ConfigLlm, fetcher: typeof fetch = fetch): ClientLlm {
  const url = `${c.url.replace(/\/+$/, "")}/chat/completions`;
  return {
    async completer(r) {
      const corps = {
        model: c.modele ?? "local",
        messages: r.messages,
        temperature: 0,
        cache_prompt: false,
        ...(r.tools?.length ? { tools: r.tools, tool_choice: "auto" } : {}),
        ...(r.schema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: r.schema.nom, strict: true, schema: r.schema.schema },
              },
            }
          : {}),
      };
      const res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(c.cle ? { authorization: `Bearer ${c.cle}` } : {}) },
        body: JSON.stringify(corps),
        signal: r.signal
          ? AbortSignal.any([r.signal, AbortSignal.timeout(c.timeoutMs ?? 120000)])
          : AbortSignal.timeout(c.timeoutMs ?? 120_000),
      });
      if (!res.ok) throw new ErreurLlm(`LLM : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = (await res.json()) as { choices?: { message?: Reponse }[] };
      const m = j.choices?.[0]?.message;
      if (!m) throw new ErreurLlm("LLM: response without a message");
      return { content: m.content ?? null, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined };
    },
  };
}
