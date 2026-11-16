/* SPDX-License-Identifier: MIT OR Apache-2.0 */
/*
 * src/tests/sanitize.c - AddressSanitizer + UndefinedBehaviorSanitizer driver for the C core (`make
 * -C src sanitize`).
 *
 * Calls every exported function of include/ay/sys.h with valid and hostile arguments: every output
 * buffer is a heap block of exactly the capacity passed (so a one-byte overrun is an ASan report),
 * every input is a block of exactly its length (so an over-read is too), and the byte streams are a
 * deterministic xorshift corpus plus structured escape sequences. The sanitizers are the oracle;
 * return codes are only checked where the header documents them. Exit status is non-zero on the
 * first sanitizer report or a failed CHECK.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ay/sys.h"

static unsigned long long rng_state = 0x9e3779b97f4a7c15ull;
static int failures;

#define CHECK(c)                                                                                   \
	do {                                                                                       \
		if (!(c)) {                                                                        \
			fprintf (stderr, "FAIL %s:%d %s\n", __FILE__, __LINE__, #c);               \
			failures++;                                                                \
		}                                                                                  \
	} while (0)

static unsigned long long
rnd (void)
{
	rng_state ^= rng_state << 13;
	rng_state ^= rng_state >> 7;
	rng_state ^= rng_state << 17;
	return rng_state;
}

static __u32
rnd_below (__u32 n)
{
	return n ? (__u32)(rnd () % n) : 0;
}

/* Heap block of exactly n bytes (never NULL: malloc(0) is replaced by one byte that is not passed
 * on). */
static __u8 *
exact (__usize n)
{
	__u8 *p = malloc (n ? n : 1);
	if (!p)
		abort ();
	return p;
}

static void
fill_random (__u8 *p, __usize n)
{
	for (__usize i = 0; i < n; i++)
		p[i] = (__u8)rnd ();
}

static void
test_sys (void)
{
	CHECK (ay_sys_abi_version () != 0);
	struct ay_cpu_caps caps;
	memset (&caps, 0, sizeof caps);
	CHECK (ay_cpu_probe (&caps) == 0);
	for (__usize n = 0; n < 96; n++) {
		__u8 *b = exact (n);
		fill_random (b, n);
		(void)ay_fnv1a64 (b, n);
		free (b);
	}
	CHECK (ay_fnv1a64 ((const __u8 *)"", 0) == 0xcbf29ce484222325ull);
	(void)ay_rdtsc ();
}

static void
test_wayland (void)
{
	for (__usize cap = 0; cap < 80; cap++) {
		for (__u32 words = 0; words < 6; words++) {
			__u8 *dst = exact (cap);
			__u32 *pl = malloc ((words ? words : 1) * sizeof (__u32));
			for (__u32 i = 0; i < words; i++)
				pl[i] = (__u32)rnd ();
			(void)wl_wire_encode (dst, cap, (__u32)rnd (), (__u16)rnd (), pl, words);
			free (pl);
			free (dst);
		}
		__u8 *dst = exact (cap);
		for (__usize len = 0; len < 40; len += 3) {
			char *s = malloc (len ? len : 1); /* not NUL terminated on purpose */
			memset (s, 'a' + (int)(len % 26), len);
			(void)wl_wire_put_string (dst, cap, s, len);
			free (s);
		}
		free (dst);
		__u8 *src = exact (cap);
		fill_random (src, cap);
		__u32 id = 0;
		__u16 op = 0, size = 0;
		(void)wl_wire_decode_hdr (src, cap, &id, &op, &size);
		free (src);
	}
	CHECK (wl_hdr_size (wl_pack_size_opcode (12, 7)) == 12);
	CHECK (wl_hdr_opcode (wl_pack_size_opcode (12, 7)) == 7);
	CHECK (wl_fixed_to_int (wl_fixed_from_int (-37)) == -37);

	for (__u32 mode = 0; mode < 4; mode++) {
		for (__u32 count = 0; count < 12; count++) {
			__u32 *ids = malloc ((count ? count : 1) * sizeof (__u32));
			struct wl_box *out = malloc ((count ? count : 1) * sizeof (struct wl_box));
			for (__u32 i = 0; i < count; i++)
				ids[i] = i + 1;
			(void)wl_tile_compute (mode, 1920, 1080, rnd_below (64), rnd_below (1200),
					       ids, count, out);
			(void)wl_tile_compute (mode, rnd_below (8), rnd_below (8), rnd_below (64),
					       rnd_below (1200), ids, count, out);
			free (ids);
			free (out);
		}
	}
	struct wl_box a = { 1, 0, 0, 10, 10 }, b = { 2, 5, 5, 20, 20 }, m;
	(void)wl_damage_union (&a, &b, &m);

	struct xcb_setup_req req;
	memset (&req, 0, sizeof req);
	(void)xcb_build_setup_req (&req);
	struct xwm_context *ctx = calloc (1, sizeof *ctx);
	xwm_context_init (ctx, 77);
	for (int i = 0; i < 4000; i++) {
		struct xcb_client_message_event ev;
		memset (&ev, 0, sizeof ev);
		ev.window = rnd_below (80);
		ev.type = rnd_below (3) ? 77 : (__u32)rnd ();
		ev.format = rnd_below (3) ? 32 : (__u8)rnd ();
		for (int k = 0; k < 5; k++)
			ev.data32[k] = rnd_below (100);
		(void)xwm_handle_client_message (ctx, &ev);
		(void)xwm_lookup_wl_surface (ctx, rnd_below (80));
		if (rnd_below (4) == 0)
			(void)xwm_unmap_window (ctx, rnd_below (80));
	}
	free (ctx);
}

static void
test_nt_wine_drm (void)
{
	for (__s32 e = -140; e <= 4; e++) {
		NTSTATUS s = nt_errno_to_ntstatus (e);
		(void)nt_status_to_errno (s);
	}
	for (int i = 0; i < 512; i++)
		(void)nt_status_to_errno ((NTSTATUS)rnd ());
	for (__u32 len = 0; len < 80; len += 4) {
		__u8 *dst = exact (64);
		__u8 *pl = exact (len);
		fill_random (pl, len);
		(void)wine_pack_server_req (dst, (__s32)rnd_below (32), pl, len, rnd ());
		free (pl);
		free (dst);
	}
	struct drm_mode_fb_cmd2 cmd;
	memset (&cmd, 0, sizeof cmd);
	(void)drm_fb_cmd2_init (&cmd, 1920, 1080, 0x34325258u, 0, 1);
	(void)drm_fb_cmd2_init (&cmd, 0, 0, 0, 0, 0);
	for (__u32 os = 0; os < 5; os++)
		(void)mesa_select_egl_platform (os, os & 1, (os >> 1) & 1);
}

static void
test_wasm (void)
{
	for (__usize cap = 0; cap < 24; cap++) {
		for (int round = 0; round < 64; round++) {
			__u8 *src = exact (cap);
			fill_random (src, cap);
			if (round & 1 && cap)
				memset (src, 0xff, cap - 1); /* unterminated continuation bytes */
			__u64 val = 0;
			__u32 n = 0;
			(void)wasm_uleb128_decode (src, cap, &val, &n);
			free (src);
		}
	}
	/* Header plus random sections: ids, sizes (ULEB128) and payloads cut at every length. */
	static const __u8 hdr[8] = { 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 };
	for (int round = 0; round < 4000; round++) {
		__usize full = 8 + rnd_below (96);
		__u8 tmp[104];
		memcpy (tmp, hdr, 8);
		fill_random (tmp + 8, full - 8);
		if (round % 3 == 0 && full > 10) {
			tmp[8] = (__u8)rnd_below (13);
			tmp[9] = (__u8)rnd_below (full);
		}
		for (__usize len = full; len + 4 > full && len > 0; len--) {
			__u8 *m = exact (len);
			memcpy (m, tmp, len);
			struct wasm_module_info info;
			memset (&info, 0, sizeof info);
			(void)wasm_inspect_module (m, len, &info);
			free (m);
		}
	}
	for (__usize count = 0; count < 70; count++) {
		__s32 *x = malloc ((count ? count : 1) * sizeof (__s32));
		__s32 *y = malloc ((count ? count : 1) * sizeof (__s32));
		for (__usize i = 0; i < count; i++) {
			x[i] = (__s32)(rnd_below (2001)) - 1000;
			y[i] = (__s32)(rnd_below (2001)) - 1000;
		}
		__s64 sum = 0, want = 0;
		CHECK (wasm_simd_dot_i32 (x, y, count, &sum) == 0);
		for (__usize i = 0; i < count; i++)
			want += (__s64)x[i] * y[i];
		CHECK (sum == want);
		free (x);
		free (y);
	}
}

static void
test_ui (void)
{
	for (__u32 mode = 0; mode < 3; mode++)
		for (__u32 role = 0; role < 70; role++)
			(void)ay_ui_color_argb (mode, role);
	for (int i = 0; i < 256; i++) {
		(void)ay_ui_argb_to_abgr ((__u32)rnd ());
		(void)ay_ui_state_blend_argb ((__u32)rnd (), (__u32)rnd (), rnd_below (1200));
	}
	struct ay_ui_spring_state st;
	for (__u32 preset = 0; preset < 8; preset++) {
		if (ay_ui_spring_init (&st, preset, 0.0f, 1.0f) == 0)
			for (int i = 0; i < 200; i++)
				(void)ay_ui_spring_step (&st, 0.016f);
	}
	for (__u32 w = 0; w < 2200; w += 37) {
		(void)ay_ui_window_class (w);
		struct ay_ui_adaptive_shell sh;
		(void)ay_ui_compute_shell (w, 800, &sh);
	}
	static const char title[] = "Title <&> \"q\"", body[] = "Body text & more", cta[] = "Open",
			  href[] = "https://x.invalid/?a=1&b=2";
	for (__usize cap = 0; cap < 600; cap += 1) {
		char *dst = (char *)exact (cap);
		(void)ay_ui_emit_m3_card_html (dst, cap, title, sizeof title - 1, body,
					       sizeof body - 1, cta, sizeof cta - 1, href,
					       sizeof href - 1);
		free (dst);
	}
}

static void
test_shell_kit (void)
{
	__u32 themes = ay_term_theme_count ();
	CHECK (themes > 0);
	for (__u32 t = 0; t < themes + 2; t++) {
		for (__usize cap = 0; cap < 48; cap += 5) {
			char *d = (char *)exact (cap);
			(void)ay_term_theme_slug (t, d, cap);
			(void)ay_term_theme_name (t, d, cap);
			free (d);
		}
		struct ay_term_palette pal;
		(void)ay_term_palette_get (t, &pal);
		for (__u32 slot = 0; slot < 40; slot++)
			(void)ay_term_palette_argb (t, slot);
	}
	for (__usize cap = 0; cap < 64; cap++) {
		char *d = (char *)exact (cap);
		(void)ay_term_format_hex ((__u32)rnd (), d, cap);
		(void)ay_term_format_sgr ((__u32)rnd (), (__u32)rnd (), (__u32)rnd (), d, cap);
		free (d);
	}
	__u32 entries = ay_shell_index_count ();
	for (__u32 i = 0; i < entries + 2; i++) {
		struct ay_shell_entry_meta meta;
		(void)ay_shell_index_meta (i, &meta);
		for (__u32 f = 0; f <= AY_SHELL_FIELD_COUNT; f++)
			for (__usize cap = 0; cap < 40; cap += 7) {
				char *d = (char *)exact (cap);
				(void)ay_shell_index_field (i, f, d, cap);
				free (d);
			}
		for (__usize len = 0; len < 12; len++) {
			char *q = (char *)exact (len);
			memset (q, 'a' + (int)(i % 26), len);
			(void)ay_shell_index_match (i, q, len);
			(void)ay_shell_index_find (q, len);
			(void)ay_term_theme_find (q, len);
			free (q);
		}
	}
}

static void
vterm_feed_structured (struct ay_vterm_state *vt)
{
	static const char *const seqs[] = {
		"\x1b[31;1m",
		"\x1b[38;2;1;2;3m",
		"\x1b[48;5;200m",
		"\x1b[2J",
		"\x1b[H",
		"\x1b[999;999H",
		"\x1b[?1049h",
		"\x1b[?1049l",
		"\x1b[3J",
		"\x1b[0K",
		"\x1b[10@",
		"\x1b[10P",
		"\x1b[5L",
		"\x1b[5M",
		"\x1b[3S",
		"\x1b[3T",
		"\x1b[1;24r",
		"\x1b[0;0r",
		"\x1b]0;title\x07",
		"\x1b]8;;https://x.invalid\x1b\\",
		"\x1b]133;A\x07",
		"\x1b]133;C\x07",
		"\x1b]133;D;0\x07",
		"\x1b]52;c;aGVsbG8=\x07",
		"\x1b]7;file://host/tmp\x07",
		"\x1bP$q\"p\x1b\\",
		"\x1b[c",
		"\x1b[6n",
		"\x1b[>u",
		"\x1b[=5u",
		"\x1b[<u",
		"\033c",
		"\xe4\xb8\xad\xe6\x96\x87",
		"\xf0\x9f\x98\x80",
		"\xc3",
		"\xff\xfe",
		"\t\r\n\b\x07",
		"\x1b[?25l",
		"\x1b[?2004h",
	};
	const __usize n = sizeof seqs / sizeof seqs[0];
	for (int i = 0; i < 6000; i++) {
		const char *s = seqs[rnd_below ((__u32)n)];
		__usize len = strlen (s);
		__u8 *b = exact (len);
		/* Exactly len bytes, no NUL: an over-read is an ASan report. */
		memcpy (b, s, len); /* NOLINT(bugprone-not-null-terminated-result) */
		(void)ay_vterm_feed (vt, b, len);
		free (b);
		if (rnd_below (5) == 0) {
			__usize k = rnd_below (40);
			__u8 *r = exact (k);
			fill_random (r, k);
			(void)ay_vterm_feed (vt, r, k);
			free (r);
		}
	}
}

static void
vterm_read_back (struct ay_vterm_state *vt)
{
	struct ay_vterm_meta meta;
	memset (&meta, 0, sizeof meta);
	(void)ay_vterm_get_meta (vt, &meta);
	for (__u32 cap = 0; cap < 300; cap += 37) {
		__u32 cells = cap;
		struct ay_vterm_gpu_cell *g = malloc ((cells ? cells : 1) * sizeof *g);
		(void)ay_vterm_pack_gpu_cells (vt, g, cells);
		free (g);
	}
	for (__u32 row = 0; row < AY_VTERM_MAX_ROWS + 2; row += 7)
		for (__usize cap = 0; cap < 300; cap += 59) {
			char *d = (char *)exact (cap);
			(void)ay_vterm_copy_row_text (vt, row, d, cap);
			(void)ay_vterm_copy_text (vt, d, cap);
			(void)ay_vterm_get_link (vt, row, d, cap);
			(void)ay_vterm_drain_clipboard (vt, d, cap);
			(void)ay_vterm_copy_scrollback_text (vt, row * 13, row, d, cap);
			free (d);
		}
	for (__usize cap = 0; cap < 700; cap += 101) {
		__u8 *d = exact (cap);
		(void)ay_vterm_drain_replies (vt, d, cap);
		free (d);
	}
	for (__u32 i = 0; i < AY_VTERM_MAX_BLOCKS + 2; i++) {
		struct ay_vterm_block blk;
		(void)ay_vterm_get_block (vt, i, &blk);
	}
	(void)ay_vterm_scroll_lines (vt, -50);
	(void)ay_vterm_scroll_lines (vt, 1 << 20);
	(void)ay_vterm_set_scroll (vt, rnd_below (4000));
	(void)ay_vterm_reset_dirty (vt);
}

static void
test_vterm (void)
{
	__usize bytes = ay_vterm_state_bytes ();
	CHECK (bytes == sizeof (struct ay_vterm_state));
	CHECK (ay_vterm_abi_version () == AY_VTERM_ABI_VERSION);
	struct ay_vterm_state *vt = malloc (bytes);
	if (!vt)
		abort ();
	static const __u32 dims[][2]
	    = { { 80, 24 }, { 1, 1 }, { 240, 80 }, { 241, 81 }, { 0, 0 }, { 10, 3 }, { 132, 50 } };
	for (__usize d = 0; d < sizeof dims / sizeof dims[0]; d++) {
		memset (vt, 0xa5, bytes);
		if (ay_vterm_init (vt, dims[d][0], dims[d][1], rnd_below (40)) != 0)
			continue;
		vterm_feed_structured (vt);
		vterm_read_back (vt);
		for (int r = 0; r < 20; r++) {
			(void)ay_vterm_resize (vt, 1 + rnd_below (250), 1 + rnd_below (90));
			(void)ay_vterm_set_theme (vt, rnd_below (40));
			vterm_feed_structured (vt);
		}
		vterm_read_back (vt);
	}
	free (vt);
}

int
main (void)
{
	test_sys ();
	test_wayland ();
	test_nt_wine_drm ();
	test_wasm ();
	test_ui ();
	test_shell_kit ();
	test_vterm ();
	if (failures) {
		fprintf (stderr, "sanitize: %d failed checks\n", failures);
		return 1;
	}
	puts ("sanitize: ok");
	return 0;
}
