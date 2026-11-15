// Généré par packages/design/src/adapters.ts depuis tokens/tokens.json (assets/brand/brand.toml, seed #135B82, vibrant, MCU 0.4.0). Ne pas éditer.
// Rust iced::theme::Palette & Material 3 color tokens (Color::from_rgb8).
// Usage : include!(concat!(env!("CARGO_MANIFEST_DIR"), "/<chemin relatif>/packages/design/tokens/adapters/iced_theme.rs"));

#[allow(dead_code)]
pub mod aphrody_iced {
    use iced::theme::Palette;
    use iced::{Color, Theme};

    pub const BOLT: Color = Color::from_rgb8(209, 210, 147);

    pub const CORNER_NONE_PX: f32 = 0.0;
    pub const CORNER_EXTRA_SMALL_PX: f32 = 4.0;
    pub const CORNER_SMALL_PX: f32 = 8.0;
    pub const CORNER_MEDIUM_PX: f32 = 12.0;
    pub const CORNER_LARGE_PX: f32 = 16.0;
    pub const CORNER_EXTRA_LARGE_PX: f32 = 28.0;

    pub mod light {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(246, 250, 255);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(20, 29, 35);
        pub const SURFACE: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_DIM: Color = Color::from_rgb8(210, 219, 228);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(236, 245, 254);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(230, 239, 248);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(225, 233, 243);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(219, 227, 237);
        pub const ON_SURFACE: Color = Color::from_rgb8(20, 29, 35);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(61, 72, 81);
        pub const OUTLINE: Color = Color::from_rgb8(109, 120, 131);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(188, 200, 211);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(233, 242, 251);
        pub const PRIMARY: Color = Color::from_rgb8(0, 100, 146);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(0, 88, 128);
        pub const ON_PRIMARY: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(201, 230, 255);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 75, 111);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(0, 30, 47);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(0, 75, 111);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(139, 206, 255);
        pub const SECONDARY: Color = Color::from_rgb8(77, 95, 124);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(65, 83, 112);
        pub const ON_SECONDARY: Color = Color::from_rgb8(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(213, 227, 255);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(53, 71, 99);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(6, 28, 54);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(53, 71, 99);
        pub const TERTIARY: Color = Color::from_rgb8(82, 92, 139);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(70, 80, 126);
        pub const ON_TERTIARY: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(221, 225, 255);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(58, 68, 114);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(12, 23, 68);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(58, 68, 114);
        pub const ERROR: Color = Color::from_rgb8(186, 26, 26);
        pub const ERROR_DIM: Color = Color::from_rgb8(168, 7, 16);
        pub const ON_ERROR: Color = Color::from_rgb8(255, 255, 255);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(255, 218, 214);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(147, 0, 10);
    }

    pub mod dark {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(12, 20, 27);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(219, 227, 237);
        pub const SURFACE: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_DIM: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(50, 58, 66);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(7, 15, 21);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(20, 29, 35);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(24, 33, 39);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(35, 43, 50);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(45, 54, 61);
        pub const ON_SURFACE: Color = Color::from_rgb8(219, 227, 237);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(188, 200, 211);
        pub const OUTLINE: Color = Color::from_rgb8(135, 146, 157);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(61, 72, 81);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(41, 49, 57);
        pub const PRIMARY: Color = Color::from_rgb8(139, 206, 255);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(10, 179, 255);
        pub const ON_PRIMARY: Color = Color::from_rgb8(0, 52, 78);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 75, 111);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(201, 230, 255);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(0, 30, 47);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(0, 75, 111);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(0, 100, 146);
        pub const SECONDARY: Color = Color::from_rgb8(180, 199, 233);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(189, 208, 242);
        pub const ON_SECONDARY: Color = Color::from_rgb8(30, 49, 76);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(53, 71, 99);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(213, 227, 255);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(6, 28, 54);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(53, 71, 99);
        pub const TERTIARY: Color = Color::from_rgb8(186, 196, 250);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(189, 198, 253);
        pub const ON_TERTIARY: Color = Color::from_rgb8(35, 45, 90);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(58, 68, 114);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(221, 225, 255);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(12, 23, 68);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(58, 68, 114);
        pub const ERROR: Color = Color::from_rgb8(255, 180, 171);
        pub const ERROR_DIM: Color = Color::from_rgb8(255, 85, 74);
        pub const ON_ERROR: Color = Color::from_rgb8(105, 0, 5);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(147, 0, 10);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(255, 218, 214);
    }

    pub mod light_medium_contrast {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(246, 250, 255);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(20, 29, 35);
        pub const SURFACE: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_DIM: Color = Color::from_rgb8(191, 199, 209);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(236, 245, 254);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(225, 233, 243);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(213, 222, 231);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(202, 211, 220);
        pub const ON_SURFACE: Color = Color::from_rgb8(10, 18, 25);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(45, 55, 64);
        pub const OUTLINE: Color = Color::from_rgb8(73, 84, 93);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(99, 110, 121);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(233, 242, 251);
        pub const PRIMARY: Color = Color::from_rgb8(0, 58, 86);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(0, 61, 91);
        pub const ON_PRIMARY: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 116, 168);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(0, 116, 168);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(0, 90, 132);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(139, 206, 255);
        pub const SECONDARY: Color = Color::from_rgb8(36, 55, 82);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(39, 58, 85);
        pub const ON_SECONDARY: Color = Color::from_rgb8(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(91, 110, 140);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(91, 110, 140);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(67, 86, 114);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY: Color = Color::from_rgb8(41, 51, 96);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(44, 54, 99);
        pub const ON_TERTIARY: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(97, 106, 155);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(97, 106, 155);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(72, 82, 129);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const ERROR: Color = Color::from_rgb8(116, 0, 6);
        pub const ERROR_DIM: Color = Color::from_rgb8(121, 0, 6);
        pub const ON_ERROR: Color = Color::from_rgb8(255, 255, 255);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(207, 44, 39);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
    }

    pub mod dark_medium_contrast {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(12, 20, 27);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(219, 227, 237);
        pub const SURFACE: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_DIM: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(61, 69, 77);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(2, 8, 14);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(22, 31, 37);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(32, 41, 48);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(43, 52, 59);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(54, 63, 70);
        pub const ON_SURFACE: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(210, 222, 233);
        pub const OUTLINE: Color = Color::from_rgb8(168, 179, 190);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(134, 146, 156);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(35, 43, 50);
        pub const PRIMARY: Color = Color::from_rgb8(189, 225, 255);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(125, 201, 255);
        pub const ON_PRIMARY: Color = Color::from_rgb8(0, 40, 62);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 153, 220);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 0, 0);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(0, 19, 32);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(0, 58, 86);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(0, 77, 113);
        pub const SECONDARY: Color = Color::from_rgb8(203, 221, 255);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(189, 208, 242);
        pub const ON_SECONDARY: Color = Color::from_rgb8(18, 38, 64);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(127, 146, 177);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(0, 0, 0);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(0, 17, 40);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(36, 55, 82);
        pub const TERTIARY: Color = Color::from_rgb8(213, 218, 255);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(189, 198, 253);
        pub const ON_TERTIARY: Color = Color::from_rgb8(24, 34, 78);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(132, 142, 193);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(0, 0, 0);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(1, 12, 57);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(41, 51, 96);
        pub const ERROR: Color = Color::from_rgb8(255, 210, 204);
        pub const ERROR_DIM: Color = Color::from_rgb8(255, 172, 162);
        pub const ON_ERROR: Color = Color::from_rgb8(84, 0, 3);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(255, 84, 73);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(0, 0, 0);
    }

    pub mod light_high_contrast {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(246, 250, 255);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(20, 29, 35);
        pub const SURFACE: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_DIM: Color = Color::from_rgb8(177, 186, 195);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(246, 250, 255);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(255, 255, 255);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(233, 242, 251);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(219, 227, 237);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(205, 213, 223);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(191, 199, 209);
        pub const ON_SURFACE: Color = Color::from_rgb8(0, 0, 0);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(0, 0, 0);
        pub const OUTLINE: Color = Color::from_rgb8(34, 45, 54);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(63, 74, 84);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(41, 49, 57);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY: Color = Color::from_rgb8(0, 47, 72);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(0, 34, 53);
        pub const ON_PRIMARY: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 78, 115);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(0, 78, 115);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(0, 54, 81);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(139, 206, 255);
        pub const SECONDARY: Color = Color::from_rgb8(25, 45, 71);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(11, 32, 58);
        pub const ON_SECONDARY: Color = Color::from_rgb8(255, 255, 255);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(55, 74, 102);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(55, 74, 102);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(32, 51, 78);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY: Color = Color::from_rgb8(31, 41, 85);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(17, 28, 72);
        pub const ON_TERTIARY: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(60, 70, 116);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(60, 70, 116);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(38, 48, 92);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const ERROR: Color = Color::from_rgb8(96, 0, 4);
        pub const ERROR_DIM: Color = Color::from_rgb8(72, 0, 2);
        pub const ON_ERROR: Color = Color::from_rgb8(255, 255, 255);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(152, 0, 10);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(255, 255, 255);
    }

    pub mod dark_high_contrast {
        use super::Color;
        pub const BACKGROUND: Color = Color::from_rgb8(12, 20, 27);
        pub const ON_BACKGROUND: Color = Color::from_rgb8(219, 227, 237);
        pub const SURFACE: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_DIM: Color = Color::from_rgb8(12, 20, 27);
        pub const SURFACE_BRIGHT: Color = Color::from_rgb8(73, 81, 89);
        pub const SURFACE_CONTAINER_LOWEST: Color = Color::from_rgb8(0, 0, 0);
        pub const SURFACE_CONTAINER_LOW: Color = Color::from_rgb8(24, 33, 39);
        pub const SURFACE_CONTAINER: Color = Color::from_rgb8(41, 49, 57);
        pub const SURFACE_CONTAINER_HIGH: Color = Color::from_rgb8(52, 60, 68);
        pub const SURFACE_CONTAINER_HIGHEST: Color = Color::from_rgb8(63, 72, 79);
        pub const ON_SURFACE: Color = Color::from_rgb8(255, 255, 255);
        pub const ON_SURFACE_VARIANT: Color = Color::from_rgb8(255, 255, 255);
        pub const OUTLINE: Color = Color::from_rgb8(230, 241, 253);
        pub const OUTLINE_VARIANT: Color = Color::from_rgb8(184, 196, 207);
        pub const INVERSE_SURFACE: Color = Color::from_rgb8(219, 227, 237);
        pub const INVERSE_ON_SURFACE: Color = Color::from_rgb8(0, 0, 0);
        pub const PRIMARY: Color = Color::from_rgb8(228, 242, 255);
        pub const PRIMARY_DIM: Color = Color::from_rgb8(230, 242, 255);
        pub const ON_PRIMARY: Color = Color::from_rgb8(0, 0, 0);
        pub const PRIMARY_CONTAINER: Color = Color::from_rgb8(129, 202, 255);
        pub const ON_PRIMARY_CONTAINER: Color = Color::from_rgb8(0, 13, 23);
        pub const PRIMARY_FIXED: Color = Color::from_rgb8(201, 230, 255);
        pub const PRIMARY_FIXED_DIM: Color = Color::from_rgb8(139, 206, 255);
        pub const ON_PRIMARY_FIXED: Color = Color::from_rgb8(0, 0, 0);
        pub const ON_PRIMARY_FIXED_VARIANT: Color = Color::from_rgb8(0, 19, 32);
        pub const INVERSE_PRIMARY: Color = Color::from_rgb8(0, 77, 113);
        pub const SECONDARY: Color = Color::from_rgb8(234, 240, 255);
        pub const SECONDARY_DIM: Color = Color::from_rgb8(235, 241, 255);
        pub const ON_SECONDARY: Color = Color::from_rgb8(0, 0, 0);
        pub const SECONDARY_CONTAINER: Color = Color::from_rgb8(177, 196, 229);
        pub const ON_SECONDARY_CONTAINER: Color = Color::from_rgb8(0, 11, 30);
        pub const SECONDARY_FIXED: Color = Color::from_rgb8(213, 227, 255);
        pub const SECONDARY_FIXED_DIM: Color = Color::from_rgb8(180, 199, 233);
        pub const ON_SECONDARY_FIXED: Color = Color::from_rgb8(0, 0, 0);
        pub const ON_SECONDARY_FIXED_VARIANT: Color = Color::from_rgb8(0, 17, 40);
        pub const TERTIARY: Color = Color::from_rgb8(239, 239, 255);
        pub const TERTIARY_DIM: Color = Color::from_rgb8(240, 239, 255);
        pub const ON_TERTIARY: Color = Color::from_rgb8(0, 0, 0);
        pub const TERTIARY_CONTAINER: Color = Color::from_rgb8(182, 192, 246);
        pub const ON_TERTIARY_CONTAINER: Color = Color::from_rgb8(0, 6, 46);
        pub const TERTIARY_FIXED: Color = Color::from_rgb8(221, 225, 255);
        pub const TERTIARY_FIXED_DIM: Color = Color::from_rgb8(186, 196, 250);
        pub const ON_TERTIARY_FIXED: Color = Color::from_rgb8(0, 0, 0);
        pub const ON_TERTIARY_FIXED_VARIANT: Color = Color::from_rgb8(1, 12, 57);
        pub const ERROR: Color = Color::from_rgb8(255, 236, 233);
        pub const ERROR_DIM: Color = Color::from_rgb8(255, 237, 234);
        pub const ON_ERROR: Color = Color::from_rgb8(0, 0, 0);
        pub const ERROR_CONTAINER: Color = Color::from_rgb8(255, 174, 164);
        pub const ON_ERROR_CONTAINER: Color = Color::from_rgb8(34, 0, 1);
    }

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
