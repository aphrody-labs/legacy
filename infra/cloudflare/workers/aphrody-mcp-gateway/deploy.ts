// Deploys the gateway Worker with the Cloudflare REST API (no wrangler): bundle, upload (existing secrets kept), R2 bucket +
// binding, custom domain, secrets. Run with the vault values in the environment, never printed:
//   bun packages/env-kit/src/cli.ts secret exec CLOUDFLARE_API_TOKEN APHRODY_OWNER_GOOGLE_ACCOUNT [GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET] -- bun infra/cloudflare/workers/aphrody-mcp-gateway/deploy.ts
// Secrets set when present in the env: OWNER_GOOGLE_ACCOUNT (from APHRODY_OWNER_GOOGLE_ACCOUNT), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// RELAY_TOKEN is read from fr2 (/etc/aphrody/relay.env) over ssh, OAUTH_SECRET is generated on first deploy.
import { join } from "node:path";

const NAME = "aphrody-mcp-gateway";
const HOST = "mcp.aphrody.com";
const BUCKET = "aphrody-skills-archive";
const ORIGIN = "https://mcp-origin.aphrody.com";
const dir = import.meta.dir;
const toml = Bun.TOML.parse(await Bun.file(join(dir, "../../cloudflare.toml")).text()) as any;
const A: string = toml.account;
const Z: string = toml.zones["aphrody.com"];
const tok = Bun.env.CLOUDFLARE_API_TOKEN;
if (!tok) throw new Error("CLOUDFLARE_API_TOKEN missing (vault)");

const call = async (method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, body, headers: { authorization: `Bearer ${tok}`, ...headers } });
  const j: any = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
  return j.result;
};
const jcall = (m: string, p: string, o?: unknown) => call(m, p, o === undefined ? undefined : JSON.stringify(o), { "content-type": "application/json" });

// 1. R2 bucket (idempotent).
const buckets = await jcall("GET", `/accounts/${A}/r2/buckets`);
if (!buckets.buckets?.some((b: any) => b.name === BUCKET)) {
  await jcall("POST", `/accounts/${A}/r2/buckets`, { name: BUCKET });
  console.log(`r2 bucket ${BUCKET} created`);
}

// 2. Bundle + upload.
const built = await Bun.build({ entrypoints: [join(dir, "index.ts")], target: "browser", format: "esm", minify: true });
if (!built.success) throw new Error(built.logs.join("\n"));
const code = await built.outputs[0].text();
const meta = {
  main_module: "index.js",
  compatibility_date: "2026-11-01",
  keep_bindings: ["secret_text"],
  bindings: [
    { type: "plain_text", name: "ORIGIN_URL", text: ORIGIN },
    { type: "r2_bucket", name: "ARCHIVE", bucket_name: BUCKET },
  ],
};
const form = new FormData();
form.set("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
form.set("index.js", new Blob([code], { type: "application/javascript+module" }), "index.js");
await call("PUT", `/accounts/${A}/workers/scripts/${NAME}`, form);
console.log(`worker ${NAME} uploaded (${code.length} bytes)`);

// 3. Secrets.
const setSecret = async (name: string, value: string) => {
  await jcall("PUT", `/accounts/${A}/workers/scripts/${NAME}/secrets`, { name, text: value, type: "secret_text" });
  console.log(`secret ${name}: set`);
};
const have = new Set<string>((await jcall("GET", `/accounts/${A}/workers/scripts/${NAME}/secrets`)).map((s: any) => s.name));
if (!have.has("OAUTH_SECRET")) await setSecret("OAUTH_SECRET", Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"));
const ssh = Bun.spawnSync(["ssh", "-o", "BatchMode=yes", "fr2", "sudo awk -F= '/^RELAY_TOKEN=/{print $2}' /etc/aphrody/relay.env"], { stdout: "pipe", stderr: "ignore" });
const relay = ssh.stdout.toString().trim();
if (relay.length >= 32) await setSecret("RELAY_TOKEN", relay);
else console.log("RELAY_TOKEN: fr2 unreachable, existing value kept");
for (const [env, name] of [["APHRODY_OWNER_GOOGLE_ACCOUNT", "OWNER_GOOGLE_ACCOUNT"], ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"], ["GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"]] as const)
  if (Bun.env[env]) await setSecret(name, Bun.env[env]!);
  else if (!have.has(name)) console.log(`secret ${name}: MISSING (set ${env} in the vault and redeploy)`);

// 4. Custom domain.
await jcall("PUT", `/accounts/${A}/workers/domains`, { hostname: HOST, service: NAME, zone_id: Z, environment: "production" });
console.log(`domain ${HOST} -> ${NAME}`);
