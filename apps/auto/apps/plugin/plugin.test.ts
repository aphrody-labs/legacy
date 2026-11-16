// The plugin stays consistent with the API and the CLI: readable manifest, remote MCP server (OAuth) on /mcp,
// named skill; the stdio server `auto mcp` stays available for uses without a browser.
import { expect, test } from "bun:test";

const dir = new URL("./", import.meta.url);
const lire = (f: string) => Bun.file(new URL(f, dir)).json();

test("manifest, MCP server and skill", async () => {
  const p = await lire(".claude-plugin/plugin.json");
  expect(p).toMatchObject({ name: "auto", version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
  const mcp = await lire(".mcp.json");
  // Remote server: no token in the configuration, the client authenticates through OAuth 2.1 (browser).
  expect(mcp.mcpServers.auto).toEqual({ type: "http", url: "${AUTO_MCP_URL:-https://auto.aphrody.com/mcp}" });
  const skill = await Bun.file(new URL("skills/auto/SKILL.md", dir)).text();
  expect(skill).toMatch(/^---\nname: auto\ndescription: .+\n---\n/);
});

test("the CLI exposes the mcp command used by the plugin", async () => {
  const aide = await Bun.$`bun ${Bun.fileURLToPath(new URL("../cli/src/cli.ts", dir))} help`.text();
  expect(aide).toContain("auto mcp");
});
