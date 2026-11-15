// Public page of an invoice (/facture/<token>): amounts, Factur-X and card payment (Stripe Checkout).
// On return from Stripe (?session=…), the session is confirmed server-side before any success message.
import "./site";
import { date, monnaie, t } from "../client/i18n";

interface Vue {
  numero: string;
  statut: string;
  emetteur: string;
  client: string;
  date: string;
  echeance: string | null;
  totaux: { htCents: number; tvaCents: number; ttcCents: number };
  resteCents: number;
  payable: boolean;
  enregistre?: boolean;
}

const jeton = decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) ?? "");
const base = `/v1/public/factures/${encodeURIComponent(jeton)}`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const eur = (c: number) => monnaie(c / 100, "EUR");
const dateLongue = (iso: string) => date(`${iso}T12:00:00`, { dateStyle: "long" });

function afficher(v: Vue) {
  document.title = t("invoice.doc_title", { number: v.numero, issuer: v.emetteur });
  $("titre-facture").textContent = t("invoice.title", { number: v.numero });
  $("parties").textContent = v.echeance
    ? t("invoice.parties_due", {
        issuer: v.emetteur,
        client: v.client,
        date: dateLongue(v.date),
        due: dateLongue(v.echeance),
      })
    : t("invoice.parties", { issuer: v.emetteur, client: v.client, date: dateLongue(v.date) });
  $("total-ht").textContent = eur(v.totaux.htCents);
  $("total-tva").textContent = eur(v.totaux.tvaCents);
  $("total-ttc").textContent = eur(v.totaux.ttcCents);
  $("reste").textContent = eur(v.resteCents);
  $<HTMLAnchorElement>("pdf").href = `${base}/pdf`;
  $("payer").textContent = t("invoice.pay", { amount: eur(v.resteCents) });
  $("paiement").hidden = !v.payable;
  const reponse = $("reponse");
  reponse.hidden = v.payable;
  reponse.textContent = t(v.resteCents === 0 ? "invoice.settled" : "invoice.online_unavailable");
  $("etat").hidden = true;
  $("facture").hidden = false;
}

const erreurChargement = (status?: number) => t(status === 404 ? "invoice.error.invalid_link" : "invoice.error.load");

async function charger() {
  const session = new URLSearchParams(location.search).get("session");
  const r = session
    ? await fetch(`${base}/confirmation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session }),
      }).catch(() => null)
    : await fetch(base, { headers: { accept: "application/json" } }).catch(() => null);
  if (!r?.ok) {
    $("etat").textContent = erreurChargement(r?.status);
    return;
  }
  const v = (await r.json()) as Vue;
  afficher(v);
  if (session) {
    history.replaceState(null, "", location.pathname);
    if (v.enregistre || v.resteCents === 0) {
      $("reponse").textContent = t("invoice.payment_received");
      $("reponse").hidden = false;
      $("reponse").focus();
    }
  }
}

$("payer").addEventListener("click", async () => {
  const bouton = $<HTMLButtonElement>("payer");
  const erreur = $("erreur");
  bouton.disabled = true;
  erreur.hidden = true;
  const r = await fetch(`${base}/paiement`, { method: "POST" }).catch(() => null);
  if (r?.ok) {
    location.assign(((await r.json()) as { url: string }).url);
    return;
  }
  bouton.disabled = false;
  erreur.textContent = t(r?.status === 409 ? "invoice.error.not_payable" : "invoice.error.payment");
  erreur.hidden = false;
});

await charger();
