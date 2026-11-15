#!/usr/bin/env bun
// Adopt the official Google skills into .agents/skills (the single source of skills) and adapt them to this machine.
//   bun scripts/skills-adopt.ts          regenerate every adopted skill + google-skills-index from the third_party pins
//   bun scripts/skills-adopt.ts --check  exit 1 when a generated skill differs from what is on disk
// Upstreams (pins in src.lock.json; bump with `git -C third_party/<name> fetch && checkout`, then `ay lock`):
//   google/skills, google-gemini/gemini-skills, ChromeDevTools/chrome-devtools-mcp.
// Each skill is regenerated, never hand edited: change the notes/edits below. An edit whose anchor vanished
// upstream throws, so a bump that rewrites a section is noticed instead of silently dropped.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SKILLS = join(ROOT, ".agents/skills");
const CHECK = process.argv.includes("--check");

const REPOS = {
  "google-skills": "google/skills",
  "gemini-skills": "google-gemini/gemini-skills",
  "chrome-devtools-mcp": "ChromeDevTools/chrome-devtools-mcp",
} as const;
type Repo = keyof typeof REPOS;

const git = (repo: Repo, ...a: string[]) => {
  const r = Bun.spawnSync(["git", "-C", join(ROOT, "third_party", repo), ...a], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${a.join(" ")} (${repo}): ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
};
const pins = Object.fromEntries(
  (Object.keys(REPOS) as Repo[]).map((r) => [r, { sha: git(r, "rev-parse", "HEAD").slice(0, 10), date: git(r, "log", "-1", "--format=%cs") }]),
) as Record<Repo, { sha: string; date: string }>;

// ---- edit helpers: each anchor must exist upstream
type Edit = (s: string) => string;
const rep =
  (from: string, to: string): Edit =>
  (s) => {
    if (!s.includes(from)) throw new Error(`anchor not found: ${from.slice(0, 70)}`);
    return s.split(from).join(to);
  };
const between =
  (start: string, end: string | null, to: string): Edit =>
  (s) => {
    const i = s.indexOf(start);
    if (i < 0) throw new Error(`anchor not found: ${start.slice(0, 70)}`);
    const j = end === null ? s.length : s.indexOf(end, i + start.length);
    if (j < 0) throw new Error(`end anchor not found: ${end!.slice(0, 70)}`);
    return s.slice(0, i) + to + s.slice(j);
  };

// ---- local notes
const CLOUD_NOTES = `## Local setup (aphrody)

- Shell is niubash on Windows. \`gcloud\` is installed (\`command -v gcloud\`); never install or update it or its components without the owner's consent.
- Accounts: no ad hoc \`gcloud auth login\`. List principals and configurations with the relay tool \`gcloud_accounts\` (read-only) or \`env-kit accounts status\`, billing with \`env-kit billing\`. Pass \`--account\` and \`--project\` explicitly.
- Secrets (API keys, tokens) come from \`.env\` through env-kit only (\`bun --env-file=.env ...\`); never print, log or commit them.
- Tools: \`xh --ignore-stdin\` for curl (\`-b\` body only; \`k==v\` query, \`k=v\` JSON field, \`Header:value\`), \`jaq\` for jq, \`rg\`/\`fd\`/Read for grep/find/cat, \`sd\` for sed. Scripts run with \`bun x.ts\` or \`uv run x.py\`; no node, npx, pip or bunx.
- Fleet: fr1 builds, prd production, fr2 tests, lint, benchmarks, sync and research without limits (its edge services stay up). From the PC only read or dry-run; no heavy build.
- \`load_skill_resource(skill_name=..., file_path=...)\` below means: Read that file under this skill's directory.`;

const GEMINI_NOTES = `## Local setup (aphrody)

- Keys: \`GEMINI_API_KEY\` (and \`GOOGLE_API_KEY\`) live in \`.env\`, loaded by env-kit (\`bun --env-file=.env ...\`, \`uv run --env-file .env ...\`); never print them. Agents also reach Gemini through the relay (\`gemini_ask\`, \`agy_ask\`, skill \`gemini-review\`).
- Packages: \`bun add @google/genai\` (TypeScript), \`uv add google-genai\` or \`uv pip install -U google-genai\` (Python). No npm, pip, node or bunx.
- Tools: \`jaq\` for jq, \`xh --ignore-stdin\` for curl. Model ids and SDK versions below were current at the pin above; re-read the upstream file after a bump.
- Antigravity: there is no official skills repo for it. \`agy --help\` is the reference; our own skills and the relay cover it.`;

const CHROME_NOTES = `## Local setup (aphrody)

- Chrome DevTools MCP sits behind the relay, not in the client's tool list: \`hub_tools\` (server \`chrome-devtools\`) to list, \`hub_call\` with \`name: "chrome-devtools__<tool>"\` and the tool's arguments (e.g. \`chrome-devtools__take_snapshot\` with \`{ "pageId": 1 }\`). Wherever this text says "call \`<tool>\`", use that form.
- The server is the \`[[hub.mcp]] chrome-devtools\` entry of \`infra/agents/toolchain.toml\`: headless, isolated profile, \`--memoryDebugging --categoryExtensions --categoryNetworkMocks\`, Google usage statistics off. Installed with \`bun add -g chrome-devtools-mcp\` (1.13.0); the shell CLI \`chrome-devtools\` ships with it.
- The owner's logged-in Chrome is not reachable from it: use claude-in-chrome or agent-browser (skills \`agent-browser\`, \`browser-engines\`). To debug a Chromium build of this repo, start \`headless_shell --remote-debugging-port=9222 <url>\` (skill \`chromium\`) and point a separate server at it with \`--browserUrl http://127.0.0.1:9222\`.
- Large outputs: pass \`filePath\`, then Read or \`rg\` the file; filter JSON with \`jaq\` or \`bun -e\`. No node, npx or bunx.`;

const CLI_NOTES = `## Local setup (aphrody)

- \`chrome-devtools\` is \`~/.bun/bin/chrome-devtools.exe\` (\`bun add -g chrome-devtools-mcp\`, 1.13.0). Its background server is separate from the relay's \`chrome-devtools\` hub entry; prefer \`hub_call\` (skill \`chrome-devtools\`) from an agent and this CLI for shell scripts.
- Output goes to files with \`--filePath\`; read them with Read or \`rg\`, filter JSON with \`jaq\`. Scripts: \`bun x.ts\`; no node, npx or bunx.`;

// ---- items
interface Item {
  repo: Repo;
  path: string; // relative to the repo root
  name: string; // destination skill name
  description: string;
  hidden?: boolean;
  notes: string;
  skill?: Edit[];
  files?: Record<string, Edit[]>; // other files, relative to the skill dir
}

const GCP = "plugins/cloud/google-cloud-developer/skills";
const AP = "skills/cloud";
const CD = "skills";

const items: Item[] = [
  {
    repo: "google-skills",
    path: `${GCP}/gcloud`,
    name: "gcloud",
    description:
      "Guardrails for any gcloud CLI command: validate syntax with `gcloud help <leaf>`, reduce output (--limit/--filter/--format), --quiet, --dry-run, denylist (IAM, billing, delete, kms). Not for client-library or raw REST code.",
    notes: CLOUD_NOTES,
  },
  {
    repo: "google-skills",
    path: `${GCP}/google-cloud-recipe-auth`,
    name: "google-cloud-recipe-auth",
    description:
      "Authenticate and authorize to Google Cloud: IAM, human users, service accounts, ADC, impersonation, Workload Identity Federation, API keys, OIDC ID tokens.",
    notes: CLOUD_NOTES,
  },
  {
    repo: "google-skills",
    path: `${GCP}/google-cloud-recipe-onboarding`,
    name: "google-cloud-recipe-onboarding",
    description:
      "First steps on Google Cloud for one developer: account, gcloud auth, first project, billing link. Not for enterprise org setup or multi-project architectures.",
    notes: CLOUD_NOTES,
    skill: [rep("which gcloud", "command -v gcloud")],
  },
  {
    repo: "google-skills",
    path: `${GCP}/retrieving-developer-knowledge`,
    name: "retrieving-developer-knowledge",
    description:
      "Search official Google developer docs (Cloud, Gemini/AI, Android, Chrome, Web, Firebase) through the Developer Knowledge MCP or REST API: gcloud syntax, API details, IAM permissions, product comparisons.",
    notes: CLOUD_NOTES,
    skill: [
      rep("Execute a REST API request via `curl` against", "Execute a REST API request via `xh` (see below) against"),
      between(
        "### 2. REST API Fallback",
        "## Synthesis & Output Guidelines",
        `### 2. REST API Fallback
When the MCP tools are absent, query \`https://developerknowledge.googleapis.com/v1\` with \`xh --ignore-stdin -b\` (\`k==v\` is a query parameter, \`k=v\` a JSON string field, \`Header:value\` a header). Two credentials work; try them in this order.

**An existing Google credential, preferred.** Pick the principal with \`gcloud_accounts\` or \`env-kit accounts status\`, then pass a bearer token and quota project:

\`\`\`bash
xh --ignore-stdin -b POST https://developerknowledge.googleapis.com/v1:answerQuery \\
  "Authorization:Bearer $(gcloud auth print-access-token)" \\
  "X-Goog-User-Project:$(gcloud config get-value project 2>/dev/null)" \\
  query="How do I configure public read access on Cloud Storage?"
\`\`\`

If that fails (401, 403, any credential error), substitute \`gcloud auth application-default print-access-token\` and try again: treat the auth error as a reason to try the application-default credential, not as a failed lookup.

**An API key, if one is configured.** \`DEVELOPERKNOWLEDGE_API_KEY\` comes from \`.env\` (env-kit), sent as the \`X-Goog-Api-Key\` header so it never lands in a URL or a log. If neither credential exists, say you need a credential (create a key with the [Developer Knowledge quickstart](https://developers.google.com/knowledge/quickstart), store it with \`env-kit set\`) rather than answering without a lookup. Examples with the key:

- **Answer Query** (limited quota; on HTTP 429 use search instead):
  \`\`\`bash
  xh --ignore-stdin -b POST https://developerknowledge.googleapis.com/v1:answerQuery \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}" \\
    query="How do I configure public read access on Cloud Storage?"
  \`\`\`
- **Search Document Chunks** (2-5 focused keywords):
  \`\`\`bash
  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents:searchDocumentChunks \\
    query=="gcloud logging metrics create" "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"
  \`\`\`
- **Get Document**:
  \`\`\`bash
  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"
  \`\`\`
- **Batch Get Documents** (a GET, one \`names\` parameter per document, up to 20 per call):
  \`\`\`bash
  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents:batchGet \\
    names==documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run \\
    names==documents/docs.cloud.google.com/storage/docs/creating-buckets \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"
  \`\`\`

`,
      ),
    ],
    files: {
      "references/api-fallback.md": [
        rep("**Example `curl`**", "**Example `xh`**"),
        rep(
          `  curl -s -X POST "https://developerknowledge.googleapis.com/v1:answerQuery?key=\${DEVELOPERKNOWLEDGE_API_KEY}" \\
    -H "Content-Type: application/json" \\
    -d '{"query": "How do I create a custom metric in Cloud Logging?"}'`,
          `  xh --ignore-stdin -b POST https://developerknowledge.googleapis.com/v1:answerQuery \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}" \\
    query="How do I create a custom metric in Cloud Logging?"`,
        ),
        rep(
          `  curl -s "https://developerknowledge.googleapis.com/v1/documents:searchDocumentChunks?query=gcloud+logging+metrics+create&key=\${DEVELOPERKNOWLEDGE_API_KEY}"`,
          `  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents:searchDocumentChunks \\
    query=="gcloud logging metrics create" "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"`,
        ),
        rep(
          `  curl -s "https://developerknowledge.googleapis.com/v1/documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run?key=\${DEVELOPERKNOWLEDGE_API_KEY}"`,
          `  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"`,
        ),
        rep(
          `  curl -s -G "https://developerknowledge.googleapis.com/v1/documents:batchGet" \\
    --data-urlencode "names=documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run" \\
    --data-urlencode "names=documents/docs.cloud.google.com/run/docs/configuring/services/environment-variables" \\
    --data-urlencode "key=\${DEVELOPERKNOWLEDGE_API_KEY}"`,
          `  xh --ignore-stdin -b https://developerknowledge.googleapis.com/v1/documents:batchGet \\
    names==documents/docs.cloud.google.com/run/docs/overview/what-is-cloud-run \\
    names==documents/docs.cloud.google.com/run/docs/configuring/services/environment-variables \\
    "X-Goog-Api-Key:\${DEVELOPERKNOWLEDGE_API_KEY}"`,
        ),
      ],
    },
  },
  {
    repo: "google-skills",
    path: `${GCP}/finding-google-skills`,
    name: "finding-google-skills",
    hidden: true,
    description: "Live lookup of Google's published skill catalog (index.json) when google-skills-index has no match.",
    notes: `## Local setup (aphrody)

- Entry point only: \`google-skills-index\` lists the skills locally first. Use this one for a live lookup.
- Fetch the catalog with \`xh --ignore-stdin -b https://raw.githubusercontent.com/google/skills/main/index.json\`; filter with \`jaq\` instead of jq (\`jaq -r '.skills[] | select((.name+" "+.description)|test("gke";"i")) | "\\(.name)\\t\\(.entrypoint)"'\`). Everything else in this text that says curl, wget, node or PowerShell means \`xh\`, \`jaq\` and \`bun -e\`.
- Never disable certificate verification, never keep the catalog beyond the request.`,
  },
  {
    repo: "google-skills",
    path: `${AP}/agent-platform-deploy`,
    name: "agent-platform-deploy",
    description:
      "Deploy Model Garden open models or custom weights to Agent Platform endpoints, check deployment operations, cost and quota errors, undeploy and clean up. For listing endpoints or evals use google-skills-index.",
    notes: CLOUD_NOTES,
    skill: [
      rep("python3 scripts/calculate_cost.py", "uv run scripts/calculate_cost.py"),
      rep(
        `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  "https://\${ENDPOINT_URL}/v1beta1/projects/\${PROJECT_ID}/locations/\${LOCATION_ID}/endpoints/\${ENDPOINT_ID}/chat/completions" \\
  -d '{
    "model": "'"$ENDPOINT_ID"'",
    "messages": [
      {
        "role": "user",
        "content": "'"$PROMPT"'"
      }
    ]
  }'`,
        `xh --ignore-stdin -b POST \\
  "https://\${ENDPOINT_URL}/v1beta1/projects/\${PROJECT_ID}/locations/\${LOCATION_ID}/endpoints/\${ENDPOINT_ID}/chat/completions" \\
  "Authorization:Bearer $(gcloud auth print-access-token)" \\
  model="$ENDPOINT_ID" \\
  "messages:=[{\\"role\\": \\"user\\", \\"content\\": \\"$PROMPT\\"}]"`,
      ),
    ],
  },
  {
    repo: "google-skills",
    path: `${AP}/agent-platform-architecture`,
    name: "agent-platform-architecture",
    description:
      "Design and validate enterprise Gemini platform architectures: multi-project layouts, Agent Gateway, ACT egress, Secure Web Proxy, UAP/SGP governance, Model Armor, Agent Runtime identity. Not for log triage or generic IAM debugging.",
    notes: CLOUD_NOTES,
  },

  // ---- gemini-skills
  {
    repo: "gemini-skills",
    path: "skills/gemini-api-dev",
    name: "gemini-api-dev",
    description:
      "Write code that calls the Gemini API (Python/TypeScript SDKs): text, chat, multimodal, image/video/TTS generation, streaming, function calling, structured output, agents, decisions, migration off generateContent. Carries the current model ids.",
    notes: GEMINI_NOTES,
    skill: [rep("`pip install -U google-genai`", "`uv pip install -U google-genai`"), rep("`npm install @google/genai`", "`bun add @google/genai`")],
  },
  {
    repo: "gemini-skills",
    path: "skills/gemini-live-api-dev",
    name: "gemini-live-api-dev",
    description:
      "Build real-time bidirectional streaming apps with the Gemini Live API (WebSocket audio/video/text, VAD, session management, ephemeral tokens, live transcription and translation) or migrate legacy Live models to Gemini 3.8 Live.",
    notes: GEMINI_NOTES,
    skill: [rep("`pip install -U google-genai`", "`uv pip install -U google-genai`"), rep("`npm install @google/genai`", "`bun add @google/genai`")],
  },
  {
    repo: "gemini-skills",
    path: "skills/gemini-api-cli",
    name: "gemini-api-cli",
    description:
      "Call the Gemini API from the shell with gemini-api: media generation (images, TTS, music, video), file and YouTube analysis, transcription, Deep Research, sandboxed agents.",
    notes: `${GEMINI_NOTES}
- \`gemini-api\` is installed at \`%LOCALAPPDATA%\\Programs\\gemini-api\\gemini-api.exe\` (asset \`gemini-api_Windows_x86_64.zip\` of google-gemini/gemini-api-cli). Check with \`command -v gemini-api\` and \`gemini-api whoami\`; the key resolved is the \`.env\` one only when env-kit exported it, so check \`whoami\` before a paid call.`,
    skill: [
      between(
        "```sh\n# macOS / Linux",
        "Credentials resolve in order",
        "Installed already on this PC (see Local setup). On another machine download the release zip for the platform from https://github.com/google-gemini/gemini-api-cli/releases and put the binary on PATH.\n\n",
      ),
      rep("| jq '", "| jaq '"),
    ],
  },
  {
    repo: "gemini-skills",
    path: "skills/gemini-omni-flash-api",
    name: "gemini-omni-flash-api",
    hidden: true,
    description:
      "Video generation and editing with Gemini Omni 1.2 Flash: text/image/video-to-video, frame transitions, extensions, ffmpeg prep scripts.",
    notes: `${GEMINI_NOTES}
- Entry point only (load by name when a video task comes up). Scripts are Python: run them as \`uv run --env-file .env --with google-genai scripts/<script>.py ...\` from this skill's directory (the text below says \`./scripts/...\`). \`ffmpeg\` and \`ffprobe\` are on PATH (WinGet).`,
    skill: [
      rep("```bash\n  pip install -U google-genai\n  ```", "```bash\n  uv pip install -U google-genai\n  ```"),
      rep('export GEMINI_API_KEY="your-api-key"', "# GEMINI_API_KEY comes from .env (env-kit); run scripts with: uv run --env-file .env --with google-genai scripts/..."),
      (s) => s.replace(/\.\/scripts\//g, "uv run --env-file .env --with google-genai scripts/"),
    ],
  },

  // ---- chrome-devtools-mcp
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/chrome-devtools`,
    name: "chrome-devtools",
    description:
      "Debug, inspect and automate a browser through Chrome DevTools MCP: snapshots, network, console, CSS, performance, emulation, extensions. Not for --slim mode.",
    notes: CHROME_NOTES,
    skill: [
      rep("`npx chrome-devtools-mcp@latest --help`", "`chrome-devtools-mcp --help`"),
      between(
        "> **Before proceeding**",
        "1. **Install**",
        "> Extension tools (`install_extension`, `list_extensions`, ...) need `--categoryExtensions`, already set in the `[[hub.mcp]] chrome-devtools` entry of `infra/agents/toolchain.toml`. If `hub_tools` (server `chrome-devtools`) does not list `install_extension`, run `just agents-sync` and restart the relay.\n\n",
      ),
    ],
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/chrome-devtools-cli`,
    name: "chrome-devtools-cli",
    description: "Write shell scripts or run shell commands that automate the browser or use Chrome DevTools through the chrome-devtools CLI.",
    notes: CLI_NOTES,
    files: {
      "references/installation.md": [
        rep("npm i chrome-devtools-mcp@latest -g", "bun add -g chrome-devtools-mcp"),
        between(
          "## Troubleshooting",
          null,
          `## Troubleshooting

- **Command not found:** \`~/.bun/bin\` (bun's global bin, holds \`chrome-devtools.exe\`) must be on PATH.
- **Old version running:** \`chrome-devtools stop && bun remove -g chrome-devtools-mcp\`, then \`bun add -g chrome-devtools-mcp\`.
- **Runtime:** the package declares node ^20.19 || ^22.12 || >=23 but runs under bun's shim (verified with 1.13.0: initialize and tools/list succeed). Report a crash instead of installing node.
`,
        ),
      ],
    },
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/a11y-debugging`,
    name: "a11y-debugging",
    description:
      "Accessibility debugging and auditing with Chrome DevTools MCP: semantic HTML, ARIA, focus, keyboard navigation, tap targets, color contrast (web.dev guidelines).",
    notes: CHROME_NOTES,
    skill: [
      rep("Use a CLI tool like `jq` or a Node.js one-liner", "Use `jaq` or a Bun one-liner"),
      rep('node -e "const r=require(', 'bun -e "const r=require('),
    ],
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/cookie-debugging`,
    name: "cookie-debugging",
    description:
      "Inspect and debug cookies, sessions and consent banners with Chrome DevTools MCP: 401/403, auth redirects, Set-Cookie, SameSite and Partitioned warnings.",
    notes: CHROME_NOTES,
    skill: [rep('node -e "const r=require(', 'bun -e "const r=require(')],
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/debug-optimize-lcp`,
    name: "debug-optimize-lcp",
    description: "Debug and optimize Largest Contentful Paint (LCP, Core Web Vitals, slow page load, hero image) with Chrome DevTools MCP traces.",
    notes: CHROME_NOTES,
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/inspect-in-devtools`,
    name: "inspect-in-devtools",
    description:
      "Open the Chrome DevTools UI to show an element, request or panel to the user, read their selection, and answer DevTools comment threads. Needs headed Chrome and --devtools-comments.",
    notes: `${CHROME_NOTES}
- Not usable through the relay entry: it is headless, and \`--devtools-comments\` exists in upstream main (pin above) but not in the published 1.13.0 that is installed (checked with \`chrome-devtools-mcp --help\`). Use it only after building the fork in \`third_party/chrome-devtools-mcp\` (gn/ninja, see its AGENTS.md) and starting that server headed in the owner's session.`,
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/memory-leak-debugging`,
    name: "memory-leak-debugging",
    description: "Find JavaScript memory leaks: capture, compare and inspect heap snapshots with Chrome DevTools MCP memory tools.",
    notes: CHROME_NOTES,
  },
  {
    repo: "chrome-devtools-mcp",
    path: `${CD}/troubleshooting`,
    name: "chrome-troubleshooting",
    description: "Fix Chrome DevTools MCP connection and target failures: list_pages, new_page or navigate_page errors, DevToolsActivePort, server will not start.",
    notes: CHROME_NOTES,
    skill: [
      rep("`.mcp.json`, `.vscode/mcp.json`, `gemini-extension.json`", "`infra/agents/toolchain.toml` (`[[hub.mcp]] chrome-devtools`, the relay's copy is `%LOCALAPPDATA%\\aphrody\\relay\\hub.json`), `.mcp.json`, `.vscode/mcp.json`, `gemini-extension.json`"),
      rep("Run `npx chrome-devtools-mcp@latest --help` to verify the installation and Node.js environment.", "Run `chrome-devtools-mcp --help` to verify the installation (`bun add -g chrome-devtools-mcp`; no node or npx)."),
      rep(
        "run `NODE_DEBUG=* npx chrome-devtools-mcp@latest --logFile=/tmp/cdm-test.log` to capture verbose logs.",
        "run `NODE_DEBUG=* chrome-devtools-mcp --headless --isolated --logFile=<abs path in the temp dir>` to capture verbose logs.",
      ),
    ],
  },
];

// ---- generation
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const scalar = (s: string) => (/^[\s>|&*!%@`'"\[{-]/.test(s) || /: |\s#/.test(s) ? JSON.stringify(s) : s);

const out = new Map<string, string | Buffer>(); // absolute path -> content
const SKIP = new Set(["node_modules", ".git"]);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

for (const it of items) {
  const srcDir = join(ROOT, "third_party", it.repo, it.path);
  const pin = pins[it.repo];
  const raw = lf(readFileSync(join(srcDir, "SKILL.md"), "utf8"));
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!m) throw new Error(`${it.path}: no frontmatter`);
  const version = /^\s+version:\s*"?([\w.]+)"?/m.exec(m[1]!)?.[1];
  let body = raw.slice(m[0].length).replace(/^\n+/, "");
  for (const e of it.skill ?? []) body = e(body);
  const header = `> Upstream: ${REPOS[it.repo]} \`${it.path}/SKILL.md\` @ ${pin.sha} (${pin.date})${version ? `, skill version ${version}` : ""}. Generated by \`bun scripts/skills-adopt.ts\`; edit the script, not this file.`;
  // no ": " in a plain scalar: naive frontmatter readers (agent CLIs) choke on it
  const fm = ["---", `name: ${it.name}`, `description: ${scalar(it.description.replaceAll(": ", " - "))}`, ...(it.hidden ? ["disable-model-invocation: true"] : []), "---"].join("\n");
  const dest = join(SKILLS, it.name);
  out.set(join(dest, "SKILL.md"), `${fm}\n\n${header}\n\n${it.notes}\n\n---\n\n${body.replace(/\s+$/, "")}\n`);
  const used = new Set<string>();
  for (const f of walk(srcDir)) {
    const rel = relative(srcDir, f).replaceAll("\\", "/");
    if (rel === "SKILL.md") continue;
    const buf = readFileSync(f);
    const edits = it.files?.[rel];
    if (edits) {
      let t = lf(buf.toString("utf8"));
      for (const e of edits) t = e(t);
      out.set(join(dest, rel), t);
      used.add(rel);
    } else out.set(join(dest, rel), buf);
  }
  for (const k of Object.keys(it.files ?? {})) if (!used.has(k)) throw new Error(`${it.name}: file edit target missing: ${k}`);
}

// ---- google-skills-index: every upstream skill that is not adopted, grouped by directory
{
  const repoDir = join(ROOT, "third_party/google-skills");
  const adopted = new Set(items.filter((i) => i.repo === "google-skills").map((i) => i.path));
  // skills/cloud/gcloud is the same skill as the plugin copy that is adopted
  adopted.add("skills/cloud/gcloud");
  // the skills/ tree carries copies of the plugin skills that are adopted (same folder name): list none of them
  const adoptedNames = new Set([...adopted].map((p) => p.slice(p.lastIndexOf("/") + 1)));
  const all = [...new Bun.Glob("**/SKILL.md").scanSync({ cwd: repoDir })].map((p) => dirname(p.replaceAll("\\", "/"))).sort();
  const groups = new Map<string, string[]>();
  let n = 0;
  for (const d of all) {
    if (adopted.has(d) || adoptedNames.has(d.slice(d.lastIndexOf("/") + 1))) continue;
    const parent = dirname(d);
    const g = groups.get(parent) ?? [];
    g.push(d.slice(parent.length + 1));
    groups.set(parent, g);
    n++;
  }
  const pin = pins["google-skills"];
  const catalog = [...groups].map(([p, names]) => `- \`${p}/\` (${names.length}): ${names.join(", ")}`).join("\n");
  const body = `---
name: google-skills-index
description: Index of the ${n} other official Google skills (Cloud products, Firebase, BigQuery, GKE, Ads, Analytics, Identity, Android, devices) with upstream paths. Load it when a Google product is a candidate and no loaded skill covers it, then read one skill by path.
---

> Upstream: ${REPOS["google-skills"]} @ ${pin.sha} (${pin.date}), ${all.length} SKILL.md in total, ${n} listed here. Generated by \`bun scripts/skills-adopt.ts\`; edit the script, not this file.

# Google skills index

Adopted and model-invocable already: \`gcloud\`, \`google-cloud-recipe-auth\`, \`google-cloud-recipe-onboarding\`, \`retrieving-developer-knowledge\`, \`agent-platform-deploy\`, \`agent-platform-architecture\` (Google Cloud); \`gemini-api-dev\`, \`gemini-api-cli\`, \`gemini-live-api-dev\` (Gemini); \`chrome-devtools\`, \`chrome-devtools-cli\`, \`a11y-debugging\`, \`cookie-debugging\`, \`debug-optimize-lcp\`, \`inspect-in-devtools\`, \`memory-leak-debugging\`, \`chrome-troubleshooting\` (Chrome). Entry points by name only: \`finding-google-skills\`, \`gemini-omni-flash-api\`. Kept as ours: \`google-labs-stitch-jules-design\`, \`jules-*\`, \`stitch-*\`.

## Use one

1. Pick by folder name below (each folder holds a \`SKILL.md\` whose frontmatter says when to use it).
2. Read \`third_party/google-skills/<dir>/<name>/SKILL.md\` (local clone pinned in \`src.lock.json\`). Not cloned: \`xh --ignore-stdin -b https://raw.githubusercontent.com/google/skills/main/<dir>/<name>/SKILL.md\`.
3. Follow it with this machine's rules: the "Local setup" section of the \`gcloud\` skill (accounts through \`gcloud_accounts\`/\`env-kit\`, secrets only from \`.env\`, \`xh\`/\`jaq\`/\`rg\` instead of curl/jq/grep, \`bun\`/\`uv\` instead of node/pip, fr1 builds, prd production, fr2 tests). Every skill that runs \`gcloud\` also reads its own \`references/attribution.md\`.
4. Nothing matches here: \`finding-google-skills\` fetches the live \`index.json\`. Antigravity has no official skills repo: \`agy --help\` and the relay tools \`agy_ask\`, \`gemini_ask\`.

## Catalog

${catalog}
`;
  out.set(join(SKILLS, "google-skills-index/SKILL.md"), body);
}

// ---- write or check
let drift = 0;
const names = new Set([...items.map((i) => i.name), "google-skills-index"]);
if (CHECK) {
  for (const [p, c] of out) {
    const cur = existsSync(p) ? readFileSync(p) : null;
    if (!cur || !cur.equals(Buffer.from(c))) {
      drift++;
      console.log(`drift: ${relative(ROOT, p)}`);
    }
  }
  process.exit(drift ? 1 : 0);
}
for (const n of names) rmSync(join(SKILLS, n), { recursive: true, force: true });
for (const [p, c] of out) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, c);
}
console.log(`${items.length} skills + index (${out.size} files); pins ${Object.entries(pins).map(([r, v]) => `${r}@${v.sha}`).join(" ")}`);
