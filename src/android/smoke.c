// SPDX-License-Identifier: MIT OR Apache-2.0
// Android smoke test: loads libaysys.so (linked, not dlopen) and exercises the C ABI on x86_64-linux-android.
#include <stdio.h>
#include <string.h>
#include <sys/system_properties.h>
#include <ay/sys.h>

int main(void)
{
	char rel[PROP_VALUE_MAX] = "?", sdk[PROP_VALUE_MAX] = "?", abi[PROP_VALUE_MAX] = "?", pg[PROP_VALUE_MAX] = "?";
	__system_property_get("ro.build.version.release", rel);
	__system_property_get("ro.build.version.sdk", sdk);
	__system_property_get("ro.product.cpu.abi", abi);
	__system_property_get("ro.product.build.version.release_or_codename", pg);

	const char msg[] = "aphrody-android";
	struct ay_cpu_caps caps;
	memset(&caps, 0, sizeof(caps));
	int rc = ay_cpu_probe(&caps);
	unsigned long long h = ay_fnv1a64((const __u8 *)msg, sizeof(msg) - 1);

	printf("device: android %s sdk %s abi %s\n", rel, sdk, abi);
	printf("ay_sys_abi_version=%u\n", ay_sys_abi_version());
	printf("ay_cpu_probe=%d\n", rc);
	printf("caps arch=%u sse42=%u avx2=%u avx512f=%u tsc=%llu\n", caps.arch_id, caps.has_sse42, caps.has_avx2,
	       caps.has_avx512f, (unsigned long long)caps.tsc_sample);
	printf("ay_fnv1a64(\"%s\")=%016llx\n", msg, h);
	printf("wl_fixed_to_int(wl_fixed_from_int(42))=%d\n", wl_fixed_to_int(wl_fixed_from_int(42)));
	printf("nt_status_to_errno(nt_errno_to_ntstatus(-2))=%d\n", nt_status_to_errno(nt_errno_to_ntstatus(-2)));
	return (rc < 0 || h == 0) ? 1 : 0;
}
