// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * src/router/router.c - portable C client of the Aphrody AI router (ABI in include/ay/router.h).
 * HTTP/1.1 with Connection: close and Content-Length; chunked responses are de-chunked in place.
 */
#include "../include/ay/router.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
typedef SOCKET sock_t;
#define SOCK_BAD INVALID_SOCKET
#define sock_close closesocket
#else
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int sock_t;
#define SOCK_BAD (-1)
#define sock_close close
#endif

struct ay_router {
	char host[256];
	char port[8];
	char auth[512];
};

unsigned ay_router_abi_version(void)
{
	return AY_ROUTER_ABI;
}

struct ay_router *ay_router_open(const char *host, unsigned short port, const char *api_key)
{
	struct ay_router *r;

	if (!host || !*host || strlen(host) >= sizeof(r->host) || !port)
		return NULL;
	if (api_key && strlen(api_key) >= sizeof(r->auth) - 32)
		return NULL;
#if defined(_WIN32)
	{
		WSADATA wsa;
		if (WSAStartup(MAKEWORD(2, 2), &wsa))
			return NULL;
	}
#endif
	r = calloc(1, sizeof(*r));
	if (!r)
		return NULL;
	strcpy(r->host, host);
	snprintf(r->port, sizeof(r->port), "%u", port);
	if (api_key && *api_key)
		snprintf(r->auth, sizeof(r->auth), "Authorization: Bearer %s\r\n", api_key);
	return r;
}

void ay_router_close(struct ay_router *r)
{
	if (!r)
		return;
	memset(r->auth, 0, sizeof(r->auth));
	free(r);
#if defined(_WIN32)
	WSACleanup();
#endif
}

static sock_t dial(const struct ay_router *r)
{
	struct addrinfo hints = { 0 }, *res, *ai;
	sock_t s = SOCK_BAD;

	hints.ai_family = AF_UNSPEC;
	hints.ai_socktype = SOCK_STREAM;
	if (getaddrinfo(r->host, r->port, &hints, &res))
		return SOCK_BAD;
	for (ai = res; ai; ai = ai->ai_next) {
		s = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
		if (s == SOCK_BAD)
			continue;
		if (!connect(s, ai->ai_addr, (int)ai->ai_addrlen))
			break;
		sock_close(s);
		s = SOCK_BAD;
	}
	freeaddrinfo(res);
	return s;
}

static int send_all(sock_t s, const char *p, size_t n)
{
	while (n) {
		int k = send(s, p, (int)(n > 65536 ? 65536 : n), 0);
		if (k <= 0)
			return -1;
		p += k;
		n -= (size_t)k;
	}
	return 0;
}

/* De-chunks body[0..len) in place, returns the new length. */
static size_t dechunk(char *body, size_t len)
{
	size_t in = 0, out = 0;

	while (in < len) {
		char *end;
		unsigned long n = strtoul(body + in, &end, 16);
		char *nl = strstr(end, "\r\n");
		if (!nl || n == 0)
			break;
		in = (size_t)(nl - body) + 2;
		if (in + n > len)
			n = (unsigned long)(len - in);
		memmove(body + out, body + in, n);
		out += n;
		in += n + 2;
	}
	return out;
}

int ay_router_request(struct ay_router *r, const char *method, const char *path, const char *json_body,
		      char *out, size_t cap)
{
	size_t blen = json_body ? strlen(json_body) : 0, hlen, used = 0;
	char head[1024], *buf, *hdr_end, *body;
	int status = 0, truncated = 0;
	sock_t s;

	if (!r || !method || !path || !out || cap < 2)
		return AY_ROUTER_EINVAL;
	hlen = (size_t)snprintf(head, sizeof(head),
				"%s %s HTTP/1.1\r\nHost: %s:%s\r\nUser-Agent: ay-router/1\r\n"
				"Accept: application/json\r\nConnection: close\r\n%s"
				"Content-Type: application/json\r\nContent-Length: %zu\r\n\r\n",
				method, path, r->host, r->port, r->auth, blen);
	if (hlen >= sizeof(head))
		return AY_ROUTER_EINVAL;
	s = dial(r);
	if (s == SOCK_BAD)
		return AY_ROUTER_ECONNECT;
	if (send_all(s, head, hlen) || (blen && send_all(s, json_body, blen))) {
		sock_close(s);
		return AY_ROUTER_EIO;
	}
	/* headers + body land in one growing buffer, then the body is copied to out */
	size_t bcap = cap + sizeof(head) * 8;
	buf = malloc(bcap);
	if (!buf) {
		sock_close(s);
		return AY_ROUTER_ENOMEM;
	}
	for (;;) {
		int k;
		if (used + 1 >= bcap) {
			truncated = 1;
			break;
		}
		k = recv(s, buf + used, (int)(bcap - used - 1), 0);
		if (k < 0) {
			free(buf);
			sock_close(s);
			return AY_ROUTER_EIO;
		}
		if (k == 0)
			break;
		used += (size_t)k;
	}
	sock_close(s);
	buf[used] = 0;
	if (sscanf(buf, "HTTP/%*s %d", &status) != 1 || !(hdr_end = strstr(buf, "\r\n\r\n"))) {
		free(buf);
		return AY_ROUTER_EIO;
	}
	body = hdr_end + 4;
	size_t n = used - (size_t)(body - buf);
	*hdr_end = 0;
	for (char *p = buf; *p; p++)
		if (*p >= 'A' && *p <= 'Z')
			*p += 32;
	if (strstr(buf, "transfer-encoding: chunked"))
		n = dechunk(body, n);
	if (n >= cap) {
		n = cap - 1;
		truncated = 1;
	}
	memcpy(out, body, n);
	out[n] = 0;
	free(buf);
	return truncated ? AY_ROUTER_ETRUNC : status;
}

/* JSON string escape of src into dst (cap bytes), returns 0 or -1 when it does not fit. */
static int json_str(char *dst, size_t cap, const char *src)
{
	size_t o = 0;

	for (; *src; src++) {
		unsigned char c = (unsigned char)*src;
		const char *e = NULL;
		char u[7];
		if (c == '"')
			e = "\\\"";
		else if (c == '\\')
			e = "\\\\";
		else if (c < 0x20) {
			snprintf(u, sizeof(u), "\\u%04x", c);
			e = u;
		}
		size_t m = e ? strlen(e) : 1;
		if (o + m + 1 >= cap)
			return -1;
		if (e)
			memcpy(dst + o, e, m);
		else
			dst[o] = (char)c;
		o += m;
	}
	dst[o] = 0;
	return 0;
}

int ay_router_chat(struct ay_router *r, const char *model, const char *messages_json, char *out, size_t cap)
{
	char m[512];
	char *body;
	size_t n;
	int rc;

	if (!messages_json || json_str(m, sizeof(m), model && *model ? model : "auto"))
		return AY_ROUTER_EINVAL;
	n = strlen(m) + strlen(messages_json) + 32;
	body = malloc(n);
	if (!body)
		return AY_ROUTER_ENOMEM;
	snprintf(body, n, "{\"model\":\"%s\",\"messages\":%s}", m, messages_json);
	rc = ay_router_request(r, "POST", "/v1/chat/completions", body, out, cap);
	free(body);
	return rc;
}

int ay_router_models(struct ay_router *r, char *out, size_t cap)
{
	return ay_router_request(r, "GET", "/v1/models", NULL, out, cap);
}
