// B2Brouter adapter (registered PA), from its public documentation (docs.b2brouter.net,
// b2brouter.readme.io, API 2026-06-26). Inactive without credentials. Unverified points: see docs/PA.md.
import { egal, hmac } from "./chiffrement";
import { PaError, type EvenementPa, type Plateforme, type StatutCycle } from "./types";

export interface IdentifiantsB2brouter {
  /** `X-B2B-API-Key` key (`test_` prefix in the sandbox). */
  cleApi: string;
  /** Account identifier (`identifier` of GET /accounts). */
  compte: string;
  /** `signing_secret` returned when the webhook is created (POST /web_hooks). */
  secretWebhook: string;
}

export interface OptionsB2brouter {
  base?: string;
  fetch?: typeof fetch;
  /** Wait between two directory polls (202 response). */
  attenteMs?: number;
  /** Webhook timestamp tolerance, in seconds. */
  toleranceS?: number;
  horloge?: () => Date;
}

export const B2BROUTER_URL = "https://api.b2brouter.net";
export const B2BROUTER_VERSION = "2026-06-26";
export const ENTETE_B2BROUTER = "x-b2brouter-signature";

/** B2Brouter invoice states → lifecycle statuses; the others are ignored. */
export const ETATS: Record<string, StatutCycle> = {
  new: "deposee",
  sending: "deposee",
  issued: "deposee",
  sent: "deposee",
  received: "mise_a_disposition",
  read: "prise_en_charge",
  downloaded: "mise_a_disposition",
  registered: "recue",
  accepted: "approuvee",
  annotated: "en_litige",
  refused: "refusee",
  allegedly_paid: "paiement_transmis",
  payment_processed: "paiement_transmis",
  paid: "encaissee",
  error: "rejetee",
  invalid: "rejetee",
};

/** Statuses the company may set (POST /invoices/{id}/mark_as). */
const VERS_ETAT: Partial<Record<StatutCycle, string>> = {
  encaissee: "paid",
  refusee: "refused",
  approuvee: "accepted",
  paiement_transmis: "allegedly_paid",
};

const echapper = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function b2brouter(ids: IdentifiantsB2brouter, o: OptionsB2brouter = {}): Plateforme {
  if (!ids.cleApi || !ids.compte || !ids.secretWebhook)
    throw new PaError("B2Brouter désactivé : cleApi, compte et secretWebhook requis", 422);
  const base = (o.base ?? B2BROUTER_URL).replace(/\/$/, "");
  const f = o.fetch ?? fetch;
  const horloge = o.horloge ?? (() => new Date());
  const compte = encodeURIComponent(ids.compte);

  async function appel(
    chemin: string,
    init: { method?: string; corps?: BodyInit; type?: string; entetes?: object } = {},
  ) {
    const url = new URL(chemin, base + "/");
    if (url.origin !== new URL(base).origin || url.username || url.password)
      throw new PaError("B2Brouter : URL de suivi hors de l'origine autorisée");
    const res = await f(url, {
      method: init.method ?? (init.corps ? "POST" : "GET"),
      headers: {
        "x-b2b-api-key": ids.cleApi,
        "x-b2b-api-version": B2BROUTER_VERSION,
        accept: "application/json",
        ...(init.type ? { "content-type": init.type } : {}),
        ...init.entetes,
      },
      body: init.corps,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok && res.status !== 202 && res.status !== 404)
      throw new PaError(`B2Brouter ${chemin.split("?")[0]} : HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
  }
  const json = async <T>(res: Response) => (await res.json()) as T;

  return {
    nom: "b2brouter",
    async deposer(d) {
      const res = await appel(`/accounts/${compte}/invoices/import?send_after_import=true&issued=true`, {
        corps: new Uint8Array(d.facturx),
        type: "application/pdf",
      });
      if (res.status === 404) throw new PaError("B2Brouter : compte introuvable", 502);
      const { invoice } = await json<{ invoice: { id: number; state: string } }>(res);
      return { idPa: String(invoice.id), statut: ETATS[invoice.state] ?? "deposee" };
    },
    async statuts(idPa) {
      const res = await appel(`/invoices/${encodeURIComponent(idPa)}`);
      if (res.status === 404) throw new PaError(`B2Brouter : facture ${idPa} introuvable`, 404);
      const { invoice } = await json<{ invoice: { state: string; state_updated_at?: string; updated_at?: string } }>(
        res,
      );
      const statut = ETATS[invoice.state];
      const date = invoice.state_updated_at ?? invoice.updated_at ?? horloge().toISOString();
      return statut ? [{ idPa, statut, date: new Date(date).toISOString() }] : [];
    },
    async signaler(idPa, statut, motif) {
      const state = VERS_ETAT[statut];
      if (!state) throw new PaError(`B2Brouter : statut ${statut} non transmissible`, 422);
      await appel(`/invoices/${encodeURIComponent(idPa)}/mark_as`, {
        corps: JSON.stringify({ state, reason: motif ?? null }),
        type: "application/json",
      });
    },
    async entrantes(depuis) {
      const out: { idPa: string; date: string }[] = [];
      const limite = 500;
      for (let offset = 0; ; offset += limite) {
        const q = new URLSearchParams({ type: "ReceivedInvoice", offset: String(offset), limit: String(limite) });
        if (depuis) q.set("updated_at_from", depuis.slice(0, 10));
        const { invoices } = await json<{ invoices: { id: number; created_at?: string; date?: string }[] }>(
          await appel(`/accounts/${compte}/invoices?${q}`),
        );
        for (const i of invoices) out.push({ idPa: String(i.id), date: i.created_at ?? i.date ?? "" });
        if (invoices.length < limite) return out;
      }
    },
    async telecharger(idPa) {
      const res = await appel(`/invoices/${encodeURIComponent(idPa)}/as/original`, {
        entetes: { accept: "*/*" },
      });
      if (res.status === 404) throw new PaError(`B2Brouter : facture ${idPa} introuvable`, 404);
      return new Uint8Array(await res.arrayBuffer());
    },
    async annuaire(siren) {
      // Asynchronous search: 202 with polling_url, polled until 200, 404, 422 or 424.
      let url = `/directory/0002/${encodeURIComponent(siren)}`;
      for (let essai = 0; essai < 10; essai++) {
        const res = await appel(url);
        if (res.status === 404) return null;
        const b = await json<{ polling_url?: string; name?: string }>(res);
        if (res.status === 200) return { siren, nom: b.name, plateforme: null };
        url = b.polling_url ?? url;
        await Bun.sleep(o.attenteMs ?? 1000);
      }
      throw new PaError("B2Brouter : annuaire sans réponse");
    },
    async ereporting() {
      throw new PaError(
        "E-reporting indisponible : les totaux agrégés ne suffisent pas au flux natif et aucun Flux 10 v3.2 validé n'est fourni",
        503,
      );
    },
    async mandater(m) {
      // No mandate API published: the mandate is carried by the company's B2Brouter account.
      return { reference: `B2BROUTER-${ids.compte}-${m.siren}-${m.date}` };
    },
    async webhook(corps, entetes) {
      // Header `t=<timestamp>,s=<hex HMAC-SHA256 of "t.body">`.
      const p = Object.fromEntries(
        (entetes.get(ENTETE_B2BROUTER) ?? "").split(",").map((kv) => kv.trim().split("=") as [string, string]),
      );
      const t = Number(p.t);
      if (!p.s || !Number.isFinite(t)) return null;
      if (Math.abs(horloge().getTime() / 1000 - t) > (o.toleranceS ?? 300)) return null;
      if (!egal(p.s, hmac(ids.secretWebhook, `${p.t}.${corps}`))) return null;
      const b = JSON.parse(corps) as {
        code: string;
        triggered_at: number;
        data: { invoice_id?: number; state?: string; notes?: string | null };
      };
      const date = new Date(b.triggered_at * 1000).toISOString();
      const idPa = String(b.data?.invoice_id ?? "");
      if (!idPa) return [];
      if (b.code === "received_invoice.created") return [{ type: "recue", idPa, date }];
      const statut = b.code === "issued_invoice.state_change" ? ETATS[b.data.state ?? ""] : undefined;
      const ev: EvenementPa[] = statut
        ? [{ type: "statut", idPa, statut, date, motif: b.data.notes ?? undefined }]
        : [];
      return ev;
    },
  };
}

/**
 * Old XML draft kept for compatibility; it is not a valid Flux 10 and the adapter
 * refuses to send it. B2Brouter submission requires a Report conforming to the DGFiP XSD v3.2.
 * @deprecated Do not use for a real declaration.
 */
export function xmlEreporting(e: {
  nature: string;
  periode: string;
  lignes: { tva: number; htCents: number; tvaCents: number; pays?: string }[];
}) {
  const lignes = e.lignes
    .map(
      (l) =>
        `<Ligne tauxTva="${(l.tva / 10).toFixed(1)}" ht="${(l.htCents / 100).toFixed(2)}" montantTva="${(l.tvaCents / 100).toFixed(2)}"${
          l.pays ? ` pays="${echapper(l.pays)}"` : ""
        }/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><EReporting nature="${echapper(e.nature)}" periode="${echapper(e.periode)}">${lignes}</EReporting>`;
}
