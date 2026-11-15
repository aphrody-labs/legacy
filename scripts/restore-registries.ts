// Discover what we published: npm (maintainer + scopes), crates.io (users/teams), PyPI.
// Prints JSON rows to stdout; never publishes. Usage: bun scripts/restore-registries.ts [--out file]
const UA = "aphrody-restore/1.0 (+https://github.com/aphrody-labs/aphrody)";
const out = Bun.argv.includes("--out") ? Bun.argv[Bun.argv.indexOf("--out") + 1] : undefined;

const getJson = async (url: string, headers: Record<string, string> = {}) => {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, ...headers }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { __status: r.status };
    return await r.json();
  } catch (e) {
    return { __error: String(e) };
  }
};

type Row = { source: string; kind: string; name: string; version?: string; date?: string; extra?: unknown };
const rows: Row[] = [];

// npm: whoami is read from the CLI, scopes from the repo + logins found on GitHub.
const who = (await Bun.$`bun pm whoami`.nothrow().quiet().text()).trim();
const logins = new Set<string>(["aphrody-dev", "aphrody-labs", "aphrody-code", "yolo-rs", "aphrody", "yolo", "rosegriffon"]);
if (who) logins.add(who);
const npmNames = new Set<string>();
const searches = [...(who ? [`maintainer:${who}`] : []), ...[...logins].flatMap((l) => [`scope:${l}`, `maintainer:${l}`])];
for (const q of searches) {
  for (let from = 0; from < 5000; from += 250) {
    const j: any = await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=250&from=${from}`);
    const objs = j?.objects ?? [];
    for (const o of objs) {
      const p = o.package;
      const maint = (p.maintainers ?? []).map((m: any) => m.username);
      const scoped = p.scope && logins.has(p.scope);
      if (scoped || maint.some((m: string) => logins.has(m))) npmNames.add(p.name);
    }
    await Bun.sleep(300);
    if (objs.length < 250) break;
  }
}
for (const name of npmNames) {
  const pk: any = await getJson(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (pk?.__status || pk?.__error) {
    rows.push({ source: "npm", kind: "package", name, extra: pk });
    continue;
  }
  const versions = Object.keys(pk.versions ?? {});
  const latest = pk["dist-tags"]?.latest ?? versions.at(-1);
  rows.push({
    source: "npm",
    kind: "package",
    name,
    version: latest,
    date: pk.time?.modified,
    extra: {
      versions: versions.length,
      tarball: pk.versions?.[latest]?.dist?.tarball,
      integrity: pk.versions?.[latest]?.dist?.integrity,
      repository: pk.repository?.url,
      maintainers: (pk.maintainers ?? []).map((m: any) => m.name),
      deprecated: !!pk.versions?.[latest]?.deprecated,
    },
  });
}

// crates.io: users and teams, then crates by user_id.
const crateNames = new Set<string>();
for (const l of logins) {
  const u: any = await getJson(`https://crates.io/api/v1/users/${l}`);
  const id = u?.user?.id;
  if (!id) continue;
  for (let page = 1; page < 20; page++) {
    const c: any = await getJson(`https://crates.io/api/v1/crates?user_id=${id}&per_page=100&page=${page}`);
    const list = c?.crates ?? [];
    for (const k of list) {
      if (crateNames.has(k.name)) continue;
      crateNames.add(k.name);
      rows.push({
        source: "crates.io",
        kind: "crate",
        name: k.name,
        version: k.max_version,
        date: k.updated_at,
        extra: { owner: l, repository: k.repository, downloads: k.downloads },
      });
    }
    if (list.length < 100) break;
  }
  await Bun.sleep(1100);
}

// PyPI: the JSON API per project name found in repo pyproject files; names come on argv after --py.
const pyIdx = Bun.argv.indexOf("--py");
const pyNames = pyIdx >= 0 ? Bun.argv.slice(pyIdx + 1) : [];
for (const n of pyNames) {
  const j: any = await getJson(`https://pypi.org/pypi/${n}/json`);
  if (j?.info) {
    rows.push({ source: "pypi", kind: "project", name: n, version: j.info.version, date: Object.values<any>(j.releases ?? {}).flat().at(-1)?.upload_time, extra: { author: j.info.author, home: j.info.home_page, urls: j.info.project_urls } });
  }
}

const text = JSON.stringify({ npmLogins: [...logins], whoami: who, rows }, null, 2);
if (out) await Bun.write(out, text);
else console.log(text);
