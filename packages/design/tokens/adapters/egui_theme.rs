// Généré par packages/design/src/adapters.ts depuis tokens/tokens.json (assets/brand/brand.toml, seed #135B82, vibrant, MCU 0.4.0). Ne pas éditer.
// Rust egui Material 3 theme adapter (Visuals & Style, Color32::from_rgb, CornerRadius, Stroke).
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/packages/design/tokens/adapters/egui_theme.rs"));

#[allow(dead_code)]
pub mod aphrody_egui {
    use egui::style::{Selection, WidgetVisuals, Widgets};
    use egui::{Color32, CornerRadius, Stroke, Style, Visuals};

    pub const BOLT: Color32 = Color32::from_rgb(209, 210, 147);

    pub const CORNER_NONE: CornerRadius = CornerRadius::ZERO;
    pub const CORNER_EXTRA_SMALL: CornerRadius = CornerRadius::same(4);
    pub const CORNER_SMALL: CornerRadius = CornerRadius::same(8);
    pub const CORNER_MEDIUM: CornerRadius = CornerRadius::same(12);
    pub const CORNER_LARGE: CornerRadius = CornerRadius::same(16);
    pub const CORNER_EXTRA_LARGE: CornerRadius = CornerRadius::same(28);
    pub const CORNER_FULL: CornerRadius = CornerRadius::same(255);

    pub mod light {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(246, 250, 255);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(20, 29, 35);
        pub const SURFACE: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(210, 219, 228);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(236, 245, 254);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(230, 239, 248);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(225, 233, 243);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(219, 227, 237);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(20, 29, 35);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(61, 72, 81);
        pub const OUTLINE: Color32 = Color32::from_rgb(109, 120, 131);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(188, 200, 211);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(233, 242, 251);
        pub const PRIMARY: Color32 = Color32::from_rgb(0, 100, 146);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(0, 88, 128);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(201, 230, 255);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 75, 111);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 30, 47);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(0, 75, 111);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(139, 206, 255);
        pub const SECONDARY: Color32 = Color32::from_rgb(77, 95, 124);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(65, 83, 112);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(213, 227, 255);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(53, 71, 99);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(6, 28, 54);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(53, 71, 99);
        pub const TERTIARY: Color32 = Color32::from_rgb(82, 92, 139);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(70, 80, 126);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(221, 225, 255);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(58, 68, 114);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(12, 23, 68);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(58, 68, 114);
        pub const ERROR: Color32 = Color32::from_rgb(186, 26, 26);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(168, 7, 16);
        pub const ON_ERROR: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 218, 214);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(147, 0, 10);
    }

    pub mod dark {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(12, 20, 27);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(219, 227, 237);
        pub const SURFACE: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(50, 58, 66);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(7, 15, 21);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(20, 29, 35);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(24, 33, 39);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(35, 43, 50);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(45, 54, 61);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(219, 227, 237);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(188, 200, 211);
        pub const OUTLINE: Color32 = Color32::from_rgb(135, 146, 157);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(61, 72, 81);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(41, 49, 57);
        pub const PRIMARY: Color32 = Color32::from_rgb(139, 206, 255);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(10, 179, 255);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(0, 52, 78);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 75, 111);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(201, 230, 255);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 30, 47);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(0, 75, 111);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(0, 100, 146);
        pub const SECONDARY: Color32 = Color32::from_rgb(180, 199, 233);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(189, 208, 242);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(30, 49, 76);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(53, 71, 99);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(213, 227, 255);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(6, 28, 54);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(53, 71, 99);
        pub const TERTIARY: Color32 = Color32::from_rgb(186, 196, 250);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(189, 198, 253);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(35, 45, 90);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(58, 68, 114);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(221, 225, 255);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(12, 23, 68);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(58, 68, 114);
        pub const ERROR: Color32 = Color32::from_rgb(255, 180, 171);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(255, 85, 74);
        pub const ON_ERROR: Color32 = Color32::from_rgb(105, 0, 5);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(147, 0, 10);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 218, 214);
    }

    pub mod light_medium_contrast {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(246, 250, 255);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(20, 29, 35);
        pub const SURFACE: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(191, 199, 209);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(236, 245, 254);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(225, 233, 243);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(213, 222, 231);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(202, 211, 220);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(10, 18, 25);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(45, 55, 64);
        pub const OUTLINE: Color32 = Color32::from_rgb(73, 84, 93);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(99, 110, 121);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(233, 242, 251);
        pub const PRIMARY: Color32 = Color32::from_rgb(0, 58, 86);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(0, 61, 91);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 116, 168);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 116, 168);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(0, 90, 132);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(139, 206, 255);
        pub const SECONDARY: Color32 = Color32::from_rgb(36, 55, 82);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(39, 58, 85);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(91, 110, 140);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(91, 110, 140);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(67, 86, 114);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY: Color32 = Color32::from_rgb(41, 51, 96);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(44, 54, 99);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(97, 106, 155);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(97, 106, 155);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(72, 82, 129);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ERROR: Color32 = Color32::from_rgb(116, 0, 6);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(121, 0, 6);
        pub const ON_ERROR: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(207, 44, 39);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
    }

    pub mod dark_medium_contrast {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(12, 20, 27);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(219, 227, 237);
        pub const SURFACE: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(61, 69, 77);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(2, 8, 14);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(22, 31, 37);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(32, 41, 48);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(43, 52, 59);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(54, 63, 70);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(210, 222, 233);
        pub const OUTLINE: Color32 = Color32::from_rgb(168, 179, 190);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(134, 146, 156);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(35, 43, 50);
        pub const PRIMARY: Color32 = Color32::from_rgb(189, 225, 255);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(125, 201, 255);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(0, 40, 62);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 153, 220);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 0, 0);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 19, 32);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(0, 58, 86);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(0, 77, 113);
        pub const SECONDARY: Color32 = Color32::from_rgb(203, 221, 255);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(189, 208, 242);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(18, 38, 64);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(127, 146, 177);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(0, 0, 0);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(0, 17, 40);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(36, 55, 82);
        pub const TERTIARY: Color32 = Color32::from_rgb(213, 218, 255);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(189, 198, 253);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(24, 34, 78);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(132, 142, 193);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(0, 0, 0);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(1, 12, 57);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(41, 51, 96);
        pub const ERROR: Color32 = Color32::from_rgb(255, 210, 204);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(255, 172, 162);
        pub const ON_ERROR: Color32 = Color32::from_rgb(84, 0, 3);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 84, 73);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(0, 0, 0);
    }

    pub mod light_high_contrast {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(246, 250, 255);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(20, 29, 35);
        pub const SURFACE: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(177, 186, 195);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(233, 242, 251);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(219, 227, 237);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(205, 213, 223);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(191, 199, 209);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(0, 0, 0);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(0, 0, 0);
        pub const OUTLINE: Color32 = Color32::from_rgb(34, 45, 54);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(63, 74, 84);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY: Color32 = Color32::from_rgb(0, 47, 72);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(0, 34, 53);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 78, 115);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 78, 115);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(0, 54, 81);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(139, 206, 255);
        pub const SECONDARY: Color32 = Color32::from_rgb(25, 45, 71);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(11, 32, 58);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(55, 74, 102);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(55, 74, 102);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(32, 51, 78);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY: Color32 = Color32::from_rgb(31, 41, 85);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(17, 28, 72);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(60, 70, 116);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(60, 70, 116);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(38, 48, 92);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ERROR: Color32 = Color32::from_rgb(96, 0, 4);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(72, 0, 2);
        pub const ON_ERROR: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(152, 0, 10);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 255, 255);
    }

    pub mod dark_high_contrast {
        use super::Color32;
        pub const BACKGROUND: Color32 = Color32::from_rgb(12, 20, 27);
        pub const ON_BACKGROUND: Color32 = Color32::from_rgb(219, 227, 237);
        pub const SURFACE: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_DIM: Color32 = Color32::from_rgb(12, 20, 27);
        pub const SURFACE_BRIGHT: Color32 = Color32::from_rgb(73, 81, 89);
        pub const SURFACE_CONTAINER_LOWEST: Color32 = Color32::from_rgb(0, 0, 0);
        pub const SURFACE_CONTAINER_LOW: Color32 = Color32::from_rgb(24, 33, 39);
        pub const SURFACE_CONTAINER: Color32 = Color32::from_rgb(41, 49, 57);
        pub const SURFACE_CONTAINER_HIGH: Color32 = Color32::from_rgb(52, 60, 68);
        pub const SURFACE_CONTAINER_HIGHEST: Color32 = Color32::from_rgb(63, 72, 79);
        pub const ON_SURFACE: Color32 = Color32::from_rgb(255, 255, 255);
        pub const ON_SURFACE_VARIANT: Color32 = Color32::from_rgb(255, 255, 255);
        pub const OUTLINE: Color32 = Color32::from_rgb(230, 241, 253);
        pub const OUTLINE_VARIANT: Color32 = Color32::from_rgb(184, 196, 207);
        pub const INVERSE_SURFACE: Color32 = Color32::from_rgb(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color32 = Color32::from_rgb(0, 0, 0);
        pub const PRIMARY: Color32 = Color32::from_rgb(228, 242, 255);
        pub const PRIMARY_DIM: Color32 = Color32::from_rgb(230, 242, 255);
        pub const ON_PRIMARY: Color32 = Color32::from_rgb(0, 0, 0);
        pub const PRIMARY_CONTAINER: Color32 = Color32::from_rgb(129, 202, 255);
        pub const ON_PRIMARY_CONTAINER: Color32 = Color32::from_rgb(0, 13, 23);
        pub const PRIMARY_FIXED: Color32 = Color32::from_rgb(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color32 = Color32::from_rgb(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color32 = Color32::from_rgb(0, 0, 0);
        pub const ON_PRIMARY_FIXED_VARIANT: Color32 = Color32::from_rgb(0, 19, 32);
        pub const INVERSE_PRIMARY: Color32 = Color32::from_rgb(0, 77, 113);
        pub const SECONDARY: Color32 = Color32::from_rgb(234, 240, 255);
        pub const SECONDARY_DIM: Color32 = Color32::from_rgb(235, 241, 255);
        pub const ON_SECONDARY: Color32 = Color32::from_rgb(0, 0, 0);
        pub const SECONDARY_CONTAINER: Color32 = Color32::from_rgb(177, 196, 229);
        pub const ON_SECONDARY_CONTAINER: Color32 = Color32::from_rgb(0, 11, 30);
        pub const SECONDARY_FIXED: Color32 = Color32::from_rgb(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color32 = Color32::from_rgb(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color32 = Color32::from_rgb(0, 0, 0);
        pub const ON_SECONDARY_FIXED_VARIANT: Color32 = Color32::from_rgb(0, 17, 40);
        pub const TERTIARY: Color32 = Color32::from_rgb(239, 239, 255);
        pub const TERTIARY_DIM: Color32 = Color32::from_rgb(240, 239, 255);
        pub const ON_TERTIARY: Color32 = Color32::from_rgb(0, 0, 0);
        pub const TERTIARY_CONTAINER: Color32 = Color32::from_rgb(182, 192, 246);
        pub const ON_TERTIARY_CONTAINER: Color32 = Color32::from_rgb(0, 6, 46);
        pub const TERTIARY_FIXED: Color32 = Color32::from_rgb(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color32 = Color32::from_rgb(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color32 = Color32::from_rgb(0, 0, 0);
        pub const ON_TERTIARY_FIXED_VARIANT: Color32 = Color32::from_rgb(1, 12, 57);
        pub const ERROR: Color32 = Color32::from_rgb(255, 236, 233);
        pub const ERROR_DIM: Color32 = Color32::from_rgb(255, 237, 234);
        pub const ON_ERROR: Color32 = Color32::from_rgb(0, 0, 0);
        pub const ERROR_CONTAINER: Color32 = Color32::from_rgb(255, 174, 164);
        pub const ON_ERROR_CONTAINER: Color32 = Color32::from_rgb(34, 0, 1);
    }

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
                bg_fill: Color32::from_rgb(200, 215, 243),
                weak_bg_fill: Color32::from_rgb(200, 215, 243),
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
                bg_fill: Color32::from_rgb(66, 83, 111),
                weak_bg_fill: Color32::from_rgb(66, 83, 111),
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
