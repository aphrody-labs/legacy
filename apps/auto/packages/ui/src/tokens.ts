/**
 * Design tokens of "auto", aligned on Material 3 (`@aphrody/m3-tokens`): each color is an `--md-sys-color-*` role
 * derived from the brand seed, or an M3 custom color (success, warning) derived from its own seed. tokens.css
 * mirrors it (checked by a test).
 */
import { schemeFromSeed, type ColorRoleMap } from "@aphrody/m3-tokens/dynamic-color";

export type Theme = "clair" | "sombre";

/** Brand seed (green-teal) and seeds of the custom colors. */
export const graines = { marque: "#0F6B5C", succes: "#1E8E3E", avertissement: "#B26A00" } as const;

/** M3 roles resolved per theme, for the brand and each custom color. */
export const roles = {
  clair: schemeFromSeed(graines.marque),
  sombre: schemeFromSeed(graines.marque, { dark: true }),
} satisfies Record<Theme, ColorRoleMap>;

const perso = (graine: string, t: Theme) => schemeFromSeed(graine, { dark: t === "sombre" });
const succes = { clair: perso(graines.succes, "clair"), sombre: perso(graines.succes, "sombre") };
const avertissement = { clair: perso(graines.avertissement, "clair"), sombre: perso(graines.avertissement, "sombre") };

const r = (t: Theme, role: string) => roles[t][`--md-sys-color-${role}`]!;
const roleDe = (role: Role, t: Theme) => (typeof role === "string" ? role : role[t]);

export interface Palette {
  fond: string;
  surface: string;
  surfaceAlt: string;
  bordure: string;
  /** Border of fields and controls: at least 3:1 on the surface (WCAG 1.4.11). */
  bordureControle: string;
  texte: string;
  texteAttenue: string;
  primaire: string;
  surPrimaire: string;
  focus: string;
  danger: string;
  surDanger: string;
  succes: string;
  avertissement: string;
}

type Role = string | Record<Theme, string>;

/**
 * Mapping of the "auto" tokens to M3 roles; success and warning are custom colors.
 * Cards sit on `surface-container-lowest` in light but `surface-container` in dark, so they stay lighter than
 * the page in both themes.
 */
export const correspondance: Record<Exclude<keyof Palette, "succes" | "avertissement">, Role> = {
  fond: "surface",
  surface: { clair: "surface-container-lowest", sombre: "surface-container" },
  surfaceAlt: "surface-container-high",
  bordure: "outline-variant",
  bordureControle: "outline",
  texte: "on-surface",
  texteAttenue: "on-surface-variant",
  primaire: "primary",
  surPrimaire: "on-primary",
  focus: "primary",
  danger: "error",
  surDanger: "on-error",
};

const palette = (t: Theme): Palette => ({
  ...(Object.fromEntries(Object.entries(correspondance).map(([k, role]) => [k, r(t, roleDe(role, t))])) as Omit<
    Palette,
    "succes" | "avertissement"
  >),
  succes: succes[t]["--md-sys-color-primary"]!,
  avertissement: avertissement[t]["--md-sys-color-primary"]!,
});

export const palettes: Record<Theme, Palette> = { clair: palette("clair"), sombre: palette("sombre") };

/** Statuses of `@auto/domain` plus `en_retard` (derived from the due date, not stored). */
export type StatutVisuel =
  | "brouillon"
  | "emis"
  | "envoye"
  | "accepte"
  | "refuse"
  | "depose"
  | "rejete"
  | "paye"
  | "annule"
  | "en_retard";

export interface CouleurStatut {
  texte: string;
  fond: string;
  /** Icon name (free Lucide set). */
  icone: string;
}

/** M3 container (`on-*-container` text on `*-container` background) of each status. */
const conteneurs: Record<
  StatutVisuel,
  "primary" | "secondary" | "tertiary" | "error" | "neutre" | "succes" | "avertissement"
> = {
  brouillon: "neutre",
  emis: "primary",
  envoye: "tertiary",
  accepte: "succes",
  refuse: "error",
  depose: "avertissement",
  rejete: "error",
  paye: "succes",
  annule: "neutre",
  en_retard: "error",
};

const icones: Record<StatutVisuel, Pick<CouleurStatut, "icone">> = {
  brouillon: { icone: "pencil" },
  emis: { icone: "file-check" },
  envoye: { icone: "send" },
  accepte: { icone: "circle-check" },
  refuse: { icone: "circle-x" },
  depose: { icone: "upload" },
  rejete: { icone: "triangle-alert" },
  paye: { icone: "banknote" },
  annule: { icone: "ban" },
  en_retard: { icone: "clock-alert" },
};

function couleurStatut(t: Theme, s: StatutVisuel): CouleurStatut {
  const c = conteneurs[s];
  const src = c === "succes" ? succes[t] : c === "avertissement" ? avertissement[t] : roles[t];
  const [fond, texte] =
    c === "neutre"
      ? [r(t, "surface-container-highest"), r(t, "on-surface-variant")]
      : [
          src[`--md-sys-color-${c === "succes" || c === "avertissement" ? "primary" : c}-container`]!,
          src[`--md-sys-color-on-${c === "succes" || c === "avertissement" ? "primary" : c}-container`]!,
        ];
  return { texte, fond, ...icones[s] };
}

const tous = Object.keys(conteneurs) as StatutVisuel[];
export const statuts: Record<Theme, Record<StatutVisuel, CouleurStatut>> = {
  clair: Object.fromEntries(tous.map((s) => [s, couleurStatut("clair", s)])) as Record<StatutVisuel, CouleurStatut>,
  sombre: Object.fromEntries(tous.map((s) => [s, couleurStatut("sombre", s)])) as Record<StatutVisuel, CouleurStatut>,
};

/** 4 px scale. */
export const espacement = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

/**
 * Shape, elevation and motion come from the M3 system tokens of `@aphrody/m3-tokens/m3-tokens.css` (imported
 * by base.css): each `--auto-*` alias points to the matching `--md-sys-*` token.
 */
export const rayons = { sm: "extra-small", md: "small", lg: "medium", pleine: "full" } as const;

export const ombres = { sm: "level1", md: "level2", lg: "level3" } as const;

/**
 * Brand fonts: they replace the M3 reference typefaces, which the M3 components follow too. The "repli"
 * fallbacks (polices-repli.css) are Arial with the metrics of the expected font: no layout shift on load.
 */
export const typographie = {
  titre: '"Plus Jakarta Sans", "Plus Jakarta Sans repli", system-ui, sans-serif',
  /** Body and figures: Inter with `font-variant-numeric: tabular-nums`. */
  corps: '"Inter", "Inter repli", system-ui, sans-serif',
  taille: { xs: "12px", sm: "14px", base: "16px", lg: "18px", xl: "24px", xxl: "32px" },
  interligne: { serre: 1.25, corps: 1.5 },
} as const;

/** M3 durations and easing (`--md-sys-motion-*`). */
export const mouvement = {
  rapide: "duration-short3",
  normal: "duration-short4",
  sortie: "duration-short3",
  courbe: "easing-standard",
} as const;

/** M3 window classes (compact, medium, expanded, large, extra-large). */
export { BREAKPOINTS as pointsDeRupture } from "@aphrody/m3-tokens/breakpoints";
export const zIndex = { base: 0, collant: 10, menu: 20, modale: 40, toast: 100 } as const;

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const canaux = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canaux[0]! + 0.7152 * canaux[1]! + 0.0722 * canaux[2]!;
}

export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const nomStatut = (s: string) => s.replace("_", "-");

/** Theme-specific values: M3 roles and custom colors (success, warning). */
function blocTheme(t: Theme, indent: string): string {
  const persos = { succes: succes[t], avertissement: avertissement[t] };
  return [
    ...Object.entries(roles[t]).map(([k, v]) => `${indent}${k}: ${v};`),
    ...Object.entries(correspondance)
      .filter(([, role]) => typeof role !== "string")
      .map(([k, role]) => `${indent}--auto-${kebab(k)}: var(--md-sys-color-${roleDe(role, t)});`),
    ...Object.entries(persos).flatMap(([nom, sc]) =>
      Object.entries(rolesPerso).map(
        ([suffixe, role]) => `${indent}--auto-${nom}-${suffixe}: ${sc[`--md-sys-color-${role}`]};`,
      ),
    ),
  ].join("\n");
}

/** Roles exposed for each M3 custom color. */
const rolesPerso = {
  base: "primary",
  sur: "on-primary",
  container: "primary-container",
  "on-container": "on-primary-container",
} as const;

/** "auto" aliases to M3 roles: the same for both themes, the cascade does the rest. */
function alias(): string {
  const conteneur = (c: (typeof conteneurs)[StatutVisuel]) =>
    c === "neutre"
      ? ["surface-container-highest", "on-surface-variant"].map((x) => `var(--md-sys-color-${x})`)
      : c === "succes" || c === "avertissement"
        ? [`var(--auto-${c}-container)`, `var(--auto-${c}-on-container)`]
        : [`var(--md-sys-color-${c}-container)`, `var(--md-sys-color-on-${c}-container)`];
  return [
    ...Object.entries(correspondance)
      .filter(([, role]) => typeof role === "string")
      .map(([k, role]) => `  --auto-${kebab(k)}: var(--md-sys-color-${role});`),
    "  --auto-succes: var(--auto-succes-base);",
    "  --auto-avertissement: var(--auto-avertissement-base);",
    ...Object.entries(conteneurs).flatMap(([k, c]) => {
      const [fond, texte] = conteneur(c);
      return [`  --auto-statut-${nomStatut(k)}-texte: ${texte};`, `  --auto-statut-${nomStatut(k)}-fond: ${fond};`];
    }),
  ].join("\n");
}

/** Generates the CSS variables (content of tokens.css). */
export function genererCss(): string {
  const fixes = [
    ...Object.entries(espacement).map(([k, v]) => `  --auto-espace-${k}: ${v};`),
    ...Object.entries(rayons).map(([k, v]) => `  --auto-rayon-${k}: var(--md-sys-shape-corner-${v});`),
    ...Object.entries(ombres).map(([k, v]) => `  --auto-ombre-${k}: var(--md-sys-elevation-${v});`),
    `  --md-ref-typeface-brand: ${typographie.titre};`,
    `  --md-ref-typeface-plain: ${typographie.corps};`,
    `  --auto-police-titre: var(--md-ref-typeface-brand);`,
    `  --auto-police-corps: var(--md-ref-typeface-plain);`,
    ...Object.entries(typographie.taille).map(([k, v]) => `  --auto-taille-${k}: ${v};`),
    ...Object.entries(mouvement).map(([k, v]) => `  --auto-mouvement-${k}: var(--md-sys-motion-${v});`),
  ].join("\n");
  return `/* Generated from src/tokens.ts (bun packages/ui/src/gen.ts): do not edit by hand. */
/* Material 3 roles (@aphrody/m3-tokens, seed ${graines.marque}) and --auto-* aliases; load after @aphrody/m3-tokens/m3-tokens.css. */
:root {
  color-scheme: light dark;
${fixes}
${alias()}
${blocTheme("clair", "  ")}
}

/* Light theme forced on a dark system: native controls (scrollbars, lists) follow. */
:root[data-theme="clair"] {
  color-scheme: light;
}

:root[data-theme="sombre"] {
  color-scheme: dark;
${blocTheme("sombre", "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="clair"]) {
${blocTheme("sombre", "    ")}
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --auto-mouvement-rapide: 0ms;
    --auto-mouvement-normal: 0ms;
    --auto-mouvement-sortie: 0ms;
  }
}
`;
}
