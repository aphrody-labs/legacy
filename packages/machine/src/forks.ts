// aphrody-labs forks integrated into third_party/: origin = aphrody-labs fork, upstream = upstream project, extra
// remotes for third-party forks of the same network (one project = one clone, see docs/core/ARCHITECTURE-ROOT.md).
// Idempotent. The existing folder is found in src.lock.json by its URL (origin or upstream), otherwise the clone
// is created flat: third_party/<name> (blobless + Scalar through `ay git clone`).
// Usage (repository root): bun packages/machine/src/forks.ts [--check] [name...]   then: ay lock --lock-only
import { existsSync } from "node:fs";
import { join } from "node:path";

type Fork = {
  name: string;
  upstream: string;
  remotes?: Record<string, string>;
  sparse?: string[];
  fork?: string; // name of the aphrody-labs fork when it differs (collision, generic name)
  dir?: string; // chemin relatif hors third_party/ (apps/<x>/upstream/<nom> : site, GUI)
};
const gh = (r: string) => `https://github.com/${r}.git`;
const FORKS: Fork[] = [
  // NT / Linux compatibility (request of 2026-11-12)
  {
    name: "LiberNT",
    upstream: gh("LiberNT/LiberNT"),
    remotes: { reactos: gh("reactos/reactos") },
  },
  {
    name: "linux",
    upstream:
      "https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git",
  },
  { name: "wine", upstream: "https://gitlab.winehq.org/wine/wine.git" }, // GitHub fork of the wine-mirror/wine mirror
  // Shell et outils (remplacement de Git Bash, MSYS2, pwsh, WSL)
  {
    name: "coreutils",
    upstream: gh("microsoft/coreutils"),
    remotes: { uutils: gh("uutils/coreutils") },
  },
  {
    name: "intelligent-terminal",
    upstream: gh("microsoft/intelligent-terminal"),
    remotes: { terminal: gh("microsoft/terminal") },
  },
  ...[
    "microsoft/git",
    "uutils/findutils",
    "uutils/diffutils",
    "uutils/sed",
    "microsoft/edit",
    "microsoft/sudo",
    "microsoft/nvx",
    "microsoft/openvmm",
    "microsoft/litebox",
    "hyperlight-dev/hyperlight",
    "microsoft/mxc",
    "microsoft/WSL",
    "microsoft/winget-cli",
    "PowerShell/DSC",
    "PowerShell/PowerShell",
    "microsoft/microsoft-ui-xaml",
    "microsoft/WindowsAppSDK",
    "microsoft/react-native-windows",
    "microsoft/PowerToys",
    "microsoft/skill-recorder",
    "microsoft/Oryx",
    "microsoft/node-api-dotnet",
    "microsoft/tui-test",
    "microsoft/windows-rs",
    "microsoft/windows-drivers-rs",
    "microsoft/Windows-rust-driver-samples",
    "vercel-labs/fx",
    "vercel-labs/wterm",
    "vercel-labs/skills",
    "microsoft/vcpkg",
    // candidats sh/bash
    "reubeno/brush",
    "hex2f/gash",
    "magicant/yash-rs",
    "longbridge/nsh",
    "nixpulvis/oursh",
    "km-clay/shed",
    "mpecan/rable",
    "mayflower/wasmsh",
    "MrPicklePinosaur/shrs",
    "nushell/nushell",
    "fish-shell/fish-shell",
    // binutils (ELF/PE/COFF objects, linker)
    "wild-linker/wild",
    "gimli-rs/object",
    "gimli-rs/addr2line",
    "m4b/goblin",
    "rust-embedded/cargo-binutils",
    "lccc-project/lc-binutils",
    "m4b/bingrep",
  ].map((r) => ({ name: r.split("/")[1]!, upstream: gh(r) })),
  { name: "redox-binutils", upstream: gh("redox-os/binutils") },
  {
    name: "winget-pkgs",
    upstream: gh("microsoft/winget-pkgs"),
    sparse: [
      "/*",
      "!/*/",
      "/Tools/",
      "/doc/",
      "/manifests/u/Unixwin/",
      "/manifests/m/Microsoft/Coreutils/",
    ],
  },
  { name: "webui", upstream: gh("microsoft/webui") },
  // Browsers, automation and crawl (2026-11-13), facade packages/chromium-bun/src/engines. Clones already
  // present (playwright, puppeteer, crawlee, apify-sdk-js, obscura, lightpanda, servo, blitz, stylo, taffy) keep
  // origin = upstream and remote aphrody = fork; only the new ones go through here.
  ...[
    "microsoft/playwright-python",
    "apify/apify-sdk-python",
    "apify/apify-cli",
    "apify/apify-client-js",
    "apify/apify-client-python",
    "apify/crawlee-python",
    "ChromeDevTools/chrome-devtools-mcp",
    "GoogleChromeLabs/chrome-for-testing",
    "DioxusLabs/anyrender",
    "DioxusLabs/dioxus",
    "DioxusLabs/dioxus-components",
    "DioxusLabs/accessibility-cli",
    "DioxusLabs/blitz-chrome-devtools-frontend",
  ].map((r) => ({ name: r.split("/")[1]!, upstream: gh(r) })),
  {
    name: "wayland-c",
    upstream: "https://gitlab.freedesktop.org/wayland/wayland.git",
  },
  // Central terminal stack (2026-11-13): intelligent-terminal and its dependencies (tools/wta,
  // vcpkg.json, dep/nuget/packages.config), Rust/Zig/terminal/UI repositories of the anomalyco, vercel-labs and
  // owner's Microsoft list orgs. See docs/native/terminal/ARCHITECTURE.md.
  ...[
    "agentclientprotocol/agent-client-protocol",
    "ratatui/ratatui",
    "crossterm-rs/crossterm",
    "joshka/tui-markdown",
    "fmtlib/fmt",
    "microsoft/GSL",
    "open-source-parsers/jsoncpp",
    "CLIUtils/CLI11",
    "commonmark/cmark",
    "microsoft/wil",
    "microsoft/cppwinrt",
    "microsoft/inshellisense",
    "anomalyco/terminal-control",
    "anomalyco/ghostty-web",
    "anomalyco/rune",
    "anomalyco/strobe",
    "anomalyco/rift",
    "anomalyco/opentunnel",
    "anomalyco/hokum",
    "anomalyco/hex",
    "anomalyco/isocast",
    "anomalyco/deadbolt",
    "anomalyco/flicks",
    "anomalyco/clip",
    "anomalyco/opencode",
    "anomalyco/opentui",
    "anomalyco/models.dev",
    "anomalyco/openauth",
    "anomalyco/browse",
    "anomalyco/browser-control",
    "vercel-labs/native",
    "vercel-labs/just-bash",
    "vercel-labs/opensrc",
    "vercel-labs/bincode-fork",
    "vercel-labs/virtue-fork",
    "vercel-labs/mdxjs-rs-turbopack",
    "microsoft/oxidizer",
    "microsoft/amplifier-constellation-instance",
    "microsoft/DevSkim",
    "microsoft/fast",
  ].map((r) => ({ name: r.split("/")[1]!, upstream: gh(r) })),
  { name: "acp-rust-sdk", upstream: gh("agentclientprotocol/rust-sdk") }, // aphrody-labs/rust-sdk = MCP
  { name: "microsoft-skills", upstream: gh("microsoft/skills") }, // aphrody-labs/skills = vercel-labs
  {
    name: "mcp-for-beginners",
    upstream: gh("microsoft/mcp-for-beginners"),
    // 2.8 GB including translations/ and translated_images/: English courses only (cone, root included).
    sparse: [
      "00-Introduction",
      "01-CoreConcepts",
      "02-Security",
      "03-GettingStarted",
      "04-PracticalImplementation",
      "05-AdvancedTopics",
      "06-CommunityContributions",
      "07-LessonsfromEarlyAdoption",
      "08-BestPractices",
      "09-CaseStudy",
      "10-StreamliningAIWorkflowsBuildingAnMCPServerWithAIToolkit",
      "11-MCPServerHandsOnLabs",
      "12-tooling",
    ],
  },
  // Node.js (V8): official binaries through `ay rt`; here only the lib/ and src/ source (repository of several GB).
  {
    name: "node",
    upstream: gh("nodejs/node"),
    sparse: ["lib", "src", "doc/api"],
  },
  // JavaScriptCore de bun (fork oven-sh/WebKit, 13 Go) : moteur JS, WTF et bmalloc seulement.
  {
    name: "WebKit",
    upstream: gh("oven-sh/WebKit"),
    remotes: { webkit: gh("WebKit/WebKit") },
    // `ay git clone --sparse` applies `git sparse-checkout set` in cone mode: folders, not patterns.
    sparse: [
      "Source/JavaScriptCore",
      "Source/WTF",
      "Source/bmalloc",
      "Source/cmake",
    ],
  },
  // unixwin ecosystem (2026-11-13): all repositories of the org. Code and
  // data in third_party/<name>; site and GUI in apps/unixwin/upstream/<name>; build and installation by
  // scripts/unixwin (just unixwin-*). unixwin/codex is not a clone: remote `unixwin` of third_party/codex.
  ...[
    "niubash",
    "rubash",
    "WinuxCmd",
    "niu-git",
    "ruline",
    "oh-my-niu",
    "shellbench",
    "diffcorpus",
    "wpm-source",
    "wpm-artifacts",
    "winuxcmd-i18n",
    "winuxsh-profiles",
  ].map((n) => ({ name: n, upstream: gh(`unixwin/${n}`) })),
  { name: "unixwin-github", upstream: gh("unixwin/.github") }, // org profile; ".github" reserved on the aphrody-labs side
  // Signed APT archive: out of the chain (docs/native/deps/POLICY.md: never apt); scripts and metadata, no packages.
  {
    name: "unixwin-apt",
    upstream: gh("unixwin/apt"),
    sparse: [".github", "conf", "meta"],
  },
  ...["unixwin.dev", "wpm-gui"].map((n) => ({
    name: n,
    upstream: gh(`unixwin/${n}`),
    dir: `apps/unixwin/upstream/${n}`,
  })),
];

const repo = join(import.meta.dir, "..", "..", "..");
const check = process.argv.includes("--check");
// Filtre optionnel : noms de forks en arguments (bun forks.ts --check niubash rubash).
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--")));
const norm = (u = "") =>
  u
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
const lock = (await Bun.file(join(repo, "src.lock.json")).json()) as {
  repositories: Record<string, { url?: string; upstream_url?: string }>;
};
const run = (cwd: string, ...a: string[]) => {
  const p = Bun.spawnSync(a, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: p.exitCode === 0,
    out: p.stdout.toString().trim(),
    err: p.stderr.toString().trim(),
  };
};

let drift = 0;
for (const f of FORKS) {
  if (only.size && !only.has(f.name)) continue;
  const origin = gh(`aphrody-labs/${f.fork ?? f.name}`);
  const want: Record<string, string> = {
    origin,
    upstream: f.upstream,
    ...f.remotes,
  };
  const urls = new Set(Object.values(want).map(norm));
  const found = Object.entries(lock.repositories).find(
    ([, v]) => urls.has(norm(v.url)) || urls.has(norm(v.upstream_url)),
  )?.[0];
  const rel = found ?? f.dir ?? `third_party/${f.name}`;
  const dir = join(repo, rel);
  if (!existsSync(join(dir, ".git"))) {
    drift++;
    console.log(`missing ${rel}`);
    if (check) continue;
    const args = [
      "ay",
      "git",
      "clone",
      "-d",
      "1",
      ...(f.sparse ?? []).flatMap((s) => ["--sparse", s]),
      "--",
      origin,
      dir,
    ];
    const c = run(repo, ...args);
    if (!c.ok) {
      console.log(`  ERREUR clone : ${c.err.split("\n").pop()}`);
      continue;
    }
  }
  for (const [name, url] of Object.entries(want)) {
    const cur = run(dir, "git", "remote", "get-url", name);
    if (cur.ok && norm(cur.out) === norm(url)) continue;
    drift++;
    console.log(
      `remote  ${rel} ${name}: ${cur.ok ? cur.out : "(missing)"} -> ${url}`,
    );
    if (!check)
      run(dir, "git", "remote", cur.ok ? "set-url" : "add", name, url);
  }
}
console.log(
  `${FORKS.length} forks, ${drift} drift(s)${check ? "" : " fixed"}`,
);
process.exit(check && drift ? 1 : 0);
