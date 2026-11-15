// Public page of a quote (/devis/<token>): view, PDF and customer answer, no account needed.
// All content is inserted as text (no HTML coming from the API).
import "./site";
import { date, monnaie, nombre, t } from "../client/i18n";

interface Vue {
  numero: string;
  statut: string;
  emetteur: string;
  client: string;
  date: string;
  validiteJours: number | null;
  lignes: { designation: string; quantite: number; prixUnitaireHtCents: number }[];
  totaux: { htCents: number; tvaCents: number; ttcCents: number };
  decidable: boolean;
}

const jeton = decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) ?? "");
const base = `/v1/public/devis/${encodeURIComponent(jeton)}`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const eur = (c: number) => monnaie(c / 100, "EUR");
const dateLongue = (iso: string) => date(`${iso}T12:00:00`, { dateStyle: "long" });
// Statuses are API data; each maps to a catalog message.
const REPONSES: Record<string, string> = {
  accepte: "quote.answer.accepted",
  refuse: "quote.answer.refused",
};

function afficher(v: Vue) {
  document.title = t("quote.doc_title", { number: v.numero, issuer: v.emetteur });
  $("titre-devis").textContent = t("quote.title", { number: v.numero });
  $("parties").textContent = v.validiteJours
    ? t("quote.parties_valid", {
        issuer: v.emetteur,
        client: v.client,
        date: dateLongue(v.date),
        days: v.validiteJours,
      })
    : t("quote.parties", { issuer: v.emetteur, client: v.client, date: dateLongue(v.date) });
  $("lignes").replaceChildren(
    ...v.lignes.map((l) => {
      const tr = document.createElement("tr");
      for (const [texte, num] of [
        [l.designation, false],
        [nombre(l.quantite), true],
        [eur(l.prixUnitaireHtCents), true],
      ] as const) {
        const td = document.createElement("td");
        td.textContent = texte;
        if (num) td.className = "num";
        tr.append(td);
      }
      return tr;
    }),
  );
  $("total-ht").textContent = eur(v.totaux.htCents);
  $("total-tva").textContent = eur(v.totaux.tvaCents);
  $("total-ttc").textContent = eur(v.totaux.ttcCents);
  $<HTMLAnchorElement>("pdf").href = `${base}/pdf`;
  $("decision").hidden = !v.decidable;
  const reponse = $("reponse");
  reponse.hidden = v.decidable;
  reponse.textContent = t(REPONSES[v.statut] ?? "quote.answer.closed");
  $("etat").hidden = true;
  $("devis").hidden = false;
}

async function charger() {
  const r = await fetch(base, { headers: { accept: "application/json" } }).catch(() => null);
  if (!r?.ok) {
    $("etat").textContent = t(r?.status === 404 ? "quote.error.invalid_link" : "quote.error.load");
    return;
  }
  afficher((await r.json()) as Vue);
}

$<HTMLFormElement>("decision").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  const champ = $<HTMLInputElement>("nom");
  const erreur = $("erreur");
  const nom = champ.value.trim();
  if (!nom) {
    erreur.textContent = t("quote.error.name_required");
    erreur.hidden = false;
    champ.setAttribute("aria-invalid", "true");
    champ.focus();
    return;
  }
  champ.removeAttribute("aria-invalid");
  erreur.hidden = true;
  for (const b of $("decision").querySelectorAll("button")) b.disabled = true;
  const r = await fetch(`${base}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: bouton?.value, nom }),
  }).catch(() => null);
  if (r?.ok) {
    afficher((await r.json()) as Vue);
    $("reponse").focus();
    return;
  }
  for (const b of $("decision").querySelectorAll("button")) b.disabled = false;
  erreur.textContent = t(r?.status === 409 ? "quote.error.already_answered" : "quote.error.save");
  erreur.hidden = false;
});

await charger();
