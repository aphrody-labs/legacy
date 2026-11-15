// Development entry point of the showcase (Bun.serve HTML imports, HMR): client-side React render, then the same
// islands as in production. In production, construction.tsx prerenders the page and loads accueil-ilots.ts.
import { createTranslator, matchLocale } from "@auto/i18n";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Accueil } from "./accueil";
import { activerIlots } from "./ilots";
import "./site";

const racine = createRoot(document.getElementById("racine")!);
const locale = matchLocale(navigator.languages.join(","));
document.documentElement.lang = locale;
document.title = createTranslator(locale).t("home.meta.title");
flushSync(() => racine.render(<Accueil locale={locale} />));
activerIlots();
