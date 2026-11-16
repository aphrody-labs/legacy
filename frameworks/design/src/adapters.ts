// Adaptateurs de @aphrody/design : projette tokens/tokens.json (lui-même issu de frameworks/design/design.toml) vers les
// formats de thème des cibles retenues par docs/ui/ECOSYSTEM-AUDIT.md. Aucun composant copié : uniquement des tokens.
// `bun run src/adapters.ts` écrit tokens/adapters/ ; `--check` échoue si une sortie dériverait.
// Formats vérifiés en amont le 2026-11-13 (commits dans ECOSYSTEM-AUDIT.md) :
//   Tailwind v4 @theme (tailwindlabs/tailwindcss), shadcn/ui variables CSS (shadcn-ui/ui), MUI createTheme colorSchemes
//   (mui/material-ui), Angular Material mat.theme + $overrides (angular/components, schematic theme-color),
//   Compose lightColorScheme (androidx material3 1.4.0), Flutter ColorScheme (flutter/flutter), Fluent v9 BrandVariants
//   (microsoft/fluentui packages/tokens), WinUI 3 SystemAccentColor*, gpui-kit .theme-schema.json (longbridge/gpui-kit),
//   webui-tokens (microsoft/webui crates/webui-tokens).
import { join } from "node:path";
import {
  argbFromHex,
  Hct,
  hexFromArgb,
} from "@material/material-color-utilities";
import { dynamicScheme } from "./schemes.ts";
import { buildThemes, LAYOUT, THEMES } from "./themes.ts";

const pkg = join(import.meta.dir, "..");
const out = join(pkg, "tokens", "adapters");
const check = process.argv.includes("--check");
const t = await Bun.file(join(pkg, "tokens", "tokens.json")).json();

type Mode = keyof typeof t.color & string;
const MODES = Object.keys(t.color) as Mode[];
const C = (mode: Mode) => t.color[mode] as Record<string, string>;
const src = t.source;
const header = (c: string, end = "") =>
  `${c} Généré par frameworks/design/src/adapters.ts depuis tokens/tokens.json (frameworks/design/design.toml, seed ${src.seed}, ${src.variant}, MCU ${src["material-color-utilities"]}). Ne pas éditer.${end}\n`;

// --- utilitaires de couleur ---
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex2 = (n: number) =>
  Math.round(n).toString(16).padStart(2, "0").toUpperCase();
/** Couche d'état M3 : `layer` posé sur `base` à l'opacité `o` (hover 0.08, pressed 0.12...). */
const over = (base: string, layer: string, o: number) => {
  const [a, b] = [rgb(base), rgb(layer)];
  return `#${a.map((x, i) => hex2(x + (b[i] - x) * o)).join("")}`;
};
const alpha = (hex: string, o: number) => `${hex}${hex2(o * 255)}`;
const st = (k: string) => Number(t.state[`${k}-state-layer-opacity`]);
const camel = (k: string) =>
  k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const px = (k: string) => parseFloat(t.shape[`corner-${k}`]);
const rem = (x: string) => parseFloat(x) * (x.endsWith("rem") ? 16 : 1);
const neutral = (tone: number) => t.palettes.neutral[String(tone)] as string;
/** Couleur lisible sur un fond : ton neutre 10 ou 99 selon le ton HCT du fond. */
const onColor = (bg: string) =>
  Hct.fromInt(argbFromHex(bg)).tone >= 60 ? neutral(10) : neutral(99);
const bolt: string = t.custom.bolt;
const light = dynamicScheme(src.seed, src.variant, false, 0);
const tone = (
  palette:
    | "primaryPalette"
    | "secondaryPalette"
    | "tertiaryPalette"
    | "neutralPalette"
    | "neutralVariantPalette"
    | "errorPalette",
  n: number,
) => hexFromArgb(light[palette].tone(n)).toUpperCase();

// --- correspondance sémantique unique (modèle shadcn, repris tel quel par gpui-kit) -> rôles M3 ---
const SEMANTIC: Record<string, string> = {
  background: "surface",
  foreground: "on-surface",
  card: "surface-container-low",
  "card-foreground": "on-surface",
  popover: "surface-container",
  "popover-foreground": "on-surface",
  primary: "primary",
  "primary-foreground": "on-primary",
  secondary: "secondary-container",
  "secondary-foreground": "on-secondary-container",
  muted: "surface-container-high",
  "muted-foreground": "on-surface-variant",
  accent: "surface-container-highest",
  "accent-foreground": "on-surface",
  destructive: "error",
  "destructive-foreground": "on-error",
  border: "outline-variant",
  input: "outline",
  ring: "primary",
  "chart-1": "primary",
  "chart-2": "tertiary",
  "chart-3": "secondary",
  "chart-4": "primary-fixed-dim",
  "chart-5": "tertiary-fixed-dim",
  sidebar: "surface-container-low",
  "sidebar-foreground": "on-surface-variant",
  "sidebar-primary": "primary",
  "sidebar-primary-foreground": "on-primary",
  "sidebar-accent": "secondary-container",
  "sidebar-accent-foreground": "on-secondary-container",
  "sidebar-border": "outline-variant",
  "sidebar-ring": "primary",
};

// Rôles *-dim de la spec 2025 (primary-dim...) : absents de Compose, Flutter et Angular Material.
const DIM2025 = /^(primary|secondary|tertiary|error)-dim$/;

const files: Record<string, string> = {};
const v = (role: string) => `var(--md-sys-color-${role})`;
const block = (sel: string, lines: string[]) =>
  `${sel} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}`;

// 1. Tailwind CSS v4 : @theme inline sur les variables de tokens.css (le mode suit tokens.css, data-theme et media).
const typeNames = Object.keys(t.typescale);
files["tailwind.css"] =
  `${header("/*", " */")}/* Usage : @import "tailwindcss"; @import "@aphrody/design/tokens.css"; @import "<ce fichier>"; puis bg-primary, text-on-surface, rounded-md, text-body-large. */
${block("@theme inline", [
  "--color-*: initial;",
  ...Object.keys(C("light")).map((k) => `--color-${k}: ${v(k)};`),
  "--color-bolt: var(--aphrody-bolt);",
  "--font-sans: var(--md-ref-typeface-plain);",
  "--font-display: var(--md-ref-typeface-brand);",
  "--font-mono: var(--md-ref-typeface-code);",
  "--radius-*: initial;",
  ...Object.keys(t.shape).map(
    (k) => `--radius-${k.replace("corner-", "")}: var(--md-sys-shape-${k});`,
  ),
  ...typeNames.flatMap((n) => [
    `--text-${n}: var(--md-sys-typescale-${n}-size);`,
    `--text-${n}--line-height: var(--md-sys-typescale-${n}-line-height);`,
    `--text-${n}--letter-spacing: var(--md-sys-typescale-${n}-tracking);`,
    `--text-${n}--font-weight: var(--md-sys-typescale-${n}-weight);`,
  ]),
  ...Object.keys(t.motion)
    .filter((k) => k.startsWith("easing-"))
    .map((k) => `--ease-${k.slice(7)}: var(--md-sys-motion-${k});`),
])}
`;

// 2. shadcn/ui : variables attendues par les composants (globals.css), pointées sur les rôles M3, puis @theme inline.
files["shadcn.css"] =
  `${header("/*", " */")}/* Transition seulement (sous-modules rosegriffon/shenron) : les couleurs shadcn deviennent les rôles M3 de la marque. */
${block(":root", [...Object.entries(SEMANTIC).map(([k, r]) => `--${k}: ${v(r)};`), `--radius: var(--md-sys-shape-corner-medium);`])}
${block("@theme inline", [
  ...Object.keys(SEMANTIC).map((k) => `--color-${k}: var(--${k});`),
  "--radius-sm: calc(var(--radius) - 4px);",
  "--radius-md: calc(var(--radius) - 2px);",
  "--radius-lg: var(--radius);",
  "--radius-xl: calc(var(--radius) + 4px);",
])}
`;

// 3. MUI (Material UI v9) : options de createTheme (colorSchemes clair/sombre, valeurs littérales exigées par MUI).
const fontStack: string = t.typeface.plain;
const ts = (n: string) => {
  const p = t.typescale[n];
  return {
    fontFamily: fontStack,
    fontSize: p.size,
    lineHeight: p["line-height"],
    letterSpacing: p.tracking,
    fontWeight: Number(p.weight),
  };
};
const muiPalette = (m: Mode) => {
  const c = C(m);
  return {
    primary: { main: c.primary, contrastText: c["on-primary"] },
    secondary: { main: c.secondary, contrastText: c["on-secondary"] },
    info: { main: c.tertiary, contrastText: c["on-tertiary"] },
    error: { main: c.error, contrastText: c["on-error"] },
    warning: { main: bolt, contrastText: onColor(bolt) },
    background: { default: c.surface, paper: c["surface-container-low"] },
    text: { primary: c["on-surface"], secondary: c["on-surface-variant"] },
    divider: c["outline-variant"],
  };
};
const MUI_TYPE: Record<string, string> = {
  h1: "display-large",
  h2: "display-medium",
  h3: "display-small",
  h4: "headline-large",
  h5: "headline-medium",
  h6: "headline-small",
  subtitle1: "title-medium",
  subtitle2: "title-small",
  body1: "body-large",
  body2: "body-medium",
  button: "label-large",
  caption: "body-small",
  overline: "label-small",
};
files["mui.json"] =
  JSON.stringify(
    {
      $comment:
        header("").trim() +
        " Usage : createTheme({ cssVariables: true, ...json }).",
      colorSchemes: {
        light: { palette: muiPalette("light") },
        dark: { palette: muiPalette("dark") },
      },
      shape: { borderRadius: px("medium") },
      typography: {
        fontFamily: fontStack,
        ...Object.fromEntries(
          Object.entries(MUI_TYPE).map(([k, n]) => [k, ts(n)]),
        ),
      },
    },
    null,
    2,
  ) + "\n";

// 4. Angular Material (v19+) : palettes au format du schematic theme-color, rôles exacts via $overrides -> tokens.css.
const HUE_TONES = [
  0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100,
];
const NEUTRAL_TONES = [...HUE_TONES, 4, 6, 12, 17, 22, 24, 87, 92, 94, 96].sort(
  (a, b) => a - b,
);
const PAL = {
  primary: "primaryPalette",
  secondary: "secondaryPalette",
  tertiary: "tertiaryPalette",
  neutral: "neutralPalette",
  "neutral-variant": "neutralVariantPalette",
  error: "errorPalette",
} as const;
const scssPal = (name: keyof typeof PAL) =>
  `  ${name}: (\n${(name === "neutral" ? NEUTRAL_TONES : HUE_TONES).map((n) => `    ${n}: ${tone(PAL[name], n)},`).join("\n")}\n  ),`;
const ngRoles = Object.keys(C("light")).filter((k) => !DIM2025.test(k));
files["_angular-theme.scss"] =
  `${header("//")}// Usage : @use '@angular/material' as mat; @use '<ce fichier>' as aphrody;
//   html { color-scheme: light dark; @include mat.theme((color: (primary: aphrody.$primary-palette, tertiary: aphrody.$tertiary-palette),
//     typography: aphrody.$font, density: 0), $overrides: aphrody.$overrides); }   (charger aussi @aphrody/design/tokens.css)
@use 'sass:map';

$_palettes: (
${(Object.keys(PAL) as (keyof typeof PAL)[]).map(scssPal).join("\n")}
);

$_rest: (
  secondary: map.get($_palettes, secondary),
  neutral: map.get($_palettes, neutral),
  neutral-variant: map.get($_palettes, neutral-variant),
  error: map.get($_palettes, error),
);

$primary-palette: map.merge(map.get($_palettes, primary), $_rest);
$tertiary-palette: map.merge(map.get($_palettes, tertiary), $_rest);
$font: ${JSON.stringify(t.typeface.plain.split(",")[0].replace(/"/g, ""))};

// Rôles M3 exacts du DynamicScheme (variante ${src.variant}) : les tons fixes du mixin sont remplacés par tokens.css.
$overrides: (
${ngRoles.map((k) => `  ${k}: ${v(k)},`).join("\n")}
  surface-tint: ${v("primary")},
  surface-variant: ${v("surface-container-highest")},
  shadow: ${neutral(0)},
  scrim: ${neutral(0)},
);
`;

// 5. Jetpack Compose (androidx.compose.material3 >= 1.4.0) : ColorScheme x6, Shapes, Typography.
const COMPOSE_EXTRA = (c: Record<string, string>): Record<string, string> => ({
  surfaceVariant: c["surface-container-highest"],
  surfaceTint: c.primary,
  scrim: neutral(0),
});
const argb = (hex: string) => `0xFF${hex.slice(1)}`;
const composeArgs = (m: Mode) => {
  const c = C(m);
  const roles = Object.fromEntries(
    Object.entries(c)
      .filter(([k]) => !DIM2025.test(k))
      .map(([k, x]) => [camel(k), x]),
  );
  return Object.entries({ ...roles, ...COMPOSE_EXTRA(c) })
    .map(([k, x]) => `        ${k} = Color(${argb(x)}),`)
    .join("\n");
};
const sp = (x: string) =>
  `${+rem(x).toFixed(4)}.sp`.replace(/^(-?\d+)\.sp$/, "$1.sp");

// Ressorts physiques Material 3 Expressive (androidx.compose.material3.tokens.ExpressiveMotionTokens v0_14_0).
const M3_EXPRESSIVE_SPRINGS = {
  spatialFast: { stiffness: 800, damping: 0.6 },
  spatialDefault: { stiffness: 380, damping: 0.8 },
  spatialSlow: { stiffness: 200, damping: 0.8 },
  effectsFast: { stiffness: 3800, damping: 1.0 },
  effectsDefault: { stiffness: 1600, damping: 1.0 },
  effectsSlow: { stiffness: 800, damping: 1.0 },
} as const;

files["Theme.kt"] =
  `${header("//")}// Usage : MaterialTheme(colorScheme = AphrodyTheme.light, shapes = AphrodyTheme.shapes, typography = AphrodyTheme.typography) { ... }
// Police : charger Google Sans Flex (OFL) dans l'app et la passer à TextStyle(fontFamily = ...).
package com.aphrody.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object AphrodyTheme {
${MODES.map((m) => `    val ${camel(m)}: ColorScheme = ${m.startsWith("dark") ? "darkColorScheme" : "lightColorScheme"}(\n${composeArgs(m)}\n    )`).join("\n\n")}

    val bolt = Color(${argb(bolt)})

    val shapes = Shapes(
${["extra-small", "small", "medium", "large", "extra-large"].map((k) => `        ${camel(k)} = RoundedCornerShape(${px(k)}.dp),`).join("\n")}
    )

    val typography = Typography(
${typeNames
  .map((n) => {
    const p = t.typescale[n];
    return `        ${camel(n)} = TextStyle(fontSize = ${sp(p.size)}, lineHeight = ${sp(p["line-height"])}, letterSpacing = (${sp(p.tracking)}), fontWeight = FontWeight(${p.weight})),`;
  })
  .join("\n")}
    )

    /** Material 3 Expressive spring physics (MotionScheme, androidx.compose.material3 >= 1.4.0). */
    object ExpressiveSprings {
        const val SPATIAL_FAST_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.spatialFast.stiffness}.0f
        const val SPATIAL_FAST_DAMPING = ${M3_EXPRESSIVE_SPRINGS.spatialFast.damping}f
        const val SPATIAL_DEFAULT_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.spatialDefault.stiffness}.0f
        const val SPATIAL_DEFAULT_DAMPING = ${M3_EXPRESSIVE_SPRINGS.spatialDefault.damping}f
        const val SPATIAL_SLOW_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.spatialSlow.stiffness}.0f
        const val SPATIAL_SLOW_DAMPING = ${M3_EXPRESSIVE_SPRINGS.spatialSlow.damping}f
        const val EFFECTS_FAST_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.effectsFast.stiffness}.0f
        const val EFFECTS_FAST_DAMPING = ${M3_EXPRESSIVE_SPRINGS.effectsFast.damping.toFixed(1)}f
        const val EFFECTS_DEFAULT_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.effectsDefault.stiffness}.0f
        const val EFFECTS_DEFAULT_DAMPING = ${M3_EXPRESSIVE_SPRINGS.effectsDefault.damping.toFixed(1)}f
        const val EFFECTS_SLOW_STIFFNESS = ${M3_EXPRESSIVE_SPRINGS.effectsSlow.stiffness}.0f
        const val EFFECTS_SLOW_DAMPING = ${M3_EXPRESSIVE_SPRINGS.effectsSlow.damping.toFixed(1)}f
    }

    @OptIn(ExperimentalMaterial3ExpressiveApi::class)
    val motionScheme: MotionScheme = MotionScheme.expressive()
}
`;

// 6. Flutter (Material 3) : ColorScheme x6 (sans les rôles dépréciés background/surfaceVariant), TextTheme, formes, durées.
const FLUTTER_RENAME: Record<string, string> = {
  inverseOnSurface: "onInverseSurface",
};
const FLUTTER_SKIP = new Set(["background", "onBackground"]);
const flutterArgs = (m: Mode) => {
  const c = C(m);
  const roles = Object.entries(c)
    .filter(([k]) => !DIM2025.test(k))
    .map(([k, x]) => [FLUTTER_RENAME[camel(k)] ?? camel(k), x] as const)
    .filter(([k]) => !FLUTTER_SKIP.has(k));
  return [
    ...roles,
    ["shadow", neutral(0)],
    ["scrim", neutral(0)],
    ["surfaceTint", c.primary],
  ]
    .map(([k, x]) => `  ${k}: Color(${argb(x)}),`)
    .join("\n");
};
const num = (x: number) => String(+x.toFixed(4));
files["aphrody_theme.dart"] =
  `${header("//")}// Usage : MaterialApp(theme: aphrodyTheme(aphrodyLight), darkTheme: aphrodyTheme(aphrodyDark), highContrastTheme: aphrodyTheme(aphrodyLightHighContrast), ...)
// Police : déclarer Google Sans Flex (OFL) dans pubspec.yaml sous ce nom de famille.
import 'package:flutter/material.dart';

${MODES.map((m) => `const ColorScheme aphrody${camel(`-${m}`).replace(/^./, (c) => c.toUpperCase())} = ColorScheme(\n  brightness: Brightness.${m.startsWith("dark") ? "dark" : "light"},\n${flutterArgs(m)}\n);`).join("\n\n")}

const Color aphrodyBolt = Color(${argb(bolt)});

const TextTheme aphrodyTextTheme = TextTheme(
${typeNames
  .map((n) => {
    const p = t.typescale[n];
    const s = rem(p.size);
    return `  ${camel(n)}: TextStyle(fontSize: ${num(s)}, height: ${num(rem(p["line-height"]) / s)}, letterSpacing: ${num(rem(p.tracking))}, fontWeight: FontWeight.w${p.weight}),`;
  })
  .join("\n")}
);

abstract final class AphrodyShape {
${Object.keys(t.shape)
  .filter((k) => k !== "corner-full")
  .map(
    (k) =>
      `  static const double ${camel(k)} = ${num(px(k.replace("corner-", "")))};`,
  )
  .join("\n")}
}

abstract final class AphrodyMotion {
${Object.entries(t.motion)
  .filter(([k]) => k.startsWith("duration"))
  .map(
    ([k, x]) =>
      `  static const Duration ${camel(k)} = Duration(milliseconds: ${parseInt(x as string)});`,
  )
  .join("\n")}
}

ThemeData aphrodyTheme(ColorScheme scheme) => ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      textTheme: aphrodyTextTheme,
      fontFamily: ${JSON.stringify(t.typeface.plain.split(",")[0].replace(/"/g, ""))},
    );
`;

// 7. Fluent 2 (React v9, Web Components v3) : BrandVariants 10..160 depuis la palette primaire, plus rôles exacts.
const BRANDS = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
];
const fluentOverrides = (m: Mode) => {
  const c = C(m);
  return {
    colorBrandBackground: c.primary,
    colorBrandBackgroundHover: over(c.primary, c["on-primary"], st("hover")),
    colorBrandBackgroundPressed: over(
      c.primary,
      c["on-primary"],
      st("pressed"),
    ),
    colorBrandBackground2: c["primary-container"],
    colorBrandForeground1: c.primary,
    colorBrandForeground2: c["on-primary-container"],
    colorBrandStroke1: c.primary,
    colorCompoundBrandBackground: c.primary,
    colorNeutralForeground1: c["on-surface"],
    colorNeutralForeground2: c["on-surface-variant"],
    colorNeutralForegroundOnBrand: c["on-primary"],
    colorNeutralBackground1: c.surface,
    colorNeutralBackground2: c["surface-container-low"],
    colorNeutralBackground3: c["surface-container"],
    colorNeutralStroke1: c.outline,
    colorNeutralStroke2: c["outline-variant"],
    colorStrokeFocus2: c.primary,
    colorPaletteRedBackground3: c.error,
    colorPaletteRedForeground1: c.error,
    fontFamilyBase: fontStack,
    fontFamilyMonospace: t.typeface.code,
    borderRadiusSmall: `${px("extra-small")}px`,
    borderRadiusMedium: `${px("small")}px`,
    borderRadiusLarge: `${px("medium")}px`,
    borderRadiusXLarge: `${px("large")}px`,
  };
};
files["fluent.json"] =
  JSON.stringify(
    {
      $comment:
        header("").trim() +
        " Usage : const theme = { ...createLightTheme(json.brand), ...json.light } (createDarkTheme / json.dark).",
      // Fluent : 10 = le plus sombre, 160 = le plus clair ; ton HCT 5 + 6 par cran (80 ~ ton 47, proche de primary ton 40).
      brand: Object.fromEntries(
        BRANDS.map((b, i) => [b, tone("primaryPalette", 5 + 6 * i)]),
      ),
      light: fluentOverrides("light"),
      dark: fluentOverrides("dark"),
      highContrastLight: fluentOverrides("light-high-contrast"),
      highContrastDark: fluentOverrides("dark-high-contrast"),
    },
    null,
    2,
  ) + "\n";

// 8. WinUI 3 / WinAppSDK : ResourceDictionary (couleur d'accentuation système redéfinie + rôles M3 en Color et brushes).
const xamlColors = (m: Mode, ind: string) => {
  const c = C(m);
  const accent = [
    ["SystemAccentColorDark3", 20],
    ["SystemAccentColorDark2", 30],
    ["SystemAccentColorDark1", 40],
    ["SystemAccentColor", 50],
    ["SystemAccentColorLight1", 60],
    ["SystemAccentColorLight2", 70],
    ["SystemAccentColorLight3", 80],
  ] as const;
  return [
    ...accent.map(
      ([k, n]) =>
        `${ind}<Color x:Key="${k}">${tone("primaryPalette", n)}</Color>`,
    ),
    ...Object.entries(c).map(
      ([k, x]) => `${ind}<Color x:Key="Md${camel(`-${k}`)}Color">${x}</Color>`,
    ),
    ...Object.keys(c).map(
      (k) =>
        `${ind}<SolidColorBrush x:Key="Md${camel(`-${k}`)}Brush" Color="{ThemeResource Md${camel(`-${k}`)}Color}" />`,
    ),
  ].join("\n");
};
files["winui.xaml"] =
  `<!--${header("").replace(/\n$/, "")} Usage : fusionner ms-appx:///aphrody/winui.xaml dans Application.Resources (MergedDictionaries). -->
<ResourceDictionary
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <ResourceDictionary.ThemeDictionaries>
${(
  [
    ["Light", "light"],
    ["Dark", "dark"],
    ["HighContrast", "dark-high-contrast"],
  ] as const
)
  .map(
    ([k, m]) =>
      `        <ResourceDictionary x:Key="${k}">\n${xamlColors(m, "            ")}\n        </ResourceDictionary>`,
  )
  .join("\n")}
    </ResourceDictionary.ThemeDictionaries>
    <Color x:Key="AphrodyBoltColor">${bolt}</Color>
    <FontFamily x:Key="AphrodyFontFamily">${t.typeface.plain.split(",")[0].replace(/"/g, "")}</FontFamily>
</ResourceDictionary>
`;

// 9. GPUI : thème gpui-kit (ex-gpui-component), schéma .theme-schema.json ; tokens.rs reste la source pour GPUI nu.
const gpuiColors = (m: Mode) => {
  const c = C(m);
  const s = Object.fromEntries(
    Object.entries(SEMANTIC).map(([k, r]) => [k, c[r]]),
  );
  const hov = (bg: string, fg: string) => over(c[bg], c[fg], st("hover"));
  const act = (bg: string, fg: string) => over(c[bg], c[fg], st("pressed"));
  return {
    background: s.background,
    foreground: s.foreground,
    border: s.border,
    ring: s.ring,
    caret: c.primary,
    "input.border": s.input,
    "accent.background": s.accent,
    "accent.foreground": s["accent-foreground"],
    "primary.background": c.primary,
    "primary.foreground": c["on-primary"],
    "primary.hover.background": hov("primary", "on-primary"),
    "primary.active.background": act("primary", "on-primary"),
    "secondary.background": c["secondary-container"],
    "secondary.foreground": c["on-secondary-container"],
    "secondary.hover.background": hov(
      "secondary-container",
      "on-secondary-container",
    ),
    "secondary.active.background": act(
      "secondary-container",
      "on-secondary-container",
    ),
    "danger.background": c.error,
    "danger.foreground": c["on-error"],
    "danger.hover.background": hov("error", "on-error"),
    "danger.active.background": act("error", "on-error"),
    "info.background": c["primary-container"],
    "info.foreground": c["on-primary-container"],
    "info.hover.background": hov("primary-container", "on-primary-container"),
    "info.active.background": act("primary-container", "on-primary-container"),
    "warning.background": bolt,
    "warning.foreground": onColor(bolt),
    "warning.hover.background": over(bolt, onColor(bolt), st("hover")),
    "warning.active.background": over(bolt, onColor(bolt), st("pressed")),
    "muted.background": s.muted,
    "muted.foreground": s["muted-foreground"],
    "popover.background": s.popover,
    "popover.foreground": s["popover-foreground"],
    link: c.primary,
    "link.hover": c.primary,
    "link.active": c.primary,
    "list.background": c.surface,
    "list.hover.background": hov("surface", "on-surface"),
    "list.active.background": c["secondary-container"],
    "list.active.border": c.primary,
    "list.even.background": c["surface-container-lowest"],
    "list.head.background": c["surface-container"],
    "table.background": c.surface,
    "table.hover.background": hov("surface", "on-surface"),
    "table.active.background": c["secondary-container"],
    "table.active.border": c.primary,
    "table.even.background": c["surface-container-lowest"],
    "table.head.background": c["surface-container"],
    "table.head.foreground": c["on-surface-variant"],
    "table.row.border": c["outline-variant"],
    "tab_bar.background": c["surface-container"],
    "tab.background": c["surface-container"],
    "tab.foreground": c["on-surface-variant"],
    "tab.active.background": c.surface,
    "tab.active.foreground": c["on-surface"],
    "title_bar.background": c["surface-container"],
    "title_bar.border": c["outline-variant"],
    "sidebar.background": s.sidebar,
    "sidebar.foreground": s["sidebar-foreground"],
    "sidebar.border": s["sidebar-border"],
    "sidebar.primary.background": s["sidebar-primary"],
    "sidebar.primary.foreground": s["sidebar-primary-foreground"],
    "sidebar.accent.background": s["sidebar-accent"],
    "sidebar.accent.foreground": s["sidebar-accent-foreground"],
    "scrollbar.thumb.background": c.outline,
    "scrollbar.thumb.hover.background": c["on-surface-variant"],
    "selection.background": alpha(c.primary, 0.3),
    "skeleton.background": c["surface-container-high"],
    "progress.bar.background": c.primary,
    "slider.background": c.primary,
    "slider.thumb.background": c.primary,
    "switch.background": c["surface-container-highest"],
    "switch.thumb.background": c.outline,
    "drag.border": c.primary,
    "drop_target.background": alpha(c.primary, st("dragged")),
    overlay: alpha(neutral(0), 0.32),
    "window.border": c["outline-variant"],
    "chart.1": s["chart-1"],
    "chart.2": s["chart-2"],
    "chart.3": s["chart-3"],
    "chart.4": s["chart-4"],
    "chart.5": s["chart-5"],
    "base.red": c.error,
    "base.yellow": bolt,
  };
};
const gpuiHighlight = (m: Mode) => {
  const c = C(m);
  return {
    "editor.background": c.surface,
    "editor.foreground": c["on-surface"],
    "editor.active_line.background": c["surface-container-low"],
    "editor.line_number": c["on-surface-variant"],
    "editor.active_line_number": c["on-surface"],
  };
};
const title = (k: string) =>
  k
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
const builtThemes = buildThemes();
const presetColorTable = Object.fromEntries(
  THEMES.map((th) => [
    th.name,
    {
      seed: th.seed,
      variant: th.variant,
      defaultMode: th.default,
      light: (builtThemes.themes as Record<string, any>)[th.name].light,
      dark: (builtThemes.themes as Record<string, any>)[th.name].dark,
    },
  ]),
);

files["gpui-kit.json"] =
  JSON.stringify(
    {
      $schema:
        "https://github.com/longbridge/gpui-kit/raw/refs/heads/main/.theme-schema.json",
      name: "Aphrody M3",
      author: "aphrody-labs",
      url: "https://github.com/aphrody-labs/src/tree/main/frameworks/design",
      themes: MODES.map((m) => ({
        name: `Aphrody M3 ${title(m)}`,
        mode: m.startsWith("dark") ? "dark" : "light",
        "font.family": t.typeface.plain.split(",")[0].replace(/"/g, ""),
        "mono_font.family": "Google Sans Code",
        radius: px("small"),
        "radius.lg": px("large"),
        colors: gpuiColors(m),
        highlight: gpuiHighlight(m),
      })),
      presets: presetColorTable,
    },
    null,
    2,
  ) + "\n";

// 10. Microsoft WebUI : fichier multi-thème de webui-tokens ({ themes: { <mode>: { <token sans --> : valeur } } }).
const shared = {
  "md-ref-typeface-brand": t.typeface.brand,
  "md-ref-typeface-plain": t.typeface.plain,
  "md-ref-typeface-code": t.typeface.code,
  "aphrody-bolt": bolt,
  ...Object.fromEntries(
    typeNames.flatMap((n) =>
      Object.entries(t.typescale[n]).map(([k, x]) => [
        `md-sys-typescale-${n}-${k}`,
        x,
      ]),
    ),
  ),
  ...Object.fromEntries(
    Object.entries(t.shape).map(([k, x]) => [`md-sys-shape-${k}`, x]),
  ),
  ...Object.fromEntries(
    Object.entries(t.motion).map(([k, x]) => [`md-sys-motion-${k}`, x]),
  ),
  ...Object.fromEntries(
    Object.entries(t.state).map(([k, x]) => [`md-sys-state-${k}`, x]),
  ),
};
files["webui-tokens.json"] =
  JSON.stringify(
    {
      themes: Object.fromEntries(
        MODES.map((m) => [
          m,
          {
            ...Object.fromEntries(
              Object.entries(C(m)).map(([k, x]) => [`md-sys-color-${k}`, x]),
            ),
            ...shared,
          },
        ]),
      ),
      presets: presetColorTable,
    },
    null,
    2,
  ) + "\n";

// 11. Taffy Layout + Multi-Theme Rust adapter (`tokens/adapters/taffy_tokens.rs`)
files["taffy_tokens.rs"] =
  `${header("//")}// Rust layout & theme constants shared with frameworks/taffy and frameworks/ui/kit.

pub const GAP_PX: f32 = ${LAYOUT.gap}.0;
pub const FOCUS_RING_PX: f32 = ${LAYOUT["focus-ring"]}.0;
pub const WINDOW_RADIUS_PX: f32 = ${LAYOUT["window-radius"]}.0;

pub const SHAPE_EXTRA_SMALL_PX: f32 = ${px("extra-small")}.0;
pub const SHAPE_SMALL_PX: f32 = ${px("small")}.0;
pub const SHAPE_MEDIUM_PX: f32 = ${px("medium")}.0;
pub const SHAPE_LARGE_PX: f32 = ${px("large")}.0;
pub const SHAPE_EXTRA_LARGE_PX: f32 = ${px("extra-large")}.0;

/// (id, seed_hex, variant, default_dark) matching frameworks/design/src/themes.ts
pub const FUSION_PRESETS: &[(&str, &str, &str, bool)] = &[
${THEMES.map((th) => `    (${JSON.stringify(th.name)}, ${JSON.stringify(th.seed)}, ${JSON.stringify(th.variant)}, ${th.default === "dark"}),`).join("\n")}
];
`;

// --- utilitaires communs aux nouveaux adaptateurs C / Rust / RON / NDK ---
const UP = (s: string) => s.replace(/-/g, "_").toUpperCase();
const SNAKE = (s: string) => s.replace(/-/g, "_");
const allRoleKeys = Object.keys(C("light"));
const argbU = (hex: string) => `0xFF${hex.slice(1).toUpperCase()}u`;
const rgba8888Le = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `0xFF${hex2(b)}${hex2(g)}${hex2(r)}u`;
};
const rgba8888Be = (hex: string) => `0x${hex.slice(1).toUpperCase()}FFu`;
const f32Lit = (n: number) => {
  const s = n.toFixed(6);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, ".0");
};

// 12. Pure C (`tokens/adapters/tokens.h`) : freestanding -std=gnu11, compatible Clang wasm32, wasm32-wasip1, Android NDK, Linux, Windows MSVC.
files["tokens.h"] = `${header("/*", " */")}#ifndef AY_DESIGN_TOKENS_H
#define AY_DESIGN_TOKENS_H

#if defined(__STDC_HOSTED__) && __STDC_HOSTED__ == 1
#include <stdint.h>
typedef uint32_t ay_m3_argb_t;
#elif defined(__UINT32_TYPE__)
typedef __UINT32_TYPE__ ay_m3_argb_t;
#else
typedef unsigned int ay_m3_argb_t;
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* --- Palette Material 3 Light (0xAARRGGBBu) --- */
${Object.entries(C("light"))
  .map(([k, x]) => `#define AY_M3_LIGHT_${UP(k)} ((ay_m3_argb_t)${argbU(x)})`)
  .join("\n")}

/* --- Palette Material 3 Dark (0xAARRGGBBu) --- */
${Object.entries(C("dark"))
  .map(([k, x]) => `#define AY_M3_DARK_${UP(k)} ((ay_m3_argb_t)${argbU(x)})`)
  .join("\n")}

#define AY_M3_BOLT ((ay_m3_argb_t)${argbU(bolt)})
#define AY_M3_SEED_HEX "${src.seed.toLowerCase()}"
#define AY_M3_VARIANT "${src.variant}"

/* --- Rayons de coins Material 3 (px) --- */
${Object.keys(t.shape)
  .map((k) => {
    const name = UP(k.replace("corner-", ""));
    const val = px(k.replace("corner-", ""));
    return `#define AY_M3_CORNER_${name}_PX ${val.toFixed(1)}f`;
  })
  .join("\n")}

/* --- Opacités d'état Material 3 (spec M3 Expressive) --- */
#define AY_M3_STATE_HOVER_OPACITY 0.08f
#define AY_M3_STATE_FOCUS_OPACITY 0.10f
#define AY_M3_STATE_PRESSED_OPACITY 0.10f
#define AY_M3_STATE_DRAGGED_OPACITY ${Number(t.state["dragged-state-layer-opacity"]).toFixed(2)}f

/* --- Classes de fenêtre / Breakpoints Material 3 (dp/px) --- */
#define AY_M3_BREAKPOINT_COMPACT_PX 600
#define AY_M3_BREAKPOINT_MEDIUM_PX 840
#define AY_M3_BREAKPOINT_EXPANDED_PX 1200
#define AY_M3_BREAKPOINT_LARGE_PX 1600

/* --- Ressorts physiques Material 3 Expressive (MotionScheme) --- */
typedef struct ay_m3_spring {
    float stiffness;
    float damping;
} ay_m3_spring_t;

#define AY_M3_SPRING_SPATIAL_FAST_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.spatialFast.stiffness}.0f
#define AY_M3_SPRING_SPATIAL_FAST_DAMPING ${M3_EXPRESSIVE_SPRINGS.spatialFast.damping}f
#define AY_M3_SPRING_SPATIAL_DEFAULT_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.spatialDefault.stiffness}.0f
#define AY_M3_SPRING_SPATIAL_DEFAULT_DAMPING ${M3_EXPRESSIVE_SPRINGS.spatialDefault.damping}f
#define AY_M3_SPRING_SPATIAL_SLOW_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.spatialSlow.stiffness}.0f
#define AY_M3_SPRING_SPATIAL_SLOW_DAMPING ${M3_EXPRESSIVE_SPRINGS.spatialSlow.damping}f

#define AY_M3_SPRING_EFFECTS_FAST_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.effectsFast.stiffness}.0f
#define AY_M3_SPRING_EFFECTS_FAST_DAMPING ${M3_EXPRESSIVE_SPRINGS.effectsFast.damping.toFixed(1)}f
#define AY_M3_SPRING_EFFECTS_DEFAULT_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.effectsDefault.stiffness}.0f
#define AY_M3_SPRING_EFFECTS_DEFAULT_DAMPING ${M3_EXPRESSIVE_SPRINGS.effectsDefault.damping.toFixed(1)}f
#define AY_M3_SPRING_EFFECTS_SLOW_STIFFNESS ${M3_EXPRESSIVE_SPRINGS.effectsSlow.stiffness}.0f
#define AY_M3_SPRING_EFFECTS_SLOW_DAMPING ${M3_EXPRESSIVE_SPRINGS.effectsSlow.damping.toFixed(1)}f

static const ay_m3_spring_t ay_m3_spring_spatial_fast = { AY_M3_SPRING_SPATIAL_FAST_STIFFNESS, AY_M3_SPRING_SPATIAL_FAST_DAMPING };
static const ay_m3_spring_t ay_m3_spring_spatial_default = { AY_M3_SPRING_SPATIAL_DEFAULT_STIFFNESS, AY_M3_SPRING_SPATIAL_DEFAULT_DAMPING };
static const ay_m3_spring_t ay_m3_spring_spatial_slow = { AY_M3_SPRING_SPATIAL_SLOW_STIFFNESS, AY_M3_SPRING_SPATIAL_SLOW_DAMPING };
static const ay_m3_spring_t ay_m3_spring_effects_fast = { AY_M3_SPRING_EFFECTS_FAST_STIFFNESS, AY_M3_SPRING_EFFECTS_FAST_DAMPING };
static const ay_m3_spring_t ay_m3_spring_effects_default = { AY_M3_SPRING_EFFECTS_DEFAULT_STIFFNESS, AY_M3_SPRING_EFFECTS_DEFAULT_DAMPING };
static const ay_m3_spring_t ay_m3_spring_effects_slow = { AY_M3_SPRING_EFFECTS_SLOW_STIFFNESS, AY_M3_SPRING_EFFECTS_SLOW_DAMPING };

/* --- Schéma complet Material 3 (0xAARRGGBBu + chaînes hexadécimales "#rrggbb") --- */
typedef struct ay_m3_scheme {
${allRoleKeys.map((k) => `    ay_m3_argb_t ${SNAKE(k)};`).join("\n")}
    ay_m3_argb_t bolt;
${allRoleKeys.map((k) => `    const char *${SNAKE(k)}_hex;`).join("\n")}
    const char *bolt_hex;
} ay_m3_scheme_t;

static const struct ay_m3_scheme ay_m3_light_scheme = {
${allRoleKeys.map((k) => `    AY_M3_LIGHT_${UP(k)},`).join("\n")}
    AY_M3_BOLT,
${Object.entries(C("light"))
  .map(([, x]) => `    "${x.toLowerCase()}",`)
  .join("\n")}
    "${bolt.toLowerCase()}"
};

static const struct ay_m3_scheme ay_m3_dark_scheme = {
${allRoleKeys.map((k) => `    AY_M3_DARK_${UP(k)},`).join("\n")}
    AY_M3_BOLT,
${Object.entries(C("dark"))
  .map(([, x]) => `    "${x.toLowerCase()}",`)
  .join("\n")}
    "${bolt.toLowerCase()}"
};

#ifdef __cplusplus
}
#endif

#endif /* AY_DESIGN_TOKENS_H */
`;

// 13. Egui (`tokens/adapters/egui_theme.rs`) : egui::Visuals & egui::Style (Color32::from_rgb, CornerRadius, Stroke) prêt à inclure.
const eguiColor = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `Color32::from_rgb(${r}, ${g}, ${b})`;
};
const eguiPaletteMod = (mode: Mode) =>
  `    pub mod ${SNAKE(mode)} {\n        use super::Color32;\n${Object.entries(
    C(mode),
  )
    .map(([k, x]) => `        pub const ${UP(k)}: Color32 = ${eguiColor(x)};`)
    .join("\n")}\n    }`;

files["egui_theme.rs"] =
  `${header("//")}// Rust egui Material 3 theme adapter (Visuals & Style, Color32::from_rgb, CornerRadius, Stroke).
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/frameworks/design/tokens/adapters/egui_theme.rs"));

#[allow(dead_code)]
pub mod aphrody_egui {
    use egui::style::{Selection, WidgetVisuals, Widgets};
    use egui::{Color32, CornerRadius, Stroke, Style, Visuals};

    pub const BOLT: Color32 = ${eguiColor(bolt)};

    pub const CORNER_NONE: CornerRadius = CornerRadius::ZERO;
    pub const CORNER_EXTRA_SMALL: CornerRadius = CornerRadius::same(${px("extra-small")});
    pub const CORNER_SMALL: CornerRadius = CornerRadius::same(${px("small")});
    pub const CORNER_MEDIUM: CornerRadius = CornerRadius::same(${px("medium")});
    pub const CORNER_LARGE: CornerRadius = CornerRadius::same(${px("large")});
    pub const CORNER_EXTRA_LARGE: CornerRadius = CornerRadius::same(${px("extra-large")});
    pub const CORNER_FULL: CornerRadius = CornerRadius::same(255);

${MODES.map(eguiPaletteMod).join("\n\n")}

    pub fn light_visuals() -> Visuals {
        let mut v = Visuals::light();
        v.dark_mode = false;
        v.override_text_color = Some(light::ON_SURFACE);
        v.weak_text_color = Some(light::ON_SURFACE_VARIANT);
        v.hyperlink_color = light::PRIMARY;
        v.faint_bg_color = light::SURFACE_CONTAINER_LOW;
        v.extreme_bg_color = light::SURFACE_CONTAINER_LOWEST;
        v.warn_fg_color = BOLT;
        v.error_fg_color = light::ERROR;
        v.window_corner_radius = CORNER_LARGE;
        v.menu_corner_radius = CORNER_MEDIUM;
        v.window_fill = light::SURFACE_CONTAINER;
        v.panel_fill = light::SURFACE;
        v.window_stroke = Stroke::new(1.0, light::OUTLINE_VARIANT);
        v.selection = Selection {
            bg_fill: light::PRIMARY_CONTAINER,
            stroke: Stroke::new(1.0, light::ON_PRIMARY_CONTAINER),
        };
        v.widgets = Widgets {
            noninteractive: WidgetVisuals {
                bg_fill: light::SURFACE,
                weak_bg_fill: light::SURFACE_CONTAINER_LOW,
                bg_stroke: Stroke::new(1.0, light::OUTLINE_VARIANT),
                corner_radius: CORNER_MEDIUM,
                fg_stroke: Stroke::new(1.0, light::ON_SURFACE),
                expansion: 0.0,
            },
            inactive: WidgetVisuals {
                bg_fill: light::SURFACE_CONTAINER_HIGH,
                weak_bg_fill: light::SECONDARY_CONTAINER,
                bg_stroke: Stroke::new(1.0, light::OUTLINE_VARIANT),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.0, light::ON_SECONDARY_CONTAINER),
                expansion: 0.0,
            },
            hovered: WidgetVisuals {
                bg_fill: ${eguiColor(over(C("light")["secondary-container"], C("light")["on-secondary-container"], st("hover")))},
                weak_bg_fill: ${eguiColor(over(C("light")["secondary-container"], C("light")["on-secondary-container"], st("hover")))},
                bg_stroke: Stroke::new(1.5, light::PRIMARY),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.5, light::ON_SURFACE),
                expansion: 1.0,
            },
            active: WidgetVisuals {
                bg_fill: light::PRIMARY,
                weak_bg_fill: light::PRIMARY,
                bg_stroke: Stroke::new(2.0, light::PRIMARY),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(2.0, light::ON_PRIMARY),
                expansion: 1.0,
            },
            open: WidgetVisuals {
                bg_fill: light::SURFACE_CONTAINER_HIGHEST,
                weak_bg_fill: light::SURFACE_CONTAINER_HIGH,
                bg_stroke: Stroke::new(1.0, light::OUTLINE),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.0, light::ON_SURFACE),
                expansion: 0.0,
            },
        };
        v
    }

    pub fn dark_visuals() -> Visuals {
        let mut v = Visuals::dark();
        v.dark_mode = true;
        v.override_text_color = Some(dark::ON_SURFACE);
        v.weak_text_color = Some(dark::ON_SURFACE_VARIANT);
        v.hyperlink_color = dark::PRIMARY;
        v.faint_bg_color = dark::SURFACE_CONTAINER_LOW;
        v.extreme_bg_color = dark::SURFACE_CONTAINER_LOWEST;
        v.warn_fg_color = BOLT;
        v.error_fg_color = dark::ERROR;
        v.window_corner_radius = CORNER_LARGE;
        v.menu_corner_radius = CORNER_MEDIUM;
        v.window_fill = dark::SURFACE_CONTAINER;
        v.panel_fill = dark::SURFACE;
        v.window_stroke = Stroke::new(1.0, dark::OUTLINE_VARIANT);
        v.selection = Selection {
            bg_fill: dark::PRIMARY_CONTAINER,
            stroke: Stroke::new(1.0, dark::ON_PRIMARY_CONTAINER),
        };
        v.widgets = Widgets {
            noninteractive: WidgetVisuals {
                bg_fill: dark::SURFACE,
                weak_bg_fill: dark::SURFACE_CONTAINER_LOW,
                bg_stroke: Stroke::new(1.0, dark::OUTLINE_VARIANT),
                corner_radius: CORNER_MEDIUM,
                fg_stroke: Stroke::new(1.0, dark::ON_SURFACE),
                expansion: 0.0,
            },
            inactive: WidgetVisuals {
                bg_fill: dark::SURFACE_CONTAINER_HIGH,
                weak_bg_fill: dark::SECONDARY_CONTAINER,
                bg_stroke: Stroke::new(1.0, dark::OUTLINE_VARIANT),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.0, dark::ON_SECONDARY_CONTAINER),
                expansion: 0.0,
            },
            hovered: WidgetVisuals {
                bg_fill: ${eguiColor(over(C("dark")["secondary-container"], C("dark")["on-secondary-container"], st("hover")))},
                weak_bg_fill: ${eguiColor(over(C("dark")["secondary-container"], C("dark")["on-secondary-container"], st("hover")))},
                bg_stroke: Stroke::new(1.5, dark::PRIMARY),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.5, dark::ON_SURFACE),
                expansion: 1.0,
            },
            active: WidgetVisuals {
                bg_fill: dark::PRIMARY,
                weak_bg_fill: dark::PRIMARY,
                bg_stroke: Stroke::new(2.0, dark::PRIMARY),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(2.0, dark::ON_PRIMARY),
                expansion: 1.0,
            },
            open: WidgetVisuals {
                bg_fill: dark::SURFACE_CONTAINER_HIGHEST,
                weak_bg_fill: dark::SURFACE_CONTAINER_HIGH,
                bg_stroke: Stroke::new(1.0, dark::OUTLINE),
                corner_radius: CORNER_SMALL,
                fg_stroke: Stroke::new(1.0, dark::ON_SURFACE),
                expansion: 0.0,
            },
        };
        v
    }

    pub fn style(dark: bool) -> Style {
        let mut s = Style::default();
        s.visuals = if dark { dark_visuals() } else { light_visuals() };
        s
    }
}
`;

// 14. Iced (`tokens/adapters/iced_theme.rs`) : iced::theme::Palette & tokens M3 (Color::from_rgb8) prêt à inclure.
const icedColor = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `Color::from_rgb8(${r}, ${g}, ${b})`;
};
const icedPaletteMod = (mode: Mode) =>
  `    pub mod ${SNAKE(mode)} {\n        use super::Color;\n${Object.entries(
    C(mode),
  )
    .map(([k, x]) => `        pub const ${UP(k)}: Color = ${icedColor(x)};`)
    .join("\n")}\n    }`;

files["iced_theme.rs"] =
  `${header("//")}// Rust iced::theme::Palette & Material 3 color tokens (Color::from_rgb8).
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/frameworks/design/tokens/adapters/iced_theme.rs"));

#[allow(dead_code)]
pub mod aphrody_iced {
    use iced::theme::Palette;
    use iced::{Color, Theme};

    pub const BOLT: Color = ${icedColor(bolt)};

    pub const CORNER_NONE_PX: f32 = ${px("none")}.0;
    pub const CORNER_EXTRA_SMALL_PX: f32 = ${px("extra-small")}.0;
    pub const CORNER_SMALL_PX: f32 = ${px("small")}.0;
    pub const CORNER_MEDIUM_PX: f32 = ${px("medium")}.0;
    pub const CORNER_LARGE_PX: f32 = ${px("large")}.0;
    pub const CORNER_EXTRA_LARGE_PX: f32 = ${px("extra-large")}.0;

${MODES.map(icedPaletteMod).join("\n\n")}

    pub const LIGHT_PALETTE: Palette = Palette {
        background: light::SURFACE,
        text: light::ON_SURFACE,
        primary: light::PRIMARY,
        success: light::TERTIARY,
        warning: BOLT,
        danger: light::ERROR,
    };

    pub const DARK_PALETTE: Palette = Palette {
        background: dark::SURFACE,
        text: dark::ON_SURFACE,
        primary: dark::PRIMARY,
        success: dark::TERTIARY,
        warning: BOLT,
        danger: dark::ERROR,
    };

    pub const LIGHT_HIGH_CONTRAST_PALETTE: Palette = Palette {
        background: light_high_contrast::SURFACE,
        text: light_high_contrast::ON_SURFACE,
        primary: light_high_contrast::PRIMARY,
        success: light_high_contrast::TERTIARY,
        warning: BOLT,
        danger: light_high_contrast::ERROR,
    };

    pub const DARK_HIGH_CONTRAST_PALETTE: Palette = Palette {
        background: dark_high_contrast::SURFACE,
        text: dark_high_contrast::ON_SURFACE,
        primary: dark_high_contrast::PRIMARY,
        success: dark_high_contrast::TERTIARY,
        warning: BOLT,
        danger: dark_high_contrast::ERROR,
    };

    pub fn light_theme() -> Theme {
        Theme::custom("Aphrody M3 Light", LIGHT_PALETTE)
    }

    pub fn dark_theme() -> Theme {
        Theme::custom("Aphrody M3 Dark", DARK_PALETTE)
    }
}
`;

// 15. System76 COSMIC (`tokens/adapters/cosmic_theme.ron`) : libcosmic cosmic-theme RON palette (light & dark).
const ronHex = (hex: string) => `"${hex.toUpperCase()}FF"`;
const cosmicInner = (
  name: string,
  c: Record<string, string>,
  dark: boolean,
) => {
  const nTones = dark
    ? [0, 4, 10, 17, 24, 40, 60, 70, 80, 92, 100]
    : [100, 96, 90, 80, 70, 50, 40, 30, 17, 10, 0];
  return `(
        name: ${JSON.stringify(name)},
        bright_red: ${ronHex(tone("errorPalette", dark ? 80 : 40))},
        bright_green: ${ronHex(tone("tertiaryPalette", dark ? 80 : 40))},
        bright_orange: ${ronHex(bolt)},
        gray_1: ${ronHex(c["surface-container-low"])},
        gray_2: ${ronHex(c["surface-container-high"])},
${nTones.map((tn, i) => `        neutral_${i}: ${ronHex(tone("neutralPalette", tn))},`).join("\n")}
        accent_blue: ${ronHex(c.primary)},
        accent_indigo: ${ronHex(c.tertiary)},
        accent_purple: ${ronHex(tone("tertiaryPalette", dark ? 80 : 40))},
        accent_pink: ${ronHex(tone("errorPalette", dark ? 80 : 35))},
        accent_red: ${ronHex(c.error)},
        accent_orange: ${ronHex(bolt)},
        accent_yellow: ${ronHex(bolt)},
        accent_green: ${ronHex(c.secondary)},
        accent_warm_grey: ${ronHex(c["on-surface-variant"])},
        ext_warm_grey: ${ronHex(c.outline)},
        ext_orange: ${ronHex(bolt)},
        ext_yellow: ${ronHex(bolt)},
        ext_blue: ${ronHex(c["primary-fixed-dim"])},
        ext_purple: ${ronHex(c["tertiary-fixed-dim"])},
        ext_pink: ${ronHex(c["error-container"])},
        ext_indigo: ${ronHex(c["secondary-fixed-dim"])},
    )`;
};

files["cosmic_theme.ron"] =
  `${header("//")}// System76 libcosmic (` +
  "`cosmic-theme`" +
  ` CosmicPalette RON) — Light & Dark palettes projetées depuis tokens/tokens.json.
(
    light: Light(${cosmicInner("Aphrody M3 Light", C("light"), false)}),
    dark: Dark(${cosmicInner("Aphrody M3 Dark", C("dark"), true)}),
)
`;

// 16. Bevy (`tokens/adapters/bevy_theme.rs`) : bevy_color::Srgba + constantes UI (Val::Px rayons/espacements) pour bevy_ui.
const bevySrgba = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `Srgba::new(${f32Lit(r / 255)}, ${f32Lit(g / 255)}, ${f32Lit(b / 255)}, 1.0)`;
};
const bevyPaletteMod = (mode: Mode) =>
  `    pub mod ${SNAKE(mode)} {\n        use super::Srgba;\n${Object.entries(
    C(mode),
  )
    .map(([k, x]) => `        pub const ${UP(k)}: Srgba = ${bevySrgba(x)};`)
    .join("\n")}\n    }`;

files["bevy_theme.rs"] =
  `${header("//")}// Rust Bevy Engine Material 3 adapter (bevy_color::Srgba + bevy_ui::Val::Px radii & spacing).
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/frameworks/design/tokens/adapters/bevy_theme.rs"));

#[allow(dead_code)]
pub mod aphrody_bevy {
    use bevy_color::Srgba;
    use bevy_ui::Val;

    pub const BOLT: Srgba = ${bevySrgba(bolt)};

    // Material 3 Corner Radii (bevy_ui::Val::Px)
    pub const CORNER_NONE: Val = Val::Px(${px("none")}.0);
    pub const CORNER_EXTRA_SMALL: Val = Val::Px(${px("extra-small")}.0);
    pub const CORNER_SMALL: Val = Val::Px(${px("small")}.0);
    pub const CORNER_MEDIUM: Val = Val::Px(${px("medium")}.0);
    pub const CORNER_LARGE: Val = Val::Px(${px("large")}.0);
    pub const CORNER_EXTRA_LARGE: Val = Val::Px(${px("extra-large")}.0);
    pub const CORNER_FULL: Val = Val::Px(${px("full")}.0);

    // Material 3 4px Grid Spacing & Shell Layout (bevy_ui::Val::Px)
    pub const SPACE_XS: Val = Val::Px(4.0);
    pub const SPACE_SM: Val = Val::Px(8.0);
    pub const SPACE_GAP: Val = Val::Px(${LAYOUT.gap}.0);
    pub const SPACE_MD: Val = Val::Px(16.0);
    pub const SPACE_LG: Val = Val::Px(24.0);
    pub const SPACE_XL: Val = Val::Px(32.0);
    pub const SPACE_XXL: Val = Val::Px(48.0);
    pub const FOCUS_RING: Val = Val::Px(${LAYOUT["focus-ring"]}.0);
    pub const WINDOW_RADIUS: Val = Val::Px(${LAYOUT["window-radius"]}.0);

${MODES.map(bevyPaletteMod).join("\n\n")}
}
`;

// 17. Leptos / Dioxus / Tauri / React / Pure Bun (`tokens/adapters/leptos_dioxus_tokens.rs`) : zero-dep Rust &'static str tokens.
files["leptos_dioxus_tokens.rs"] =
  `${header("//")}// Zero-dependency Rust CSS token constants (&'static str) shared identically across Leptos, Dioxus, Tauri WebView, React SSR, and Pure Bun.
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/frameworks/design/tokens/adapters/leptos_dioxus_tokens.rs"));

#[allow(dead_code)]
pub mod aphrody_web_tokens {
    /// Relative workspace path to the canonical Material 3 CSS custom properties sheet.
    pub const M3_TOKENS_CSS_PATH: &str = "frameworks/design/tokens/tokens.css";

    /// Embedded canonical CSS custom properties (identical to @aphrody/design/tokens.css).
    pub const M3_TOKENS_CSS: &str = include_str!("../tokens.css");

    pub const SEED_HEX: &str = ${JSON.stringify(src.seed)};
    pub const VARIANT: &str = ${JSON.stringify(src.variant)};
    pub const FONT_BRAND: &str = ${JSON.stringify(src.design.font)};
    pub const BOLT_VAR: &str = "var(--aphrody-bolt)";

    /// CSS custom property names (--md-sys-color-*) and var(--md-sys-color-*) expressions.
    pub mod css_vars {
${allRoleKeys
  .map(
    (k) =>
      `        pub const ${UP(k)}_PROP: &str = "--md-sys-color-${k}";\n        pub const ${UP(k)}: &str = "var(--md-sys-color-${k})";`,
  )
  .join("\n")}
${Object.keys(t.shape)
  .map(
    (k) =>
      `        pub const SHAPE_${UP(k.replace("corner-", ""))}: &str = "var(--md-sys-shape-${k})";`,
  )
  .join("\n")}
    }

    /// Canonical Material 3 semantic utility classes shared across Leptos, Dioxus, Tauri, and Web Components.
    pub mod classes {
        pub const SURFACE: &str = "m3-surface";
        pub const SURFACE_CONTAINER_LOW: &str = "m3-surface-container-low";
        pub const SURFACE_CONTAINER: &str = "m3-surface-container";
        pub const SURFACE_CONTAINER_HIGH: &str = "m3-surface-container-high";
        pub const SURFACE_CONTAINER_HIGHEST: &str = "m3-surface-container-highest";
        pub const CARD_FILLED: &str = "m3-card-filled";
        pub const CARD_OUTLINED: &str = "m3-card-outlined";
        pub const BUTTON_FILLED: &str = "m3-button-filled";
        pub const BUTTON_TONAL: &str = "m3-button-tonal";
        pub const BUTTON_OUTLINED: &str = "m3-button-outlined";
        pub const CHIP: &str = "m3-chip";
        pub const TOP_APP_BAR: &str = "m3-top-app-bar";
        pub const NAVIGATION_RAIL: &str = "m3-navigation-rail";
        pub const TEXT_FIELD_OUTLINED: &str = "m3-text-field-outlined";
    }

    /// All (role_kebab, css_var_expr, light_hex, dark_hex) tuples for deterministic SSR / inline style hydration.
    pub const COLOR_ROLES: &[(&str, &str, &str, &str)] = &[
${allRoleKeys
  .map(
    (k) =>
      `        (${JSON.stringify(k)}, "var(--md-sys-color-${k})", ${JSON.stringify(C("light")[k])}, ${JSON.stringify(C("dark")[k])}),`,
  )
  .join("\n")}
    ];
}
`;

// 18. Android NDK (`tokens/adapters/ndk_theme.h`) : pont C ABI / JNI léger (ANativeWindow / AChoreographer RGBA8888 + table alignée sur Theme.kt).
const ndkRoleEntries = (m: Mode) => {
  const c = C(m);
  const roles = Object.entries(c)
    .filter(([k]) => !DIM2025.test(k))
    .map(([k, x]) => [camel(k), x] as const);
  const extras = Object.entries(COMPOSE_EXTRA(c));
  return [...roles, ...extras];
};
const ndkRoleOrder = ndkRoleEntries("light").map(([k]) => k);
const COMPOSE_SNAKE = (c: string) =>
  c.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

files["ndk_theme.h"] =
  `${header("/*", " */")}/* Pont C ABI / JNI léger pour Android NDK (ANativeWindow WINDOW_FORMAT_RGBA_8888, AChoreographer, Vulkan/GLES clear colors).
 * Table de ${ndkRoleOrder.length} rôles strictement alignée sur l'ordre de Theme.kt (Jetpack Compose Material 3). */
#ifndef AY_NDK_THEME_H
#define AY_NDK_THEME_H

#include "tokens.h"

#ifdef __cplusplus
extern "C" {
#endif

/* --- Couleurs de surface / clear ANativeWindow RGBA_8888 (little-endian 0xAABBGGRRu pour uint32_t pixel buffer, et big-endian 0xRRGGBBAAu) --- */
#define AY_NDK_LIGHT_CLEAR_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("light").surface)})
#define AY_NDK_LIGHT_SURFACE_CONTAINER_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("light")["surface-container"])})
#define AY_NDK_LIGHT_PRIMARY_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("light").primary)})

#define AY_NDK_DARK_CLEAR_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("dark").surface)})
#define AY_NDK_DARK_SURFACE_CONTAINER_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("dark")["surface-container"])})
#define AY_NDK_DARK_PRIMARY_RGBA8888 ((ay_m3_argb_t)${rgba8888Le(C("dark").primary)})

/* --- Valeurs normalisées float[4] RGBA pour glClearColor / VkClearColorValue --- */
typedef struct ay_ndk_clear_color {
    float r;
    float g;
    float b;
    float a;
} ay_ndk_clear_color_t;

${(() => {
  const [lr, lg, lb] = rgb(C("light").surface);
  const [dr, dg, db] = rgb(C("dark").surface);
  return `static const ay_ndk_clear_color_t ay_ndk_light_clear = { ${f32Lit(lr / 255)}f, ${f32Lit(lg / 255)}f, ${f32Lit(lb / 255)}f, 1.0f };
static const ay_ndk_clear_color_t ay_ndk_dark_clear = { ${f32Lit(dr / 255)}f, ${f32Lit(dg / 255)}f, ${f32Lit(db / 255)}f, 1.0f };`;
})()}

/* --- Index des rôles Material 3 aligné 1:1 avec AphrodyTheme (Theme.kt) --- */
typedef enum ay_ndk_role {
${ndkRoleOrder.map((k, i) => `    AY_NDK_ROLE_${COMPOSE_SNAKE(k)} = ${i},`).join("\n")}
    AY_NDK_ROLE_COUNT = ${ndkRoleOrder.length}
} ay_ndk_role_t;

typedef struct ay_ndk_role_entry {
    const char *compose_name;
    ay_m3_argb_t argb;       /* 0xAARRGGBBu (Color(0xFF......) dans Theme.kt / JNI jint) */
    ay_m3_argb_t rgba8888;   /* 0xAABBGGRRu (écriture directe pixel ANativeWindow_Buffer RGBA_8888 little-endian) */
    ay_m3_argb_t rgba_be;    /* 0xRRGGBBAAu (ordre octets réseau / WebGPU) */
} ay_ndk_role_entry_t;

static const ay_ndk_role_entry_t ay_ndk_light_roles[AY_NDK_ROLE_COUNT] = {
${ndkRoleEntries("light")
  .map(
    ([k, x]) =>
      `    { "${k}", (ay_m3_argb_t)${argbU(x)}, (ay_m3_argb_t)${rgba8888Le(x)}, (ay_m3_argb_t)${rgba8888Be(x)} },`,
  )
  .join("\n")}
};

static const ay_ndk_role_entry_t ay_ndk_dark_roles[AY_NDK_ROLE_COUNT] = {
${ndkRoleEntries("dark")
  .map(
    ([k, x]) =>
      `    { "${k}", (ay_m3_argb_t)${argbU(x)}, (ay_m3_argb_t)${rgba8888Le(x)}, (ay_m3_argb_t)${rgba8888Be(x)} },`,
  )
  .join("\n")}
};

/* --- Helper inline pour cadence AChoreographer / interpolation ressort M3 Expressive --- */
static inline const ay_ndk_role_entry_t *ay_ndk_get_roles(int is_dark) {
    return is_dark ? ay_ndk_dark_roles : ay_ndk_light_roles;
}

#ifdef __cplusplus
}
#endif

#endif /* AY_NDK_THEME_H */
`;

// --- écriture / vérification ---
let drift = 0;
for (const [f, content] of Object.entries(files)) {
  const path = join(out, f);
  const file = Bun.file(path);
  if ((await file.exists()) && (await file.text()) === content) continue;
  drift++;
  if (check) console.error(`dérive : ${path}`);
  else await Bun.write(path, content);
}
if (check && drift) process.exit(1);
console.log(
  `${check ? "vérifié" : "écrit"} : ${Object.keys(files).length} adaptateurs dans tokens/adapters`,
);
