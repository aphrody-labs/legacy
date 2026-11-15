import "./site";
import { date, nombre, t } from "../client/i18n";
import type { Catalogue, Distribution } from "../distributions";

const liste = document.getElementById("distributions")!;
const etat = document.getElementById("version-disponible")!;
const notes = document.getElementById("notes-distributions")!;
function texte<K extends keyof HTMLElementTagNameMap>(tag: K, contenu: string) {
  const e = document.createElement(tag);
  e.textContent = contenu;
  return e;
}
// Distribution types are manifest data (published by the release scripts); each maps to a catalog message.
const DESCRIPTIONS: Record<Distribution["type"], string> = {
  autonome: "downloads.type.standalone",
  apk: "downloads.type.apk",
  portable: "downloads.type.portable",
  installateur: "downloads.type.installer",
};
function carte(a: Distribution) {
  const article = document.createElement("article");
  article.className = "distribution";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("icone");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("width", "24");
  use.setAttribute("height", "24");
  use.setAttribute("href", "/icones/symboles.svg#FileDown");
  icon.append(use);
  const taille = nombre(a.octets / 1024 / 1024, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 });
  article.append(icon, texte("h3", a.nom), texte("p", `${a.architecture} · ${taille}`));
  article.append(texte("p", t(DESCRIPTIONS[a.type])));
  const lien = texte("a", t("downloads.download", { name: a.nom }));
  lien.className = "bouton bouton-primaire";
  lien.href = `/downloads/${encodeURIComponent(a.fichier)}`;
  lien.download = a.fichier;
  article.append(lien);
  const details = document.createElement("details");
  details.append(texte("summary", t("downloads.fingerprint")), texte("code", a.sha256));
  article.append(details);
  return article;
}
try {
  const r = await fetch("/api/distributions", { cache: "no-cache" });
  if (!r.ok) throw Error("catalog");
  const c = (await r.json()) as Catalogue;
  if (!c.fichiers?.length) {
    liste.replaceChildren();
    etat.textContent = t("downloads.publishing");
  } else {
    etat.textContent = t("downloads.version", { version: c.version, date: date(c.date) });
    liste.replaceChildren(...c.fichiers.map(carte));
    notes.textContent = c.notes ?? "";
  }
} catch {
  liste.replaceChildren();
  etat.textContent = t("downloads.unavailable");
}
