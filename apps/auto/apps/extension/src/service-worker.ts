/// <reference types="chrome" />
// Service worker of the auto extension: "Send the invoice to auto" context menu and the badge of invoices to
// check. No state in global variables: settings and counters live in chrome.storage.
import { traducteur } from "./i18n";
import {
  INSTANCE_PAR_DEFAUT,
  TAILLE_MAX,
  erreurApi,
  messageDepot,
  motifHote,
  nomFichier,
  texteBadge,
  typeFichier,
  urlDepot,
  type Recue,
  type Reglages,
} from "./lib";

const MENU_LIEN = "envoyer-lien";
const MENU_PAGE = "envoyer-page";
const ALARME = "badge";
/** Badge colour: M3 primary role of @auto/ui (light theme); the badge API requires an explicit colour. */
// The UI language is read at each use: it can change while the service worker lives.
const t = () => traducteur(chrome.i18n.getUILanguage());
const COULEUR_BADGE = "#056b5b";

async function reglages(): Promise<Reglages> {
  const r = await chrome.storage.local.get(["instance", "jeton"]);
  return { instance: (r.instance as string) || INSTANCE_PAR_DEFAUT, jeton: (r.jeton as string) || "" };
}

async function notifier(titre: string, message: string) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: titre,
    message,
  });
}

async function majBadge() {
  const { instance, jeton } = await reglages();
  if (!jeton) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  try {
    const r = await fetch(`${instance}/v1/factures-recues?statut=a_verifier`, {
      headers: { authorization: `Bearer ${jeton}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const n = ((await r.json()) as unknown[]).length;
    await chrome.storage.local.set({ aVerifier: n, derniereMaj: new Date().toISOString(), erreurBadge: null });
    await chrome.action.setBadgeBackgroundColor({ color: COULEUR_BADGE });
    await chrome.action.setBadgeText({ text: texteBadge(n) });
    await chrome.action.setTitle({
      title: t().t("ext.badge.title", { count: n }),
    });
  } catch (e) {
    await chrome.storage.local.set({ erreurBadge: e instanceof Error ? e.message : String(e) });
    await chrome.action.setBadgeText({ text: "" });
  }
}

async function envoyer(url: string, autorisation: Promise<boolean>) {
  try {
    if (!(await autorisation))
      return await notifier(t().t("ext.notify.denied.title"), t().t("ext.notify.denied.message"));
    const { instance, jeton } = await reglages();
    if (!jeton) {
      await notifier(t().t("ext.notify.setup.title"), t().t("ext.notify.setup.message"));
      return await chrome.runtime.openOptionsPage();
    }
    const source = await fetch(url, { credentials: "include" });
    if (!source.ok) throw new Error(t().t("ext.error.download", { status: source.status }));
    const octets = new Uint8Array(await source.arrayBuffer());
    if (octets.length > TAILLE_MAX) throw new Error(t().t("ext.error.too_large"));
    const type = typeFichier(octets);
    if (!type) throw new Error(t().t("ext.error.not_invoice"));
    const nom = nomFichier(url, source.headers.get("content-disposition"), type);
    const r = await fetch(urlDepot(instance, nom), {
      method: "POST",
      headers: { authorization: `Bearer ${jeton}`, "content-type": type },
      body: octets,
    });
    const corps = await r.json().catch(() => null);
    if (!r.ok) throw new Error(erreurApi(r.status, corps, t()));
    const m = messageDepot(corps as Recue, nom, t());
    await notifier(m.titre, m.message);
    await majBadge();
  } catch (e) {
    await notifier(t().t("ext.notify.failed.title"), e instanceof Error ? e.message : String(e));
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({ id: MENU_LIEN, title: t().t("ext.menu.link"), contexts: ["link"] });
  // Page open in Chrome's PDF viewer, or displayed XML: same action on the page itself.
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: t().t("ext.menu.page"),
    contexts: ["page"],
    documentUrlPatterns: ["*://*/*.pdf", "*://*/*.pdf?*", "*://*/*.xml", "*://*/*.xml?*"],
  });
  await chrome.alarms.create(ALARME, { periodInMinutes: 15 });
  await majBadge();
});

chrome.runtime.onStartup.addListener(() => void majBadge());

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARME) void majBadge();
});

chrome.contextMenus.onClicked.addListener((info) => {
  const cible = info.menuItemId === MENU_LIEN ? info.linkUrl : info.pageUrl;
  if (!cible || !/^https?:/.test(cible)) {
    void notifier(t().t("ext.notify.unsupported.title"), t().t("ext.notify.unsupported.message"));
    return;
  }
  // The click grants access to the current tab (activeTab). A file hosted elsewhere needs a permission
  // requested right here, before any await: the user gesture does not survive waiting.
  const autreSite = new URL(cible).origin !== new URL(info.pageUrl ?? cible).origin;
  const autorisation = autreSite ? chrome.permissions.request({ origins: [motifHote(cible)] }) : Promise.resolve(true);
  void envoyer(cible, autorisation);
});

// Messages from extension pages only (popup, tests): badge update, sending an invoice URL.
chrome.runtime.onMessage.addListener((m: { type?: string; url?: string }, expediteur, repondre) => {
  // Extension pages only: a content script would carry a web page URL.
  if (expediteur.id !== chrome.runtime.id || !expediteur.url?.startsWith(chrome.runtime.getURL(""))) return false;
  const action =
    m?.type === "majBadge"
      ? majBadge
      : m?.type === "envoyer" && typeof m.url === "string" && /^https?:/.test(m.url)
        ? () => envoyer(m.url!, Promise.resolve(true))
        : null;
  if (!action) return false;
  (async () => {
    await action();
    repondre({ ok: true });
  })();
  return true;
});
