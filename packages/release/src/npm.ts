// Human-free npm for the whole monorepo. No secret value is displayed or passed in argv:
// the token lives in the env-kit vault (NPM_TOKEN) and leaves it only through the env or the stdin of a child process.
//   bun packages/release/src/npm.ts status              whoami : coffre, PC, prd (root, agent), fr2, fr1 ; secret d'org GitHub
//   bun packages/release/src/npm.ts sync                vault -> Windows user env, aphrody-labs org secret, hosts' ~/.npmrc
//   bun packages/release/src/npm.ts inventory [--json]  publishable packages (src + apps/* submodules), published version
//   bun packages/release/src/npm.ts align [--write]     repository/publishConfig required by trusted publishing; unowned scopes -> private
//   bun packages/release/src/npm.ts login               npm login --auth-type=web in a PTY (separate session), the owner clicks
//   bun packages/release/src/npm.ts trust [--dry-run]   npm trust github for each published package (account 2FA required)
//   bun packages/release/src/npm.ts harden [--dry-run]  npm access set mfa=publish (2FA + tokens refused) on packages already on OIDC
//   bun packages/release/src/npm.ts pins [--write] [--push]  npm-publish.yml actions pinned by SHA (tag in a comment), updated
//                                          within the same major; --push commit + push to main (timer: just npm-pins-schedule)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..").replaceAll("\\", "/");
const ENV_KIT = join(ROOT, "packages/env-kit/src/cli.ts");
const REGISTRY = "https://registry.npmjs.org";
const OWNED = ["@aphrody", "@rosegriffon"]; // orgs npm dont <npm-owner> est owner (GET /-/org/<scope>/user)
const ORG = "aphrody-labs";
const WORKFLOW = "npm-publish.yml"; // name of the calling workflow, checked by npm on every OIDC publish
const SUBMODULES = ["apps/auto", "../rosegriffon", "../shenron"]; // the two products are sibling checkouts
/** Name duplicates: the canonical copy is shenron's (media domain). */
const CANONICAL: Record<string, string> = {
  "@aphrody/remotion": join(ROOT, "../shenron").replaceAll("\\", "/"),
  "@aphrody/hyperframes": join(ROOT, "../shenron").replaceAll("\\", "/"),
  "@aphrody/filmcraft": join(ROOT, "../shenron").replaceAll("\\", "/"),
};
const SESSION = join(
  process.env.LOCALAPPDATA ?? join(process.env.HOME ?? "~", ".local/share"),
  "aphrody",
  "npm-session.npmrc",
);
/** Hosts: role -> ssh argv. A role is a Host alias of ~/.ssh/config (address, jump host and key alias live there). */
const HOSTS: Record<string, string[]> = {
  "prd:root": ["prd"],
  "prd:agent": ["-l", "agent", "prd"],
  fr2: ["fr2"],
  fr1: ["fr1"],
};
const SECRET = /\bnpm_[A-Za-z0-9]{20,}/g;
const mask = (s: string) => s.replace(SECRET, "[secret]");

const run = (
  argv: string[],
  opts: { stdin?: string; cwd?: string; timeout?: number } = {},
) => {
  const r = Bun.spawnSync(argv, {
    cwd: opts.cwd,
    stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin),
    timeout: opts.timeout ?? 120_000,
  });
  return {
    code: r.exitCode,
    out: mask(r.stdout.toString()).trim(),
    err: mask(r.stderr.toString()).trim(),
  };
};
/** Command run with NPM_TOKEN from the vault in its env (env-kit secret exec). */
const withToken = (argv: string[], timeout?: number) =>
  run(["bun", ENV_KIT, "secret", "exec", "NPM_TOKEN", "--", ...argv], {
    timeout,
  });
/** Vault value on the command's stdin (env-kit secret pipe). */
const pipeToken = (argv: string[], timeout?: number) =>
  run(["bun", ENV_KIT, "secret", "pipe", "NPM_TOKEN", "--", ...argv], {
    timeout,
  });
const ssh = (h: string, cmd: string) => [
  "ssh",
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=20",
  ...HOSTS[h]!,
  cmd,
];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// ------------------------------------------------------------------------------------------------- inventaire
type Pkg = {
  path: string;
  repoRoot: string;
  slug: string;
  name: string;
  version: string;
  priv: boolean;
  json: any;
  indent: string;
};

const remoteSlug = (dir: string) => {
  const u =
    run(["git", "-C", dir, "remote", "get-url", "origin"]).out ||
    run(["git", "-C", dir, "remote", "get-url", "all"]).out;
  return u
    .replace(/^git\+/, "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
};

function scan(): Pkg[] {
  const roots = [
    ROOT,
    ...SUBMODULES.map((s) => join(ROOT, s).replaceAll("\\", "/")).filter((d) =>
      existsSync(join(d, ".git")),
    ),
  ];
  const pkgs: Pkg[] = [];
  for (const repoRoot of roots) {
    const slug = repoRoot === ROOT ? `${ORG}/src` : remoteSlug(repoRoot);
    const files = run([
      "git",
      "-C",
      repoRoot,
      "ls-files",
      "--",
      "*package.json",
    ])
      .out.split("\n")
      .filter((f) => /(^|\/)package\.json$/.test(f));
    for (const f of files) {
      if (
        /(^|\/)(node_modules|third_party|var|fixtures?|__fixtures__)\//.test(f)
      )
        continue;
      const abs = join(repoRoot, f);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, "utf8");
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }
      if (!json.name) continue;
      pkgs.push({
        path: relative(ROOT, dirname(abs)).replaceAll("\\", "/") || ".",
        repoRoot,
        slug,
        name: json.name,
        version: json.version ?? "0.0.0",
        priv: !!json.private,
        json,
        indent: /^\{\r?\n(\s+)/.exec(text)?.[1] ?? "  ",
      });
    }
  }
  return pkgs;
}

const scopeOf = (n: string) => (n.startsWith("@") ? n.split("/")[0]! : "");
const publishable = (p: Pkg) =>
  !p.priv &&
  OWNED.includes(scopeOf(p.name)) &&
  (!CANONICAL[p.name] || p.path.startsWith(CANONICAL[p.name]!));

async function latest(name: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}/latest`);
      return r.status === 200
        ? ((await r.json()) as { version: string }).version
        : null;
    } catch {
      await Bun.sleep(500);
    }
  }
  return null;
}

async function inventory(json: boolean) {
  const rows = [];
  for (const p of scan().filter(publishable))
    rows.push({
      name: p.name,
      path: p.path,
      repo: p.slug,
      version: p.version,
      npm: await latest(p.name),
    });
  if (json) return console.log(JSON.stringify(rows, null, 2));
  for (const r of rows)
    console.log(
      `${r.name}\t${r.version}\tnpm=${r.npm ?? "-"}\t${r.repo}\t${r.path}`,
    );
  console.log(
    `# ${rows.length} publishable, ${rows.filter((r) => r.npm).length} already on npm`,
  );
}

// ------------------------------------------------------------------------------------------------- alignement
function align(write: boolean) {
  let n = 0;
  for (const p of scan()) {
    const want: any = { ...p.json };
    const scope = scopeOf(p.name);
    const dup = CANONICAL[p.name] && !p.path.startsWith(CANONICAL[p.name]!);
    if (!p.priv && ((scope && !OWNED.includes(scope)) || dup)) {
      want.private = true; // unowned npm scope, or duplicate of a canonical package: never publishable
    } else if (publishable(p)) {
      const directory = relative(p.repoRoot, join(ROOT, p.path)).replaceAll(
        "\\",
        "/",
      );
      want.repository = {
        type: "git",
        url: `git+https://github.com/${p.slug}.git`,
        ...(directory ? { directory } : {}),
      };
      want.publishConfig = {
        ...(p.json.publishConfig ?? {}),
        access: "public",
        registry: `${REGISTRY}/`,
      };
    } else continue;
    const before = JSON.stringify(p.json);
    if (JSON.stringify(want) === before) continue;
    n++;
    console.log(`${write ? "written" : "to align"}\t${p.name}\t${p.path}`);
    if (write)
      writeFileSync(
        join(ROOT, p.path, "package.json"),
        `${JSON.stringify(want, null, p.indent)}\n`,
      );
  }
  console.log(
    `# ${n} package.json ${write ? "aligned" : "to align (--write)"}`,
  );
}

// ------------------------------------------------------------------------------------------------- token and hosts
async function status() {
  const out: Record<string, string> = {};
  const who = withToken([
    "bun",
    "-e",
    `const r=await fetch("${REGISTRY}/-/whoami",{headers:{authorization:"Bearer "+process.env.NPM_TOKEN}});console.log(r.status===200?(await r.json()).username:"invalide "+r.status)`,
  ]);
  out.vault = who.out || who.err;
  // The PC's ~/.npmrc reads ${NPM_TOKEN}: current value of the user env (a parent process may keep an old one).
  const env = { ...process.env } as Record<string, string>;
  if (process.platform === "win32")
    env.NPM_TOKEN = Bun.spawnSync([
      "pwsh",
      "-NoProfile",
      "-c",
      "[Environment]::GetEnvironmentVariable('NPM_TOKEN','User')",
    ])
      .stdout.toString()
      .trim();
  const pc = Bun.spawnSync([npm, "whoami"], {
    cwd: process.env.USERPROFILE ?? process.env.HOME,
    env,
  });
  out.pc = pc.exitCode === 0 ? pc.stdout.toString().trim() : "not signed in";
  for (const h of Object.keys(HOSTS)) {
    const r = run(
      ssh(
        h,
        "cd /tmp && PATH=$HOME/.bun/bin:$PATH nice -n 19 bun pm whoami 2>&1 | tail -1",
      ),
      { timeout: 90_000 },
    );
    out[h] = r.out || r.err.slice(0, 80);
  }
  out.github = run(["gh", "secret", "list", "--org", ORG])
    .out.split("\n")
    .find((l) => l.startsWith("NPM_TOKEN\t"))
    ? "org secret NPM_TOKEN present"
    : "missing";
  out.session = existsSync(SESSION)
    ? "interactive npm session present"
    : "pas de session (bun packages/release/src/npm.ts login)";
  console.log(JSON.stringify(out, null, 2));
}

const NPMRC =
  'umask 077; t=$(cat); touch ~/.npmrc; grep -v "^//registry.npmjs.org/:_authToken=" ~/.npmrc > ~/.npmrc.n; ' +
  'printf "//registry.npmjs.org/:_authToken=%s\\n" "$t" >> ~/.npmrc.n; mv ~/.npmrc.n ~/.npmrc; chmod 600 ~/.npmrc; ' +
  'curl -s -m 20 -H "Authorization: Bearer $t" https://registry.npmjs.org/-/whoami';

function sync() {
  const out: Record<string, unknown> = {};
  if (process.platform === "win32")
    out.userenv =
      pipeToken([
        "pwsh",
        "-NoProfile",
        "-c",
        "[Environment]::SetEnvironmentVariable('NPM_TOKEN', [Console]::In.ReadToEnd().Trim(), 'User')",
      ]).code === 0;
  out.github =
    pipeToken([
      "gh",
      "secret",
      "set",
      "NPM_TOKEN",
      "--org",
      ORG,
      "--visibility",
      "all",
    ]).code === 0;
  for (const h of Object.keys(HOSTS))
    out[h] = pipeToken(ssh(h, `bash -c '${NPMRC}'`), 90_000).out;
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------------------------------------- session interactive (2FA)
/** npm in a bun PTY: Enter sent to prompts, authentication URL opened at the owner's, status lines
 *  relayed (never a token). The session lives in a separate userconfig: ~/.npmrc keeps the vault token. */
async function pty(
  argv: string[],
  waitMin = 15,
): Promise<{ code: number; text: string }> {
  let text = "";
  const opened = new Set<string>();
  const term = new Bun.Terminal({
    cols: 300,
    rows: 50,
    data(_t, d) {
      const s = new TextDecoder()
        .decode(d)
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
      text += s;
      if (/press enter|appuyez sur entr|appuyez sur entrée/i.test(s)) term.write("\r");
      for (const url of s.match(
        /https:\/\/www\.npmjs\.com\/(?:login|auth)\/[^\s"']+/g,
      ) ?? []) {
        if (opened.has(url)) continue;
        opened.add(url);
        if (process.platform === "win32") Bun.spawn(["explorer.exe", url]);
      }
      for (const l of s.split(/\r?\n/)) {
        const x = mask(l).trim();
        if (
          x &&
          /http|logged|error|success|authent|otp|2fa|trust|created|exists|already/i.test(
            x,
          )
        )
          console.error(x.slice(0, 220));
      }
    },
  });
  const p = Bun.spawn(argv, { terminal: term });
  const timer = setTimeout(() => p.kill(), waitMin * 60_000);
  const code = await p.exited;
  clearTimeout(timer);
  term.close();
  return { code, text: mask(text) };
}

async function login() {
  mkdirSync(dirname(SESSION), { recursive: true });
  const r = await pty(
    [npm, "login", "--auth-type=web", `--userconfig=${SESSION}`],
    30,
  );
  console.log(
    JSON.stringify({
      login: r.code === 0,
      whoami: run([npm, "whoami", `--userconfig=${SESSION}`]).out,
    }),
  );
}

async function trust(dry: boolean) {
  const rows = scan().filter(publishable);
  const res: Record<string, string> = {};
  for (const p of rows) {
    if (!(await latest(p.name))) {
      res[p.name] =
        "missing from npm: first publish by the workflow (token), then trust";
      continue;
    }
    const list = run(
      [npm, "trust", "list", p.name, "--json", `--userconfig=${SESSION}`],
      {
        timeout: 60_000,
      },
    );
    if (
      /github/i.test(list.out) &&
      list.out.includes(p.slug) &&
      list.out.includes(WORKFLOW)
    ) {
      res[p.name] = "already configured";
      continue;
    }
    const argv = [
      npm,
      "trust",
      "github",
      p.name,
      "--file",
      WORKFLOW,
      "--repo",
      p.slug,
      "--allow-publish",
      "--allow-stage-publish",
      "-y",
      `--userconfig=${SESSION}`,
    ];
    if (dry) {
      res[p.name] = `dry-run : ${argv.slice(1, 8).join(" ")}`;
      continue;
    }
    const r = await pty(argv, 10);
    res[p.name] =
      r.code === 0
        ? "configured"
        : `failed ${r.code}: ${
            r.text
              .split("\n")
              .filter((l) => /error|ERR/i.test(l))
              .slice(-1)[0]
              ?.trim()
              .slice(0, 120) ?? ""
          }`;
  }
  console.log(JSON.stringify(res, null, 2));
}

/** mfa=publish = "Require two-factor authentication and disallow tokens": only trusted publishing stays possible.
 *  Applied only to packages whose latest version was published through OIDC (_npmUser.trustedPublisher). */
async function harden(dry: boolean) {
  const res: Record<string, string> = {};
  for (const p of scan().filter(publishable)) {
    const r = await fetch(`${REGISTRY}/${p.name.replace("/", "%2f")}/latest`);
    if (r.status !== 200) continue;
    const j = (await r.json()) as { _npmUser?: { trustedPublisher?: unknown } };
    if (!j._npmUser?.trustedPublisher) {
      res[p.name] = "latest version published by token: not yet";
      continue;
    }
    if (dry) {
      res[p.name] = "dry-run : npm access set mfa=publish";
      continue;
    }
    const x = await pty(
      [npm, "access", "set", "mfa=publish", p.name, `--userconfig=${SESSION}`],
      10,
    );
    res[p.name] = x.code === 0 ? "2FA + tokens refused" : `failed ${x.code}`;
  }
  console.log(JSON.stringify(res, null, 2));
}

// ------------------------------------------------------------------------------------------------- SHA pinning
/** npm-publish.yml workflow files: src + submodules that call it. */
const PIN_FILES = [
  ROOT,
  ...SUBMODULES.map((m) => join(ROOT, m).replaceAll("\\", "/")),
]
  .map((d) => ({ repo: d, file: join(d, ".github/workflows", WORKFLOW) }))
  .filter((x) => existsSync(x.file));
const gh = (path: string) => JSON.parse(run(["gh", "api", path]).out || "null");
const shaOf = (repo: string, ref: string) =>
  (gh(`repos/${repo}/commits/${ref}`) as { sha: string }).sha;

/** Latest stable release of the same major as `tag` (v7.0.1 -> the most recent v7.x.y). */
function latestInMajor(repo: string, tag: string): string {
  const major = /^v?(\d+)/.exec(tag)?.[1];
  const rel =
    (gh(`repos/${repo}/releases?per_page=50`) as {
      tag_name: string;
      prerelease: boolean;
      draft: boolean;
    }[]) ?? [];
  return (
    rel.find(
      (r) =>
        !r.prerelease &&
        !r.draft &&
        new RegExp(`^v?${major}\\.`).test(r.tag_name),
    )?.tag_name ?? tag
  );
}

function pins(write: boolean, push: boolean) {
  const USES =
    /uses: ([\w.-]+\/[\w.-]+)((?:\/[\w./-]+)?)@([0-9a-f]{40}|[\w.-]+)(?: # ([\w.\/-]+))?/g;
  const out: Record<string, string[]> = {};
  for (const { repo, file } of PIN_FILES) {
    const text = readFileSync(file, "utf8");
    const changes: string[] = [];
    const next = text.replace(
      USES,
      (m, action: string, sub: string, ref: string, comment?: string) => {
        let tag: string, sha: string;
        if (sub) {
          // reusable workflow of the monorepo: latest commit of main that modified it
          tag = "main";
          sha = (
            gh(
              `repos/${action}/commits?sha=main&path=${sub.slice(1)}&per_page=1`,
            ) as {
              sha: string;
            }[]
          )[0]!.sha;
        } else {
          tag = latestInMajor(action, comment ?? ref);
          sha = shaOf(action, tag);
        }
        const line = `uses: ${action}${sub}@${sha} # ${tag}`;
        if (line !== m)
          changes.push(`${action}${sub} ${comment ?? ref} -> ${tag}`);
        return line;
      },
    );
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    out[rel] = changes;
    if (!write || next === text) continue;
    writeFileSync(file, next);
    if (!push) continue;
    const wf = relative(repo, file).replaceAll("\\", "/");
    run(["git", "-C", repo, "add", "--", wf]);
    run([
      "git",
      "-C",
      repo,
      "commit",
      "-m",
      `npm-publish: actions pinned by SHA (${changes.join(", ")})`,
      "--",
      wf,
    ]);
    run(["git", "-C", repo, "pull", "--rebase", "--autostash"], {
      timeout: 300_000,
    });
    const p = run(["git", "-C", repo, "push", "origin", "HEAD:main"], {
      timeout: 300_000,
    });
    out[rel].push(
      p.code === 0 ? "pushed" : `push failed: ${p.err.slice(-160)}`,
    );
  }
  console.log(JSON.stringify(out, null, 2));
}

const [cmd = "status", ...args] = Bun.argv.slice(2);
const flag = (f: string) => args.includes(f);
switch (cmd) {
  case "status":
    await status();
    break;
  case "sync":
    sync();
    break;
  case "inventory":
    await inventory(flag("--json"));
    break;
  case "align":
    align(flag("--write"));
    break;
  case "login":
    await login();
    break;
  case "trust":
    await trust(flag("--dry-run"));
    break;
  case "harden":
    await harden(flag("--dry-run"));
    break;
  case "pins":
    pins(flag("--write") || flag("--push"), flag("--push"));
    break;
  default:
    console.error(
      "usage : bun packages/release/src/npm.ts status|sync|inventory [--json]|align [--write]|login|trust [--dry-run]|harden [--dry-run]|pins [--write] [--push]",
    );
    process.exit(2);
}
