import { expect, test } from "bun:test";
import { argbFromHex, Contrast, Hct } from "@material/material-color-utilities";
import { tokens } from "../src/index.ts";

const dir = `${import.meta.dir}/../tokens/adapters`;
const text = (f: string) => Bun.file(`${dir}/${f}`).text();
const json = (f: string) => Bun.file(`${dir}/${f}`).json();
const modes = Object.keys(tokens.color) as (keyof typeof tokens.color)[];
const roles = Object.keys(tokens.color.light);
const tone = (hex: string) => Hct.fromInt(argbFromHex(hex.slice(0, 7))).tone;

test("adaptateurs à jour (bun run src/adapters.ts)", () => {
  const r = Bun.spawnSync([
    "bun",
    "run",
    `${import.meta.dir}/../src/adapters.ts`,
    "--check",
  ]);
  expect(r.exitCode, r.stderr.toString()).toBe(0);
});

test("Tailwind v4 : un --color-* par rôle M3, sur les variables de tokens.css", async () => {
  const css = await text("tailwind.css");
  expect(css).toContain("@theme inline");
  for (const r of roles)
    expect(css).toContain(`--color-${r}: var(--md-sys-color-${r});`);
  for (const n of Object.keys(tokens.typescale))
    expect(css).toContain(`--text-${n}: var(--md-sys-typescale-${n}-size);`);
  expect(css.replace(/\/\*[^]*?\*\//g, "")).not.toMatch(/#[0-9A-F]{6}/i);
});

test("shadcn : jeu de variables complet de globals.css, aucune valeur littérale", async () => {
  const css = await text("shadcn.css");
  const want = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "border",
    "input",
    "ring",
    "chart-1",
    "chart-2",
    "chart-3",
    "chart-4",
    "chart-5",
    "sidebar",
    "sidebar-foreground",
    "sidebar-primary",
    "sidebar-primary-foreground",
    "sidebar-accent",
    "sidebar-accent-foreground",
    "sidebar-border",
    "sidebar-ring",
    "radius",
  ];
  for (const k of want)
    expect(css).toMatch(new RegExp(`\\n  --${k}: var\\(--md-sys-`));
  expect(css.replace(/\/\*[^]*?\*\//g, "")).not.toMatch(/#[0-9A-F]{6}/i);
});

test("MUI : palettes = rôles M3 clair et sombre", async () => {
  const m = await json("mui.json");
  for (const mode of ["light", "dark"] as const) {
    const p = m.colorSchemes[mode].palette;
    expect(p.primary.main).toBe(tokens.color[mode].primary);
    expect(p.primary.contrastText).toBe(tokens.color[mode]["on-primary"]);
    expect(p.background.default).toBe(tokens.color[mode].surface);
  }
  expect(m.typography.body1.fontSize).toBe(tokens.typescale["body-large"].size);
});

test("Angular Material : palettes complètes du schematic et overrides vers tokens.css", async () => {
  const s = await text("_angular-theme.scss");
  for (const p of [
    "primary",
    "secondary",
    "tertiary",
    "neutral",
    "neutral-variant",
    "error",
  ])
    expect(s).toContain(`  ${p}: (`);
  for (const n of [25, 35, 87, 92, 94, 96]) expect(s).toContain(`    ${n}: #`);
  expect(s).toContain(`    40: ${tokens.palettes.primary["40"]},`);
  expect(s).toContain("  primary: var(--md-sys-color-primary),");
  expect(s).not.toContain("primary-dim");
});

test("Compose et Flutter : six schémas, valeurs exactes", async () => {
  const kt = await text("Theme.kt");
  const dart = await text("aphrody_theme.dart");
  expect(kt.match(/ColorScheme\(/g)?.length).toBe(6);
  expect(dart.match(/= ColorScheme\(/g)?.length).toBe(6);
  for (const m of modes) {
    const x = tokens.color[m];
    expect(kt).toContain(
      `onPrimaryFixedVariant = Color(0xFF${x["on-primary-fixed-variant"].slice(1)})`,
    );
    expect(dart).toContain(
      `surfaceContainerLowest: Color(0xFF${x["surface-container-lowest"].slice(1)})`,
    );
  }
  expect(dart).toContain("onInverseSurface:");
  expect(dart).toContain("useMaterial3: true,");
  expect(dart).not.toMatch(/^\s+(background|onBackground|surfaceVariant):/m);
  expect(kt).toContain("object ExpressiveSprings");
  expect(kt).toContain("SPATIAL_FAST_STIFFNESS = 800.0f");
  expect(kt).toContain("SPATIAL_DEFAULT_STIFFNESS = 380.0f");
  expect(kt).toContain("EFFECTS_DEFAULT_STIFFNESS = 1600.0f");
  expect(kt).toContain(
    "val motionScheme: MotionScheme = MotionScheme.expressive()",
  );
});

test("Fluent : rampe de marque 10..160 du sombre au clair, rôles exacts", async () => {
  const f = await json("fluent.json");
  const ramp = Object.entries(f.brand)
    .sort(([a], [b]) => +a - +b)
    .map(([, h]) => tone(h as string));
  expect(ramp).toHaveLength(16);
  for (let i = 1; i < ramp.length; i++)
    expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  expect(f.light.colorBrandBackground).toBe(tokens.color.light.primary);
  expect(f.dark.colorNeutralBackground1).toBe(tokens.color.dark.surface);
});

test("WinUI : trois ThemeDictionaries, accent système et brushes pour chaque rôle", async () => {
  const x = await text("winui.xaml");
  for (const k of ["Light", "Dark", "HighContrast"])
    expect(x).toContain(`<ResourceDictionary x:Key="${k}">`);
  expect(x.match(/<Color x:Key="SystemAccentColorDark1">/g)?.length).toBe(3);
  expect(x.match(/<SolidColorBrush /g)?.length).toBe(3 * roles.length);
  expect(x.match(/<ResourceDictionary[\s>]/g)?.length).toBe(
    x.match(/<\/ResourceDictionary>/g)?.length,
  );
});

test("gpui-kit : un thème par mode, états M3 lisibles", async () => {
  const g = await json("gpui-kit.json");
  expect(g.themes).toHaveLength(6);
  for (const [i, m] of modes.entries()) {
    const c = g.themes[i].colors;
    expect(g.themes[i].mode).toBe(m.startsWith("dark") ? "dark" : "light");
    expect(c["primary.background"]).toBe(tokens.color[m].primary);
    const min = m.endsWith("high-contrast") ? 7 : 4.5;
    for (const k of ["primary", "secondary", "danger"]) {
      for (const s of [
        `${k}.background`,
        `${k}.hover.background`,
        `${k}.active.background`,
      ]) {
        expect(
          Contrast.ratioOfTones(tone(c[`${k}.foreground`]), tone(c[s])),
          `${m} ${s}`,
        ).toBeGreaterThanOrEqual(min - 0.6);
      }
    }
  }
});

test("WebUI : themes = les six modes, rôles, échelles et 9 presets", async () => {
  const w = await json("webui-tokens.json");
  expect(Object.keys(w.themes)).toEqual(modes);
  for (const m of modes) {
    expect(w.themes[m]["md-sys-color-primary"]).toBe(tokens.color[m].primary);
    expect(w.themes[m]["md-sys-shape-corner-medium"]).toBe(
      tokens.shape["corner-medium"],
    );
  }
  expect(Object.keys(w.presets)).toHaveLength(9);
  const g = await json("gpui-kit.json");
  expect(Object.keys(g.presets)).toHaveLength(9);
  const taffy = await text("taffy_tokens.rs");
  expect(taffy).toContain("pub const FUSION_PRESETS:");
  expect(taffy).toContain('"hyprland"');
  expect(taffy).toContain('"cachyos"');
});

test("Pure C (tokens.h) et Android NDK (ndk_theme.h) : palettes ARGB32, struct statique, ressorts M3 Expressive et table JNI/ANativeWindow", async () => {
  const h = await text("tokens.h");
  const ndk = await text("ndk_theme.h");

  // ARGB 0xAARRGGBBu + hex strings dans struct ay_m3_scheme
  const lp = tokens.color.light.primary;
  const dp = tokens.color.dark.primary;
  expect(h).toContain(
    `#define AY_M3_LIGHT_PRIMARY ((ay_m3_argb_t)0xFF${lp.slice(1)}u)`,
  );
  expect(h).toContain(
    `#define AY_M3_DARK_PRIMARY ((ay_m3_argb_t)0xFF${dp.slice(1)}u)`,
  );
  expect(h).toContain(
    "static const struct ay_m3_scheme ay_m3_light_scheme = {",
  );
  expect(h).toContain("static const struct ay_m3_scheme ay_m3_dark_scheme = {");
  expect(h).toContain(`"${lp.toLowerCase()}"`);
  expect(h).toContain(`"${dp.toLowerCase()}"`);

  // Rayons, opacités d'état M3, breakpoints et ressorts M3 Expressive
  expect(h).toContain("#define AY_M3_CORNER_MEDIUM_PX 12.0f");
  expect(h).toContain("#define AY_M3_CORNER_EXTRA_LARGE_PX 28.0f");
  expect(h).toContain("#define AY_M3_STATE_HOVER_OPACITY 0.08f");
  expect(h).toContain("#define AY_M3_STATE_FOCUS_OPACITY 0.10f");
  expect(h).toContain("#define AY_M3_STATE_PRESSED_OPACITY 0.10f");
  expect(h).toContain("#define AY_M3_STATE_DRAGGED_OPACITY 0.16f");
  expect(h).toContain("#define AY_M3_BREAKPOINT_COMPACT_PX 600");
  expect(h).toContain("#define AY_M3_BREAKPOINT_MEDIUM_PX 840");
  expect(h).toContain("#define AY_M3_BREAKPOINT_EXPANDED_PX 1200");
  expect(h).toContain("#define AY_M3_BREAKPOINT_LARGE_PX 1600");
  expect(h).toContain("#define AY_M3_SPRING_SPATIAL_FAST_STIFFNESS 800.0f");
  expect(h).toContain("#define AY_M3_SPRING_SPATIAL_FAST_DAMPING 0.6f");
  expect(h).toContain("#define AY_M3_SPRING_SPATIAL_DEFAULT_STIFFNESS 380.0f");
  expect(h).toContain("#define AY_M3_SPRING_SPATIAL_SLOW_STIFFNESS 200.0f");
  expect(h).toContain("#define AY_M3_SPRING_EFFECTS_FAST_STIFFNESS 3800.0f");
  expect(h).toContain("#define AY_M3_SPRING_EFFECTS_DEFAULT_STIFFNESS 1600.0f");
  expect(h).toContain("#define AY_M3_SPRING_EFFECTS_SLOW_STIFFNESS 800.0f");

  // Android NDK RGBA8888 (0xAABBGGRRu) + table alignée sur les 48 rôles de Theme.kt
  expect(ndk).toContain('#include "tokens.h"');
  expect(ndk).toContain("AY_NDK_LIGHT_CLEAR_RGBA8888");
  expect(ndk).toContain("AY_NDK_DARK_CLEAR_RGBA8888");
  expect(ndk).toContain("AY_NDK_ROLE_COUNT = 48");
  expect(ndk).toContain(`{ "primary", (ay_m3_argb_t)0xFF${lp.slice(1)}u,`);
  expect(ndk).toContain(`{ "primary", (ay_m3_argb_t)0xFF${dp.slice(1)}u,`);
  expect(ndk).toContain("ay_ndk_get_roles(int is_dark)");
});

test("Egui, Iced, COSMIC RON, Bevy et Leptos/Dioxus : adaptateurs Rust et RON complets et fidèles à tokens.json", async () => {
  const egui = await text("egui_theme.rs");
  const iced = await text("iced_theme.rs");
  const cosmic = await text("cosmic_theme.ron");
  const bevy = await text("bevy_theme.rs");
  const ld = await text("leptos_dioxus_tokens.rs");

  const [lr, lg, lb] = [1, 3, 5].map((i) =>
    parseInt(tokens.color.light.primary.slice(i, i + 2), 16),
  );
  const [dr, dg, db] = [1, 3, 5].map((i) =>
    parseInt(tokens.color.dark.primary.slice(i, i + 2), 16),
  );

  // Egui Visuals & Style
  expect(egui).toContain("pub mod aphrody_egui");
  expect(egui).toContain(
    `pub const PRIMARY: Color32 = Color32::from_rgb(${lr}, ${lg}, ${lb});`,
  );
  expect(egui).toContain(
    `pub const PRIMARY: Color32 = Color32::from_rgb(${dr}, ${dg}, ${db});`,
  );
  expect(egui).toContain("CornerRadius::same(12)");
  expect(egui).toContain("Stroke::new(");
  expect(egui).toContain("pub fn light_visuals() -> Visuals");
  expect(egui).toContain("pub fn dark_visuals() -> Visuals");
  expect(egui).toContain("pub fn style(dark: bool) -> Style");

  // Iced Palette & Theme
  expect(iced).toContain("pub mod aphrody_iced");
  expect(iced).toContain(
    `pub const PRIMARY: Color = Color::from_rgb8(${lr}, ${lg}, ${lb});`,
  );
  expect(iced).toContain(
    `pub const PRIMARY: Color = Color::from_rgb8(${dr}, ${dg}, ${db});`,
  );
  expect(iced).toContain("pub const LIGHT_PALETTE: Palette = Palette {");
  expect(iced).toContain("pub const DARK_PALETTE: Palette = Palette {");

  // System76 libcosmic RON
  expect(cosmic).toContain("light: Light((");
  expect(cosmic).toContain('name: "Aphrody M3 Light"');
  expect(cosmic).toContain(`accent_blue: "${tokens.color.light.primary}FF"`);
  expect(cosmic).toContain("dark: Dark((");
  expect(cosmic).toContain('name: "Aphrody M3 Dark"');
  expect(cosmic).toContain(`accent_blue: "${tokens.color.dark.primary}FF"`);
  expect(cosmic).toContain("neutral_0:");
  expect(cosmic).toContain("neutral_10:");

  // Bevy Srgba + Val::Px
  expect(bevy).toContain("pub mod aphrody_bevy");
  expect(bevy).toContain("use bevy_color::Srgba;");
  expect(bevy).toContain("use bevy_ui::Val;");
  expect(bevy).toContain("pub const CORNER_MEDIUM: Val = Val::Px(12.0);");
  expect(bevy).toContain("pub const SPACE_MD: Val = Val::Px(16.0);");
  expect(bevy).toContain("Srgba::new(");

  // Leptos / Dioxus / Tauri / React / Pure Bun zero-dep CSS tokens
  expect(ld).toContain("pub mod aphrody_web_tokens");
  expect(ld).toContain(
    'pub const M3_TOKENS_CSS: &str = include_str!("../tokens.css");',
  );
  expect(ld).toContain(
    'pub const PRIMARY_PROP: &str = "--md-sys-color-primary";',
  );
  expect(ld).toContain(
    'pub const PRIMARY: &str = "var(--md-sys-color-primary)";',
  );
  expect(ld).toContain(
    `("primary", "var(--md-sys-color-primary)", "${tokens.color.light.primary}", "${tokens.color.dark.primary}")`,
  );
  expect(ld.match(/\("[a-z0-9-]+", "var\(--md-sys-color-/g)?.length).toBe(
    roles.length,
  );
});
