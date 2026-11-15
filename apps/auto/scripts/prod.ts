// Production operations on usa (ssh alias `prd`, public IP; the 10.200.77.x mesh may be cut):
// `ay ssh` for the host and the containers, public probe through fetch. Data and environment files: /srv/auto.
//   bun run prod etat       host, auto-* containers, public health
//   bun run prod deployer   image built here, loaded on the server, API, worker and web relaunched
import { $ } from "bun";
import { empreinteFichiers } from "./empreinte";

const URL_PUBLIQUE = "https://auto.aphrody.com";
const HOTE = Bun.env.AUTO_HOTE ?? "prd";
const RACINE = "/srv/auto";

/** Common options: non-root, read-only file system, bounded logs. */
const COMMUN =
  "--init --read-only --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true " +
  "--tmpfs /tmp:rw,nosuid,nodev,size=512m,mode=1777 --tmpfs /home/auto:rw,nosuid,nodev,size=256m,uid=10001,gid=10001 " +
  "--log-driver json-file --log-opt max-size=10m --log-opt max-file=3";

/** Application containers: specific options (the worker exposes no port). */
const CONTENEURS = [
  {
    nom: "auto-api",
    image: "auto-app:dev",
    options: `--shm-size 256m -v ${RACINE}/arrivages:/mnt/arrivages:ro`,
    commande: "bun apps/api/src/index.ts",
  },
  // The worker calls the API back ("auto action" nodes of the workflows) through the internal network.
  {
    nom: "auto-worker",
    image: "auto-app:dev",
    options: `--shm-size 256m --no-healthcheck -e AUTO_API_URL=http://auto-api:3000 -v ${RACINE}/arrivages:/mnt/arrivages`,
    commande: "bun apps/worker/src/index.ts",
  },
  {
    nom: "auto-web",
    image: "auto-app:dev",
    options:
      `-e PORT=3001 -e AUTO_API_URL=http://auto-api:3000 -e AUTO_MEDIA_DIR=/mnt/media -e AUTO_DISTRIBUTIONS_DIR=/mnt/distributions ` +
      `-v ${RACINE}/media:/mnt/media:ro -v ${RACINE}/distributions:/mnt/distributions:ro`,
    commande: "bun apps/web/src/index.ts",
  },
];

const distant = (commande: string) => $`ay ssh exec ${HOTE} -- ${commande}`;

async function sonde() {
  const r = await fetch(`${URL_PUBLIQUE}/health`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  return r?.ok === true;
}

async function etat() {
  await $`ay ssh check ${HOTE}`;
  await distant(`docker ps --filter name=auto- --format '{{.Names}}\t{{.Status}}\t{{.Image}}'`);
  console.log(`${URL_PUBLIQUE}/health : ${(await sonde()) ? "ok" : "KO"}`);
}

/** Fingerprint of what makes up the native library (crates, Cargo lock, pinned vendored suite). */
async function empreinteNatif() {
  const suivis =
    await $`git ls-files --cached --others --exclude-standard -- Cargo.toml Cargo.lock crates vendor/suite docker/app.Dockerfile .dockerignore`.text();
  return (await empreinteFichiers(suivis.trim().split(/\r?\n/).filter(Boolean))).slice(0, 16);
}

/**
 * Full path: image built here and copied as an archive (scp with retry, fingerprint verified), then
 * tagged `auto-app:base` on the server. Slow (weak uplink): only when the native part changes.
 */
async function deployerComplet(natif: string) {
  await $`docker build -q -f docker/app.Dockerfile -t auto-app:dev .`;
  const archive = ".cache/auto-app.tar.gz";
  await $`mkdir -p .cache && docker save auto-app:dev | gzip -1 > ${archive}`;
  const empreinte = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).bytes()).digest("hex");
  for (let essai = 1; ; essai++) {
    const copie =
      await $`scp -q -o BatchMode=yes -o ServerAliveInterval=10 ${archive} ${HOTE}:${RACINE}/auto-app.tar.gz`
        .nothrow()
        .quiet();
    const distante = await distant(`sha256sum ${RACINE}/auto-app.tar.gz | cut -d' ' -f1`).nothrow().quiet();
    if (copie.exitCode === 0 && distante.text().includes(empreinte)) break;
    if (essai === 5) throw new Error("image copy failed after 5 attempts");
    console.error(`copie de l'image interrompue, nouvel essai (${essai + 1}/5)`);
    await Bun.sleep(10_000);
  }
  await distant(
    `gunzip -c ${RACINE}/auto-app.tar.gz | docker load && rm ${RACINE}/auto-app.tar.gz && docker tag auto-app:dev auto-app:base && echo ${natif} > ${RACINE}/natif.txt`,
  );
  await $`rm -f ${archive}`;
}

/**
 * Fast path: TypeScript sources only (about 1 MB) sent to the server, image rebuilt there on
 * `auto-app:base` which already contains the native library (docker/app-maj.Dockerfile).
 */
async function deployerRapide() {
  await $`tar czf - --exclude=node_modules --exclude=dist --exclude=target --exclude=gen package.json bun.lock bunfig.toml tsconfig.json apps packages docker/app-maj.Dockerfile | ssh -o BatchMode=yes ${HOTE} "rm -rf ${RACINE}/src && mkdir -p ${RACINE}/src && tar xzf - -C ${RACINE}/src"`;
  await distant(`docker build -q -f ${RACINE}/src/docker/app-maj.Dockerfile -t auto-app:dev ${RACINE}/src >/dev/null`);
}

async function deployer() {
  const natif = await empreinteNatif();
  const distant_ = (
    await distant(
      `cat ${RACINE}/natif.txt 2>/dev/null; docker image inspect auto-app:base >/dev/null 2>&1 && echo base`,
    )
      .nothrow()
      .quiet()
  ).text();
  if (distant_.includes(natif) && distant_.includes("base")) await deployerRapide();
  else await deployerComplet(natif);
  await distant(`install -d -o 10001 -g 10001 -m 2770 ${RACINE}/arrivages`);
  const relance = CONTENEURS.map(
    (c) =>
      `docker rm -f ${c.nom} >/dev/null 2>&1; docker run -d --name ${c.nom} --network auto-prod --restart unless-stopped ${COMMUN} ${c.options} --env-file prod.env ${c.image} ${c.commande} >/dev/null`,
  ).join(" && ");
  await distant(`cd ${RACINE} && ${relance}`);
  for (let i = 0; i < 12; i++) {
    if (await sonde()) return etat();
    await Bun.sleep(5000);
  }
  throw new Error(`${URL_PUBLIQUE}/health does not answer after the deployment`);
}

const actions: Record<string, () => Promise<unknown>> = {
  etat,
  deployer,
};
const action = actions[Bun.argv[2] ?? "etat"];
if (!action) {
  console.error(`actions : ${Object.keys(actions).join(", ")}`);
  process.exit(1);
}
await action();
