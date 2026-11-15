/// <reference types="chrome" />
// Popup: settings (instance, API token) tested against /v1/moi, and the state of invoices to check.
import { traducteur } from "./i18n";
import { INSTANCE_PAR_DEFAUT, erreurApi, jetonValide, motifHote, normaliserInstance } from "./lib";

const t = traducteur(chrome.i18n.getUILanguage());
document.documentElement.lang = t.locale;
document.title = t.t("ext.popup.title");
for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t.t(el.dataset.i18n!);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("reglages");
const champInstance = $<HTMLInputElement>("instance");
const champJeton = $<HTMLInputElement>("jeton");
const erreur = $<HTMLParagraphElement>("erreur");
const bouton = $<HTMLButtonElement>("enregistrer");

function afficherErreur(message: string | null, champ?: HTMLInputElement) {
  for (const c of [champInstance, champJeton]) c.removeAttribute("aria-invalid");
  erreur.hidden = !message;
  erreur.textContent = message ?? "";
  if (champ) {
    champ.setAttribute("aria-invalid", "true");
    champ.setAttribute("aria-errormessage", "erreur");
    champ.focus();
  }
}

async function afficherEtat() {
  const s = await chrome.storage.local.get(["instance", "jeton", "aVerifier", "entreprise", "erreurBadge"]);
  const instance = (s.instance as string) || INSTANCE_PAR_DEFAUT;
  champInstance.value = instance;
  const resume = $("resume");
  const ouvrir = $<HTMLAnchorElement>("ouvrir");
  if (!s.jeton) {
    resume.textContent = t.t("ext.popup.not_configured");
    ouvrir.hidden = true;
    return;
  }
  const n = Number(s.aVerifier ?? 0);
  const company = s.entreprise ? String(s.entreprise) : null;
  const state = n === 0 ? (company ? "none" : "none_anonymous") : company ? "some" : "some_anonymous";
  resume.textContent = s.erreurBadge
    ? t.t("ext.popup.connection_failed", { host: new URL(instance).host, reason: s.erreurBadge })
    : t.t(`ext.popup.${state}`, { company, count: n });
  ouvrir.href = `${instance}/app/achats`;
  ouvrir.hidden = false;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  let instance: string;
  try {
    instance = normaliserInstance(champInstance.value || INSTANCE_PAR_DEFAUT, t);
  } catch (err) {
    afficherErreur((err as Error).message, champInstance);
    return;
  }
  const jeton = champJeton.value.trim();
  if (!jetonValide(jeton)) {
    afficherErreur(t.t("ext.error.token_invalid"), champJeton);
    return;
  }
  // An instance other than auto.aphrody.com asks for permission within the user gesture, before any await.
  const autorisation =
    instance === INSTANCE_PAR_DEFAUT
      ? Promise.resolve(true)
      : chrome.permissions.request({ origins: [motifHote(instance)] });
  void (async () => {
    bouton.disabled = true;
    bouton.textContent = t.t("ext.popup.testing");
    try {
      if (!(await autorisation)) {
        afficherErreur(t.t("ext.error.access_refused"));
        return;
      }
      const r = await fetch(`${instance}/v1/moi`, { headers: { authorization: `Bearer ${jeton}` } });
      const corps = await r.json().catch(() => null);
      if (!r.ok) {
        afficherErreur(erreurApi(r.status, corps, t), r.status === 401 ? champJeton : undefined);
        return;
      }
      const moi = corps as { entreprise?: { nom?: string } };
      await chrome.storage.local.set({ instance, jeton, entreprise: moi.entreprise?.nom ?? null });
      champJeton.value = "";
      afficherErreur(null);
      await chrome.runtime.sendMessage({ type: "majBadge" });
      await afficherEtat();
    } catch (err) {
      afficherErreur(t.t("ext.error.unreachable", { reason: (err as Error).message }), champInstance);
    } finally {
      bouton.disabled = false;
      bouton.textContent = t.t("ext.popup.save");
    }
  })();
});

void afficherEtat();
