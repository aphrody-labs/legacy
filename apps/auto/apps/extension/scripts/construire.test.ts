// Conformance of the built package: Manifest V3, referenced files present, icons at the right size,
// no page with an inline script or inline event handler (extension CSP), one _locales folder per catalog.
import { beforeAll, expect, test } from "bun:test";
import { catalogs } from "../src/i18n";
import { construire, TAILLES } from "./construire";

const dist = new URL("../dist/", import.meta.url);
let fichiers: string[] = [];
let manifeste: Record<string, any>;

beforeAll(async () => {
  fichiers = (await construire()).map((f) => f.replaceAll("\\", "/"));
  manifeste = await Bun.file(new URL("manifest.json", dist)).json();
});

test("Manifest V3, no V2 API", () => {
  expect(manifeste.manifest_version).toBe(3);
  expect(manifeste.background).toEqual({ service_worker: "service-worker.js", type: "module" });
  expect(manifeste.browser_action).toBeUndefined();
  expect(manifeste.action).toBeDefined(); // requis par chrome.action (badge, titre)
  expect(manifeste.name).toBe("__MSG_extName__");
  expect(manifeste.description).toBe("__MSG_extDescription__");
});

test("one _locales folder per catalog; names and descriptions within store limits", async () => {
  expect(manifeste.default_locale).toBeDefined();
  for (const tag of Object.keys(catalogs)) {
    const m = await Bun.file(new URL(`_locales/${tag.replace("-", "_")}/messages.json`, dist)).json();
    expect(m.extName.message.length).toBeLessThanOrEqual(75);
    expect(m.extDescription.message.length).toBeLessThanOrEqual(132);
  }
  expect(fichiers).toContain(`_locales/${manifeste.default_locale}/messages.json`);
});

test("minimal permissions and restricted hosts", () => {
  expect(manifeste.permissions.sort()).toEqual(["activeTab", "alarms", "contextMenus", "notifications", "storage"]);
  expect(manifeste.host_permissions).toEqual(["https://auto.aphrody.com/*"]);
  expect(manifeste.permissions).not.toContain("tabs");
  expect(JSON.stringify(manifeste)).not.toContain("<all_urls>");
});

test("every referenced file exists; PNG icons at the announced sizes", async () => {
  const references = [
    manifeste.background.service_worker,
    manifeste.action.default_popup,
    manifeste.options_ui.page,
    ...Object.values(manifeste.icons),
    ...Object.values(manifeste.action.default_icon),
  ] as string[];
  for (const r of references) expect(fichiers).toContain(r);
  for (const t of TAILLES) {
    const png = await Bun.file(new URL(`icons/icon-${t}.png`, dist)).bytes();
    const v = new DataView(png.buffer);
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([t, t]);
  }
  expect(fichiers).toContain("tokens.css");
});

test("pages without inline script or handler; sources without eval or .then", async () => {
  const html = await Bun.file(new URL("popup.html", dist)).text();
  expect([...html.matchAll(/<script\b[^>]*>/g)].every((m) => /\bsrc=/.test(m[0]))).toBe(true);
  expect(html).not.toMatch(/\son[a-z]+=/i);
  for (const f of ["service-worker.js", "popup.js"]) {
    const js = await Bun.file(new URL(f, dist)).text();
    expect(js).not.toMatch(/\beval\(|new Function\(/);
  }
  for (const f of new Bun.Glob("*.ts").scanSync(Bun.fileURLToPath(new URL("../src/", import.meta.url))))
    expect(await Bun.file(new URL(`../src/${f}`, import.meta.url)).text()).not.toContain(".then(");
});
