// @aphrody/design/web : inputs of web pages from the design system. tokens.css (Material Color Utilities from
// packages/design/brand/brand.toml), the Angular Material M3 theme (--mat-sys-* on those tokens), the Angular Material
// module map, and the M3 typescale as CSS. Angular components are compiled by the Angular builder of the consuming
// app (apps/aphrody/web), never bundled here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..");
const TOKENS = join(PKG, "tokens", "tokens.css");
const ANGULAR_THEME = join(PKG, "tokens", "angular-material.css");

/** Minify CSS conservatively: comments and whitespace only. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

/** packages/design/tokens/tokens.css, minified. */
export function tokensCss(): string {
  return minifyCss(readFileSync(TOKENS, "utf8"));
}

/** M3 type roles (display/headline/title/body/label x large/medium/small). */
export const TYPE_ROLES = [
  "display",
  "headline",
  "title",
  "body",
  "label",
].flatMap((r) => ["large", "medium", "small"].map((s) => `${r}-${s}`));

/** CSS `font` + `letter-spacing` declarations of an M3 type role, from the typescale tokens. */
export const typescale = (role: string): string =>
  `font:var(--md-sys-typescale-${role}-weight) var(--md-sys-typescale-${role}-size)/var(--md-sys-typescale-${role}-line-height) var(--md-sys-typescale-${role}-font);letter-spacing:var(--md-sys-typescale-${role}-tracking)`;

/** One `.md-typescale-<role>` utility class per role. */
export const typescaleCss = (): string =>
  TYPE_ROLES.map((r) => `.md-typescale-${r}{${typescale(r)}}`).join("");

/** Angular Material secondary entry point and NgModule of every selector the sites use (tag or attribute). */
const MATERIAL: Record<string, readonly [entry: string, module: string]> = {
  matButton: ["button", "MatButtonModule"],
  "mat-button": ["button", "MatButtonModule"],
  "mat-flat-button": ["button", "MatButtonModule"],
  "mat-stroked-button": ["button", "MatButtonModule"],
  "mat-raised-button": ["button", "MatButtonModule"],
  "mat-icon-button": ["button", "MatButtonModule"],
  "mat-fab": ["button", "MatButtonModule"],
  "mat-mini-fab": ["button", "MatButtonModule"],
  "mat-button-toggle": ["button-toggle", "MatButtonToggleModule"],
  "mat-button-toggle-group": ["button-toggle", "MatButtonToggleModule"],
  "mat-card": ["card", "MatCardModule"],
  "mat-checkbox": ["checkbox", "MatCheckboxModule"],
  "mat-chip": ["chips", "MatChipsModule"],
  "mat-chip-set": ["chips", "MatChipsModule"],
  "mat-chip-listbox": ["chips", "MatChipsModule"],
  "mat-chip-option": ["chips", "MatChipsModule"],
  "mat-chip-grid": ["chips", "MatChipsModule"],
  "mat-dialog-content": ["dialog", "MatDialogModule"],
  "mat-divider": ["divider", "MatDividerModule"],
  "mat-form-field": ["form-field", "MatFormFieldModule"],
  "mat-label": ["form-field", "MatFormFieldModule"],
  "mat-hint": ["form-field", "MatFormFieldModule"],
  "mat-error": ["form-field", "MatFormFieldModule"],
  "mat-icon": ["icon", "MatIconModule"],
  matInput: ["input", "MatInputModule"],
  "mat-list": ["list", "MatListModule"],
  "mat-nav-list": ["list", "MatListModule"],
  "mat-action-list": ["list", "MatListModule"],
  "mat-selection-list": ["list", "MatListModule"],
  "mat-list-item": ["list", "MatListModule"],
  "mat-menu": ["menu", "MatMenuModule"],
  "mat-progress-bar": ["progress-bar", "MatProgressBarModule"],
  "mat-progress-spinner": ["progress-spinner", "MatProgressSpinnerModule"],
  "mat-radio-button": ["radio", "MatRadioModule"],
  "mat-radio-group": ["radio", "MatRadioModule"],
  "mat-select": ["select", "MatSelectModule"],
  "mat-option": ["select", "MatSelectModule"],
  "mat-sidenav": ["sidenav", "MatSidenavModule"],
  "mat-sidenav-container": ["sidenav", "MatSidenavModule"],
  "mat-slide-toggle": ["slide-toggle", "MatSlideToggleModule"],
  "mat-slider": ["slider", "MatSliderModule"],
  "mat-table": ["table", "MatTableModule"],
  "mat-tab-group": ["tabs", "MatTabsModule"],
  "mat-tab": ["tabs", "MatTabsModule"],
  "mat-toolbar": ["toolbar", "MatToolbarModule"],
  matTooltip: ["tooltip", "MatTooltipModule"],
  matBadge: ["badge", "MatBadgeModule"],
};

/** Angular Material entry point of a selector (mat-card -> @angular/material/card, matButton -> .../button). */
export function materialEntry(selector: string): string {
  const m = MATERIAL[selector];
  if (!m) throw new Error(`unknown Angular Material selector: ${selector}`);
  return `@angular/material/${m[0]}`;
}

/** NgModule of a selector (mat-card -> MatCardModule), for a standalone component's 'imports'. */
export function materialModule(selector: string): string {
  const m = MATERIAL[selector];
  if (!m) throw new Error(`unknown Angular Material selector: ${selector}`);
  return m[1];
}

/** Every selector of the table, sorted. */
export const materialSelectors = (): string[] => Object.keys(MATERIAL).sort();

/** TypeScript import lines and the 'imports' array of a standalone component using the given selectors. */
export function materialImports(selectors: string[]): {
  imports: string;
  array: string;
} {
  const byEntry = new Map<string, Set<string>>();
  for (const sel of selectors) {
    const e = materialEntry(sel);
    (byEntry.get(e) ?? byEntry.set(e, new Set()).get(e)!).add(
      materialModule(sel),
    );
  }
  const entries = [...byEntry].sort(([x], [y]) => x.localeCompare(y));
  return {
    imports: entries
      .map(([e, m]) => `import { ${[...m].sort().join(", ")} } from "${e}";`)
      .join("\n"),
    array: `[${entries
      .flatMap(([, m]) => [...m])
      .sort()
      .join(", ")}]`,
  };
}

/** packages/design/tokens/angular-material.css (Angular Material --mat-sys-* mapped on --md-sys-*), minified. */
export function angularThemeCss(): string {
  return minifyCss(readFileSync(ANGULAR_THEME, "utf8"));
}
