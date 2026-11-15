/* SPDX-License-Identifier: MIT OR Apache-2.0 */
/*
 * src/include/ay/router.h - C ABI of the Aphrody AI router (packages/ai-os/src/router).
 *
 * The router is an OpenAI- and Anthropic-compatible HTTP service (relay `/v1/chat/completions`,
 * `/v1/messages`, `/v1/models`) that walks every discovered provider offer with failover. This ABI
 * is the portable client: plain C11 over BSD sockets / Winsock, no TLS, no allocator of its own.
 * Every language with a C FFI (Rust, Zig, Bun ffi, Swift, Kotlin/JNI, C#, Python ctypes) and every
 * surface (CLI, TUI, GUI, mobile, serverless sidecar) reaches the router through these five calls.
 * TLS endpoints are reached through a local relay or sidecar (the relay terminates TLS upstream).
 */
#ifndef _AY_ROUTER_H
#define _AY_ROUTER_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#define AY_ROUTER_API __declspec(dllexport)
#else
#define AY_ROUTER_API __attribute__((visibility("default")))
#endif

#define AY_ROUTER_ABI 1u

/* Errors (negative), success returns the HTTP status (>= 100) or 0. */
#define AY_ROUTER_EINVAL   (-22)
#define AY_ROUTER_ENOMEM   (-12)
#define AY_ROUTER_ECONNECT (-111)
#define AY_ROUTER_EIO      (-5)
#define AY_ROUTER_ETRUNC   (-75)

struct ay_router;

/* Version of this ABI (AY_ROUTER_ABI). */
AY_ROUTER_API unsigned ay_router_abi_version(void);

/* Opens a client for http://host:port. api_key may be NULL (sent as `Authorization: Bearer`).
 * Returns NULL on bad arguments or allocation failure. */
AY_ROUTER_API struct ay_router *ay_router_open(const char *host, unsigned short port, const char *api_key);

/* Raw request: method + path + optional JSON body. The response body is written to out (NUL
 * terminated, at most cap - 1 bytes). Returns the HTTP status, or a negative AY_ROUTER_E*. */
AY_ROUTER_API int ay_router_request(struct ay_router *r, const char *method, const char *path,
				    const char *json_body, char *out, size_t cap);

/* POST /v1/chat/completions with {"model": model, "messages": messages_json}.
 * model may be a provider/model id or a virtual model ("auto", "auto:cheap", "auto:code", ...). */
AY_ROUTER_API int ay_router_chat(struct ay_router *r, const char *model, const char *messages_json,
				 char *out, size_t cap);

/* GET /v1/models: every routable offer plus the virtual models. */
AY_ROUTER_API int ay_router_models(struct ay_router *r, char *out, size_t cap);

AY_ROUTER_API void ay_router_close(struct ay_router *r);

#ifdef __cplusplus
}
#endif

#endif /* _AY_ROUTER_H */
