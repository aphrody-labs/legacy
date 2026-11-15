import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { applets, unixwinTools } from "../../src/relay/unixwin-mcp.ts";

const fake = { bin: [process.execPath, join(import.meta.dir, "..", "..", "..", "omniu", "test", "fixtures", "fake-ay.ts")] };
const call = async (name: string, args: object = {}) => {
  const t = unixwinTools(fake).find((x) => x.name === name)!;
  return t.run(args as never);
};

describe("unixwin MCP tools", () => {
  test("the tool list is stable and marks the shell tool as not read-only", () => {
    const tools = unixwinTools(fake);
    expect(tools.map((t) => t.name)).toEqual(["unixwin_applets", "unixwin_plugin_manifest", "unixwin_validate_bundle", "unixwin_sh"]);
    expect(tools.filter((t) => !t.readOnly).map((t) => t.name)).toEqual(["unixwin_sh"]);
  });

  test("applets: the provider table, with WinuxCmd as the base", async () => {
    const t = await applets();
    expect(t.basename).toBe("winux");
    const r: any = await call("unixwin_applets");
    expect(r.counts.winux).toBeGreaterThan(50);
    expect(r.counts.uutils).toBeGreaterThan(10);
    expect(await call("unixwin_applets", { name: "basename" })).toEqual({ basename: "winux" });
    expect(await call("unixwin_applets", { name: "nope" })).toEqual({ error: "unknown applet nope" });
  });

  test("plugin manifest comes from the ay binary", async () => {
    expect(((await call("unixwin_plugin_manifest")) as any).version).toBe("9.9.9");
  });

  test("the omniu bundle validates", async () => {
    expect(await call("unixwin_validate_bundle")).toEqual({ ok: true, errors: [] });
  });

  test("sh runs through ay and returns the exit status", async () => {
    expect(await call("unixwin_sh", { command: "exit 4" })).toMatchObject({ code: 4 });
    await expect(call("unixwin_sh", {})).rejects.toThrow("command (string) required");
  });
});

test("the stdio server answers initialize and tools/list, one JSON message per line", async () => {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "..", "src", "relay", "unixwin-mcp.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  proc.stdin.end();
  const lines = (await new Response(proc.stdout).text()).trim().split("\n").map((l) => JSON.parse(l));
  expect(lines[0].result.serverInfo.name).toBe("aphrody-unixwin");
  expect(lines[1].result.tools.map((t: any) => t.name)).toContain("unixwin_applets");
  await proc.exited;
});
