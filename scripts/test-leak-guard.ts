// Runs `bun test <args>` and fails when its output contains a secret: a value of a secret-looking variable of the
// environment or of the monorepo .env, or a token-shaped string. It prints key names and shapes, never a value.
//   bun scripts/test-leak-guard.ts system/env-kit      (CI: the environment holds the repository secrets)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDotEnv, resolveMonorepoEnvPath } from "../system/env-kit/src/index.ts";

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PASSPHRASE)/i;
const SHAPES: [string, RegExp][] = [
  ["anthropic", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["github", /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/],
  ["google-api", /\bAIza[A-Za-z0-9_-]{30,}/],
  ["cloudflare", /\bcfat_[A-Za-z0-9]{20,}/],
  ["neon", /\bnapi_[A-Za-z0-9]{20,}/],
  ["figma", /\bfigd_[A-Za-z0-9_-]{20,}/],
  ["context7", /\bctx7sk-[A-Za-z0-9-]{20,}/],
  ["npm", /\bnpm_[A-Za-z0-9]{30,}/],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["url-credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]{8,}@/i],
];

const secrets = new Map<string, string>(); // value -> variable name
const add = (k: string, v: string | undefined) => {
  if (v && v.length >= 12 && SECRET_NAME.test(k)) secrets.set(v, k);
};
for (const [k, v] of Object.entries(process.env)) add(k, v);
try {
  const path = resolveMonorepoEnvPath();
  if (path && existsSync(path)) for (const [k, v] of Object.entries(parseDotEnv(readFileSync(path, "utf8")))) add(k, v);
} catch {
  /* no monorepo .env: the environment alone is checked */
}

const args = Bun.argv.slice(2);
const p = Bun.spawnSync(["bun", "test", ...args], { stdout: "pipe", stderr: "pipe", env: process.env, cwd: join(import.meta.dir, "..") });
const out = p.stdout.toString() + p.stderr.toString();
const leaks: string[] = [];
for (const [v, k] of secrets) if (out.includes(v)) leaks.push(`value of ${k}`);
for (const [name, re] of SHAPES) if (re.test(out)) leaks.push(`${name}-shaped string`);
if (leaks.length) {
  console.error(`test-leak-guard: the test output contains secrets (${[...new Set(leaks)].join(", ")}); output withheld`);
  process.exit(1);
}
process.stdout.write(out);
process.exit(p.exitCode ?? 0);
