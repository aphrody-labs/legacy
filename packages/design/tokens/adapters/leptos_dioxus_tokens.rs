// Généré par packages/design/src/adapters.ts depuis tokens/tokens.json (assets/brand/brand.toml, seed #135B82, vibrant, MCU 0.4.0). Ne pas éditer.
// Zero-dependency Rust CSS token constants (&'static str) shared identically across Leptos, Dioxus, Tauri WebView, React SSR, and Pure Bun.
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/packages/design/tokens/adapters/leptos_dioxus_tokens.rs"));

#[allow(dead_code)]
pub mod aphrody_web_tokens {
    /// Relative workspace path to the canonical Material 3 CSS custom properties sheet.
    pub const M3_TOKENS_CSS_PATH: &str = "packages/design/tokens/tokens.css";

    /// Embedded canonical CSS custom properties (identical to @aphrody/design/tokens.css).
    pub const M3_TOKENS_CSS: &str = include_str!("../tokens.css");

    pub const SEED_HEX: &str = "#135B82";
    pub const VARIANT: &str = "vibrant";
    pub const FONT_BRAND: &str = "Google Sans Flex";
    pub const BOLT_VAR: &str = "var(--aphrody-bolt)";

    /// CSS custom property names (--md-sys-color-*) and var(--md-sys-color-*) expressions.
    pub mod css_vars {
        pub const BACKGROUND_PROP: &str = "--md-sys-color-background";
        pub const BACKGROUND: &str = "var(--md-sys-color-background)";
        pub const ON_BACKGROUND_PROP: &str = "--md-sys-color-on-background";
        pub const ON_BACKGROUND: &str = "var(--md-sys-color-on-background)";
        pub const SURFACE_PROP: &str = "--md-sys-color-surface";
        pub const SURFACE: &str = "var(--md-sys-color-surface)";
        pub const SURFACE_DIM_PROP: &str = "--md-sys-color-surface-dim";
        pub const SURFACE_DIM: &str = "var(--md-sys-color-surface-dim)";
        pub const SURFACE_BRIGHT_PROP: &str = "--md-sys-color-surface-bright";
        pub const SURFACE_BRIGHT: &str = "var(--md-sys-color-surface-bright)";
        pub const SURFACE_CONTAINER_LOWEST_PROP: &str = "--md-sys-color-surface-container-lowest";
        pub const SURFACE_CONTAINER_LOWEST: &str = "var(--md-sys-color-surface-container-lowest)";
        pub const SURFACE_CONTAINER_LOW_PROP: &str = "--md-sys-color-surface-container-low";
        pub const SURFACE_CONTAINER_LOW: &str = "var(--md-sys-color-surface-container-low)";
        pub const SURFACE_CONTAINER_PROP: &str = "--md-sys-color-surface-container";
        pub const SURFACE_CONTAINER: &str = "var(--md-sys-color-surface-container)";
        pub const SURFACE_CONTAINER_HIGH_PROP: &str = "--md-sys-color-surface-container-high";
        pub const SURFACE_CONTAINER_HIGH: &str = "var(--md-sys-color-surface-container-high)";
        pub const SURFACE_CONTAINER_HIGHEST_PROP: &str = "--md-sys-color-surface-container-highest";
        pub const SURFACE_CONTAINER_HIGHEST: &str = "var(--md-sys-color-surface-container-highest)";
        pub const ON_SURFACE_PROP: &str = "--md-sys-color-on-surface";
        pub const ON_SURFACE: &str = "var(--md-sys-color-on-surface)";
        pub const ON_SURFACE_VARIANT_PROP: &str = "--md-sys-color-on-surface-variant";
        pub const ON_SURFACE_VARIANT: &str = "var(--md-sys-color-on-surface-variant)";
        pub const OUTLINE_PROP: &str = "--md-sys-color-outline";
        pub const OUTLINE: &str = "var(--md-sys-color-outline)";
        pub const OUTLINE_VARIANT_PROP: &str = "--md-sys-color-outline-variant";
        pub const OUTLINE_VARIANT: &str = "var(--md-sys-color-outline-variant)";
        pub const INVERSE_SURFACE_PROP: &str = "--md-sys-color-inverse-surface";
        pub const INVERSE_SURFACE: &str = "var(--md-sys-color-inverse-surface)";
        pub const INVERSE_ON_SURFACE_PROP: &str = "--md-sys-color-inverse-on-surface";
        pub const INVERSE_ON_SURFACE: &str = "var(--md-sys-color-inverse-on-surface)";
        pub const PRIMARY_PROP: &str = "--md-sys-color-primary";
        pub const PRIMARY: &str = "var(--md-sys-color-primary)";
        pub const PRIMARY_DIM_PROP: &str = "--md-sys-color-primary-dim";
        pub const PRIMARY_DIM: &str = "var(--md-sys-color-primary-dim)";
        pub const ON_PRIMARY_PROP: &str = "--md-sys-color-on-primary";
        pub const ON_PRIMARY: &str = "var(--md-sys-color-on-primary)";
        pub const PRIMARY_CONTAINER_PROP: &str = "--md-sys-color-primary-container";
        pub const PRIMARY_CONTAINER: &str = "var(--md-sys-color-primary-container)";
        pub const ON_PRIMARY_CONTAINER_PROP: &str = "--md-sys-color-on-primary-container";
        pub const ON_PRIMARY_CONTAINER: &str = "var(--md-sys-color-on-primary-container)";
        pub const PRIMARY_FIXED_PROP: &str = "--md-sys-color-primary-fixed";
        pub const PRIMARY_FIXED: &str = "var(--md-sys-color-primary-fixed)";
        pub const PRIMARY_FIXED_DIM_PROP: &str = "--md-sys-color-primary-fixed-dim";
        pub const PRIMARY_FIXED_DIM: &str = "var(--md-sys-color-primary-fixed-dim)";
        pub const ON_PRIMARY_FIXED_PROP: &str = "--md-sys-color-on-primary-fixed";
        pub const ON_PRIMARY_FIXED: &str = "var(--md-sys-color-on-primary-fixed)";
        pub const ON_PRIMARY_FIXED_VARIANT_PROP: &str = "--md-sys-color-on-primary-fixed-variant";
        pub const ON_PRIMARY_FIXED_VARIANT: &str = "var(--md-sys-color-on-primary-fixed-variant)";
        pub const INVERSE_PRIMARY_PROP: &str = "--md-sys-color-inverse-primary";
        pub const INVERSE_PRIMARY: &str = "var(--md-sys-color-inverse-primary)";
        pub const SECONDARY_PROP: &str = "--md-sys-color-secondary";
        pub const SECONDARY: &str = "var(--md-sys-color-secondary)";
        pub const SECONDARY_DIM_PROP: &str = "--md-sys-color-secondary-dim";
        pub const SECONDARY_DIM: &str = "var(--md-sys-color-secondary-dim)";
        pub const ON_SECONDARY_PROP: &str = "--md-sys-color-on-secondary";
        pub const ON_SECONDARY: &str = "var(--md-sys-color-on-secondary)";
        pub const SECONDARY_CONTAINER_PROP: &str = "--md-sys-color-secondary-container";
        pub const SECONDARY_CONTAINER: &str = "var(--md-sys-color-secondary-container)";
        pub const ON_SECONDARY_CONTAINER_PROP: &str = "--md-sys-color-on-secondary-container";
        pub const ON_SECONDARY_CONTAINER: &str = "var(--md-sys-color-on-secondary-container)";
        pub const SECONDARY_FIXED_PROP: &str = "--md-sys-color-secondary-fixed";
        pub const SECONDARY_FIXED: &str = "var(--md-sys-color-secondary-fixed)";
        pub const SECONDARY_FIXED_DIM_PROP: &str = "--md-sys-color-secondary-fixed-dim";
        pub const SECONDARY_FIXED_DIM: &str = "var(--md-sys-color-secondary-fixed-dim)";
        pub const ON_SECONDARY_FIXED_PROP: &str = "--md-sys-color-on-secondary-fixed";
        pub const ON_SECONDARY_FIXED: &str = "var(--md-sys-color-on-secondary-fixed)";
        pub const ON_SECONDARY_FIXED_VARIANT_PROP: &str = "--md-sys-color-on-secondary-fixed-variant";
        pub const ON_SECONDARY_FIXED_VARIANT: &str = "var(--md-sys-color-on-secondary-fixed-variant)";
        pub const TERTIARY_PROP: &str = "--md-sys-color-tertiary";
        pub const TERTIARY: &str = "var(--md-sys-color-tertiary)";
        pub const TERTIARY_DIM_PROP: &str = "--md-sys-color-tertiary-dim";
        pub const TERTIARY_DIM: &str = "var(--md-sys-color-tertiary-dim)";
        pub const ON_TERTIARY_PROP: &str = "--md-sys-color-on-tertiary";
        pub const ON_TERTIARY: &str = "var(--md-sys-color-on-tertiary)";
        pub const TERTIARY_CONTAINER_PROP: &str = "--md-sys-color-tertiary-container";
        pub const TERTIARY_CONTAINER: &str = "var(--md-sys-color-tertiary-container)";
        pub const ON_TERTIARY_CONTAINER_PROP: &str = "--md-sys-color-on-tertiary-container";
        pub const ON_TERTIARY_CONTAINER: &str = "var(--md-sys-color-on-tertiary-container)";
        pub const TERTIARY_FIXED_PROP: &str = "--md-sys-color-tertiary-fixed";
        pub const TERTIARY_FIXED: &str = "var(--md-sys-color-tertiary-fixed)";
        pub const TERTIARY_FIXED_DIM_PROP: &str = "--md-sys-color-tertiary-fixed-dim";
        pub const TERTIARY_FIXED_DIM: &str = "var(--md-sys-color-tertiary-fixed-dim)";
        pub const ON_TERTIARY_FIXED_PROP: &str = "--md-sys-color-on-tertiary-fixed";
        pub const ON_TERTIARY_FIXED: &str = "var(--md-sys-color-on-tertiary-fixed)";
        pub const ON_TERTIARY_FIXED_VARIANT_PROP: &str = "--md-sys-color-on-tertiary-fixed-variant";
        pub const ON_TERTIARY_FIXED_VARIANT: &str = "var(--md-sys-color-on-tertiary-fixed-variant)";
        pub const ERROR_PROP: &str = "--md-sys-color-error";
        pub const ERROR: &str = "var(--md-sys-color-error)";
        pub const ERROR_DIM_PROP: &str = "--md-sys-color-error-dim";
        pub const ERROR_DIM: &str = "var(--md-sys-color-error-dim)";
        pub const ON_ERROR_PROP: &str = "--md-sys-color-on-error";
        pub const ON_ERROR: &str = "var(--md-sys-color-on-error)";
        pub const ERROR_CONTAINER_PROP: &str = "--md-sys-color-error-container";
        pub const ERROR_CONTAINER: &str = "var(--md-sys-color-error-container)";
        pub const ON_ERROR_CONTAINER_PROP: &str = "--md-sys-color-on-error-container";
        pub const ON_ERROR_CONTAINER: &str = "var(--md-sys-color-on-error-container)";
        pub const SHAPE_EXTRA_LARGE: &str = "var(--md-sys-shape-corner-extra-large)";
        pub const SHAPE_EXTRA_SMALL: &str = "var(--md-sys-shape-corner-extra-small)";
        pub const SHAPE_FULL: &str = "var(--md-sys-shape-corner-full)";
        pub const SHAPE_LARGE: &str = "var(--md-sys-shape-corner-large)";
        pub const SHAPE_MEDIUM: &str = "var(--md-sys-shape-corner-medium)";
        pub const SHAPE_NONE: &str = "var(--md-sys-shape-corner-none)";
        pub const SHAPE_SMALL: &str = "var(--md-sys-shape-corner-small)";
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
        ("background", "var(--md-sys-color-background)", "#F6FAFF", "#0C141B"),
        ("on-background", "var(--md-sys-color-on-background)", "#141D23", "#DBE3ED"),
        ("surface", "var(--md-sys-color-surface)", "#F6FAFF", "#0C141B"),
        ("surface-dim", "var(--md-sys-color-surface-dim)", "#D2DBE4", "#0C141B"),
        ("surface-bright", "var(--md-sys-color-surface-bright)", "#F6FAFF", "#323A42"),
        ("surface-container-lowest", "var(--md-sys-color-surface-container-lowest)", "#FFFFFF", "#070F15"),
        ("surface-container-low", "var(--md-sys-color-surface-container-low)", "#ECF5FE", "#141D23"),
        ("surface-container", "var(--md-sys-color-surface-container)", "#E6EFF8", "#182127"),
        ("surface-container-high", "var(--md-sys-color-surface-container-high)", "#E1E9F3", "#232B32"),
        ("surface-container-highest", "var(--md-sys-color-surface-container-highest)", "#DBE3ED", "#2D363D"),
        ("on-surface", "var(--md-sys-color-on-surface)", "#141D23", "#DBE3ED"),
        ("on-surface-variant", "var(--md-sys-color-on-surface-variant)", "#3D4851", "#BCC8D3"),
        ("outline", "var(--md-sys-color-outline)", "#6D7883", "#87929D"),
        ("outline-variant", "var(--md-sys-color-outline-variant)", "#BCC8D3", "#3D4851"),
        ("inverse-surface", "var(--md-sys-color-inverse-surface)", "#293139", "#DBE3ED"),
        ("inverse-on-surface", "var(--md-sys-color-inverse-on-surface)", "#E9F2FB", "#293139"),
        ("primary", "var(--md-sys-color-primary)", "#006492", "#8BCEFF"),
        ("primary-dim", "var(--md-sys-color-primary-dim)", "#005880", "#0AB3FF"),
        ("on-primary", "var(--md-sys-color-on-primary)", "#FFFFFF", "#00344E"),
        ("primary-container", "var(--md-sys-color-primary-container)", "#C9E6FF", "#004B6F"),
        ("on-primary-container", "var(--md-sys-color-on-primary-container)", "#004B6F", "#C9E6FF"),
        ("primary-fixed", "var(--md-sys-color-primary-fixed)", "#C9E6FF", "#C9E6FF"),
        ("primary-fixed-dim", "var(--md-sys-color-primary-fixed-dim)", "#8BCEFF", "#8BCEFF"),
        ("on-primary-fixed", "var(--md-sys-color-on-primary-fixed)", "#001E2F", "#001E2F"),
        ("on-primary-fixed-variant", "var(--md-sys-color-on-primary-fixed-variant)", "#004B6F", "#004B6F"),
        ("inverse-primary", "var(--md-sys-color-inverse-primary)", "#8BCEFF", "#006492"),
        ("secondary", "var(--md-sys-color-secondary)", "#4D5F7C", "#B4C7E9"),
        ("secondary-dim", "var(--md-sys-color-secondary-dim)", "#415370", "#BDD0F2"),
        ("on-secondary", "var(--md-sys-color-on-secondary)", "#FFFFFF", "#1E314C"),
        ("secondary-container", "var(--md-sys-color-secondary-container)", "#D5E3FF", "#354763"),
        ("on-secondary-container", "var(--md-sys-color-on-secondary-container)", "#354763", "#D5E3FF"),
        ("secondary-fixed", "var(--md-sys-color-secondary-fixed)", "#D5E3FF", "#D5E3FF"),
        ("secondary-fixed-dim", "var(--md-sys-color-secondary-fixed-dim)", "#B4C7E9", "#B4C7E9"),
        ("on-secondary-fixed", "var(--md-sys-color-on-secondary-fixed)", "#061C36", "#061C36"),
        ("on-secondary-fixed-variant", "var(--md-sys-color-on-secondary-fixed-variant)", "#354763", "#354763"),
        ("tertiary", "var(--md-sys-color-tertiary)", "#525C8B", "#BAC4FA"),
        ("tertiary-dim", "var(--md-sys-color-tertiary-dim)", "#46507E", "#BDC6FD"),
        ("on-tertiary", "var(--md-sys-color-on-tertiary)", "#FFFFFF", "#232D5A"),
        ("tertiary-container", "var(--md-sys-color-tertiary-container)", "#DDE1FF", "#3A4472"),
        ("on-tertiary-container", "var(--md-sys-color-on-tertiary-container)", "#3A4472", "#DDE1FF"),
        ("tertiary-fixed", "var(--md-sys-color-tertiary-fixed)", "#DDE1FF", "#DDE1FF"),
        ("tertiary-fixed-dim", "var(--md-sys-color-tertiary-fixed-dim)", "#BAC4FA", "#BAC4FA"),
        ("on-tertiary-fixed", "var(--md-sys-color-on-tertiary-fixed)", "#0C1744", "#0C1744"),
        ("on-tertiary-fixed-variant", "var(--md-sys-color-on-tertiary-fixed-variant)", "#3A4472", "#3A4472"),
        ("error", "var(--md-sys-color-error)", "#BA1A1A", "#FFB4AB"),
        ("error-dim", "var(--md-sys-color-error-dim)", "#A80710", "#FF554A"),
        ("on-error", "var(--md-sys-color-on-error)", "#FFFFFF", "#690005"),
        ("error-container", "var(--md-sys-color-error-container)", "#FFDAD6", "#93000A"),
        ("on-error-container", "var(--md-sys-color-on-error-container)", "#93000A", "#FFDAD6"),
    ];
}
