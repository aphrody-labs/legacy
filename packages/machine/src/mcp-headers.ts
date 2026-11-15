// headersHelper of the HTTP MCP servers of infra/agents/toolchain.toml: reads each secret from the env-kit vault
// and prints the JSON headers object on stdout, which Claude Code reads alone (never written to settings or argv).
// Usage (set by toolchain.ts): bun packages/machine/src/mcp-headers.ts <Header>=<SECRET_NAME> ...
import { secretGet } from "@aphrody/env-kit/secret-store";

const headers: Record<string, string> = {};
for (const pair of process.argv.slice(2)) {
  const i = pair.indexOf("=");
  const [header, name] = [pair.slice(0, i), pair.slice(i + 1)];
  const v = secretGet(name);
  if (!v) {
    console.error(`mcp-headers: ${name} missing from the env-kit vault`);
    process.exit(1);
  }
  headers[header] = v;
}
process.stdout.write(JSON.stringify(headers));
