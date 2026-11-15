// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * src/ui/m3.c - Freestanding Pure C (`-std=gnu11`) Material 3 Expressive Engine
 *
 * Implements:
 *   1. Aphrody M3 ColorScheme (Light + Dark, seed #135B82, vibrant) computed by ui/hct.c, byte-identical
 *      to `packages/design/tokens/tokens.json` (golden check: ui/hct_test.c).
 *   2. Material 3 Expressive Spring Physics (`androidx` Compose Material3 v0_14_0 spatial & effects
 *      springs: semi-implicit Euler + analytical harmonic damping, 120Hz/240Hz frame-rate independent).
 *   3. Adaptive Window Size Classes (`compact`, `medium`, `expanded`, `large`, `extra-large`) and
 *      Taffy-compatible flex/rail shell geometry (`NavigationBar` < 600dp, `NavigationRail` >= 600dp).
 *   4. Zero-allocation HTML5 + `<md-*>` Material Web custom element SSR emitter (`ay_ui_emit_m3_card_html`)
 *      with strict XSS HTML-entity escaping, usable from WASI, Bun FFI, Rust, Android NDK, or Cloudflare Workers.
 */

#include "../include/ay/sys.h"

/* Aphrody brand (assets/brand/brand.toml): seed, variant and accent; roles are computed by ui/hct.c. */
#define AY_BRAND_SEED_ARGB   0xFF135B82u
#define AY_BRAND_ACCENT_ARGB 0xFFD1D293u

static __u32 g_m3_roles[2][AY_UI_ROLE_COUNT];
static int g_m3_ready;

/* Expressive spring table: { damping_ratio, stiffness } from ExpressiveMotionTokens.kt */
static const float g_m3_expressive_springs[6][2] = {
	{ 0.6f,  800.0f }, /* FAST_SPATIAL    */
	{ 1.0f, 3800.0f }, /* FAST_EFFECTS    */
	{ 0.8f,  380.0f }, /* DEFAULT_SPATIAL */
	{ 1.0f, 1600.0f }, /* DEFAULT_EFFECTS */
	{ 0.8f,  200.0f }, /* SLOW_SPATIAL    */
	{ 1.0f,  800.0f }, /* SLOW_EFFECTS    */
};

static float ay_sqrtf_nr(float x)
{
	float g;
	int i;

	if (x <= 0.0f)
		return 0.0f;
	g = x > 1.0f ? x * 0.5f : 1.0f;
	for (i = 0; i < 6; ++i)
		g = 0.5f * (g + x / g);
	return g;
}

AY_API __u32 ay_ui_color_argb(__u32 theme_mode, __u32 role_id)
{
	if (role_id >= AY_UI_ROLE_COUNT)
		return 0u;
	if (!g_m3_ready) {
		ay_m3_scheme(AY_BRAND_SEED_ARGB, AY_M3_VARIANT_VIBRANT, AY_UI_THEME_LIGHT, AY_BRAND_ACCENT_ARGB, g_m3_roles[0]);
		ay_m3_scheme(AY_BRAND_SEED_ARGB, AY_M3_VARIANT_VIBRANT, AY_UI_THEME_DARK, AY_BRAND_ACCENT_ARGB, g_m3_roles[1]);
		g_m3_ready = 1;
	}
	return g_m3_roles[theme_mode == AY_UI_THEME_DARK ? 1 : 0][role_id];
}

/* Convert 0xAARRGGBB -> 0xAABBGGRR little-endian ABGR word for WebGPU / Canvas / ANativeWindow RGBA8888 */
AY_API __u32 ay_ui_argb_to_abgr(__u32 argb)
{
	__u32 a = (argb >> 24) & 0xFFu;
	__u32 r = (argb >> 16) & 0xFFu;
	__u32 g = (argb >> 8) & 0xFFu;
	__u32 b = argb & 0xFFu;

	return (a << 24) | (b << 16) | (g << 8) | r;
}

/* Blend M3 state layer (`hover` 8%, `focus` 10%, `pressed` 10%, `dragged` 16%) in integer permille */
AY_API __u32 ay_ui_state_blend_argb(__u32 base_argb, __u32 content_argb, __u32 opacity_permille)
{
	__u32 inv;
	__u32 r, g, b;

	if (opacity_permille > 1000u)
		opacity_permille = 1000u;
	inv = 1000u - opacity_permille;

	r = (((base_argb >> 16) & 0xFFu) * inv + ((content_argb >> 16) & 0xFFu) * opacity_permille + 500u) / 1000u;
	g = (((base_argb >> 8) & 0xFFu) * inv + ((content_argb >> 8) & 0xFFu) * opacity_permille + 500u) / 1000u;
	b = ((base_argb & 0xFFu) * inv + (content_argb & 0xFFu) * opacity_permille + 500u) / 1000u;

	return (base_argb & 0xFF000000u) | (r << 16) | (g << 8) | b;
}

AY_API __s32 ay_ui_spring_init(struct ay_ui_spring_state *st, __u32 preset_id, float initial, float target)
{
	if (!st || preset_id > AY_UI_SPRING_SLOW_EFFECTS)
		return -AY_EINVAL;

	st->value = initial;
	st->target = target;
	st->velocity = 0.0f;
	st->damping_ratio = g_m3_expressive_springs[preset_id][0];
	st->stiffness = g_m3_expressive_springs[preset_id][1];
	return 0;
}

/* Sub-stepped damped harmonic oscillator (Compose M3 Expressive spring physics) */
AY_API __s32 ay_ui_spring_step(struct ay_ui_spring_state *st, float dt_sec)
{
	float c, sub_dt;
	int steps, i;

	if (!st || dt_sec < 0.0f || st->stiffness <= 0.0f)
		return -AY_EINVAL;
	if (dt_sec > 0.1f)
		dt_sec = 0.1f;

	c = 2.0f * st->damping_ratio * ay_sqrtf_nr(st->stiffness);
	/* Sub-step at <= 1ms so high-stiffness effects springs (k=3800) remain unconditionally stable */
	steps = (int)(dt_sec * 1000.0f) + 1;
	if (steps > 100)
		steps = 100;
	sub_dt = dt_sec / (float)steps;

	for (i = 0; i < steps; ++i) {
		float disp = st->value - st->target;
		float accel = -st->stiffness * disp - c * st->velocity;

		st->velocity += accel * sub_dt;
		st->value += st->velocity * sub_dt;
	}

	/* Snap when settled within sub-pixel / sub-alpha threshold */
	if ((st->value - st->target < 0.0005f && st->value - st->target > -0.0005f) &&
	    (st->velocity < 0.005f && st->velocity > -0.005f)) {
		st->value = st->target;
		st->velocity = 0.0f;
		return 1; /* settled */
	}
	return 0;
}

AY_API __u32 ay_ui_window_class(__u32 width_dp)
{
	if (width_dp < 600u)
		return AY_UI_WIN_COMPACT;
	if (width_dp < 840u)
		return AY_UI_WIN_MEDIUM;
	if (width_dp < 1200u)
		return AY_UI_WIN_EXPANDED;
	if (width_dp < 1600u)
		return AY_UI_WIN_LARGE;
	return AY_UI_WIN_EXTRA_LARGE;
}

AY_API __s32 ay_ui_compute_shell(__u32 width_dp, __u32 height_dp, struct ay_ui_adaptive_shell *out_shell)
{
	__u32 cls;

	if (!out_shell || width_dp == 0u || height_dp == 0u)
		return -AY_EINVAL;

	cls = ay_ui_window_class(width_dp);
	out_shell->window_class = cls;

	if (cls == AY_UI_WIN_COMPACT) {
		out_shell->nav_kind = AY_UI_COMP_NAVIGATION_BAR;
		out_shell->margin_px = 16u;
		out_shell->gutter_px = 12u;
		out_shell->columns = 1u;
		out_shell->nav_rail_width_px = 0u;
		out_shell->bottom_bar_h_px = height_dp > 80u ? 80u : 0u;
	} else if (cls == AY_UI_WIN_MEDIUM) {
		out_shell->nav_kind = AY_UI_COMP_NAVIGATION_RAIL;
		out_shell->margin_px = 24u;
		out_shell->gutter_px = 16u;
		out_shell->columns = 2u;
		out_shell->nav_rail_width_px = 80u;
		out_shell->bottom_bar_h_px = 0u;
	} else if (cls == AY_UI_WIN_EXPANDED) {
		out_shell->nav_kind = AY_UI_COMP_NAVIGATION_RAIL;
		out_shell->margin_px = 24u;
		out_shell->gutter_px = 24u;
		out_shell->columns = 3u;
		out_shell->nav_rail_width_px = 80u;
		out_shell->bottom_bar_h_px = 0u;
	} else {
		out_shell->nav_kind = AY_UI_COMP_NAVIGATION_RAIL;
		out_shell->margin_px = 24u;
		out_shell->gutter_px = 24u;
		out_shell->columns = (cls == AY_UI_WIN_EXTRA_LARGE) ? 4u : 3u;
		out_shell->nav_rail_width_px = 220u;
		out_shell->bottom_bar_h_px = 0u;
	}

	out_shell->content_x = out_shell->nav_rail_width_px + out_shell->margin_px;
	out_shell->content_y = 64u; /* Small M3 App Bar height = 64dp */
	out_shell->content_w = (width_dp > out_shell->content_x + out_shell->margin_px)
		? (width_dp - out_shell->content_x - out_shell->margin_px)
		: 0u;
	out_shell->content_h = (height_dp > out_shell->content_y + out_shell->bottom_bar_h_px)
		? (height_dp - out_shell->content_y - out_shell->bottom_bar_h_px)
		: 0u;
	return 0;
}

static __usize append_raw(char *dst, __usize cap, __usize pos, const char *s)
{
	while (*s) {
		if (pos + 1u < cap)
			dst[pos] = *s;
		pos++;
		s++;
	}
	return pos;
}

static __usize append_escaped(char *dst, __usize cap, __usize pos, const char *s, __usize len)
{
	__usize i;

	for (i = 0u; i < len; ++i) {
		char c = s[i];

		if (c == '&')
			pos = append_raw(dst, cap, pos, "&amp;");
		else if (c == '<')
			pos = append_raw(dst, cap, pos, "&lt;");
		else if (c == '>')
			pos = append_raw(dst, cap, pos, "&gt;");
		else if (c == '"')
			pos = append_raw(dst, cap, pos, "&quot;");
		else if (c == '\'')
			pos = append_raw(dst, cap, pos, "&#39;");
		else {
			if (pos + 1u < cap)
				dst[pos] = c;
			pos++;
		}
	}
	return pos;
}

/*
 * Zero-allocation Pure C SSR emitter: writes a semantic M3 Expressive card using the exact
 * `--md-sys-*` CSS variables and `<md-filled-button>` / `<md-outlined-button>` Web Components
 * shared with TypeScript (`@aphrody/design/components`) and Rust (`leptos` / `dioxus` / `aphrody-ui`).
 * Returns byte length written (excluding NUL), or `-AY_ENOSPC` if `cap` is too small.
 */
AY_API __s32 ay_ui_emit_m3_card_html(char *dst, __usize cap,
				     const char *title, __usize title_len,
				     const char *body, __usize body_len,
				     const char *cta_label, __usize cta_len,
				     const char *cta_href, __usize href_len)
{
	__usize pos = 0u;

	if (!dst || cap == 0u || (!title && title_len > 0u) || (!body && body_len > 0u) ||
	    (!cta_label && cta_len > 0u) || (!cta_href && href_len > 0u))
		return -AY_EINVAL;

	pos = append_raw(dst, cap, pos,
		"<article class=\"m3-card\" style=\"background:var(--md-sys-color-surface-container-low);"
		"color:var(--md-sys-color-on-surface);border:1px solid var(--md-sys-color-outline-variant);"
		"border-radius:var(--md-sys-shape-corner-large);padding:1.5rem\">"
		"<h2 style=\"font-size:var(--md-sys-typescale-title-large-size);"
		"line-height:var(--md-sys-typescale-title-large-line-height);margin:0 0 0.5rem\">");
	pos = append_escaped(dst, cap, pos, title ? title : "", title_len);
	pos = append_raw(dst, cap, pos,
		"</h2><p style=\"color:var(--md-sys-color-on-surface-variant);"
		"font-size:var(--md-sys-typescale-body-large-size);margin:0 0 1rem\">");
	pos = append_escaped(dst, cap, pos, body ? body : "", body_len);
	pos = append_raw(dst, cap, pos, "</p><md-filled-button href=\"");
	pos = append_escaped(dst, cap, pos, cta_href ? cta_href : "", href_len);
	pos = append_raw(dst, cap, pos, "\">");
	pos = append_escaped(dst, cap, pos, cta_label ? cta_label : "", cta_len);
	pos = append_raw(dst, cap, pos, "</md-filled-button></article>");

	if (pos + 1u > cap) {
		dst[cap - 1u] = '\0';
		return -AY_ENOSPC;
	}
	dst[pos] = '\0';
	return (__s32)pos;
}
