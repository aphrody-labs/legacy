/* Généré par packages/design/src/adapters.ts depuis tokens/tokens.json (assets/brand/brand.toml, seed #135B82, vibrant, MCU 0.4.0). Ne pas éditer. */
/* Pont C ABI / JNI léger pour Android NDK (ANativeWindow WINDOW_FORMAT_RGBA_8888, AChoreographer, Vulkan/GLES clear colors).
 * Table de 48 rôles strictement alignée sur l'ordre de Theme.kt (Jetpack Compose Material 3). */
#ifndef AY_NDK_THEME_H
#define AY_NDK_THEME_H

#include "tokens.h"

#ifdef __cplusplus
extern "C" {
#endif

/* --- Couleurs de surface / clear ANativeWindow RGBA_8888 (little-endian 0xAABBGGRRu pour uint32_t pixel buffer, et big-endian 0xRRGGBBAAu) --- */
#define AY_NDK_LIGHT_CLEAR_RGBA8888 ((ay_m3_argb_t)0xFFFFFAF6u)
#define AY_NDK_LIGHT_SURFACE_CONTAINER_RGBA8888 ((ay_m3_argb_t)0xFFF8EFE6u)
#define AY_NDK_LIGHT_PRIMARY_RGBA8888 ((ay_m3_argb_t)0xFF926400u)

#define AY_NDK_DARK_CLEAR_RGBA8888 ((ay_m3_argb_t)0xFF1B140Cu)
#define AY_NDK_DARK_SURFACE_CONTAINER_RGBA8888 ((ay_m3_argb_t)0xFF272118u)
#define AY_NDK_DARK_PRIMARY_RGBA8888 ((ay_m3_argb_t)0xFFFFCE8Bu)

/* --- Valeurs normalisées float[4] RGBA pour glClearColor / VkClearColorValue --- */
typedef struct ay_ndk_clear_color {
    float r;
    float g;
    float b;
    float a;
} ay_ndk_clear_color_t;

static const ay_ndk_clear_color_t ay_ndk_light_clear = { 0.964706f, 0.980392f, 1.0f, 1.0f };
static const ay_ndk_clear_color_t ay_ndk_dark_clear = { 0.047059f, 0.078431f, 0.105882f, 1.0f };

/* --- Index des rôles Material 3 aligné 1:1 avec AphrodyTheme (Theme.kt) --- */
typedef enum ay_ndk_role {
    AY_NDK_ROLE_BACKGROUND = 0,
    AY_NDK_ROLE_ON_BACKGROUND = 1,
    AY_NDK_ROLE_SURFACE = 2,
    AY_NDK_ROLE_SURFACE_DIM = 3,
    AY_NDK_ROLE_SURFACE_BRIGHT = 4,
    AY_NDK_ROLE_SURFACE_CONTAINER_LOWEST = 5,
    AY_NDK_ROLE_SURFACE_CONTAINER_LOW = 6,
    AY_NDK_ROLE_SURFACE_CONTAINER = 7,
    AY_NDK_ROLE_SURFACE_CONTAINER_HIGH = 8,
    AY_NDK_ROLE_SURFACE_CONTAINER_HIGHEST = 9,
    AY_NDK_ROLE_ON_SURFACE = 10,
    AY_NDK_ROLE_ON_SURFACE_VARIANT = 11,
    AY_NDK_ROLE_OUTLINE = 12,
    AY_NDK_ROLE_OUTLINE_VARIANT = 13,
    AY_NDK_ROLE_INVERSE_SURFACE = 14,
    AY_NDK_ROLE_INVERSE_ON_SURFACE = 15,
    AY_NDK_ROLE_PRIMARY = 16,
    AY_NDK_ROLE_ON_PRIMARY = 17,
    AY_NDK_ROLE_PRIMARY_CONTAINER = 18,
    AY_NDK_ROLE_ON_PRIMARY_CONTAINER = 19,
    AY_NDK_ROLE_PRIMARY_FIXED = 20,
    AY_NDK_ROLE_PRIMARY_FIXED_DIM = 21,
    AY_NDK_ROLE_ON_PRIMARY_FIXED = 22,
    AY_NDK_ROLE_ON_PRIMARY_FIXED_VARIANT = 23,
    AY_NDK_ROLE_INVERSE_PRIMARY = 24,
    AY_NDK_ROLE_SECONDARY = 25,
    AY_NDK_ROLE_ON_SECONDARY = 26,
    AY_NDK_ROLE_SECONDARY_CONTAINER = 27,
    AY_NDK_ROLE_ON_SECONDARY_CONTAINER = 28,
    AY_NDK_ROLE_SECONDARY_FIXED = 29,
    AY_NDK_ROLE_SECONDARY_FIXED_DIM = 30,
    AY_NDK_ROLE_ON_SECONDARY_FIXED = 31,
    AY_NDK_ROLE_ON_SECONDARY_FIXED_VARIANT = 32,
    AY_NDK_ROLE_TERTIARY = 33,
    AY_NDK_ROLE_ON_TERTIARY = 34,
    AY_NDK_ROLE_TERTIARY_CONTAINER = 35,
    AY_NDK_ROLE_ON_TERTIARY_CONTAINER = 36,
    AY_NDK_ROLE_TERTIARY_FIXED = 37,
    AY_NDK_ROLE_TERTIARY_FIXED_DIM = 38,
    AY_NDK_ROLE_ON_TERTIARY_FIXED = 39,
    AY_NDK_ROLE_ON_TERTIARY_FIXED_VARIANT = 40,
    AY_NDK_ROLE_ERROR = 41,
    AY_NDK_ROLE_ON_ERROR = 42,
    AY_NDK_ROLE_ERROR_CONTAINER = 43,
    AY_NDK_ROLE_ON_ERROR_CONTAINER = 44,
    AY_NDK_ROLE_SURFACE_VARIANT = 45,
    AY_NDK_ROLE_SURFACE_TINT = 46,
    AY_NDK_ROLE_SCRIM = 47,
    AY_NDK_ROLE_COUNT = 48
} ay_ndk_role_t;

typedef struct ay_ndk_role_entry {
    const char *compose_name;
    ay_m3_argb_t argb;       /* 0xAARRGGBBu (Color(0xFF......) dans Theme.kt / JNI jint) */
    ay_m3_argb_t rgba8888;   /* 0xAABBGGRRu (écriture directe pixel ANativeWindow_Buffer RGBA_8888 little-endian) */
    ay_m3_argb_t rgba_be;    /* 0xRRGGBBAAu (ordre octets réseau / WebGPU) */
} ay_ndk_role_entry_t;

static const ay_ndk_role_entry_t ay_ndk_light_roles[AY_NDK_ROLE_COUNT] = {
    { "background", (ay_m3_argb_t)0xFFF6FAFFu, (ay_m3_argb_t)0xFFFFFAF6u, (ay_m3_argb_t)0xF6FAFFFFu },
    { "onBackground", (ay_m3_argb_t)0xFF141D23u, (ay_m3_argb_t)0xFF231D14u, (ay_m3_argb_t)0x141D23FFu },
    { "surface", (ay_m3_argb_t)0xFFF6FAFFu, (ay_m3_argb_t)0xFFFFFAF6u, (ay_m3_argb_t)0xF6FAFFFFu },
    { "surfaceDim", (ay_m3_argb_t)0xFFD2DBE4u, (ay_m3_argb_t)0xFFE4DBD2u, (ay_m3_argb_t)0xD2DBE4FFu },
    { "surfaceBright", (ay_m3_argb_t)0xFFF6FAFFu, (ay_m3_argb_t)0xFFFFFAF6u, (ay_m3_argb_t)0xF6FAFFFFu },
    { "surfaceContainerLowest", (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu },
    { "surfaceContainerLow", (ay_m3_argb_t)0xFFECF5FEu, (ay_m3_argb_t)0xFFFEF5ECu, (ay_m3_argb_t)0xECF5FEFFu },
    { "surfaceContainer", (ay_m3_argb_t)0xFFE6EFF8u, (ay_m3_argb_t)0xFFF8EFE6u, (ay_m3_argb_t)0xE6EFF8FFu },
    { "surfaceContainerHigh", (ay_m3_argb_t)0xFFE1E9F3u, (ay_m3_argb_t)0xFFF3E9E1u, (ay_m3_argb_t)0xE1E9F3FFu },
    { "surfaceContainerHighest", (ay_m3_argb_t)0xFFDBE3EDu, (ay_m3_argb_t)0xFFEDE3DBu, (ay_m3_argb_t)0xDBE3EDFFu },
    { "onSurface", (ay_m3_argb_t)0xFF141D23u, (ay_m3_argb_t)0xFF231D14u, (ay_m3_argb_t)0x141D23FFu },
    { "onSurfaceVariant", (ay_m3_argb_t)0xFF3D4851u, (ay_m3_argb_t)0xFF51483Du, (ay_m3_argb_t)0x3D4851FFu },
    { "outline", (ay_m3_argb_t)0xFF6D7883u, (ay_m3_argb_t)0xFF83786Du, (ay_m3_argb_t)0x6D7883FFu },
    { "outlineVariant", (ay_m3_argb_t)0xFFBCC8D3u, (ay_m3_argb_t)0xFFD3C8BCu, (ay_m3_argb_t)0xBCC8D3FFu },
    { "inverseSurface", (ay_m3_argb_t)0xFF293139u, (ay_m3_argb_t)0xFF393129u, (ay_m3_argb_t)0x293139FFu },
    { "inverseOnSurface", (ay_m3_argb_t)0xFFE9F2FBu, (ay_m3_argb_t)0xFFFBF2E9u, (ay_m3_argb_t)0xE9F2FBFFu },
    { "primary", (ay_m3_argb_t)0xFF006492u, (ay_m3_argb_t)0xFF926400u, (ay_m3_argb_t)0x006492FFu },
    { "onPrimary", (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu },
    { "primaryContainer", (ay_m3_argb_t)0xFFC9E6FFu, (ay_m3_argb_t)0xFFFFE6C9u, (ay_m3_argb_t)0xC9E6FFFFu },
    { "onPrimaryContainer", (ay_m3_argb_t)0xFF004B6Fu, (ay_m3_argb_t)0xFF6F4B00u, (ay_m3_argb_t)0x004B6FFFu },
    { "primaryFixed", (ay_m3_argb_t)0xFFC9E6FFu, (ay_m3_argb_t)0xFFFFE6C9u, (ay_m3_argb_t)0xC9E6FFFFu },
    { "primaryFixedDim", (ay_m3_argb_t)0xFF8BCEFFu, (ay_m3_argb_t)0xFFFFCE8Bu, (ay_m3_argb_t)0x8BCEFFFFu },
    { "onPrimaryFixed", (ay_m3_argb_t)0xFF001E2Fu, (ay_m3_argb_t)0xFF2F1E00u, (ay_m3_argb_t)0x001E2FFFu },
    { "onPrimaryFixedVariant", (ay_m3_argb_t)0xFF004B6Fu, (ay_m3_argb_t)0xFF6F4B00u, (ay_m3_argb_t)0x004B6FFFu },
    { "inversePrimary", (ay_m3_argb_t)0xFF8BCEFFu, (ay_m3_argb_t)0xFFFFCE8Bu, (ay_m3_argb_t)0x8BCEFFFFu },
    { "secondary", (ay_m3_argb_t)0xFF4D5F7Cu, (ay_m3_argb_t)0xFF7C5F4Du, (ay_m3_argb_t)0x4D5F7CFFu },
    { "onSecondary", (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu },
    { "secondaryContainer", (ay_m3_argb_t)0xFFD5E3FFu, (ay_m3_argb_t)0xFFFFE3D5u, (ay_m3_argb_t)0xD5E3FFFFu },
    { "onSecondaryContainer", (ay_m3_argb_t)0xFF354763u, (ay_m3_argb_t)0xFF634735u, (ay_m3_argb_t)0x354763FFu },
    { "secondaryFixed", (ay_m3_argb_t)0xFFD5E3FFu, (ay_m3_argb_t)0xFFFFE3D5u, (ay_m3_argb_t)0xD5E3FFFFu },
    { "secondaryFixedDim", (ay_m3_argb_t)0xFFB4C7E9u, (ay_m3_argb_t)0xFFE9C7B4u, (ay_m3_argb_t)0xB4C7E9FFu },
    { "onSecondaryFixed", (ay_m3_argb_t)0xFF061C36u, (ay_m3_argb_t)0xFF361C06u, (ay_m3_argb_t)0x061C36FFu },
    { "onSecondaryFixedVariant", (ay_m3_argb_t)0xFF354763u, (ay_m3_argb_t)0xFF634735u, (ay_m3_argb_t)0x354763FFu },
    { "tertiary", (ay_m3_argb_t)0xFF525C8Bu, (ay_m3_argb_t)0xFF8B5C52u, (ay_m3_argb_t)0x525C8BFFu },
    { "onTertiary", (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu },
    { "tertiaryContainer", (ay_m3_argb_t)0xFFDDE1FFu, (ay_m3_argb_t)0xFFFFE1DDu, (ay_m3_argb_t)0xDDE1FFFFu },
    { "onTertiaryContainer", (ay_m3_argb_t)0xFF3A4472u, (ay_m3_argb_t)0xFF72443Au, (ay_m3_argb_t)0x3A4472FFu },
    { "tertiaryFixed", (ay_m3_argb_t)0xFFDDE1FFu, (ay_m3_argb_t)0xFFFFE1DDu, (ay_m3_argb_t)0xDDE1FFFFu },
    { "tertiaryFixedDim", (ay_m3_argb_t)0xFFBAC4FAu, (ay_m3_argb_t)0xFFFAC4BAu, (ay_m3_argb_t)0xBAC4FAFFu },
    { "onTertiaryFixed", (ay_m3_argb_t)0xFF0C1744u, (ay_m3_argb_t)0xFF44170Cu, (ay_m3_argb_t)0x0C1744FFu },
    { "onTertiaryFixedVariant", (ay_m3_argb_t)0xFF3A4472u, (ay_m3_argb_t)0xFF72443Au, (ay_m3_argb_t)0x3A4472FFu },
    { "error", (ay_m3_argb_t)0xFFBA1A1Au, (ay_m3_argb_t)0xFF1A1ABAu, (ay_m3_argb_t)0xBA1A1AFFu },
    { "onError", (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu, (ay_m3_argb_t)0xFFFFFFFFu },
    { "errorContainer", (ay_m3_argb_t)0xFFFFDAD6u, (ay_m3_argb_t)0xFFD6DAFFu, (ay_m3_argb_t)0xFFDAD6FFu },
    { "onErrorContainer", (ay_m3_argb_t)0xFF93000Au, (ay_m3_argb_t)0xFF0A0093u, (ay_m3_argb_t)0x93000AFFu },
    { "surfaceVariant", (ay_m3_argb_t)0xFFDBE3EDu, (ay_m3_argb_t)0xFFEDE3DBu, (ay_m3_argb_t)0xDBE3EDFFu },
    { "surfaceTint", (ay_m3_argb_t)0xFF006492u, (ay_m3_argb_t)0xFF926400u, (ay_m3_argb_t)0x006492FFu },
    { "scrim", (ay_m3_argb_t)0xFF000000u, (ay_m3_argb_t)0xFF000000u, (ay_m3_argb_t)0x000000FFu },
};

static const ay_ndk_role_entry_t ay_ndk_dark_roles[AY_NDK_ROLE_COUNT] = {
    { "background", (ay_m3_argb_t)0xFF0C141Bu, (ay_m3_argb_t)0xFF1B140Cu, (ay_m3_argb_t)0x0C141BFFu },
    { "onBackground", (ay_m3_argb_t)0xFFDBE3EDu, (ay_m3_argb_t)0xFFEDE3DBu, (ay_m3_argb_t)0xDBE3EDFFu },
    { "surface", (ay_m3_argb_t)0xFF0C141Bu, (ay_m3_argb_t)0xFF1B140Cu, (ay_m3_argb_t)0x0C141BFFu },
    { "surfaceDim", (ay_m3_argb_t)0xFF0C141Bu, (ay_m3_argb_t)0xFF1B140Cu, (ay_m3_argb_t)0x0C141BFFu },
    { "surfaceBright", (ay_m3_argb_t)0xFF323A42u, (ay_m3_argb_t)0xFF423A32u, (ay_m3_argb_t)0x323A42FFu },
    { "surfaceContainerLowest", (ay_m3_argb_t)0xFF070F15u, (ay_m3_argb_t)0xFF150F07u, (ay_m3_argb_t)0x070F15FFu },
    { "surfaceContainerLow", (ay_m3_argb_t)0xFF141D23u, (ay_m3_argb_t)0xFF231D14u, (ay_m3_argb_t)0x141D23FFu },
    { "surfaceContainer", (ay_m3_argb_t)0xFF182127u, (ay_m3_argb_t)0xFF272118u, (ay_m3_argb_t)0x182127FFu },
    { "surfaceContainerHigh", (ay_m3_argb_t)0xFF232B32u, (ay_m3_argb_t)0xFF322B23u, (ay_m3_argb_t)0x232B32FFu },
    { "surfaceContainerHighest", (ay_m3_argb_t)0xFF2D363Du, (ay_m3_argb_t)0xFF3D362Du, (ay_m3_argb_t)0x2D363DFFu },
    { "onSurface", (ay_m3_argb_t)0xFFDBE3EDu, (ay_m3_argb_t)0xFFEDE3DBu, (ay_m3_argb_t)0xDBE3EDFFu },
    { "onSurfaceVariant", (ay_m3_argb_t)0xFFBCC8D3u, (ay_m3_argb_t)0xFFD3C8BCu, (ay_m3_argb_t)0xBCC8D3FFu },
    { "outline", (ay_m3_argb_t)0xFF87929Du, (ay_m3_argb_t)0xFF9D9287u, (ay_m3_argb_t)0x87929DFFu },
    { "outlineVariant", (ay_m3_argb_t)0xFF3D4851u, (ay_m3_argb_t)0xFF51483Du, (ay_m3_argb_t)0x3D4851FFu },
    { "inverseSurface", (ay_m3_argb_t)0xFFDBE3EDu, (ay_m3_argb_t)0xFFEDE3DBu, (ay_m3_argb_t)0xDBE3EDFFu },
    { "inverseOnSurface", (ay_m3_argb_t)0xFF293139u, (ay_m3_argb_t)0xFF393129u, (ay_m3_argb_t)0x293139FFu },
    { "primary", (ay_m3_argb_t)0xFF8BCEFFu, (ay_m3_argb_t)0xFFFFCE8Bu, (ay_m3_argb_t)0x8BCEFFFFu },
    { "onPrimary", (ay_m3_argb_t)0xFF00344Eu, (ay_m3_argb_t)0xFF4E3400u, (ay_m3_argb_t)0x00344EFFu },
    { "primaryContainer", (ay_m3_argb_t)0xFF004B6Fu, (ay_m3_argb_t)0xFF6F4B00u, (ay_m3_argb_t)0x004B6FFFu },
    { "onPrimaryContainer", (ay_m3_argb_t)0xFFC9E6FFu, (ay_m3_argb_t)0xFFFFE6C9u, (ay_m3_argb_t)0xC9E6FFFFu },
    { "primaryFixed", (ay_m3_argb_t)0xFFC9E6FFu, (ay_m3_argb_t)0xFFFFE6C9u, (ay_m3_argb_t)0xC9E6FFFFu },
    { "primaryFixedDim", (ay_m3_argb_t)0xFF8BCEFFu, (ay_m3_argb_t)0xFFFFCE8Bu, (ay_m3_argb_t)0x8BCEFFFFu },
    { "onPrimaryFixed", (ay_m3_argb_t)0xFF001E2Fu, (ay_m3_argb_t)0xFF2F1E00u, (ay_m3_argb_t)0x001E2FFFu },
    { "onPrimaryFixedVariant", (ay_m3_argb_t)0xFF004B6Fu, (ay_m3_argb_t)0xFF6F4B00u, (ay_m3_argb_t)0x004B6FFFu },
    { "inversePrimary", (ay_m3_argb_t)0xFF006492u, (ay_m3_argb_t)0xFF926400u, (ay_m3_argb_t)0x006492FFu },
    { "secondary", (ay_m3_argb_t)0xFFB4C7E9u, (ay_m3_argb_t)0xFFE9C7B4u, (ay_m3_argb_t)0xB4C7E9FFu },
    { "onSecondary", (ay_m3_argb_t)0xFF1E314Cu, (ay_m3_argb_t)0xFF4C311Eu, (ay_m3_argb_t)0x1E314CFFu },
    { "secondaryContainer", (ay_m3_argb_t)0xFF354763u, (ay_m3_argb_t)0xFF634735u, (ay_m3_argb_t)0x354763FFu },
    { "onSecondaryContainer", (ay_m3_argb_t)0xFFD5E3FFu, (ay_m3_argb_t)0xFFFFE3D5u, (ay_m3_argb_t)0xD5E3FFFFu },
    { "secondaryFixed", (ay_m3_argb_t)0xFFD5E3FFu, (ay_m3_argb_t)0xFFFFE3D5u, (ay_m3_argb_t)0xD5E3FFFFu },
    { "secondaryFixedDim", (ay_m3_argb_t)0xFFB4C7E9u, (ay_m3_argb_t)0xFFE9C7B4u, (ay_m3_argb_t)0xB4C7E9FFu },
    { "onSecondaryFixed", (ay_m3_argb_t)0xFF061C36u, (ay_m3_argb_t)0xFF361C06u, (ay_m3_argb_t)0x061C36FFu },
    { "onSecondaryFixedVariant", (ay_m3_argb_t)0xFF354763u, (ay_m3_argb_t)0xFF634735u, (ay_m3_argb_t)0x354763FFu },
    { "tertiary", (ay_m3_argb_t)0xFFBAC4FAu, (ay_m3_argb_t)0xFFFAC4BAu, (ay_m3_argb_t)0xBAC4FAFFu },
    { "onTertiary", (ay_m3_argb_t)0xFF232D5Au, (ay_m3_argb_t)0xFF5A2D23u, (ay_m3_argb_t)0x232D5AFFu },
    { "tertiaryContainer", (ay_m3_argb_t)0xFF3A4472u, (ay_m3_argb_t)0xFF72443Au, (ay_m3_argb_t)0x3A4472FFu },
    { "onTertiaryContainer", (ay_m3_argb_t)0xFFDDE1FFu, (ay_m3_argb_t)0xFFFFE1DDu, (ay_m3_argb_t)0xDDE1FFFFu },
    { "tertiaryFixed", (ay_m3_argb_t)0xFFDDE1FFu, (ay_m3_argb_t)0xFFFFE1DDu, (ay_m3_argb_t)0xDDE1FFFFu },
    { "tertiaryFixedDim", (ay_m3_argb_t)0xFFBAC4FAu, (ay_m3_argb_t)0xFFFAC4BAu, (ay_m3_argb_t)0xBAC4FAFFu },
    { "onTertiaryFixed", (ay_m3_argb_t)0xFF0C1744u, (ay_m3_argb_t)0xFF44170Cu, (ay_m3_argb_t)0x0C1744FFu },
    { "onTertiaryFixedVariant", (ay_m3_argb_t)0xFF3A4472u, (ay_m3_argb_t)0xFF72443Au, (ay_m3_argb_t)0x3A4472FFu },
    { "error", (ay_m3_argb_t)0xFFFFB4ABu, (ay_m3_argb_t)0xFFABB4FFu, (ay_m3_argb_t)0xFFB4ABFFu },
    { "onError", (ay_m3_argb_t)0xFF690005u, (ay_m3_argb_t)0xFF050069u, (ay_m3_argb_t)0x690005FFu },
    { "errorContainer", (ay_m3_argb_t)0xFF93000Au, (ay_m3_argb_t)0xFF0A0093u, (ay_m3_argb_t)0x93000AFFu },
    { "onErrorContainer", (ay_m3_argb_t)0xFFFFDAD6u, (ay_m3_argb_t)0xFFD6DAFFu, (ay_m3_argb_t)0xFFDAD6FFu },
    { "surfaceVariant", (ay_m3_argb_t)0xFF2D363Du, (ay_m3_argb_t)0xFF3D362Du, (ay_m3_argb_t)0x2D363DFFu },
    { "surfaceTint", (ay_m3_argb_t)0xFF8BCEFFu, (ay_m3_argb_t)0xFFFFCE8Bu, (ay_m3_argb_t)0x8BCEFFFFu },
    { "scrim", (ay_m3_argb_t)0xFF000000u, (ay_m3_argb_t)0xFF000000u, (ay_m3_argb_t)0x000000FFu },
};

/* --- Helper inline pour cadence AChoreographer / interpolation ressort M3 Expressive --- */
static inline const ay_ndk_role_entry_t *ay_ndk_get_roles(int is_dark) {
    return is_dark ? ay_ndk_dark_roles : ay_ndk_light_roles;
}

#ifdef __cplusplus
}
#endif

#endif /* AY_NDK_THEME_H */
