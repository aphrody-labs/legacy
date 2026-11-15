// unixwin as a stdio MCP server (protocol 2025-11-25, one JSON message per line), reached through the relay hub:
// hub_call unixwin__unixwin_applets | unixwin__unixwin_plugin_manifest | unixwin__unixwin_validate_bundle | unixwin__unixwin_sh.
// Registered by [[hub.mcp]] unixwin in infra/agents/toolchain.toml. Backends: infra/os/unixwin/applets.toml (provider table of the
// `ay applet` multicall), packages/omniu (plugin host and bundle validator), the `ay` binary ($AY_BIN, else PATH; `ay sh` is the
// embedded Bash engine). Skill: .agents/skills/unixwin.
import { join } from "node:path";
import { manifest, sh, type AyOptions } from "../../../omniu/src/ay.ts";
import { validateAll } from "../../../omniu/src/validate.ts";

type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: any };

const send = (m: unknown): void => void process.stdout.write(`${JSON.stringify(m)}\n`);
const ok = (id: Rpc["id"], result: unknown) => send({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });

const SRC = join(import.meta.dir, "..", "..", "..", "..");

/** The provider table of `ay applet`: `{ name: "winux" | "uutils" | "winux-cxx" }`. */
export async function applets(root: string = SRC): Promise<Record<string, string>> {
  const doc = Bun.TOML.parse(await Bun.file(join(root, "infra/os/unixwin/applets.toml")).text()) as Record<string, { provider: string }>;
  return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, v.provider]));
}

export function unixwinTools(ay: AyOptions = {}, root: string = SRC) {
  return [
    {
      name: "unixwin_applets",
      description: "Providers of the `ay applet` multicall (WinuxCmd is the base: winux = Rust applet linked on Windows, uutils = fills the gaps, winux-cxx = C++ Windows bundle). Optional `name` returns one applet.",
      inputSchema: { type: "object", properties: { name: { type: "string" } } },
      readOnly: true,
      run: async (a: { name?: string }) => {
        const t = await applets(root);
        if (a.name) return t[a.name] ? { [a.name]: t[a.name] } : { error: `unknown applet ${a.name}` };
        const counts: Record<string, number> = {};
        for (const p of Object.values(t)) counts[p] = (counts[p] ?? 0) + 1;
        return { counts, applets: t };
      },
    },
    {
      name: "unixwin_plugin_manifest",
      description: "Plugin manifest emitted by the ay binary (`ay plugin manifest`): schema, version, embedded engine, command table and the niu and Bun host entries.",
      inputSchema: { type: "object", properties: {} },
      readOnly: true,
      run: async () => manifest(ay),
    },
    {
      name: "unixwin_validate_bundle",
      description: "Validate the oh-my-niu bundle (packages/omniu): layout, plugin manifests including [bun] entries, assets, index and release notes. Returns { ok, errors }.",
      inputSchema: { type: "object", properties: {} },
      readOnly: true,
      run: async () => {
        const errors = validateAll(join(root, "packages", "omniu"));
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: "unixwin_sh",
      description: "Run a command string in the Bash 5.3 engine embedded in ay (`ay sh -c`); extra `args` become $1.... Returns { code, stdout, stderr }. Not read-only.",
      inputSchema: { type: "object", properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" } } }, required: ["command"] },
      readOnly: false,
      run: async (a: { command?: string; args?: string[] }) => {
        if (typeof a.command !== "string") throw new Error("command (string) required");
        return sh(a.command, a.args ?? [], ay);
      },
    },
  ];
}

export async function handle(m: Rpc, tools = unixwinTools()): Promise<void> {
  if (m.id === undefined) return;
  switch (m.method) {
    case "initialize":
      return ok(m.id, { protocolVersion: m.params?.protocolVersion ?? "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "aphrody-unixwin", version: "0.1.0" } });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly } })) });
    case "tools/call": {
      const t = tools.find((x) => x.name === m.params?.name);
      if (!t) return fail(m.id, -32602, `unknown tool ${m.params?.name}`);
      try {
        const r = await t.run(m.params?.arguments ?? {});
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(r) }] });
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
  for await (const c of Bun.stdin.stream()) {
    buf += Buffer.from(c).toString("utf8");
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) await handle(JSON.parse(line) as Rpc);
    }
  }
}
