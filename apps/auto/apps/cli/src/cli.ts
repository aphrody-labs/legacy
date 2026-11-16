#!/usr/bin/env bun
// `auto` CLI: `auto agent [request]` (agent loop), `auto mcp` (stdio MCP server) and `auto flows` (workflows).
// The French command names (`outils`, `flux`, `importer`, `lancer`, `catalogue`, `aide`) stay as aliases.
import { clientOpenAi, configLlmDepuisEnv, type Message } from "@auto/ingest/llm";
import { apiDepuisEnv, executerAgent, outil, OUTILS, ServeurMcp } from "@auto/agent";

const AIDE = `auto: agent and MCP server of the Auto API

Usage:
  auto agent [request…]   runs a request (without a request: conversation on standard input)
  auto mcp                MCP server on stdio (for Claude Code, Claude Desktop, etc.)
  auto tools              lists the tools
  auto flows              lists the automation workflows
  auto flows import <file.json>   creates a workflow from its definition or an n8n export
  auto flows run <id> [json]      runs a workflow, optional input data
  auto flows catalog      node types and templates

Variables:
  AUTO_API_URL   API URL (default https://auto.aphrody.com; http://localhost:3000 in development)
  AUTO_TOKEN     user API token (POST /v1/jetons), required
  AUTO_LLM_URL   OpenAI-compatible API for \`auto agent\` (e.g. http://localhost:8080/v1)
  AUTO_LLM_MODEL, AUTO_LLM_KEY, AUTO_LLM_TIMEOUT_MS`;

const erreur = (m: string): never => {
  console.error(`auto: ${m}`);
  process.exit(1);
};

async function agent(demande: string[]) {
  const api = apiDepuisEnv();
  const c = configLlmDepuisEnv() ?? erreur("AUTO_LLM_URL missing (llama-server, Ollama…)");
  const llm = clientOpenAi(c);
  const surOutil = (nom: string, _args: unknown, ok: boolean) => console.error(`  · ${nom}${ok ? "" : " (error)"}`);
  if (demande.length) {
    console.log((await executerAgent(demande.join(" "), { llm, api, surOutil })).reponse);
    return;
  }
  let historique: Message[] = [];
  process.stderr.write("> ");
  for await (const ligne of console) {
    if (ligne.trim()) {
      const t = await executerAgent(ligne, { llm, api, historique, surOutil });
      historique = t.messages;
      console.log(t.reponse);
    }
    process.stderr.write("> ");
  }
}

/** Workflows: same tools as the MCP server (a single owner of the calls). */
async function flux([action, ...args]: string[]) {
  const api = apiDepuisEnv();
  const lancer = (nom: string, a: Record<string, unknown> = {}) => outil(nom)!.executer(api, a);
  let r: unknown;
  if (!action) r = await lancer("lister_automatisations");
  else if (action === "catalog" || action === "catalogue") r = await lancer("catalogue_automatisation");
  else if (action === "import" || action === "importer") {
    const chemin = args[0] ?? erreur("file missing: auto flows import <file.json>");
    const f = Bun.file(chemin);
    if (!(await f.exists())) erreur(`file not found: ${chemin}`);
    const j = (await f.json()) as Record<string, unknown>;
    // An n8n export is recognized by its shape (nodes, connections): converted by the API.
    r =
      Array.isArray(j.nodes) && j.connections
        ? await lancer("importer_n8n", { workflow: j })
        : await lancer("creer_automatisation", "definition" in j ? j : { nom: chemin, definition: j });
  } else if (action === "run" || action === "lancer") {
    const id = args[0] ?? erreur("identifier missing: auto flows run <id> [json]");
    r = await lancer("executer_automatisation", { id, donnees: args[1] ? JSON.parse(args[1]) : undefined });
  } else erreur(`unknown action: flows ${action}`);
  console.log(JSON.stringify(r, null, 2));
}

const [commande, ...reste] = Bun.argv.slice(2);
switch (commande) {
  case "agent":
    await agent(reste);
    break;
  case "mcp": {
    const s = new ServeurMcp(apiDepuisEnv());
    await s.servir(Bun.stdin.stream(), (l) => process.stdout.write(`${l}\n`));
    break;
  }
  case "flows":
  case "flux":
    await flux(reste);
    break;
  case "tools":
  case "outils":
    for (const o of OUTILS) console.log(`${o.nom.padEnd(24)} ${o.description}`);
    break;
  case undefined:
  case "help":
  case "aide":
  case "--help":
  case "-h":
    console.log(AIDE);
    break;
  default:
    erreur(`unknown command: ${commande}\n\n${AIDE}`);
}
