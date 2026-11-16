// Contract with the n8n workflows of infra/n8n/workflows: structure, and code of the verification nodes
// run here on a body signed the way the worker does.
import { expect, test } from "bun:test";
import { signer } from "@auto/services";

interface Noeud {
  name: string;
  type: string;
  disabled?: boolean;
  parameters: { jsCode?: string; path?: string };
}
interface Workflow {
  id: string;
  nodes: Noeud[];
  connections: Record<string, { main: { node: string }[][] }>;
}

const DOSSIER = new URL("../../../infra/n8n/workflows/", import.meta.url);
const lire = (nom: string) => Bun.file(new URL(nom, DOSSIER)).json() as Promise<Workflow>;
const SECRET = "secret-de-test";

/** Runs an n8n Code node ("all items" mode) with the given $input, $env and static state. */
function executer(n: Noeud, items: { json: unknown }[], statique: Record<string, unknown> = {}) {
  const fn = new Function("require", "$input", "$env", "$getWorkflowStaticData", n.parameters.jsCode!);
  return fn(
    (m: string) => require(m),
    { all: () => items },
    { N8N_WEBHOOK_SECRET: SECRET },
    () => statique,
  ) as { json: Record<string, unknown> }[];
}

const relance = {
  id: "0199f1c2-0000-7000-8000-000000000001",
  type: "relance.a_envoyer",
  tenantId: "t1",
  date: "2026-10-22T08:00:00.000Z",
  data: {
    documentId: "d1",
    numero: "F-2026-0007",
    client: { nom: "Client", siret: "73282932000074", adresse: "2 rue B", email: "compta@client.fr" },
    echeance: "2026-10-12",
    joursRetard: 10,
    niveau: 1,
    resteCents: 123456,
    jour: "2026-10-22",
  },
};
const recu = (corps: string, signature: string) => ({
  json: { body: JSON.parse(corps), headers: { "x-auto-signature": signature } },
});

test("workflows: connections to existing nodes, distinct webhook paths", async () => {
  const chemins: string[] = [];
  for await (const f of new Bun.Glob("*.json").scan(Bun.fileURLToPath(DOSSIER))) {
    const w = await lire(f);
    const noms = new Set(w.nodes.map((n) => n.name));
    for (const [de, c] of Object.entries(w.connections)) {
      expect(noms.has(de)).toBe(true);
      for (const x of c.main.flat()) expect(noms.has(x.node)).toBe(true);
    }
    for (const n of w.nodes) if (n.type === "n8n-nodes-base.webhook") chemins.push(n.parameters.path!);
  }
  expect(chemins.sort()).toEqual(["auto-evenements", "auto-relances"]);
});

test("auto-relances: signature verified, deduplication, mail prepared, sending disabled", async () => {
  const w = await lire("auto-relances.json");
  const noeud = (nom: string) => w.nodes.find((n) => n.name === nom)!;
  const corps = JSON.stringify(relance);

  expect(() => executer(noeud("Verify signature"), [recu(corps, signer("autre", corps))])).toThrow(
    "Invalid signature",
  );
  const verifies = executer(noeud("Verify signature"), [recu(corps, signer(SECRET, corps))]);
  expect(verifies.map((i) => i.json)).toEqual([relance]);

  const statique = {};
  expect(executer(noeud("Deduplicate"), verifies, statique).length).toBe(1);
  expect(executer(noeud("Deduplicate"), verifies, statique).length).toBe(0); // same id: ignored

  const [mail] = executer(noeud("Prepare mail"), verifies);
  expect(mail!.json).toMatchObject({ a: "compta@client.fr", objet: "Rappel : facture F-2026-0007 échue", niveau: 1 });
  expect(String(mail!.json.texte)).toContain("10 jours de retard");
  const sansEmail = { json: { ...relance, data: { ...relance.data, client: { nom: "X" } } } };
  expect(executer(noeud("Prepare mail"), [sansEmail])).toEqual([]);
  const dejaEnvoyee = { json: { ...relance, data: { ...relance.data, envoyeParMail: true } } };
  expect(executer(noeud("Prepare mail"), [dejaEnvoyee])).toEqual([]);

  expect(noeud("Send mail")).toMatchObject({ type: "n8n-nodes-base.emailSend", disabled: true });
});

test("auto-evenements: same signature verification on the outbox body", async () => {
  const w = await lire("auto-evenements.json");
  const v = w.nodes.find((n) => n.name === "Verify signature")!;
  const corps = JSON.stringify(relance);
  expect(executer(v, [recu(corps, signer(SECRET, corps))]).map((i) => i.json)).toEqual([relance]);
  expect(w.connections["Verify signature"]!.main[0]!.map((x) => x.node)).toContain("Reminder?");
});
