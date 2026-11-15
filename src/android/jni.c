// SPDX-License-Identifier: MIT OR Apache-2.0
// JNI shim between the Compose shell app (apps/android-shell in aphrody-labs/open) and libaysys.so.
#include <jni.h>
#include <string.h>
#include <ay/sys.h>

JNIEXPORT jstring JNICALL Java_dev_aphrody_shell_Native_fnv1a(JNIEnv *env, jclass cls, jstring s)
{
	(void)cls;
	const char *utf = (*env)->GetStringUTFChars(env, s, NULL);
	if (!utf)
		return NULL;
	unsigned long long h = ay_fnv1a64((const __u8 *)utf, strlen(utf));
	(*env)->ReleaseStringUTFChars(env, s, utf);
	char out[17];
	static const char hex[] = "0123456789abcdef";
	for (int i = 0; i < 16; i++)
		out[i] = hex[(h >> (60 - 4 * i)) & 0xf];
	out[16] = 0;
	return (*env)->NewStringUTF(env, out);
}

JNIEXPORT jint JNICALL Java_dev_aphrody_shell_Native_abiVersion(JNIEnv *env, jclass cls)
{
	(void)env;
	(void)cls;
	return (jint)ay_sys_abi_version();
}

JNIEXPORT jstring JNICALL Java_dev_aphrody_shell_Native_cpu(JNIEnv *env, jclass cls)
{
	(void)cls;
	struct ay_cpu_caps c;
	memset(&c, 0, sizeof(c));
	int rc = ay_cpu_probe(&c);
	char buf[96];
	char *p = buf;
	const char *k = rc == 0 ? "ok" : "err";
	while (*k)
		*p++ = *k++;
	*p++ = ' ';
	const char *f[] = { c.has_sse42 ? "sse4.2" : "-", c.has_avx2 ? "avx2" : "-", c.has_avx512f ? "avx512f" : "-" };
	for (int i = 0; i < 3; i++) {
		for (const char *q = f[i]; *q; q++)
			*p++ = *q;
		*p++ = ' ';
	}
	*p = 0;
	return (*env)->NewStringUTF(env, buf);
}
