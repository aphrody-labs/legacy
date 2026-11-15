// Provisions n8n (compose): credential to the auto API, workflows of infra/n8n/workflows published.
// Usage : bun scripts/n8n.ts <jeton auto_…>
const RACINE = new URL("..", import.meta.url);
const WORKFLOWS = new URL("infra/n8n/workflows/", RACINE);
export const N8N_URL = Bun.env.N8N_URL ?? "http://localhost:5678";
export const CREDENTIAL_ID = "autoApi000000001";

async function compose(...args: string[]) {
  const p = Bun.spawn(["docker", "compose", ...args], {
    cwd: Bun.fileURLToPath(RACINE),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`docker compose ${args.join(" ")} : ${err || out}`);
  return out;
}

export async function attendreN8n(timeoutMs = 120_000) {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    if (
      await fetch(`${N8N_URL}/healthz/readiness`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await Bun.sleep(1000);
  }
  throw new Error(`n8n unavailable at ${N8N_URL}`);
}

/** Webhooks register after /healthz/readiness: CORS probe without triggering a run. */
export async function attendreWebhook(chemin: string, timeoutMs = 60_000) {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    const r = await fetch(`${N8N_URL}/webhook/${chemin}`, {
      method: "OPTIONS",
      headers: { origin: N8N_URL, "access-control-request-method": "POST" },
    }).catch(() => null);
    if (r?.status === 204) return;
    await Bun.sleep(500);
  }
  throw new Error(`n8n webhook ${chemin} not registered`);
}

/** "auto API" credential (Bearer header), imported encrypted by n8n, then workflows imported and published. */
export async function provisionner(jeton: string) {
  if (
    !(await fetch(`${N8N_URL}/healthz`).then(
      (r) => r.ok,
      () => false,
    ))
  )
    await compose("up", "-d", "--wait", "n8n");
  const credential = [
    {
      id: CREDENTIAL_ID,
      name: "API auto",
      type: "httpHeaderAuth",
      data: { name: "Authorization", value: `Bearer ${jeton}` },
    },
  ];
  const tmp = `${Bun.env.TMPDIR ?? Bun.env.TEMP ?? "/tmp"}/auto-n8n-credentials.json`;
  await Bun.write(tmp, JSON.stringify(credential));
  try {
    await compose("cp", tmp, "n8n:/tmp/credentials.json");
    await compose("exec", "-T", "n8n", "n8n", "import:credentials", "--input=/tmp/credentials.json");
  } finally {
    await Bun.file(tmp).delete();
    await compose("exec", "-T", "n8n", "rm", "-f", "/tmp/credentials.json").catch(() => {});
  }
  const ids: string[] = [];
  for await (const f of new Bun.Glob("*.json").scan(Bun.fileURLToPath(WORKFLOWS))) {
    const { id } = (await Bun.file(new URL(f, WORKFLOWS)).json()) as { id: string };
    await compose("exec", "-T", "n8n", "n8n", "import:workflow", `--input=/workflows/${f}`);
    await compose("exec", "-T", "n8n", "n8n", "publish:workflow", `--id=${id}`);
    ids.push(id);
  }
  // CLI imports only take effect after a restart.
  await compose("restart", "n8n");
  await attendreN8n();
  await attendreWebhook("auto-evenements");
  await attendreWebhook("auto-relances");
  return ids;
}

if (import.meta.main) {
  const jeton = Bun.argv[2];
  if (!jeton?.startsWith("auto_")) throw new Error("usage : bun scripts/n8n.ts <jeton auto_…>");
  console.log(`workflows published: ${(await provisionner(jeton)).join(", ")}`);
}
