// SPDX-License-Identifier: MIT OR Apache-2.0
// Android smoke test: links libaysys.so and exercises the C ABI on x86_64-linux-android.
// ay/sys.h defines __u64 and friends itself and clashes with bionic's linux/types.h (pulled in by <stdio.h>),
// so libc is declared by hand here and no libc header is included.
#include <ay/sys.h>

int printf(const char *fmt, ...);
void *memset(void *s, int c, unsigned long n);

int main(void)
{
	const char msg[] = "aphrody-android";
	struct ay_cpu_caps caps;
	memset(&caps, 0, sizeof(caps));
	int rc = ay_cpu_probe(&caps);
	unsigned long long h = ay_fnv1a64((const __u8 *)msg, sizeof(msg) - 1);

	printf("ay_sys_abi_version=%u\n", ay_sys_abi_version());
	printf("ay_cpu_probe=%d\n", rc);
	printf("caps arch=%u sse42=%u avx2=%u avx512f=%u tsc=%llu\n", caps.arch_id, caps.has_sse42, caps.has_avx2,
	       caps.has_avx512f, (unsigned long long)caps.tsc_sample);
	printf("ay_fnv1a64(\"%s\")=%016llx\n", msg, h);
	printf("wl_fixed_to_int(wl_fixed_from_int(42))=%d\n", wl_fixed_to_int(wl_fixed_from_int(42)));
	printf("nt_status_to_errno(nt_errno_to_ntstatus(-2))=%d\n", nt_status_to_errno(nt_errno_to_ntstatus(-2)));
	return (rc < 0 || h == 0) ? 1 : 0;
}
