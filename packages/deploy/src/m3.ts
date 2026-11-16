// Design inputs of the aphrody.com and aphrody.app pages, all from the monorepo design system (skill ui-system):
// tokens from packages/design/tokens/tokens.css (Material Color Utilities from packages/design/design.toml), Angular
// Material M3 theme (--mat-sys-*) lives in packages/design; these server pages use its token twins. Google Sans Flex.
// No color, radius, duration or font value is written here: CSS only references `--md-sys-*` / `--md-ref-*`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SiteLogo {
  name: string;
  mark: string;
}

/** Name from packages/design/design.toml; the mark is the logo image served by aphrody.com. */
export function readLogo(root: string): SiteLogo {
  const toml = join(root, "packages", "design", "design.toml");
  const d = existsSync(toml)
    ? ((Bun.TOML.parse(readFileSync(toml, "utf8")) as any).design ?? {})
    : {};
  return {
    name: d.name ?? "Aphrody",
    mark: '<img src="https://aphrody.com/favicon.png" alt="" width="32" height="32">',
  };
}

/** packages/design/tokens/tokens.css, minified (comments and whitespace only). */
export function tokensCss(root: string): string {
  const f = join(root, "packages", "design", "tokens", "tokens.css");
  if (!existsSync(f))
    throw new Error(`${f} missing: bun run --cwd packages/design build`);
  return readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,])\s*/g, "$1")
    .trim();
}

/** CSS `font` + `letter-spacing` of an M3 type role, from the typescale tokens. */
export const type = (role: string) =>
  `font:var(--md-sys-typescale-${role}-weight) var(--md-sys-typescale-${role}-size)/var(--md-sys-typescale-${role}-line-height) var(--md-sys-typescale-${role}-font);letter-spacing:var(--md-sys-typescale-${role}-tracking)`;

/** Google Sans Flex (design.toml `font`), served by Google Fonts. display=optional: the swap of a late font moved
 * whole sections (CLS 0.30 traced on aphrody.com, 2026-11-13); a font that misses the first frame waits for the
 * next visit instead of shifting the page. */
export const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=optional">';

/** M3 list and chip in native HTML (ul/li/a, span/a): the md-list-item shadow `role="listitem"` has no `list`
 * parent for axe (aria-required-parent), and labels must not wait for JavaScript. Buttons are native a/button
 * twins of the Angular Material M3 buttons (Angular components need the Angular runtime, absent from these server
 * rendered pages), styled by the same --md-sys-* tokens that feed Angular Material (packages/design). */
export const NATIVE_CSS = `.m3-list{list-style:none;margin:0;padding:8px 0;border-radius:var(--md-sys-shape-corner-medium);background:var(--md-sys-color-surface-container-low)}
.m3-list a,.m3-list .row{display:flex;gap:16px;align-items:center;min-height:72px;padding:12px 24px 12px 16px;color:var(--md-sys-color-on-surface);text-decoration:none}
.m3-list a:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
.m3-list a:focus-visible{outline:3px solid var(--md-sys-color-secondary);outline-offset:-3px}
.m3-list .txt{flex:1;min-width:0;display:flex;flex-direction:column}
.m3-list .h{${type("body-large")}}
.m3-list .s{${type("body-medium")};color:var(--md-sys-color-on-surface-variant)}
.m3-list .t{${type("label-small")};color:var(--md-sys-color-on-surface-variant)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:8px}
.chip{display:inline-flex;align-items:center;height:32px;padding:0 16px;border:1px solid var(--md-sys-color-outline);border-radius:var(--md-sys-shape-corner-small);color:var(--md-sys-color-on-surface);text-decoration:none;${type("label-large")}}
a.chip:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
a:focus-visible{outline:3px solid var(--md-sys-color-secondary);outline-offset:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:40px;padding:0 24px;border:0;border-radius:var(--md-sys-shape-corner-full);background:transparent;color:var(--md-sys-color-primary);text-decoration:none;cursor:pointer;${type("label-large")}}
.btn-filled{background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
.btn-tonal{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.btn-outlined{border:1px solid var(--md-sys-color-outline)}
.btn-text{padding:0 12px}
.btn:hover{box-shadow:inset 0 0 0 999px color-mix(in srgb,currentColor calc(var(--md-sys-state-hover-state-layer-opacity)*100%),transparent)}
.btn:focus-visible{outline:3px solid var(--md-sys-color-secondary);outline-offset:2px}`;

export interface ListRow {
  headline: string; // already escaped HTML
  supporting?: string;
  trailing?: string;
  href?: string;
}

/** Native M3 list (escaped HTML in, markup out). */
export const m3List = (rows: ListRow[]): string =>
  `<ul class="m3-list" role="list">${rows
    .map((r) => {
      const inner = `<span class="txt"><span class="h">${r.headline}</span>${r.supporting ? `<span class="s">${r.supporting}</span>` : ""}</span>${r.trailing ? `<span class="t">${r.trailing}</span>` : ""}`;
      return `<li>${r.href ? `<a href="${r.href}">${inner}</a>` : `<span class="row">${inner}</span>`}</li>`;
    })
    .join("")}</ul>`;

