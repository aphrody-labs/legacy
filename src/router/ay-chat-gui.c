// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * ay-chat-gui: native Windows desktop chat over the router C ABI (Win32, no framework).
 * Colours: Material 3 dark scheme computed by ui/hct.c from the brand seed; type: Google Sans Flex.
 * Env: AY_ROUTER_HOST (https://router.aphrody.com), AY_ROUTER_PORT, AY_ROUTER_KEY, AY_ROUTER_MODEL (auto:free).
 * Requests run on a worker thread; the reply is posted back to the UI thread.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../include/ay/router.h"

/* ui/hct.c (sys.h types clash with windows.h, so the prototype is restated with plain C types) */
int ay_m3_scheme(unsigned seed, unsigned variant, unsigned mode, unsigned accent, unsigned out[25]);
enum { R_SURFACE = 0, R_LOW = 2, R_HIGH = 4, R_HIGHEST = 5, R_ON_SURFACE = 6, R_ON_VARIANT = 7, R_PRIMARY = 8, R_ON_PRIMARY = 9 };

#define WM_REPLY (WM_APP + 1)
#define ID_SEND 100

static unsigned roles[25];
static HWND g_log, g_in, g_send;
static HBRUSH g_bg, g_log_bg, g_in_bg, g_btn_bg;
static HFONT g_font;
static struct ay_router *g_r;
static char g_model[128];
static char *g_hist;
static size_t g_ho, g_hcap = 1 << 20;
static volatile LONG g_busy;

static COLORREF cr(unsigned argb) { return RGB((argb >> 16) & 255, (argb >> 8) & 255, argb & 255); }

static void jesc(char *dst, size_t cap, size_t *o, const char *s)
{
	for (; *s && *o + 8 < cap; s++) {
		unsigned char c = (unsigned char)*s;
		if (c == '"' || c == '\\') { dst[(*o)++] = '\\'; dst[(*o)++] = (char)c; }
		else if (c == '\n') { dst[(*o)++] = '\\'; dst[(*o)++] = 'n'; }
		else if (c >= 0x20) dst[(*o)++] = (char)c;
	}
	dst[*o] = 0;
}

static void raw(const char *s)
{
	size_t n = strlen(s);
	if (g_ho + n + 1 < g_hcap) { memcpy(g_hist + g_ho, s, n + 1); g_ho += n; }
}

static int jget(const char *json, const char *key, char *out, size_t cap)
{
	char pat[64];
	snprintf(pat, sizeof(pat), "\"%s\":\"", key);
	const char *p = strstr(json, pat);
	if (!p) return -1;
	p += strlen(pat);
	size_t o = 0;
	for (; *p && *p != '"' && o + 4 < cap; p++) {
		if (*p != '\\') { out[o++] = *p; continue; }
		p++;
		if (*p == 'n') { out[o++] = '\r'; out[o++] = '\n'; }
		else if (*p == 'u') {
			unsigned v = 0;
			for (int i = 1; i <= 4 && p[i]; i++) v = v * 16 + (unsigned)(p[i] <= '9' ? p[i] - '0' : (p[i] | 32) - 'a' + 10);
			p += 4;
			if (v < 0x80) out[o++] = (char)v;
			else if (v < 0x800) { out[o++] = (char)(0xC0 | (v >> 6)); out[o++] = (char)(0x80 | (v & 63)); }
			else { out[o++] = (char)(0xE0 | (v >> 12)); out[o++] = (char)(0x80 | ((v >> 6) & 63)); out[o++] = (char)(0x80 | (v & 63)); }
		} else out[o++] = *p;
	}
	out[o] = 0;
	return 0;
}

static void append_log(const char *utf8)
{
	int n = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, NULL, 0);
	wchar_t *w = malloc(n * sizeof(wchar_t));
	if (!w) return;
	MultiByteToWideChar(CP_UTF8, 0, utf8, -1, w, n);
	int len = GetWindowTextLengthW(g_log);
	SendMessageW(g_log, EM_SETSEL, len, len);
	SendMessageW(g_log, EM_REPLACESEL, FALSE, (LPARAM)w);
	SendMessageW(g_log, EM_SCROLLCARET, 0, 0);
	free(w);
}

static DWORD WINAPI worker(LPVOID hwnd)
{
	static char out[1 << 21];
	char *msgs = malloc(g_ho + 4);
	if (!msgs) return 0;
	snprintf(msgs, g_ho + 4, "[%s]", g_hist);
	int rc = ay_router_chat(g_r, g_model, msgs, out, sizeof(out));
	free(msgs);
	char *res = malloc(1 << 18);
	if (!res) return 0;
	char served[256] = "";
	if (rc >= 200 && rc < 300 && !jget(out, "content", res, 1 << 18)) {
		jget(out, "model", served, sizeof(served));
		size_t o = g_ho;
		raw(",{\"role\":\"assistant\",\"content\":\"");
		char tmp[1 << 16]; size_t t = 0;
		jesc(tmp, sizeof(tmp), &t, res);
		raw(tmp);
		raw("\"}");
		(void)o;
		size_t n = strlen(res);
		snprintf(res + n, (1 << 18) - n, "\r\n    %s\r\n\r\n", served);
	} else {
		snprintf(res, 1 << 18, "error %d %.300s\r\n\r\n", rc, out);
	}
	PostMessageW((HWND)hwnd, WM_REPLY, 0, (LPARAM)res);
	return 0;
}

static void send_msg(HWND hwnd)
{
	if (InterlockedCompareExchange(&g_busy, 1, 0)) return;
	wchar_t w[8192];
	GetWindowTextW(g_in, w, 8192);
	char text[24576];
	WideCharToMultiByte(CP_UTF8, 0, w, -1, text, sizeof(text), NULL, NULL);
	if (!*text) { g_busy = 0; return; }
	SetWindowTextW(g_in, L"");
	char esc[32768]; size_t e = 0;
	jesc(esc, sizeof(esc), &e, text);
	raw(g_ho ? ",{\"role\":\"user\",\"content\":\"" : "{\"role\":\"user\",\"content\":\"");
	raw(esc);
	raw("\"}");
	append_log("> ");
	append_log(text);
	append_log("\r\n");
	EnableWindow(g_send, FALSE);
	CloseHandle(CreateThread(NULL, 0, worker, hwnd, 0, NULL));
}

static WNDPROC g_in_proc;
static LRESULT CALLBACK in_proc(HWND h, UINT m, WPARAM w, LPARAM l)
{
	if (m == WM_KEYDOWN && w == VK_RETURN && !(GetKeyState(VK_SHIFT) & 0x8000)) { send_msg(GetParent(h)); return 0; }
	if (m == WM_CHAR && w == '\r') return 0;
	return CallWindowProcW(g_in_proc, h, m, w, l);
}

/* AY_CHAT_GUI_SELFTEST=<prompt>: send it, then after the reply write the window to <AY_CHAT_GUI_SHOT>.bmp and exit. */
static void shot(HWND hwnd, const char *path)
{
	RECT r;
	GetClientRect(hwnd, &r);
	int W = r.right, H = r.bottom;
	HDC wdc = GetDC(hwnd), mdc = CreateCompatibleDC(wdc);
	HBITMAP bmp = CreateCompatibleBitmap(wdc, W, H);
	SelectObject(mdc, bmp);
	PrintWindow(hwnd, mdc, 1 /* PW_CLIENTONLY */ | 2 /* PW_RENDERFULLCONTENT */);
	BITMAPINFOHEADER bi = { sizeof(bi), W, -H, 1, 32, BI_RGB, 0, 0, 0, 0, 0 };
	size_t n = (size_t)W * H * 4;
	void *px = malloc(n);
	GetDIBits(mdc, bmp, 0, H, px, (BITMAPINFO *)&bi, DIB_RGB_COLORS);
	BITMAPFILEHEADER fh = { 0x4D42, (DWORD)(sizeof(fh) + sizeof(bi) + n), 0, 0, sizeof(fh) + sizeof(bi) };
	FILE *f = fopen(path, "wb");
	if (f) { fwrite(&fh, sizeof(fh), 1, f); fwrite(&bi, sizeof(bi), 1, f); fwrite(px, n, 1, f); fclose(f); }
	free(px);
	DeleteObject(bmp);
	DeleteDC(mdc);
	ReleaseDC(hwnd, wdc);
}

static void layout(HWND hwnd)
{
	RECT rc;
	GetClientRect(hwnd, &rc);
	int W = rc.right, H = rc.bottom, pad = 16, inH = 64, btnW = 112;
	MoveWindow(g_log, pad, pad, W - 2 * pad, H - inH - 3 * pad, TRUE);
	MoveWindow(g_in, pad, H - inH - pad, W - 3 * pad - btnW, inH, TRUE);
	MoveWindow(g_send, W - pad - btnW, H - inH - pad + 8, btnW, 48, TRUE);
}

static LRESULT CALLBACK wnd(HWND hwnd, UINT m, WPARAM w, LPARAM l)
{
	switch (m) {
	case WM_CREATE:
		g_log = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL, 0, 0, 0, 0, hwnd, NULL, NULL, NULL);
		g_in = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_MULTILINE | ES_AUTOVSCROLL, 0, 0, 0, 0, hwnd, NULL, NULL, NULL);
		g_send = CreateWindowExW(0, L"BUTTON", L"Send", WS_CHILD | WS_VISIBLE | BS_OWNERDRAW, 0, 0, 0, 0, hwnd, (HMENU)ID_SEND, NULL, NULL);
		SendMessageW(g_log, WM_SETFONT, (WPARAM)g_font, TRUE);
		SendMessageW(g_in, WM_SETFONT, (WPARAM)g_font, TRUE);
		SendMessageW(g_log, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(12, 12));
		SendMessageW(g_in, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(16, 16));
		g_in_proc = (WNDPROC)SetWindowLongPtrW(g_in, GWLP_WNDPROC, (LONG_PTR)in_proc);
		SetFocus(g_in);
		return 0;
	case WM_SIZE: layout(hwnd); return 0;
	case WM_ERASEBKGND: { RECT r; GetClientRect(hwnd, &r); FillRect((HDC)w, &r, g_bg); return 1; }
	case WM_CTLCOLOREDIT:
	case WM_CTLCOLORSTATIC: {
		HDC dc = (HDC)w;
		int log = (HWND)l == g_log;
		SetTextColor(dc, cr(roles[R_ON_SURFACE]));
		SetBkColor(dc, cr(roles[log ? R_LOW : R_HIGHEST]));
		return (LRESULT)(log ? g_log_bg : g_in_bg);
	}
	case WM_DRAWITEM: {
		DRAWITEMSTRUCT *d = (DRAWITEMSTRUCT *)l;
		FillRect(d->hDC, &d->rcItem, g_bg);
		HBRUSH b = g_busy ? g_in_bg : g_btn_bg;
		SelectObject(d->hDC, b);
		SelectObject(d->hDC, GetStockObject(NULL_PEN));
		RoundRect(d->hDC, d->rcItem.left, d->rcItem.top, d->rcItem.right, d->rcItem.bottom, 48, 48);
		SetBkMode(d->hDC, TRANSPARENT);
		SetTextColor(d->hDC, cr(roles[g_busy ? R_ON_VARIANT : R_ON_PRIMARY]));
		SelectObject(d->hDC, g_font);
		DrawTextW(d->hDC, g_busy ? L"..." : L"Send", -1, &d->rcItem, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
		return TRUE;
	}
	case WM_COMMAND:
		if (LOWORD(w) == ID_SEND) send_msg(hwnd);
		return 0;
	case WM_REPLY:
		append_log((char *)l);
		free((void *)l);
		g_busy = 0;
		EnableWindow(g_send, TRUE);
		InvalidateRect(g_send, NULL, TRUE);
		SetFocus(g_in);
		if (getenv("AY_CHAT_GUI_SELFTEST")) {
			UpdateWindow(hwnd);
			shot(hwnd, getenv("AY_CHAT_GUI_SHOT") ? getenv("AY_CHAT_GUI_SHOT") : "ay-chat-gui.bmp");
			PostMessageW(hwnd, WM_CLOSE, 0, 0);
		}
		return 0;
	case WM_DESTROY: PostQuitMessage(0); return 0;
	}
	return DefWindowProcW(hwnd, m, w, l);
}

static const char *env(const char *k, const char *d) { const char *v = getenv(k); return v && *v ? v : d; }

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmd, int show)
{
	(void)prev; (void)cmd;
	ay_m3_scheme(0xFF135B82u, 3 /* vibrant */, 1 /* dark */, 0xFFD1D293u, roles);
	g_bg = CreateSolidBrush(cr(roles[R_SURFACE]));
	g_log_bg = CreateSolidBrush(cr(roles[R_LOW]));
	g_in_bg = CreateSolidBrush(cr(roles[R_HIGHEST]));
	g_btn_bg = CreateSolidBrush(cr(roles[R_PRIMARY]));
	g_font = CreateFontW(-18, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Google Sans Flex");
	g_hist = calloc(1, g_hcap);
	const char *host = env("AY_ROUTER_HOST", "https://router.aphrody.com");
	g_r = ay_router_open(host, (unsigned short)atoi(env("AY_ROUTER_PORT", strncmp(host, "https://", 8) ? "8790" : "0")), getenv("AY_ROUTER_KEY"));
	snprintf(g_model, sizeof(g_model), "%s", env("AY_ROUTER_MODEL", "auto:free"));
	if (!g_r || !g_hist) return 2;
	WNDCLASSW wc = { 0 };
	wc.lpfnWndProc = wnd;
	wc.hInstance = inst;
	wc.hCursor = LoadCursor(NULL, IDC_ARROW);
	wc.lpszClassName = L"AyChat";
	wc.hbrBackground = g_bg;
	RegisterClassW(&wc);
	HWND hwnd = CreateWindowExW(0, L"AyChat", L"Aphrody AI", WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 900, 680, NULL, NULL, inst, NULL);
	BOOL dark = TRUE;
	typedef HRESULT(WINAPI * dwm_set)(HWND, DWORD, LPCVOID, DWORD);
	HMODULE dwm = LoadLibraryW(L"dwmapi.dll");
	dwm_set set = dwm ? (dwm_set)GetProcAddress(dwm, "DwmSetWindowAttribute") : NULL;
	if (set) set(hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &dark, sizeof(dark));
	ShowWindow(hwnd, show);
	char hello[256];
	snprintf(hello, sizeof(hello), "Aphrody AI  %s  model %s\r\n\r\n", host, g_model);
	append_log(hello);
	const char *st = getenv("AY_CHAT_GUI_SELFTEST");
	if (st) {
		wchar_t w[2048];
		MultiByteToWideChar(CP_UTF8, 0, st, -1, w, 2048);
		SetWindowTextW(g_in, w);
		send_msg(hwnd);
	}
	MSG msg;
	while (GetMessageW(&msg, NULL, 0, 0) > 0) {
		TranslateMessage(&msg);
		DispatchMessageW(&msg);
	}
	ay_router_close(g_r);
	return 0;
}
