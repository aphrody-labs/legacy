// End to end API ↔ n8n: issued invoice → outbox → worker → signed webhook → n8n re-reads the Factur-X through the API → archive.
// Prerequisites: the API's Postgres (DATABASE_URL) and n8n (compose). Usage: bun apps/api/e2e/n8n.ts
import { refus } from "../src/i18n";
import { testDb } from "@auto/store";
import { verifierPdfA } from "@auto/native";
import { creerApp } from "../src/app";
import { expediteur } from "../../worker/src/expediteur";
import { creerWorker } from "../../worker/src/worker";
import { N8N_URL, provisionner } from "../../../scripts/n8n";

const PORT = Number(Bun.env.AUTO_E2E_PORT ?? 3000); // n8n AUTO_API_URL: host.docker.internal:3000
const SECRET = Bun.env.N8N_WEBHOOK_SECRET ?? "auto-dev-secret-webhook";
const ARCHIVES = new URL("../../../data/n8n/archives/", import.meta.url);

const { sql, drop } = await testDb();
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  routes: creerApp(sql),
  fetch: (req) => refus(req, "route_not_found", 404),
});
// Outbox delivery by the worker, in this process.
const worker = creerWorker(sql, expediteur(sql, { url: `${N8N_URL}/webhook/auto-evenements`, secret: SECRET }), {
  intervalleMs: 200,
});
worker.demarrer();

async function api<T = any>(path: string, token?: string, body?: unknown): Promise<T> {
  const r = await fetch(new URL(path, server.url), {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path} : HTTP ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

try {
  const a = await api("/v1/auth/inscription", undefined, {
    email: "e2e-n8n@exemple.fr",
    motDePasse: "a long password",
    entreprise: { nom: "E2E n8n SAS", siret: "73282932000074", adresse: "1 rue de la Paix, 75002 Paris" },
  });
  const { jeton } = await api("/v1/jetons", a.session, { nom: "n8n" });
  console.log(`n8n provisioned: ${(await provisionner(jeton)).join(", ")}`);

  const d = await api("/v1/documents", jeton, {
    type: "facture",
    client: { nom: "Client SAS", siret: "73282932000074", adresse: "2 rue B, Lyon" },
    lignes: [{ designation: "Automatisation", quantite: 2, prixUnitaireHtCents: 45000, tva: 200 }],
    datePrestation: new Date().toISOString().slice(0, 10),
    echeance: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
  });
  const e = await api(`/v1/documents/${d.id}/emettre`, jeton, {});
  console.log(`invoice issued: ${e.numero}`);

  const archive = Bun.file(new URL(`${a.tenantId}_${e.numero}.pdf`, ARCHIVES));
  // Written by n8n through a mount: wait for a non-zero, stable size.
  const fin = Date.now() + 60_000;
  let taille = -1;
  while (Date.now() < fin) {
    const f = Bun.file(archive.name!); // size re-read on every turn
    const t = (await f.exists()) ? f.size : -1;
    if (t > 0 && t === taille) break;
    taille = t;
    await Bun.sleep(1000);
  }
  if (taille <= 0) throw new Error(`archive absente : ${archive.name}`);

  const archivee = await archive.bytes();
  const officielle = new Uint8Array(
    await (
      await fetch(new URL(`/v1/documents/${d.id}/pdf`, server.url), { headers: { authorization: `Bearer ${jeton}` } })
    ).arrayBuffer(),
  );
  const sha = (b: Uint8Array) => new Bun.CryptoHasher("sha256").update(b).digest("hex");
  if (sha(archivee) !== sha(officielle)) {
    const i = archivee.findIndex((o, k) => o !== officielle[k]);
    throw new Error(
      `archive differs from the API's Factur-X: ${archivee.length} / ${officielle.length} bytes, first difference at ${i}`,
    );
  }
  const nonConformites = verifierPdfA(archivee);
  if (nonConformites.length) throw new Error(`archive is not PDF/A-3b: ${nonConformites.join("; ")}`);
  await archive.delete();
  console.log(`OK : ${archive.name} (${archivee.length} octets, SHA-256 ${sha(archivee).slice(0, 16)}…, PDF/A-3b)`);
} finally {
  await worker.arreter();
  await server.stop(true);
  await drop();
}
