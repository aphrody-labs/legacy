// 30-day consumption of every Neon and Supabase project, as JSON on stdout.
// usage: bun device/db/budget.ts   (env: NEON_API_KEY, NEON_ORG_ID, NEON_API_KEY__USA, SUPABASE_ACCESS_TOKEN)
// Tolerant .env fallback (the shared .env is not valid shell); only fills unset vars.
for (const f of [process.env.BUDGET_ENV ?? "C:/aphrody/.env"]) {
  const t = await Bun.file(f)
    .text()
    .catch(() => "");
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const NEON = "https://console.neon.tech/api/v2";
const SB = "https://api.supabase.com/v1";
const to = new Date();
const from = new Date(to.getTime() - 30 * 864e5);

async function get(url: string, token: string) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok)
    return { error: `${r.status} ${(await r.text()).slice(0, 200)}` } as any;
  return r.json() as any;
}

const rows: unknown[] = [];

async function neon(label: string, key: string | undefined, org?: string) {
  if (!key) return;
  const q = org ? `&org_id=${org}` : "";
  const projects = await get(`${NEON}/projects?limit=400${q}`, key);
  if (projects.error)
    return void rows.push({
      provider: "neon",
      key: label,
      error: projects.error,
    });
  const cons = await get(
    `${NEON}/consumption_history/projects?from=${from.toISOString()}&to=${to.toISOString()}&granularity=monthly&limit=400${q}`,
    key,
  );
  const byId = new Map<string, any>(
    (cons.projects ?? []).map((p: any) => [p.project_id, p]),
  );
  for (const p of projects.projects ?? []) {
    const periods = byId.get(p.id)?.periods ?? [];
    const sum = (k: string) =>
      periods
        .flatMap((x: any) => x.consumption ?? [])
        .reduce((a: number, c: any) => a + (c[k] ?? 0), 0);
    rows.push({
      provider: "neon",
      key: label,
      id: p.id,
      name: p.name,
      region: p.region_id,
      compute_seconds: p.compute_time_seconds,
      active_seconds: p.active_time_seconds,
      logical_size_bytes: p.synthetic_storage_size,
      history_s: p.history_retention_seconds,
      last_active: p.compute_last_active_at,
      c30: {
        active_time_seconds: sum("active_time_seconds"),
        compute_time_seconds: sum("compute_time_seconds"),
        written_data_bytes: sum("written_data_bytes"),
        synthetic_storage_size_bytes: sum("synthetic_storage_size_bytes"),
      },
    });
  }
}

async function supabase(token: string | undefined) {
  if (!token) return;
  const projects = await get(`${SB}/projects`, token);
  if (projects.error)
    return void rows.push({ provider: "supabase", error: projects.error });
  for (const p of projects) {
    const [usage, addons] = await Promise.all([
      get(
        `${SB}/projects/${p.id}/analytics/endpoints/usage.api-counts?interval=30days`,
        token,
      ),
      get(`${SB}/projects/${p.id}/billing/addons`, token),
    ]);
    rows.push({
      provider: "supabase",
      id: p.id,
      name: p.name,
      org: p.organization_id ?? p.organization_slug,
      region: p.region,
      status: p.status,
      created: p.created_at,
      addons: addons.error
        ? addons.error
        : addons.selected_addons?.map((a: any) => a.variant?.id ?? a.type),
      api_counts_30d: usage.error ? usage.error : usage.result,
    });
  }
}

await neon("main", process.env.NEON_API_KEY, process.env.NEON_ORG_ID);
await neon("usa", process.env.NEON_API_KEY__USA);
await supabase(process.env.SUPABASE_ACCESS_TOKEN);
console.log(JSON.stringify({ from, to, rows }, null, 2));
