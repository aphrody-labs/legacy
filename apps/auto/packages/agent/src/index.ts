// Agent and MCP server of the auto API: typed tools over /v1 with the user's token, LLM agent loop, stdio MCP
// server. Used by the CLI (apps/cli) and the plugin (apps/plugin).
export { appelerOutil, executerAgent } from "./agent";
export { ApiAuto, apiDepuisEnv, ErreurApi } from "./api";
export { ServeurMcp } from "./mcp";
export { outil, OUTILS, type Outil } from "./outils";
