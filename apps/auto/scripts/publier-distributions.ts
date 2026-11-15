// The local directory contains manifest.json and only the public files it references.
import { catalogue } from "../apps/web/src/distributions";
const dossier = Bun.argv[2];
if (!dossier) throw Error("Usage: bun scripts/publier-distributions.ts <directory>");
const livraison = (await Bun.file(".cache/last-release.json").json()).version as string;
if (!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(livraison)) throw Error("Invalid validated release");
const c = await catalogue(dossier);
if (!c?.fichiers.length) throw Error("Catalog missing or invalid");
for (const a of c.fichiers) {
  const f = Bun.file(`${dossier}/${a.fichier}`);
  const h = new Bun.CryptoHasher("sha256");
  if (!(await f.exists()) || f.size !== a.octets) throw Error(`File missing or incomplete: ${a.fichier}`);
  for await (const chunk of f.stream()) h.update(chunk);
  if (h.digest("hex") !== a.sha256) throw Error(`Empreinte incorrecte : ${a.fichier}`);
}
const id = crypto.randomUUID();
const depot = `auto/distributions/.publication-${id}`;
async function commande(args: string[]) {
  const p = Bun.spawn(args, { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error("Publication interrupted; previous catalog kept");
}
await commande(["ssh", "fr1", `umask 022; mkdir -p ~/${depot} ~/auto/outils; chmod 755 ~/auto/distributions`]);
await commande(["scp", "-S", Bun.which("ssh") ?? "ssh", `${dossier}/manifest.json`, `fr1:${depot}/manifest.json`]);
// These two sources contain neither a private key nor an account configuration.
await commande([
  "scp",
  "-S",
  Bun.which("ssh") ?? "ssh",
  "scripts/distributions-vps.ts",
  "vps:auto/outils/distributions-vps.ts",
]);
const plan = Bun.spawn(["ssh", "fr1", `~/.local/bin/bun ~/auto/outils/distributions-vps.ts ${id} ${livraison} plan`], {
  stdin: "ignore",
  stdout: "pipe",
  stderr: "inherit",
});
const sortie = await new Response(plan.stdout).text();
if (await plan.exited) throw Error("Publication plan refused; current catalog kept");
const { manquants } = JSON.parse(sortie) as { manquants: string[] };
if (
  !Array.isArray(manquants) ||
  manquants.some((n) => !c.fichiers.some((a) => a.fichier === n)) ||
  new Set(manquants).size !== manquants.length
)
  throw Error("Inconsistent transfer plan");
console.log(
  `Transfer: ${manquants.length} new files, ${c.fichiers.length - manquants.length} files already verified`,
);
for (const nom of manquants)
  await commande(["scp", "-S", Bun.which("ssh") ?? "ssh", `${dossier}/${nom}`, `fr1:${depot}/${nom}`]);
// The validator comes from the immutable release; no source of this release is modified.
await commande(["ssh", "fr1", `~/.local/bin/bun ~/auto/outils/distributions-vps.ts ${id} ${livraison}`]);
