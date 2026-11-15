// Hardcode and slop scanner as a stdio MCP server (protocol 2025-11-25, one JSON message per line), reached through
// the relay hub: hub_tools server=hygiene, hub_call name=hygiene__hygiene_scan | hygiene__hygiene_rules.
// Registered by [[hub.mcp]] hygiene in infra/agents/toolchain.toml. Engine: scripts/hygiene.ts.
import { RULES, deadRefs, scan, summarize, type Hit } from "./hygiene.ts";

const root = import.meta.dir.replace(/[\\/]scripts$/, "");
type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: any };
const send = (m: unknown): void => void process.stdout.write(`${JSON.stringify(m)}\n`);
const ok = (id: Rpc["id"], result: unknown) => send({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });

const TOOLS = [
  {
    name: "hygiene_scan",
    description:
      "Scan the tracked tree for hardcoded values and slop. Rules: " + [...RULES.map((r) => r.id), "dead-ref"].join(", ") +
      ". Returns a per-rule summary and up to `limit` hits.",
    inputSchema: {
      type: "object",
      properties: {
        rules: { type: "array", items: { type: "string" }, description: "rule ids (default: all but dead-ref)" },
        paths: { type: "array", items: { type: "string" }, description: "repo-relative pathspecs" },
        limit: { type: "number", description: "max hits returned (default 100)" },
      },
    },
    run: (a: { rules?: string[]; paths?: string[]; limit?: number }) => {
      const hits: Hit[] = scan(root, { rules: a.rules, paths: a.paths });
      if (a.rules?.includes("dead-ref")) hits.push(...deadRefs(root, a.paths));
      return { summary: summarize(hits), hits: hits.slice(0, a.limit ?? 100) };
    },
  },
  {
    name: "hygiene_rules",
    description: "List the scanner rules with the reason each one flags.",
    inputSchema: { type: "object", properties: {} },
    run: () => [...RULES.map((r) => ({ id: r.id, why: r.why })), { id: "dead-ref", why: "Repo path or relative link that points to nothing" }],
  },
];

export async function handle(m: Rpc): Promise<void> {
  if (m.id === undefined) return;
  switch (m.method) {
    case "initialize":
      return ok(m.id, { protocolVersion: m.params?.protocolVersion ?? "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "aphrody-hygiene", version: "0.1.0" } });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS.map(({ run: _r, ...t }) => ({ ...t, annotations: { readOnlyHint: true } })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === m.params?.name);
      if (!t) return fail(m.id, -32602, `unknown tool ${m.params?.name}`);
      try {
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(await t.run(m.params?.arguments ?? {})) }] });
      } catch (e) {
        return ok(m.id, { isError: true, content: [{ type: "text", text: String(e) }] });
      }
    }
    default:
      return fail(m.id, -32601, `method not found: ${m.method}`);
  }
}

if (import.meta.main) {
  let buf = "";
  for await (const chunk of Bun.stdin.stream()) {
    buf += new TextDecoder().decode(chunk);
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { await handle(JSON.parse(line)); } catch (e) { fail(null as any, -32700, String(e)); }
    }
  }
}
