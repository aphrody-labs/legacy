// To run on the VPS: assertions on the active containers, without printing their secret variables.
export {};
function lire(args: string[]) {
  const p = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode) throw Error(`Check impossible: ${args[0]} ${args[1]}`);
  return p.stdout.toString().trim();
}
const controles: string[] = [];
function exiger(ok: boolean, nom: string) {
  if (!ok) throw Error(nom);
  controles.push(nom);
}
for (const nom of ["auto-api", "auto-worker", "auto-web"]) {
  const [c] = JSON.parse(lire(["docker", "inspect", nom]));
  exiger(c.State.Running && c.RestartCount === 0, `${nom}: running without restart`);
  exiger(
    c.Config.User === "10001:10001" && c.HostConfig.ReadonlyRootfs,
    `${nom}: non-root and read-only root`,
  );
  exiger(
    c.HostConfig.CapDrop.includes("ALL") && c.HostConfig.SecurityOpt.includes("no-new-privileges:true"),
    `${nom}: capabilities dropped`,
  );
  exiger(
    Object.values(c.NetworkSettings.Ports ?? {}).every((p) => p === null),
    `${nom}: no published port`,
  );
  if (nom !== "auto-worker") exiger(c.State.Health?.Status === "healthy", `${nom}: health validated`);
  if (nom === "auto-web") {
    for (const destination of ["/mnt/media", "/mnt/distributions"])
      exiger(
        c.Mounts.some((m: { Destination: string; RW: boolean }) => m.Destination === destination && !m.RW),
        `web : ${destination} en lecture seule`,
      );
    const outils = JSON.parse(
      lire([
        "docker",
        "exec",
        nom,
        "bun",
        "-e",
        "console.log(JSON.stringify(['chromium','tesseract','pdftotext'].map(n=>Bun.which(n))))",
      ]),
    );
    exiger(
      outils.every((x: unknown) => x === null),
      "web: no system OCR/browser tool",
    );
  }
}
exiger(
  lire([
    "docker",
    "exec",
    "auto-api",
    "bun",
    "-e",
    "const u=new URL(Bun.env.DATABASE_URL);const s=new Bun.SQL(u.href,{max:1});const [r]=await s`select current_setting('server_version_num')::int v`;await s.close();console.log(u.hostname.endsWith('.neon.tech')&&u.hostname.includes('-pooler')&&r.v>=180000?'ok':'non')",
  ]) === "ok",
  "PostgreSQL: Neon (pooled endpoint, Postgres 18) reachable from the API",
);
const etat = lire([
  "docker",
  "exec",
  "auto-web",
  "bun",
  "-e",
  "const r=await fetch('http://127.0.0.1:3001/health');if(!r.ok)process.exit(1);console.log('ok')",
]);
exiger(etat === "ok", "web proxy to API: health reachable");
console.log(JSON.stringify({ statut: "PRODUCTION_CONTENEURS_OK", controles }, null, 2));
