// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * ay-chat: terminal chat over the router C ABI, coloured by the Material 3 scheme computed in ui/hct.c
 * (brand seed, vibrant, dark) and printed with 24-bit SGR. Same env as ay-router:
 *   AY_ROUTER_HOST (https://router.aphrody.com or 127.0.0.1), AY_ROUTER_PORT, AY_ROUTER_KEY, AY_ROUTER_MODEL (auto:free)
 * Commands: /model <id>, /models, /clear, /quit.
 */
#include "../include/ay/router.h"
#include "../include/ay/sys.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
/* kernel32 console calls declared here: <windows.h> clashes with the uapi NTSTATUS types of sys.h */
__declspec(dllimport) int __stdcall SetConsoleOutputCP(unsigned);
__declspec(dllimport) void *__stdcall GetStdHandle(unsigned long);
__declspec(dllimport) int __stdcall GetConsoleMode(void *, unsigned long *);
__declspec(dllimport) int __stdcall SetConsoleMode(void *, unsigned long);
#define CP_UTF8 65001
#define STD_OUTPUT_HANDLE ((unsigned long)-11)
#endif

static __u32 roles[AY_UI_ROLE_COUNT];

static void fg(__u32 role) { __u32 c = roles[role]; printf("\x1b[38;2;%u;%u;%um", (c >> 16) & 255, (c >> 8) & 255, c & 255); }
static void bg(__u32 role) { __u32 c = roles[role]; printf("\x1b[48;2;%u;%u;%um", (c >> 16) & 255, (c >> 8) & 255, c & 255); }
static void reset(void) { printf("\x1b[0m"); }

/* JSON string append with escaping; returns 0, or -1 when it does not fit. */
static int jappend(char *dst, size_t cap, size_t *o, const char *s)
{
	for (; *s; s++) {
		unsigned char c = (unsigned char)*s;
		char e[8];
		const char *w = e;
		if (c == '"' || c == '\\') { e[0] = '\\'; e[1] = (char)c; e[2] = 0; }
		else if (c == '\n') w = "\\n";
		else if (c < 0x20) snprintf(e, sizeof(e), "\\u%04x", c);
		else { e[0] = (char)c; e[1] = 0; }
		size_t n = strlen(w);
		if (*o + n + 1 >= cap)
			return -1;
		memcpy(dst + *o, w, n);
		*o += n;
	}
	dst[*o] = 0;
	return 0;
}

/* Raw append (JSON structure, no escaping). */
static int rappend(char *dst, size_t cap, size_t *o, const char *s)
{
	size_t n = strlen(s);
	if (*o + n + 1 >= cap)
		return -1;
	memcpy(dst + *o, s, n + 1);
	*o += n;
	return 0;
}

/* First value of "key":"..." in json, unescaped into out. */
static int jget(const char *json, const char *key, char *out, size_t cap)
{
	char pat[64];
	snprintf(pat, sizeof(pat), "\"%s\":\"", key);
	const char *p = strstr(json, pat);
	if (!p)
		return -1;
	p += strlen(pat);
	size_t o = 0;
	for (; *p && *p != '"' && o + 4 < cap; p++) {
		if (*p != '\\') { out[o++] = *p; continue; }
		p++;
		switch (*p) {
		case 'n': out[o++] = '\n'; break;
		case 't': out[o++] = '\t'; break;
		case 'u': {
			unsigned v = 0;
			for (int i = 1; i <= 4 && p[i]; i++) v = v * 16 + (unsigned)(p[i] <= '9' ? p[i] - '0' : (p[i] | 32) - 'a' + 10);
			p += 4;
			if (v < 0x80) out[o++] = (char)v;
			else if (v < 0x800) { out[o++] = (char)(0xC0 | (v >> 6)); out[o++] = (char)(0x80 | (v & 63)); }
			else { out[o++] = (char)(0xE0 | (v >> 12)); out[o++] = (char)(0x80 | ((v >> 6) & 63)); out[o++] = (char)(0x80 | (v & 63)); }
			break;
		}
		default: out[o++] = *p;
		}
	}
	out[o] = 0;
	return 0;
}

static const char *env(const char *k, const char *d) { const char *v = getenv(k); return v && *v ? v : d; }

int main(void)
{
	static char out[1 << 21], hist[1 << 20], reply[1 << 18], msgs[(1 << 20) + 16];
	char line[8192], model[256];
	size_t ho = 0;
#if defined(_WIN32)
	SetConsoleOutputCP(CP_UTF8);
	void *h = GetStdHandle(STD_OUTPUT_HANDLE);
	unsigned long mode = 0;
	if (GetConsoleMode(h, &mode))
		SetConsoleMode(h, mode | 0x0004 /* ENABLE_VIRTUAL_TERMINAL_PROCESSING */);
#endif
	ay_m3_scheme(0xFF135B82u, AY_M3_VARIANT_VIBRANT, AY_UI_THEME_DARK, 0xFFD1D293u, roles);
	const char *host = env("AY_ROUTER_HOST", "https://router.aphrody.com");
	struct ay_router *r = ay_router_open(host, (unsigned short)atoi(env("AY_ROUTER_PORT", strncmp(host, "https://", 8) ? "8790" : "0")),
					     getenv("AY_ROUTER_KEY"));
	if (!r) {
		fprintf(stderr, "ay-chat: bad AY_ROUTER_HOST/PORT\n");
		return 2;
	}
	snprintf(model, sizeof(model), "%s", env("AY_ROUTER_MODEL", "auto:free"));
	bg(AY_UI_ROLE_PRIMARY); fg(AY_UI_ROLE_ON_PRIMARY); printf(" ay-chat "); reset();
	fg(AY_UI_ROLE_ON_SURFACE_VARIANT); printf(" %s  model %s  /models /model /clear /quit\n", host, model); reset();
	for (;;) {
		fg(AY_UI_ROLE_PRIMARY); printf("\n> "); reset(); fflush(stdout);
		if (!fgets(line, sizeof(line), stdin))
			break;
		line[strcspn(line, "\r\n")] = 0;
		if (!*line)
			continue;
		if (!strcmp(line, "/quit"))
			break;
		if (!strcmp(line, "/clear")) { ho = 0; hist[0] = 0; continue; }
		if (!strncmp(line, "/model ", 7)) { snprintf(model, sizeof(model), "%s", line + 7); continue; }
		if (!strcmp(line, "/models")) {
			int rc = ay_router_models(r, out, sizeof(out));
			fg(AY_UI_ROLE_ON_SURFACE_VARIANT);
			for (const char *p = out; rc >= 200 && (p = strstr(p, "\"id\":\"")); ) { p += 6; const char *e = strchr(p, '"'); printf("  %.*s\n", (int)(e - p), p); p = e; }
			if (rc < 200) printf("  error %d\n", rc);
			reset();
			continue;
		}
		size_t save = ho;
		if (rappend(hist, sizeof(hist), &ho, ho ? ",{\"role\":\"user\",\"content\":\"" : "{\"role\":\"user\",\"content\":\"") ||
		    jappend(hist, sizeof(hist), &ho, line)) { ho = save; fprintf(stderr, "history full, /clear\n"); continue; }
		memcpy(hist + ho, "\"}", 3);
		ho += 2;
		snprintf(msgs, sizeof(msgs), "[%s]", hist);
		int rc = ay_router_chat(r, model, msgs, out, sizeof(out));
		if (rc < 200 || rc >= 300 || jget(out, "content", reply, sizeof(reply))) {
			ho = save; hist[ho] = 0;
			fg(AY_UI_ROLE_ERROR); printf("  error %d %.300s\n", rc, out); reset();
			continue;
		}
		char served[256] = "";
		jget(out, "model", served, sizeof(served));
		bg(AY_UI_ROLE_SURFACE_CONTAINER_HIGH); fg(AY_UI_ROLE_ON_SURFACE);
		printf(" %s ", reply); reset();
		fg(AY_UI_ROLE_OUTLINE); printf("\n  %s\n", served); reset();
		save = ho;
		if (rappend(hist, sizeof(hist), &ho, ",{\"role\":\"assistant\",\"content\":\"") || jappend(hist, sizeof(hist), &ho, reply) || ho + 3 >= sizeof(hist)) {
			ho = save; hist[ho] = 0;
			continue;
		}
		memcpy(hist + ho, "\"}", 3);
		ho += 2;
	}
	ay_router_close(r);
	return 0;
}
