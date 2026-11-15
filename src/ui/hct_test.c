// SPDX-License-Identifier: MIT OR Apache-2.0
/* ui/hct_test.c - golden check of ui/hct.c: material-color-utilities 0.4.0 reference values and the
 * Aphrody vibrant scheme of packages/design/tokens/tokens.json (seed #135B82). make hct-test. */
#include "../include/ay/sys.h"
#include <stdio.h>

static const __u32 golden_light_argb[AY_UI_ROLE_COUNT] = {
	0xFFF6FAFFu, /* SURFACE                   */
	0xFFFFFFFFu, /* SURFACE_CONTAINER_LOWEST  */
	0xFFECF5FEu, /* SURFACE_CONTAINER_LOW     */
	0xFFE6EFF8u, /* SURFACE_CONTAINER         */
	0xFFE1E9F3u, /* SURFACE_CONTAINER_HIGH    */
	0xFFDBE3EDu, /* SURFACE_CONTAINER_HIGHEST */
	0xFF141D23u, /* ON_SURFACE                */
	0xFF3D4851u, /* ON_SURFACE_VARIANT        */
	0xFF006492u, /* PRIMARY                   */
	0xFFFFFFFFu, /* ON_PRIMARY                */
	0xFFC9E6FFu, /* PRIMARY_CONTAINER         */
	0xFF004B6Fu, /* ON_PRIMARY_CONTAINER      */
	0xFF4D5F7Cu, /* SECONDARY                 */
	0xFFFFFFFFu, /* ON_SECONDARY              */
	0xFFD5E3FFu, /* SECONDARY_CONTAINER       */
	0xFF354763u, /* ON_SECONDARY_CONTAINER    */
	0xFF525C8Bu, /* TERTIARY                  */
	0xFFFFFFFFu, /* ON_TERTIARY               */
	0xFFDDE1FFu, /* TERTIARY_CONTAINER        */
	0xFF3A4472u, /* ON_TERTIARY_CONTAINER     */
	0xFFBA1A1Au, /* ERROR                     */
	0xFFFFFFFFu, /* ON_ERROR                  */
	0xFF6D7883u, /* OUTLINE                   */
	0xFFBCC8D3u, /* OUTLINE_VARIANT           */
	0xFFD1D293u, /* BOLT                      */
};

static const __u32 golden_dark_argb[AY_UI_ROLE_COUNT] = {
	0xFF0C141Bu, /* SURFACE                   */
	0xFF070F15u, /* SURFACE_CONTAINER_LOWEST  */
	0xFF141D23u, /* SURFACE_CONTAINER_LOW     */
	0xFF182127u, /* SURFACE_CONTAINER         */
	0xFF232B32u, /* SURFACE_CONTAINER_HIGH    */
	0xFF2D363Du, /* SURFACE_CONTAINER_HIGHEST */
	0xFFDBE3EDu, /* ON_SURFACE                */
	0xFFBCC8D3u, /* ON_SURFACE_VARIANT        */
	0xFF8BCEFFu, /* PRIMARY                   */
	0xFF00344Eu, /* ON_PRIMARY                */
	0xFF004B6Fu, /* PRIMARY_CONTAINER         */
	0xFFC9E6FFu, /* ON_PRIMARY_CONTAINER      */
	0xFFB4C7E9u, /* SECONDARY                 */
	0xFF1E314Cu, /* ON_SECONDARY              */
	0xFF354763u, /* SECONDARY_CONTAINER       */
	0xFFD5E3FFu, /* ON_SECONDARY_CONTAINER    */
	0xFFBAC4FAu, /* TERTIARY                  */
	0xFF232D5Au, /* ON_TERTIARY               */
	0xFF3A4472u, /* TERTIARY_CONTAINER        */
	0xFFDDE1FFu, /* ON_TERTIARY_CONTAINER     */
	0xFFFFB4ABu, /* ERROR                     */
	0xFF690005u, /* ON_ERROR                  */
	0xFF87929Du, /* OUTLINE                   */
	0xFF3D4851u, /* OUTLINE_VARIANT           */
	0xFFD1D293u, /* BOLT                      */
};


int main(void)
{
	double h, c, t;
	int miss = 0;
	ay_hct_from_argb(0xFF6750A4u, &h, &c, &t);
	if (h < 298.980997210 || h > 298.980997211 || c < 47.856526374 || c > 47.856526376 || t < 40.083244087 || t > 40.083244088)
		miss++, printf("hct(0xff6750a4) = %.12f %.12f %.12f\n", h, c, t);
	if (ay_hct_to_argb(h, c, t) != 0xFF6750A4u)
		miss++, printf("round trip 0xff6750a4 = %08X\n", ay_hct_to_argb(h, c, t));
	for (__u32 m = 0; m < 2; m++) {
		__u32 out[AY_UI_ROLE_COUNT];
		const __u32 *want = m ? golden_dark_argb : golden_light_argb;
		ay_m3_scheme(0xFF135B82u, AY_M3_VARIANT_VIBRANT, m, 0xFFD1D293u, out);
		for (__u32 r = 0; r < AY_UI_ROLE_COUNT; r++)
			if (out[r] != want[r] || ay_ui_color_argb(m, r) != want[r])
				miss++, printf("mode %u role %u: %08X want %08X\n", m, r, out[r], want[r]);
	}
	printf("hct: %d mismatch\n", miss);
	return miss != 0;
}
