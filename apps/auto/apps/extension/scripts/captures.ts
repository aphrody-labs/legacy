// Chrome Web Store visuals: two 1280x800 screenshots and the 440x280 tile, written to apps/extension/store/<tag>/,
// one set per catalog present. The real extension is built in a temporary folder, where composition pages are added
// that frame the real popup (same origin, so an iframe works). These pages are never in dist or in the zip.
// No network call: the popup is not submitted. Usage: bun apps/extension/scripts/captures.ts
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { catalogs, traducteur } from "../src/i18n";
import { construire } from "./construire";

function cheminChrome(): string | null {
  if (Bun.env.AUTO_CHROME) return Bun.env.AUTO_CHROME;
  const racine =
    Bun.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(Bun.env.LOCALAPPDATA ?? join(Bun.env.HOME ?? "", ".cache"), "ms-playwright");
  for (const m of ["chromium-*/chrome-win64/chrome.exe", "chromium-*/chrome-linux64/chrome"])
    for (const f of existsSync(racine) ? new Bun.Glob(m).scanSync({ cwd: racine, onlyFiles: true }) : [])
      return join(racine, f);
  return null;
}

const STYLE = `
  html, body { margin: 0; }
  body { background: var(--auto-fond); color: var(--auto-texte); font-family: var(--auto-police-corps); }
  h1, .nom { font-family: var(--auto-police-titre); font-weight: 600; margin: 0; }
  .scene { box-sizing: border-box; width: 1280px; height: 800px; display: grid; grid-template-columns: 1fr 560px;
    align-items: center; padding: 0 var(--auto-espace-16) 0 112px; gap: var(--auto-espace-8); }
  h1 { font-size: 44px; line-height: 1.15; max-width: 13em; color: var(--auto-primaire); }
  ul { list-style: none; margin: var(--auto-espace-8) 0 0; padding: 0; display: grid; gap: var(--auto-espace-4); }
  li { font-size: 20px; line-height: 1.4; max-width: 24em; }
  .popup { justify-self: center; width: 374px; height: 704px; position: relative; }
  iframe { position: absolute; top: 0; left: 0; width: 340px; height: 650px; border: 0; transform: scale(1.1);
    transform-origin: top left; background: var(--auto-fond); border-radius: var(--auto-rayon-lg);
    box-shadow: var(--auto-ombre-lg); }
`;

const scene = (lang: string, titre: string, points: string[], popup: string) => `<!doctype html><html lang="${lang}"><meta charset="utf-8">
<link rel="stylesheet" href="tokens.css"><style>${STYLE}</style>
<main class="scene"><div><h1>${titre}</h1><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul></div>
<div class="popup"><iframe src="popup.html" title="${popup}"></iframe></div></main></html>`;

const vignette = (lang: string, accroche: string) => `<!doctype html><html lang="${lang}"><meta charset="utf-8"><link rel="stylesheet" href="tokens.css">
<style>html,body{margin:0}body{width:440px;height:280px;box-sizing:border-box;background:var(--auto-fond);
color:var(--auto-texte);font-family:var(--auto-police-corps);display:flex;flex-direction:column;justify-content:center;
padding:0 var(--auto-espace-10);gap:var(--auto-espace-3)}
img{width:64px;height:64px;border-radius:var(--auto-rayon-lg)}
.nom{font-size:64px;line-height:1;color:var(--auto-primaire);margin:0;font-family:var(--auto-police-titre);font-weight:600}
p{margin:0;font-size:20px}</style>
<img src="icons/icon-128.png" alt=""><div class="nom">auto</div><p>${accroche}</p></html>`;

const executable = cheminChrome();
if (!executable) throw new Error("Full Chromium not found (AUTO_CHROME or playwright install chromium).");

const sortie = Bun.fileURLToPath(new URL("../store/", import.meta.url));
for (const tag of Object.keys(catalogs)) {
  const t = traducteur(tag);
  const dossier = join(sortie, tag);
  mkdirSync(dossier, { recursive: true });
  const ext = mkdtempSync(join(tmpdir(), "auto-cap-"));
  const profil = mkdtempSync(join(tmpdir(), "auto-cap-profil-"));
  try {
    await construire({ dist: Bun.pathToFileURL(`${ext}/`) });
    const points = (c: string) => [1, 2, 3].map((n) => t.t(`ext.store.${c}.p${n}`));
    const popup = t.t("ext.store.popup_title");
    await Bun.write(join(ext, "capture-1.html"), scene(t.locale, t.t("ext.store.c1.title"), points("c1"), popup));
    await Bun.write(join(ext, "capture-2.html"), scene(t.locale, t.t("ext.store.c2.title"), points("c2"), popup));
    await Bun.write(join(ext, "vignette.html"), vignette(t.locale, t.t("ext.store.tagline")));

    const contexte = await chromium.launchPersistentContext(profil, {
      executablePath: executable,
      headless: true,
      locale: tag,
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${tag}`],
    });
    try {
      const sw = contexte.serviceWorkers()[0] ?? (await contexte.waitForEvent("serviceworker"));
      const base = `chrome-extension://${new URL(sw.url()).host}`;
      const page = await contexte.newPage();

      // Screenshot 1: signed-in account, three invoices to check.
      await sw.evaluate((r) => chrome.storage.local.set(r), {
        instance: "https://auto.aphrody.com",
        jeton: "auto_exemple",
        aVerifier: 3,
        entreprise: "Acheteur SARL",
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${base}/capture-1.html`);
      await page.frameLocator("iframe").getByText(t.t("ext.popup.some", { company: "Acheteur SARL", count: 3 })).waitFor();
      await page.screenshot({ path: join(dossier, "capture-1.png") });

      // Screenshot 2: extension not configured, token typed in (never submitted: no network call).
      await sw.evaluate(() => chrome.storage.local.clear());
      await page.goto(`${base}/capture-2.html`);
      await page.frameLocator("iframe").getByLabel(t.t("ext.popup.token")).fill("auto_0123456789abcdef");
      await page.screenshot({ path: join(dossier, "capture-2.png") });

      await page.setViewportSize({ width: 440, height: 280 });
      await page.goto(`${base}/vignette.html`);
      await page.screenshot({ path: join(dossier, "promo-440x280.png") });
    } finally {
      await contexte.close();
    }
  } finally {
    rmSync(ext, { recursive: true, force: true });
    rmSync(profil, { recursive: true, force: true });
  }
  for (const f of ["capture-1.png", "capture-2.png", "promo-440x280.png"]) {
    const o = new DataView((await Bun.file(join(dossier, f)).slice(16, 24).arrayBuffer()) as ArrayBuffer);
    console.log(`${tag}/${f}: ${o.getUint32(0)}x${o.getUint32(4)}`);
  }
}
