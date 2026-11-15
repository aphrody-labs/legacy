// SPDX-License-Identifier: MIT OR Apache-2.0
/*
 * src/ui/hct.c - Material 3 colour science in freestanding C (no libc, no libm): native and wasm32.
 *
 * Port of material-color-utilities (Apache-2.0) as already ported to Rust in src/ui/kit/src/color
 * (hct.rs, cam16.rs, color_math.rs, scheme.rs): CAM16 under the standard viewing conditions,
 * HCT <-> ARGB (HctSolver: Newton on J, then the critical-plane bisection when out of gamut),
 * tonal palettes, and the 2021 dynamic scheme of each variant resolved to the 25 AY_UI_ROLE_* roles.
 * The transcendental functions are local (range reduction + series): results match libm to ~1e-14,
 * far below the 1/255 quantisation of an sRGB channel.
 */
#include "../include/ay/sys.h"

#define PI 3.14159265358979323846
#define LN2 0.69314718055994530942

/* ---- freestanding math ------------------------------------------------------------------- */

static double m_abs(double x) { return x < 0 ? -x : x; }

static double m_floor(double x)
{
	if (x >= 9.0e15 || x <= -9.0e15)
		return x;
	double t = (double)(long long)x;
	return t > x ? t - 1.0 : t;
}

static double m_ceil(double x) { return -m_floor(-x); }

static double m_sqrt(double x)
{
	if (x <= 0)
		return 0;
	return __builtin_sqrt(x); /* sqrtsd / f64.sqrt: an instruction on both targets */
}

static double m_fmod_pos(double x, double m) /* x mod m in [0, m) */
{
	double r = x - m_floor(x / m) * m;
	return r < 0 ? r + m : (r >= m ? r - m : r);
}

/* exp: x = k ln2 + r, |r| <= ln2/2, Taylor to degree 14 (error < 2e-17 relative) */
static double m_exp(double x)
{
	if (x > 709.0)
		return 1.0e308;
	if (x < -745.0)
		return 0.0;
	double kf = m_floor(x / LN2 + 0.5);
	double r = x - kf * LN2, term = 1.0, sum = 1.0;
	for (int i = 1; i <= 14; i++) {
		term *= r / i;
		sum += term;
	}
	long long k = (long long)kf;
	union { double d; unsigned long long u; } s = { .u = (unsigned long long)(k + 1023) << 52 };
	if (k < -1022) { /* subnormal: scale in two steps */
		union { double d; unsigned long long u; } a = { .u = (unsigned long long)(k + 1023 + 600) << 52 };
		union { double d; unsigned long long u; } b = { .u = (unsigned long long)(1023 - 600) << 52 };
		return sum * a.d * b.d;
	}
	return sum * s.d;
}

/* log: x = m 2^e with m in [sqrt(1/2), sqrt(2)), log m = 2 atanh((m-1)/(m+1)) */
static double m_log(double x)
{
	if (x <= 0)
		return -1.0e308;
	union { double d; unsigned long long u; } v = { .d = x };
	int e = (int)((v.u >> 52) & 0x7ff) - 1023;
	v.u = (v.u & 0x000fffffffffffffULL) | 0x3ff0000000000000ULL;
	double m = v.d;
	if (m > 1.4142135623730951) {
		m *= 0.5;
		e++;
	}
	double s = (m - 1) / (m + 1), s2 = s * s, term = s, sum = 0;
	for (int i = 1; i <= 39; i += 2) {
		sum += term / i;
		term *= s2;
	}
	return 2 * sum + e * LN2;
}

static double m_pow(double x, double y)
{
	if (x <= 0)
		return 0;
	return m_exp(y * m_log(x));
}

static double m_cbrt(double x)
{
	return x < 0 ? -m_pow(-x, 1.0 / 3.0) : m_pow(x, 1.0 / 3.0);
}

/* sin/cos on [-pi/4, pi/4] after quadrant reduction */
static double sin_k(double x)
{
	double x2 = x * x, term = x, sum = x;
	for (int i = 3; i <= 23; i += 2) {
		term *= -x2 / ((i - 1) * i);
		sum += term;
	}
	return sum;
}

static double cos_k(double x)
{
	double x2 = x * x, term = 1, sum = 1;
	for (int i = 2; i <= 22; i += 2) {
		term *= -x2 / ((i - 1) * i);
		sum += term;
	}
	return sum;
}

static void m_sincos(double x, double *s, double *c)
{
	double q = m_floor(x / (PI / 2) + 0.5);
	double r = x - q * (PI / 2);
	long long n = (long long)q & 3;
	double sr = sin_k(r), cr = cos_k(r);
	switch (n) {
	case 0: *s = sr; *c = cr; break;
	case 1: *s = cr; *c = -sr; break;
	case 2: *s = -sr; *c = -cr; break;
	default: *s = -cr; *c = sr; break;
	}
}

static double m_cos(double x) { double s, c; m_sincos(x, &s, &c); return c; }
static double m_sin(double x) { double s, c; m_sincos(x, &s, &c); return s; }

/* atan: two half-angle reductions bring |x| <= tan(pi/16), then the odd series */
static double m_atan(double x)
{
	int neg = x < 0;
	if (neg)
		x = -x;
	int inv = x > 1;
	if (inv)
		x = 1 / x;
	for (int i = 0; i < 2; i++)
		x = x / (1 + m_sqrt(1 + x * x));
	double x2 = x * x, term = x, sum = 0;
	for (int i = 1; i <= 41; i += 2) {
		sum += term / i;
		term *= -x2;
	}
	sum *= 4;
	if (inv)
		sum = PI / 2 - sum;
	return neg ? -sum : sum;
}

static double m_atan2(double y, double x)
{
	if (x > 0)
		return m_atan(y / x);
	if (x < 0)
		return y >= 0 ? m_atan(y / x) + PI : m_atan(y / x) - PI;
	return y > 0 ? PI / 2 : (y < 0 ? -PI / 2 : 0);
}

static double signum(double x) { return x < 0 ? -1.0 : (x == 0 ? 0.0 : 1.0); }

static double sanitize_degrees(double d) { return m_fmod_pos(d, 360.0); }

static double js_round(double x) { return m_floor(x + 0.5); }

/* ---- colour math (color_math.rs) ---------------------------------------------------------- */

static const double SRGB_TO_XYZ[3][3] = {
	{ 0.41233895, 0.35762064, 0.18051042 },
	{ 0.2126, 0.7152, 0.0722 },
	{ 0.01932141, 0.11916382, 0.95034478 },
};
static const double WHITE_D65[3] = { 95.047, 100.0, 108.883 };

static double linearized(__u32 c8)
{
	double n = c8 / 255.0;
	return n <= 0.040449936 ? n / 12.92 * 100.0 : m_pow((n + 0.055) / 1.055, 2.4) * 100.0;
}

static __u32 delinearized(double comp)
{
	double n = comp / 100.0;
	double d = n <= 0.0031308 ? n * 12.92 : 1.055 * m_pow(n, 1.0 / 2.4) - 0.055;
	double r = js_round(d * 255.0);
	return r < 0 ? 0u : (r > 255 ? 255u : (__u32)r);
}

static __u32 argb_from_rgb(__u32 r, __u32 g, __u32 b) { return 0xFF000000u | (r << 16) | (g << 8) | b; }

static __u32 argb_from_linrgb(const double l[3])
{
	return argb_from_rgb(delinearized(l[0]), delinearized(l[1]), delinearized(l[2]));
}

static double lab_f(double t)
{
	const double e = 216.0 / 24389.0, kappa = 24389.0 / 27.0;
	return t > e ? m_cbrt(t) : (kappa * t + 16.0) / 116.0;
}

static double lab_invf(double ft)
{
	const double e = 216.0 / 24389.0, kappa = 24389.0 / 27.0;
	double ft3 = ft * ft * ft;
	return ft3 > e ? ft3 : (116.0 * ft - 16.0) / kappa;
}

static double y_from_lstar(double l) { return 100.0 * lab_invf((l + 16.0) / 116.0); }

static __u32 argb_from_lstar(double l)
{
	__u32 c = delinearized(y_from_lstar(l));
	return argb_from_rgb(c, c, c);
}

/* ---- CAM16 standard viewing conditions (cam16.rs) ---------------------------------------- */

struct vc {
	double n, aw, nbb, ncb, c, nc, fl, fl_root, z, rgb_d[3];
};

static struct vc g_vc;
static int g_vc_ready;

static const struct vc *vc_standard(void)
{
	if (g_vc_ready)
		return &g_vc;
	const double *xyz = WHITE_D65;
	double la = 200.0 / PI * y_from_lstar(50.0) / 100.0, surround = 2.0;
	double r_w = xyz[0] * 0.401288 + xyz[1] * 0.650173 + xyz[2] * -0.051461;
	double g_w = xyz[0] * -0.250268 + xyz[1] * 1.204414 + xyz[2] * 0.045854;
	double b_w = xyz[0] * -0.002079 + xyz[1] * 0.048952 + xyz[2] * 0.953127;
	double f = 0.8 + surround / 10.0;
	double c = f >= 0.9 ? 0.59 + (0.69 - 0.59) * ((f - 0.9) * 10.0) : 0.525 + (0.59 - 0.525) * ((f - 0.8) * 10.0);
	double d = f * (1.0 - (1.0 / 3.6) * m_exp((-la - 42.0) / 92.0));
	d = d < 0 ? 0 : (d > 1 ? 1 : d);
	struct vc v;
	v.nc = f;
	v.c = c;
	v.rgb_d[0] = d * (100.0 / r_w) + 1.0 - d;
	v.rgb_d[1] = d * (100.0 / g_w) + 1.0 - d;
	v.rgb_d[2] = d * (100.0 / b_w) + 1.0 - d;
	double k = 1.0 / (5.0 * la + 1.0), k4 = k * k * k * k, k4f = 1.0 - k4;
	v.fl = k4 * la + 0.1 * k4f * k4f * m_cbrt(5.0 * la);
	v.n = y_from_lstar(50.0) / xyz[1];
	v.z = 1.48 + m_sqrt(v.n);
	v.nbb = 0.725 / m_pow(v.n, 0.2);
	v.ncb = v.nbb;
	double w[3] = { r_w, g_w, b_w }, ra[3];
	for (int i = 0; i < 3; i++) {
		double fa = m_pow(v.fl * v.rgb_d[i] * w[i] / 100.0, 0.42);
		ra[i] = 400.0 * fa / (fa + 27.13);
	}
	v.aw = (2.0 * ra[0] + ra[1] + 0.05 * ra[2]) * v.nbb;
	v.fl_root = m_pow(v.fl, 0.25);
	g_vc = v;
	g_vc_ready = 1;
	return &g_vc;
}

AY_API void ay_hct_from_argb(__u32 argb, double *hue, double *chroma, double *tone)
{
	const struct vc *vc = vc_standard();
	double rl = linearized((argb >> 16) & 0xff), gl = linearized((argb >> 8) & 0xff), bl = linearized(argb & 0xff);
	double x = SRGB_TO_XYZ[0][0] * rl + SRGB_TO_XYZ[0][1] * gl + SRGB_TO_XYZ[0][2] * bl;
	double y = SRGB_TO_XYZ[1][0] * rl + SRGB_TO_XYZ[1][1] * gl + SRGB_TO_XYZ[1][2] * bl;
	double z = SRGB_TO_XYZ[2][0] * rl + SRGB_TO_XYZ[2][1] * gl + SRGB_TO_XYZ[2][2] * bl;
	double rc = 0.401288 * x + 0.650173 * y - 0.051461 * z;
	double gc = -0.250268 * x + 1.204414 * y + 0.045854 * z;
	double bc = -0.002079 * x + 0.048952 * y + 0.953127 * z;
	double rd = vc->rgb_d[0] * rc, gd = vc->rgb_d[1] * gc, bd = vc->rgb_d[2] * bc;
	double raf = m_pow(vc->fl * m_abs(rd) / 100.0, 0.42), gaf = m_pow(vc->fl * m_abs(gd) / 100.0, 0.42),
	       baf = m_pow(vc->fl * m_abs(bd) / 100.0, 0.42);
	double r_a = signum(rd) * 400.0 * raf / (raf + 27.13), g_a = signum(gd) * 400.0 * gaf / (gaf + 27.13),
	       b_a = signum(bd) * 400.0 * baf / (baf + 27.13);
	double a = (11.0 * r_a - 12.0 * g_a + b_a) / 11.0, b = (r_a + g_a - 2.0 * b_a) / 9.0;
	double u = (20.0 * r_a + 20.0 * g_a + 21.0 * b_a) / 20.0, p2 = (40.0 * r_a + 20.0 * g_a + b_a) / 20.0;
	double h = sanitize_degrees(m_atan2(b, a) * 180.0 / PI);
	double ac = p2 * vc->nbb;
	double j = 100.0 * m_pow(ac / vc->aw, vc->c * vc->z);
	double hp = h < 20.14 ? h + 360.0 : h;
	double e_hue = 0.25 * (m_cos(hp * PI / 180.0 + 2.0) + 3.8);
	double p1 = 50000.0 / 13.0 * e_hue * vc->nc * vc->ncb;
	double t = p1 * m_sqrt(a * a + b * b) / (u + 0.305);
	double alpha = m_pow(t, 0.9) * m_pow(1.64 - m_pow(0.29, vc->n), 0.73);
	if (hue)
		*hue = h;
	if (chroma)
		*chroma = alpha * m_sqrt(j / 100.0);
	if (tone)
		*tone = 116.0 * lab_f(y / 100.0) - 16.0;
}

/* ---- HctSolver (hct.rs) ------------------------------------------------------------------- */

static const double SCALED_DISCOUNT_FROM_LINRGB[3][3] = {
	{ 0.001200833568784504, 0.002389694492170889, 0.0002795742885861124 },
	{ 0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398 },
	{ 0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076 },
};
static const double LINRGB_FROM_SCALED_DISCOUNT[3][3] = {
	{ 1373.2198709594231, -1100.4251190754821, -7.278681089101213 },
	{ -271.815969077903, 559.6580465940733, -32.46047482791194 },
	{ 1.9622899599665666, -57.173814538844006, 308.7233197812385 },
};
static const double Y_FROM_LINRGB[3] = { 0.2126, 0.7152, 0.0722 };

static void mat3(const double in[3], const double m[3][3], double out[3])
{
	for (int i = 0; i < 3; i++)
		out[i] = in[0] * m[i][0] + in[1] * m[i][1] + in[2] * m[i][2];
}

/* sRGB-channel critical planes: linearized((i + 0.5) ... ), the 255 boundaries between 8-bit values */
static double critical_plane(int i)
{
	double n = (i + 0.5) / 255.0;
	return n <= 0.040449936 ? n / 12.92 * 100.0 : m_pow((n + 0.055) / 1.055, 2.4) * 100.0;
}

static double sanitize_radians(double a) { return m_fmod_pos(a + PI * 8.0, PI * 2.0); }

static double true_delinearized(double comp)
{
	double n = comp / 100.0;
	double d = n <= 0.0031308 ? n * 12.92 : 1.055 * m_pow(n, 1.0 / 2.4) - 0.055;
	return d * 255.0;
}

static double chromatic_adaptation(double c)
{
	double af = m_pow(m_abs(c), 0.42);
	return signum(c) * 400.0 * af / (af + 27.13);
}

static double hue_of(const double lin[3])
{
	double s[3];
	mat3(lin, SCALED_DISCOUNT_FROM_LINRGB, s);
	double ra = chromatic_adaptation(s[0]), ga = chromatic_adaptation(s[1]), ba = chromatic_adaptation(s[2]);
	double a = (11.0 * ra - 12.0 * ga + ba) / 11.0, b = (ra + ga - 2.0 * ba) / 9.0;
	return m_atan2(b, a);
}

static int cyclic(double a, double b, double c) { return sanitize_radians(b - a) < sanitize_radians(c - a); }

static int bounded(double x) { return x >= 0.0 && x <= 100.0; }

static void nth_vertex(double y, int n, double out[3])
{
	double kr = Y_FROM_LINRGB[0], kg = Y_FROM_LINRGB[1], kb = Y_FROM_LINRGB[2];
	double ca = n % 4 <= 1 ? 0.0 : 100.0, cb = n % 2 == 0 ? 0.0 : 100.0;
	out[0] = out[1] = out[2] = -1.0;
	if (n < 4) {
		double r = (y - ca * kg - cb * kb) / kr;
		if (bounded(r)) { out[0] = r; out[1] = ca; out[2] = cb; }
	} else if (n < 8) {
		double g = (y - cb * kr - ca * kb) / kg;
		if (bounded(g)) { out[0] = cb; out[1] = g; out[2] = ca; }
	} else {
		double b = (y - ca * kr - cb * kg) / kb;
		if (bounded(b)) { out[0] = ca; out[1] = cb; out[2] = b; }
	}
}

static void set_coordinate(const double s[3], double coord, const double t[3], int axis, double out[3])
{
	double k = (coord - s[axis]) / (t[axis] - s[axis]);
	for (int i = 0; i < 3; i++)
		out[i] = s[i] + (t[i] - s[i]) * k;
}

static void bisect_to_limit(double y, double target, double out[3])
{
	double left[3] = { -1, -1, -1 }, right[3] = { -1, -1, -1 }, mid[3];
	double lh = 0, rh = 0;
	int init = 0, uncut = 1;
	for (int n = 0; n < 12; n++) {
		nth_vertex(y, n, mid);
		if (mid[0] < 0)
			continue;
		double mh = hue_of(mid);
		if (!init) {
			for (int i = 0; i < 3; i++) left[i] = right[i] = mid[i];
			lh = rh = mh;
			init = 1;
			continue;
		}
		if (uncut || cyclic(lh, mh, rh)) {
			uncut = 0;
			if (cyclic(lh, target, mh)) {
				for (int i = 0; i < 3; i++) right[i] = mid[i];
				rh = mh;
			} else {
				for (int i = 0; i < 3; i++) left[i] = mid[i];
				lh = mh;
			}
		}
	}
	lh = hue_of(left);
	for (int axis = 0; axis < 3; axis++) {
		if (left[axis] == right[axis])
			continue;
		int lp, rp;
		if (left[axis] < right[axis]) {
			lp = (int)m_floor(true_delinearized(left[axis]) - 0.5);
			rp = (int)m_ceil(true_delinearized(right[axis]) - 0.5);
		} else {
			lp = (int)m_ceil(true_delinearized(left[axis]) - 0.5);
			rp = (int)m_floor(true_delinearized(right[axis]) - 0.5);
		}
		for (int i = 0; i < 8; i++) {
			if ((rp - lp) <= 1 && (lp - rp) <= 1)
				break;
			int mp = (int)m_floor((lp + rp) / 2.0);
			int ci = mp < 0 ? 0 : (mp > 254 ? 254 : mp);
			set_coordinate(left, critical_plane(ci), right, axis, mid);
			double mh = hue_of(mid);
			if (cyclic(lh, target, mh)) {
				for (int k = 0; k < 3; k++) right[k] = mid[k];
				rp = mp;
			} else {
				for (int k = 0; k < 3; k++) left[k] = mid[k];
				lh = mh;
				lp = mp;
			}
		}
	}
	for (int i = 0; i < 3; i++)
		out[i] = (left[i] + right[i]) / 2.0;
}

static double inverse_chromatic_adaptation(double ad)
{
	double aa = m_abs(ad);
	double base = 27.13 * aa / (400.0 - aa);
	if (base < 0)
		base = 0;
	return signum(ad) * m_pow(base, 1.0 / 0.42);
}

static int find_by_j(double hr, double chroma, double y, __u32 *out)
{
	const struct vc *vc = vc_standard();
	double j = m_sqrt(y) * 11.0;
	double t_inner = 1.0 / m_pow(1.64 - m_pow(0.29, vc->n), 0.73);
	double e_hue = 0.25 * (m_cos(hr + 2.0) + 3.8);
	double p1 = e_hue * (50000.0 / 13.0) * vc->nc * vc->ncb;
	double hs = m_sin(hr), hc = m_cos(hr);
	for (int round = 0; round < 5; round++) {
		double jn = j / 100.0;
		double alpha = (chroma == 0.0 || j == 0.0) ? 0.0 : chroma / m_sqrt(jn);
		double t = m_pow(alpha * t_inner, 1.0 / 0.9);
		double ac = vc->aw * m_pow(jn, 1.0 / vc->c / vc->z);
		double p2 = ac / vc->nbb;
		double gamma = 23.0 * (p2 + 0.305) * t / (23.0 * p1 + 11.0 * t * hc + 108.0 * t * hs);
		double a = gamma * hc, b = gamma * hs;
		double ra = (460.0 * p2 + 451.0 * a + 288.0 * b) / 1403.0;
		double ga = (460.0 * p2 - 891.0 * a - 261.0 * b) / 1403.0;
		double ba = (460.0 * p2 - 220.0 * a - 6300.0 * b) / 1403.0;
		double sc[3] = { inverse_chromatic_adaptation(ra), inverse_chromatic_adaptation(ga),
				 inverse_chromatic_adaptation(ba) }, lin[3];
		mat3(sc, LINRGB_FROM_SCALED_DISCOUNT, lin);
		if (lin[0] < 0 || lin[1] < 0 || lin[2] < 0)
			return 0;
		double fnj = Y_FROM_LINRGB[0] * lin[0] + Y_FROM_LINRGB[1] * lin[1] + Y_FROM_LINRGB[2] * lin[2];
		if (fnj <= 0)
			return 0;
		if (round == 4 || m_abs(fnj - y) < 0.002) {
			if (lin[0] > 100.01 || lin[1] > 100.01 || lin[2] > 100.01)
				return 0;
			*out = argb_from_linrgb(lin);
			return 1;
		}
		j -= (fnj - y) * j / (2.0 * fnj);
	}
	return 0;
}

AY_API __u32 ay_hct_to_argb(double hue, double chroma, double tone)
{
	if (chroma < 0.0001 || tone < 0.0001 || tone > 99.9999)
		return argb_from_lstar(tone);
	double hr = sanitize_degrees(hue) / 180.0 * PI, y = y_from_lstar(tone);
	__u32 argb;
	if (find_by_j(hr, chroma, y, &argb))
		return argb;
	double lin[3];
	bisect_to_limit(y, hr, lin);
	return argb_from_linrgb(lin);
}

/* ---- 2021 dynamic scheme (scheme.rs Palettes::from_hue) ---------------------------------- */

static double rotated(double hue, const double bp[9], const double rot[9])
{
	for (int i = 0; i < 8; i++)
		if (hue >= bp[i] && hue < bp[i + 1])
			return sanitize_degrees(hue + rot[i]);
	return hue;
}

struct pal { double h, c; };

static int palettes(__u32 variant, double hue, double chroma, struct pal p[6])
{
	static const double VB[9] = { 0, 41, 61, 101, 131, 181, 251, 301, 360 };
	static const double VS[9] = { 18, 15, 10, 12, 15, 18, 15, 12, 12 };
	static const double VT[9] = { 35, 30, 20, 25, 30, 35, 30, 25, 25 };
	static const double EB[9] = { 0, 21, 51, 121, 151, 191, 271, 321, 360 };
	static const double ES[9] = { 45, 95, 45, 20, 45, 90, 45, 45, 45 };
	static const double ET[9] = { 120, 120, 20, 45, 20, 15, 20, 120, 120 };
	p[5] = (struct pal){ 25.0, 84.0 };
	switch (variant) {
	case AY_M3_VARIANT_MONOCHROME:
		for (int i = 0; i < 5; i++) p[i] = (struct pal){ hue, 0 };
		break;
	case AY_M3_VARIANT_NEUTRAL:
		p[0] = (struct pal){ hue, 12 }; p[1] = (struct pal){ hue, 8 }; p[2] = (struct pal){ hue, 16 };
		p[3] = (struct pal){ hue, 2 }; p[4] = (struct pal){ hue, 2 };
		break;
	case AY_M3_VARIANT_TONAL_SPOT:
		p[0] = (struct pal){ hue, 36 }; p[1] = (struct pal){ hue, 16 };
		p[2] = (struct pal){ sanitize_degrees(hue + 60), 24 };
		p[3] = (struct pal){ hue, 6 }; p[4] = (struct pal){ hue, 8 };
		break;
	case AY_M3_VARIANT_VIBRANT:
		p[0] = (struct pal){ hue, 200 }; p[1] = (struct pal){ rotated(hue, VB, VS), 24 };
		p[2] = (struct pal){ rotated(hue, VB, VT), 32 };
		p[3] = (struct pal){ hue, 10 }; p[4] = (struct pal){ hue, 12 };
		break;
	case AY_M3_VARIANT_EXPRESSIVE:
		p[0] = (struct pal){ sanitize_degrees(hue + 240), 40 }; p[1] = (struct pal){ rotated(hue, EB, ES), 24 };
		p[2] = (struct pal){ rotated(hue, EB, ET), 32 };
		p[3] = (struct pal){ sanitize_degrees(hue + 15), 8 }; p[4] = (struct pal){ sanitize_degrees(hue + 15), 12 };
		break;
	case AY_M3_VARIANT_RAINBOW:
		p[0] = (struct pal){ hue, 48 }; p[1] = (struct pal){ hue, 16 };
		p[2] = (struct pal){ sanitize_degrees(hue + 60), 24 };
		p[3] = (struct pal){ hue, 0 }; p[4] = (struct pal){ hue, 0 };
		break;
	case AY_M3_VARIANT_FRUIT_SALAD:
		p[0] = (struct pal){ sanitize_degrees(hue - 50), 48 }; p[1] = (struct pal){ sanitize_degrees(hue - 50), 36 };
		p[2] = (struct pal){ hue, 36 }; p[3] = (struct pal){ hue, 10 }; p[4] = (struct pal){ hue, 16 };
		break;
	case AY_M3_VARIANT_CONTENT: /* source-faithful chroma; tertiary hue + 60 (no temperature cache) */
		p[0] = (struct pal){ hue, chroma }; p[1] = (struct pal){ hue, chroma - 32 > chroma * 0.5 ? chroma - 32 : chroma * 0.5 };
		p[2] = (struct pal){ sanitize_degrees(hue + 60), chroma > 16 ? chroma / 2 : 8 };
		p[3] = (struct pal){ hue, chroma / 8 }; p[4] = (struct pal){ hue, chroma / 8 + 4 };
		break;
	default:
		return AY_EINVAL;
	}
	return 0;
}

/* Role -> { palette index (0 P, 1 S, 2 T, 3 N, 4 NV, 5 E), light tone, dark tone } */
static const __u8 ROLE_TONES[AY_UI_ROLE_COUNT - 1][3] = {
	{ 3, 98, 6 },   { 3, 100, 4 },  { 3, 96, 10 },  { 3, 94, 12 },  { 3, 92, 17 },  { 3, 90, 22 },
	{ 3, 10, 90 },  { 4, 30, 80 },
	{ 0, 40, 80 },  { 0, 100, 20 }, { 0, 90, 30 },  { 0, 30, 90 },
	{ 1, 40, 80 },  { 1, 100, 20 }, { 1, 90, 30 },  { 1, 30, 90 },
	{ 2, 40, 80 },  { 2, 100, 20 }, { 2, 90, 30 },  { 2, 30, 90 },
	{ 5, 40, 80 },  { 5, 100, 20 },
	{ 4, 50, 60 },  { 4, 80, 30 },
};

AY_API __s32 ay_m3_scheme(__u32 seed_argb, __u32 variant, __u32 theme_mode, __u32 accent_argb,
			  __u32 out_argb[AY_UI_ROLE_COUNT])
{
	double h, c;
	struct pal p[6];
	if (!out_argb || theme_mode > AY_UI_THEME_DARK)
		return AY_EINVAL;
	ay_hct_from_argb(seed_argb, &h, &c, (double *)0);
	__s32 rc = palettes(variant, h, c, p);
	if (rc)
		return rc;
	for (__u32 r = 0; r < AY_UI_ROLE_COUNT - 1; r++) {
		const __u8 *t = ROLE_TONES[r];
		out_argb[r] = ay_hct_to_argb(p[t[0]].h, p[t[0]].c, theme_mode ? t[2] : t[1]);
	}
	out_argb[AY_UI_ROLE_BOLT] = accent_argb;
	return 0;
}

AY_API __u32 ay_m3_tone(double hue, double chroma, double tone)
{
	return ay_hct_to_argb(hue, chroma, tone);
}
