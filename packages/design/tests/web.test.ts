import "@angular/compiler";
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  angularThemeCss,
  materialEntry,
  materialImports,
  materialModule,
  materialSelectors,
  tokensCss,
  typescale,
  typescaleCss,
} from "../src/web.ts";

const PKG = join(import.meta.dir, "..");

describe("@aphrody/design/web", () => {
  test("tokensCss is minified and carries the M3 roles", () => {
    const css = tokensCss();
    expect(css).toContain("--md-sys-color-primary");
    expect(css).not.toContain("/*");
    expect(css).not.toContain("\n");
  });
  test("typescale references the tokens only", () => {
    expect(typescale("body-large")).toContain(
      "var(--md-sys-typescale-body-large-size)",
    );
    expect(typescaleCss()).toContain(".md-typescale-display-large{");
  });
  test("materialEntry maps selectors and rejects others", () => {
    expect(materialEntry("mat-card")).toBe("@angular/material/card");
    expect(materialEntry("matButton")).toBe("@angular/material/button");
    expect(materialModule("mat-chip-set")).toBe("MatChipsModule");
    expect(() => materialEntry("md-filled-button")).toThrow();
    expect(() => materialEntry("div")).toThrow();
  });
  test("every mapped selector resolves to a real Angular Material NgModule", async () => {
    for (const sel of materialSelectors()) {
      const entry = materialEntry(sel);
      Bun.resolveSync(entry, PKG);
      const mod = await import(entry);
      expect(typeof mod[materialModule(sel)]).toBe("function");
    }
  }, 60000);
  test("materialImports is deterministic and deduplicated", () => {
    const a = materialImports(["mat-card", "matButton", "mat-flat-button"]);
    const b = materialImports(["mat-flat-button", "matButton", "mat-card"]);
    expect(a).toEqual(b);
    expect(a.array).toBe("[MatButtonModule, MatCardModule]");
    expect(a.imports).toContain(
      'import { MatCardModule } from "@angular/material/card";',
    );
  });
  test("components.ts re-exports the modules of the table", async () => {
    const c = await import("../src/components.ts");
    for (const sel of materialSelectors())
      expect(typeof (c as Record<string, unknown>)[materialModule(sel)]).toBe(
        "function",
      );
    expect(c.APHRODY_MATERIAL.length).toBeGreaterThan(20);
  }, 60000);
  test("Angular theme maps --mat-sys-* on the generated --md-sys-* tokens", () => {
    const css = angularThemeCss();
    expect(css).toContain("--mat-sys-primary: var(--md-sys-color-primary)");
    expect(css).toContain(
      "--mat-sys-focus-state-layer-opacity: var(--md-sys-state-focus-state-layer-opacity)",
    );
    expect(css).toContain(
      "--mat-sys-corner-medium: var(--md-sys-shape-corner-medium)",
    );
    // every color role of tokens.css is mapped
    const roles = [
      ...readFileSync(join(PKG, "tokens", "tokens.css"), "utf8").matchAll(
        /--md-sys-color-([a-z-]+):/g,
      ),
    ].map((m) => m[1]);
    expect(roles.length).toBeGreaterThan(40);
    expect(existsSync(join(PKG, "tokens", "angular-theme.scss"))).toBe(true);
    for (const r of new Set(roles).intersection(
      new Set([
        "primary",
        "on-surface",
        "surface-container-high",
        "outline-variant",
        "error",
      ]),
    ))
      expect(css).toContain(`--mat-sys-${r}: var(--md-sys-color-${r})`);
  });
});
