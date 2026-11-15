import { afterAll, beforeAll, expect, test } from "bun:test";
import { clientOpenAi, type AppelOutil, type ClientLlm, type Message, type Requete } from "@auto/ingest/llm";
import { executerAgent } from "./agent";
import { ApiAuto } from "./api";
import { apiDeTest } from "./test-api";
import { OUTILS } from "./outils";

let t: Awaited<ReturnType<typeof apiDeTest>>;
let A: { jeton: string };
let B: { jeton: string };
let clientId: string;

beforeAll(async () => {
  t = await apiDeTest();
  A = await t.tenant("agent-a@exemple.fr", "Alpha");
  B = await t.tenant("agent-b@exemple.fr", "Beta");
  clientId = (
    await t.appel("/v1/clients", A.jeton, { nom: "Dupont SARL", siret: "73282932000074", adresse: "3 rue C, Nantes" })
  ).id;
});
afterAll(() => t.fermer());

let n = 0;
const appel = (name: string, args: unknown): AppelOutil => ({
  id: `c${++n}`,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

/** Deterministic fake LLM: each step decides from the last tool result. */
function scripte(
  etapes: ((dernier: unknown, messages: Message[]) => AppelOutil[] | string)[],
): ClientLlm & { requetes: Requete[] } {
  const requetes: Requete[] = [];
  return {
    requetes,
    async completer(r) {
      requetes.push(r);
      const outils = r.messages.filter((m) => m.role === "tool");
      const dernier = outils.length ? JSON.parse(outils.at(-1)!.content) : null;
      const e = etapes[requetes.length - 1];
      if (!e) throw new Error("script exhausted");
      const s = e(dernier, r.messages);
      return typeof s === "string" ? { content: s } : { content: null, tool_calls: s };
    },
  };
}

test("agent loop: find the customer, invoice, issue, collect", async () => {
  const llm = scripte([
    () => [appel("chercher_client", { q: "dupont" })],
    (clients) => [
      appel("creer_facture", {
        clientId: (clients as { id: string }[])[0]!.id,
        echeance: "2099-12-31",
        datePrestation: "2026-10-15",
        lignes: [{ designation: "Conseil", quantite: 2, prixUnitaireHtCents: 45000, tva: 200 }],
      }),
    ],
    (f) => [appel("emettre_document", { id: (f as { id: string }).id })],
    (e) => [
      appel("enregistrer_paiement", {
        id: (e as { id: string }).id,
        montantCents: (e as { ttcCents: number }).ttcCents,
      }),
    ],
    (_p, messages) => {
      const emis = JSON.parse(messages.filter((m) => m.role === "tool").at(-2)!.content as string);
      return `Invoice ${emis.numero} issued and paid.`;
    },
  ]);
  const r = await executerAgent("Invoice 2 days of consulting at EUR 450 excl. VAT to Dupont, issue it, it is paid.", {
    llm,
    api: new ApiAuto(t.url, A.jeton),
  });
  expect(r.reponse).toBe("Invoice F-2026-0001 issued and paid.");
  expect(r.appels.map((a) => [a.nom, a.ok])).toEqual([
    ["chercher_client", true],
    ["creer_facture", true],
    ["emettre_document", true],
    ["enregistrer_paiement", true],
  ]);
  // The model receives the system message and the tools in OpenAI format.
  expect(llm.requetes[0]!.messages[0]!.role).toBe("system");
  expect(llm.requetes[0]!.tools!.map((o) => o.function.name)).toContain("exporter");
  const docs = await t.appel("/v1/documents", A.jeton);
  expect(docs).toEqual([expect.objectContaining({ numero: "F-2026-0001", statut: "paye", clientId })]);
});

test("isolation: tenant B's token sees nothing of tenant A through the agent", async () => {
  const [doc] = await t.appel("/v1/documents", A.jeton);
  const llm = scripte([
    () => [
      appel("lire_document", { id: doc.id }),
      appel("lister_documents", {}),
      appel("chercher_document", { q: "dupont" }),
      appel("chercher_client", { q: "dupont" }),
      appel("enregistrer_paiement", { id: doc.id, montantCents: 100 }),
      appel("exporter", { format: "json" }),
    ],
    () => "Nothing found.",
  ]);
  const r = await executerAgent("Show me Dupont's invoice", { llm, api: new ApiAuto(t.url, B.jeton) });
  const resultats = r.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  expect(resultats[0]).toMatchObject({ status: 404 });
  expect(resultats.slice(1, 4)).toEqual([[], [], []]);
  expect(resultats[4]).toMatchObject({ status: 404 });
  expect(resultats[5]).toEqual([]);
  expect(r.appels.map((a) => a.ok)).toEqual([false, true, true, true, false, true]);
  // The payment was not recorded at A.
  expect((await t.appel(`/v1/documents/${doc.id}/paiements`, A.jeton)).paiements).toHaveLength(1);
});

test("OpenAI-compatible LLM (fake HTTP server): tool_calls then answer", async () => {
  const corps: { messages: Message[]; tools?: unknown[] }[] = [];
  const llm = Bun.serve({
    port: 0,
    routes: {
      "/v1/chat/completions": {
        POST: async (req) => {
          const b = (await req.json()) as { messages: Message[]; tools?: unknown[] };
          corps.push(b);
          const message =
            corps.length === 1
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [appel("exporter", { format: "csv", type: "facture" })],
                }
              : { role: "assistant", content: "Export ready." };
          return Response.json({ choices: [{ message }] });
        },
      },
    },
  });
  try {
    const r = await executerAgent("Export the invoices", {
      llm: clientOpenAi({ url: `${llm.url}v1` }),
      api: new ApiAuto(t.url, A.jeton),
    });
    expect(r.reponse).toBe("Export ready.");
    const outil = corps[1]!.messages.at(-1)!;
    expect(outil.role).toBe("tool");
    expect((outil as { content: string }).content).toStartWith(
      "numero;type;statut;date;echeance;client;ttcCents;id\nF-2026-0001;facture;paye;",
    );
    expect(corps[0]!.tools).toHaveLength(21);
  } finally {
    await llm.stop(true);
  }
});

test("invalid arguments, unknown tool, step cap", async () => {
  const boucle: ClientLlm = {
    completer: async () => ({
      content: null,
      tool_calls: [
        { id: "x", type: "function", function: { name: "inconnu", arguments: "{}" } },
        { id: "y", type: "function", function: { name: "lister_documents", arguments: "{not json" } },
      ],
    }),
  };
  const r = await executerAgent("boucle", { llm: boucle, api: new ApiAuto(t.url, A.jeton), maxEtapes: 2 });
  expect(r.reponse).toContain("Maximum");
  expect(r.appels.every((a) => !a.ok)).toBe(true);
});

test("management search by agent: same data and isolation as REST", async () => {
  const outil = OUTILS.find((o) => o.nom === "chercher_piece_gestion")!;
  const a = (await outil.executer(new ApiAuto(t.url, A.jeton), { q: "Dupont" })) as { total: number };
  const b = (await outil.executer(new ApiAuto(t.url, B.jeton), { q: "Dupont" })) as { total: number };
  expect(a.total).toBeGreaterThan(0);
  expect(b.total).toBe(0);
});
