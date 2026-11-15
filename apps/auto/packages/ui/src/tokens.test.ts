import { describe, expect, test } from "bun:test";
import { type Theme, contraste, genererCss, palettes, roles, statuts } from "./tokens";

const themes: Theme[] = ["clair", "sombre"];

describe("WCAG AA contrasts", () => {
  test("reference: black on white = 21", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  for (const t of themes) {
    const p = palettes[t];
    test(`${t}: text >= 4.5`, () => {
      for (const fond of [p.fond, p.surface, p.surfaceAlt]) {
        expect(contraste(p.texte, fond)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(p.texteAttenue, fond)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contraste(p.surPrimaire, p.primaire)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.surDanger, p.danger)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.primaire, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.danger, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.succes, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(p.avertissement, p.surface)).toBeGreaterThanOrEqual(4.5);
    });
    test(`${t}: non-text elements >= 3`, () => {
      expect(contraste(p.bordureControle, p.surface)).toBeGreaterThanOrEqual(3);
      expect(contraste(p.focus, p.surface)).toBeGreaterThanOrEqual(3);
      expect(contraste(p.focus, p.fond)).toBeGreaterThanOrEqual(3);
    });
    test(`${t}: status badges >= 4.5`, () => {
      for (const [nom, s] of Object.entries(statuts[t])) {
        expect(contraste(s.texte, s.fond), nom).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("tokens.css", () => {
  test("is the exact mirror of tokens.ts", async () => {
    const css = await Bun.file(new URL("./tokens.css", import.meta.url)).text();
    expect(css).toBe(genererCss());
  });
});

describe("Material 3 aliases", () => {
  test("every referenced var(--…) is defined (here or in the M3 system tokens)", async () => {
    const css = genererCss();
    const m3 = await Bun.file(Bun.fileURLToPath(import.meta.resolve("@aphrody/m3-tokens/m3-tokens.css"))).text();
    const definies = new Set([...(css + m3).matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    const references = new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
    expect([...references].filter((v) => !definies.has(v))).toEqual([]);
  });

  test("primary = M3 primary role of the brand seed", () => {
    expect(palettes.clair.primaire).toBe(roles.clair["--md-sys-color-primary"]!);
    expect(palettes.sombre.texte).toBe(roles.sombre["--md-sys-color-on-surface"]!);
  });
});

test("color scheme of native controls matches the forced theme", () => {
  const css = genererCss();
  expect(css).toMatch(/:root\[data-theme="clair"\] \{\n {2}color-scheme: light;/);
  expect(css).toMatch(/:root\[data-theme="sombre"\] \{\n {2}color-scheme: dark;/);
  expect(css).toMatch(/:root \{\n {2}color-scheme: light dark;/);
});
