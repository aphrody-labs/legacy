// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * ay-router: CLI over the router C ABI.
 *   ay-router models
 *   ay-router chat [model] "<prompt>"
 * Env: AY_ROUTER_HOST (127.0.0.1, or https://router.aphrody.com), AY_ROUTER_PORT (8790; 0 with https = 443), AY_ROUTER_KEY (optional bearer).
 */
#include "../include/ay/router.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *env(const char *k, const char *d)
{
	const char *v = getenv(k);
	return v && *v ? v : d;
}

int main(int argc, char **argv)
{
	static char out[1 << 22];
	char msg[16384];
	struct ay_router *r;
	int rc;

	if (argc < 2 || (strcmp(argv[1], "models") && strcmp(argv[1], "chat")) ||
	    (!strcmp(argv[1], "chat") && argc < 3)) {
		fprintf(stderr, "usage: ay-router models | ay-router chat [model] \"<prompt>\"\n");
		return 2;
	}
	const char *host = env("AY_ROUTER_HOST", "127.0.0.1");
	r = ay_router_open(host, (unsigned short)atoi(env("AY_ROUTER_PORT", strncmp(host, "https://", 8) ? "8790" : "0")),
			   getenv("AY_ROUTER_KEY"));
	if (!r) {
		fprintf(stderr, "ay-router: bad host/port\n");
		return 2;
	}
	if (!strcmp(argv[1], "models")) {
		rc = ay_router_models(r, out, sizeof(out));
	} else {
		const char *model = argc > 3 ? argv[2] : "auto", *prompt = argv[argc > 3 ? 3 : 2];
		size_t o = 0;
		o += (size_t)snprintf(msg, sizeof(msg), "[{\"role\":\"user\",\"content\":\"");
		for (const char *p = prompt; *p && o + 8 < sizeof(msg); p++) {
			if (*p == '"' || *p == '\\')
				msg[o++] = '\\';
			if ((unsigned char)*p < 0x20)
				continue;
			msg[o++] = *p;
		}
		snprintf(msg + o, sizeof(msg) - o, "\"}]");
		rc = ay_router_chat(r, model, msg, out, sizeof(out));
	}
	ay_router_close(r);
	if (rc < 0) {
		fprintf(stderr, "ay-router: error %d\n", rc);
		return 1;
	}
	puts(out);
	return rc >= 200 && rc < 300 ? 0 : 1;
}
