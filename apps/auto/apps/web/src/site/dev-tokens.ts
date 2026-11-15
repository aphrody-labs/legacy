// Development only: the HTML imports of `Bun.serve` are not localized by the server (production is, see
// construction.tsx), so the `%%key%%` / `%%html:key%%` tokens left in the page are replaced here with the catalog.
// Loaded on demand by site.ts, so no production page ships it.
import { t } from "../client/i18n";

const jeton = /%%(html:)?([\w.:]+)%%/g;
const echapper = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
document.body.innerHTML = document.body.innerHTML.replace(jeton, (_, brut: string | undefined, cle: string) =>
  brut ? t(cle) : echapper(t(cle)),
);
for (const e of document.head.querySelectorAll("title, meta[content]")) {
  if (e instanceof HTMLMetaElement) e.content = e.content.replace(jeton, (_, __, c: string) => t(c));
  else e.textContent = (e.textContent ?? "").replace(jeton, (_, __, c: string) => t(c));
}
