//! `factor` — GNU coreutils 9.4 `src/factor.c` operand grammar and output
//! shape, probed byte-for-byte against WSL coreutils 9.4 (2026-11-12).
//!
//! * Output per NUMBER: `N: f1 f2 ...` with factors ascending; 0 and 1
//!   print `N:` with no factors. `-h/--exponents` groups repeats as
//!   `p^e` unless e is 1 (`12` -> `12: 2^2 3`). No operands reads stdin
//!   line by line.
//! * Parsing (probed): leading SPACE characters only (a leading tab is
//!   invalid), one optional `+`, then all-digits, no trailing characters;
//!   `010` is decimal 10; `--` ends options so `factor -- -5` reports the
//!   negative operand. An invalid operand reports
//!   `factor: '<x>' is not a valid positive integer` on stderr, rc 1,
//!   and processing CONTINUES with the remaining operands/stdin lines.
//! * Stdin lines are trimmed of spaces and tabs on both ends before the
//!   same parse; a line that trims empty is skipped without error, while
//!   other junk fails that line and processing continues (probed:
//!   `'\n5\n'` -> `5: 5` rc 0; `'6\r\n'` -> invalid '6\r' rc 1;
//!   `'  5  \n'` -> 5). `\r` is NOT trimmed (probed invalid).
//! * Documented subset: GNU links GMP and factors arbitrary-precision
//!   operands (`factor 18446744073709551616` prints 64 twos, rc 0;
//!   `factor 99999999999999999999999` = 3 x 11111111111111111111111,
//!   probed). This implementation covers 0..=u64::MAX exactly — primes
//!   < 1000 by trial division, then deterministic Miller-Rabin +
//!   Pollard-Brent rho, which factor any u64 in milliseconds (probed
//!   worst cases 2^64-1 and 4295109041 match GNU output). Operands
//!   beyond u64::MAX are factored in u128 (trial division, then Miller-Rabin
//!   and Pollard rho on 128-bit modular arithmetic); only operands beyond
//!   u128::MAX (GNU uses GMP there) are rejected with rc 1.

use std::ffi::OsString;

use crate::argopt::{self, OptSpec};
use crate::gnuhelp;
use winux_core::{CmdResult, Ctx, Io};

const OPTS: &[OptSpec] = &[OptSpec {
    short: Some('h'),
    long: "exponents",
    takes_value: false,
}];

// `--help` body verbatim from `env factor --help` under WSL coreutils 9.4,
// minus the shared gnuhelp::footer tail.
const FACTOR_HELP_BODY: &str = r#"Usage: factor [OPTION] [NUMBER]...
Print the prime factors of each specified integer NUMBER.  If none
are specified on the command line, read them from standard input.

  -h, --exponents   print repeated factors in form p^e unless e is 1
      --help        display this help and exit
      --version     output version information and exit

"#;

pub fn factor_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    let p = match argopt::parse("factor", args, OPTS, io, ctx, 1) {
        Ok(p) => p,
        Err(s) => return Ok(s),
    };
    if let Some(which) = p
        .flags
        .iter()
        .find(|f| f.as_str() == argopt::HELP || f.as_str() == argopt::VERSION)
    {
        return Ok(match which.as_str() {
            "help" => {
                write!(
                    io.stdout,
                    "{}{}",
                    FACTOR_HELP_BODY,
                    gnuhelp::footer("factor", "factor invocation")
                )?;
                0
            }
            _ => {
                write!(
                    io.stdout,
                    "{}",
                    gnuhelp::coreutils_version(
                        "factor",
                        "Paul Rubin, Torbj\u{f6}rn Granlund, and Niels M\u{f6}ller"
                    )
                )?;
                0
            }
        });
    }
    let exponents = p.has("exponents");

    let mut failed = false;
    let out = &mut *io.stdout;
    if p.positionals.is_empty() {
        let mut data = Vec::new();
        if std::io::copy(&mut io.stdin, &mut data).is_err() {
            let _ = writeln!(io.stderr, "factor: read error");
            return Ok(1);
        }
        let err = &mut *io.stderr;
        for line in data.split(|&b| b == b'\n') {
            // trim spaces and tabs on both ends; empty lines are skipped
            let trimmed: &[u8] = {
                let mut s = line;
                while let Some((&first, rest)) = s.split_first() {
                    if first == b' ' || first == b'\t' {
                        s = rest;
                    } else {
                        break;
                    }
                }
                while let Some((&last, rest)) = s.split_last() {
                    if last == b' ' || last == b'\t' {
                        s = rest;
                    } else {
                        break;
                    }
                }
                s
            };
            if trimmed.is_empty() {
                continue;
            }
            let text = String::from_utf8_lossy(trimmed).into_owned();
            if !print_factors(out, err, &text, exponents) {
                failed = true;
            }
        }
    } else {
        let err = &mut *io.stderr;
        for operand in &p.positionals {
            let text = operand.to_string_lossy().into_owned();
            if !print_factors(out, err, &text, exponents) {
                failed = true;
            }
        }
    }
    Ok(if failed { 1 } else { 0 })
}

/// Parse and print one NUMBER operand; false on invalid input (the GNU
/// diagnostic goes to stderr, processing continues).
fn print_factors(
    out: &mut dyn std::io::Write,
    err: &mut dyn std::io::Write,
    text: &str,
    exponents: bool,
) -> bool {
    let Some(n) = parse_operand(text) else {
        let _ = writeln!(err, "factor: '{text}' is not a valid positive integer");
        return false;
    };
    let mut factors = factorize_wide(n);
    factors.sort_unstable();
    let _ = write!(out, "{n}:");
    if exponents {
        let mut i = 0usize;
        while i < factors.len() {
            let mut count = 1usize;
            while i + count < factors.len() && factors[i + count] == factors[i] {
                count += 1;
            }
            if count == 1 {
                let _ = write!(out, " {}", factors[i]);
            } else {
                let _ = write!(out, " {}^{count}", factors[i]);
            }
            i += count;
        }
    } else {
        for f in &factors {
            let _ = write!(out, " {f}");
        }
    }
    let _ = writeln!(out);
    true
}

/// factor.c parse: skip leading ' ' only, one optional '+', all digits,
/// no trailing characters; the value must fit u128 (documented subset).
fn parse_operand(text: &str) -> Option<u128> {
    let bytes = text.as_bytes();
    let mut pos = 0usize;
    while pos < bytes.len() && bytes[pos] == b' ' {
        pos += 1;
    }
    if pos < bytes.len() && bytes[pos] == b'+' {
        pos += 1;
    }
    let digits = &text[pos..];
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse::<u128>().ok()
}

// ---------------------------------------------------------------------------
// Number theory (std-only): deterministic Miller-Rabin for u64, Pollard-
// Brent rho with u128 intermediate products, trial division by primes
// < 1000. No process-global state: the tiny prime table is built per call
// (a 1000-cell sieve is microseconds).
// ---------------------------------------------------------------------------

fn mulmod(a: u64, b: u64, m: u64) -> u64 {
    ((a as u128 * b as u128) % m as u128) as u64
}

fn powmod(mut base: u64, mut exp: u64, m: u64) -> u64 {
    if m == 1 {
        return 0;
    }
    let mut result = 1u64;
    base %= m;
    while exp > 0 {
        if exp & 1 == 1 {
            result = mulmod(result, base, m);
        }
        base = mulmod(base, base, m);
        exp >>= 1;
    }
    result
}

fn gcd(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

/// Deterministic Miller-Rabin for u64: the first 12 prime bases are a
/// proven witness set over the whole u64 range.
fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    for p in [2u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
        if n % p == 0 {
            return n == p;
        }
    }
    let d0 = n - 1;
    let s = d0.trailing_zeros();
    let d = d0 >> s;
    'witness: for a in [2u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
        let mut x = powmod(a, d, n);
        if x == 1 || x == n - 1 {
            continue;
        }
        for _ in 0..s {
            x = mulmod(x, x, n);
            if x == n - 1 {
                continue 'witness;
            }
        }
        return false;
    }
    true
}

/// Pollard-Brent rho: returns a nontrivial factor of composite n (> 1,
/// no small factors left). Retries with fresh polynomials/seeds until a
/// proper split is found.
fn pollard_brent(n: u64) -> u64 {
    if n % 2 == 0 {
        return 2;
    }
    if n % 3 == 0 {
        return 3;
    }
    let mut seed: u64 = 1;
    let mut c: u64 = 1;
    loop {
        let mut y: u64 = seed % n;
        let mut x = y;
        let mut g;
        let mut q = 1u64;
        let mut r = 1u64;
        loop {
            x = y;
            for _ in 0..r {
                y = (mulmod(y, y, n) + c) % n;
            }
            let mut k = 0u64;
            g = 1u64;
            while k < r && g == 1 {
                for _ in 0..128.min(r - k) {
                    y = (mulmod(y, y, n) + c) % n;
                    q = mulmod(q, x.abs_diff(y).max(1), n);
                }
                g = gcd(q, n);
                k += 128;
            }
            r <<= 1;
            if g != 1 {
                break;
            }
        }
        if g == n {
            // the batch overshot: backtrack one step at a time
            let mut ys = y;
            g = 1;
            while g == 1 {
                ys = (mulmod(ys, ys, n) + c) % n;
                g = gcd(x.abs_diff(ys).max(1), n);
            }
        }
        if g != n && g != 1 {
            return g;
        }
        // retry: advance the polynomial constant and the seed
        c += 1;
        seed = seed.wrapping_add(11).max(2);
        if c > 10_000 {
            // unreachable for composite u64 inputs; fall back to the
            // trivial divisor scan rather than looping forever
            let mut f = 2u64;
            while f * f <= n {
                if n % f == 0 {
                    return f;
                }
                f += 1;
            }
            return n;
        }
    }
}

fn small_primes() -> Vec<u64> {
    let limit = 1000usize;
    let mut sieve = vec![true; limit];
    let mut primes = Vec::new();
    for i in 2..limit {
        if sieve[i] {
            primes.push(i as u64);
            let mut j = i * i;
            while j < limit {
                sieve[j] = false;
                j += i;
            }
        }
    }
    primes
}

fn factorize(n: u64) -> Vec<u64> {
    if n < 2 {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut rest = n;
    for p in small_primes() {
        if p * p > rest {
            break;
        }
        while rest % p == 0 {
            out.push(p);
            rest /= p;
        }
    }
    if rest > 1 {
        let mut stack = vec![rest];
        while let Some(x) = stack.pop() {
            if x == 1 {
                continue;
            }
            if is_prime(x) {
                out.push(x);
                continue;
            }
            let d = pollard_brent(x);
            stack.push(d);
            stack.push(x / d);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 128-bit path: operands above u64::MAX. Modular products by shift-and-add
// (no 256-bit intermediate), so every step stays inside u128.
// ---------------------------------------------------------------------------

fn addmod128(a: u128, b: u128, m: u128) -> u128 {
    if a >= m - b {
        a - (m - b)
    } else {
        a + b
    }
}

fn mulmod128(a: u128, b: u128, m: u128) -> u128 {
    let (mut a, mut b, mut r) = (a % m, b % m, 0u128);
    while b > 0 {
        if b & 1 == 1 {
            r = addmod128(r, a, m);
        }
        a = addmod128(a, a, m);
        b >>= 1;
    }
    r
}

fn powmod128(mut base: u128, mut exp: u128, m: u128) -> u128 {
    let mut result = 1u128 % m;
    base %= m;
    while exp > 0 {
        if exp & 1 == 1 {
            result = mulmod128(result, base, m);
        }
        base = mulmod128(base, base, m);
        exp >>= 1;
    }
    result
}

fn gcd128(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

/// Miller-Rabin with the first 20 primes as bases (above u64 this is probabilistic in theory; no counterexample is known for this set).
fn is_prime128(n: u128) -> bool {
    const BASES: [u128; 20] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
    if n < 2 {
        return false;
    }
    for p in BASES {
        if n % p == 0 {
            return n == p;
        }
    }
    let (mut d, mut r) = (n - 1, 0u32);
    while d % 2 == 0 {
        d /= 2;
        r += 1;
    }
    'witness: for a in BASES {
        let mut x = powmod128(a, d, n);
        if x == 1 || x == n - 1 {
            continue;
        }
        for _ in 1..r {
            x = mulmod128(x, x, n);
            if x == n - 1 {
                continue 'witness;
            }
        }
        return false;
    }
    true
}

/// A non-trivial divisor of the composite odd `n` (Floyd cycle detection on x^2 + c).
fn pollard128(n: u128) -> u128 {
    let mut c = 1u128;
    loop {
        let step = |x: u128| addmod128(mulmod128(x, x, n), c, n);
        let (mut x, mut y, mut d) = (2u128, 2u128, 1u128);
        while d == 1 {
            x = step(x);
            y = step(step(y));
            d = gcd128(x.abs_diff(y), n);
        }
        if d != n {
            return d;
        }
        c += 1;
    }
}

/// Prime factors of any u128, with repeats.
fn factorize_wide(n: u128) -> Vec<u128> {
    if n <= u64::MAX as u128 {
        return factorize(n as u64).into_iter().map(u128::from).collect();
    }
    let mut out = Vec::new();
    let mut rest = n;
    for p in small_primes() {
        let p = p as u128;
        while rest % p == 0 {
            out.push(p);
            rest /= p;
        }
    }
    let mut stack = vec![rest];
    while let Some(x) = stack.pop() {
        if x == 1 {
            continue;
        }
        if x <= u64::MAX as u128 {
            out.extend(factorize(x as u64).into_iter().map(u128::from));
        } else if is_prime128(x) {
            out.push(x);
        } else {
            let d = pollard128(x);
            stack.push(d);
            stack.push(x / d);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use winux_core::test_support::{MemIo, ScratchCtx};

    use super::*;

    fn run(args: &[&str], stdin: &str) -> (u32, String, String) {
        let sc = ScratchCtx::new("factor");
        let ctx = sc.ctx();
        let mut io = MemIo::new(stdin);
        let owned: Vec<OsString> = args.iter().map(Into::into).collect();
        let r = factor_cmd(&owned, &mut io.split(), &ctx).unwrap();
        (r, io.out(), io.err())
    }

    #[test]
    fn basic_factorizations() {
        // All expected strings probed against WSL coreutils 9.4.
        let (r, out, err) = run(&["12"], "");
        assert_eq!((r, err.as_str()), (0, ""));
        assert_eq!(out, "12: 2 2 3\n");
        let (_, out, _) = run(&["0"], "");
        assert_eq!(out, "0:\n");
        let (_, out, _) = run(&["1"], "");
        assert_eq!(out, "1:\n");
        let (_, out, _) = run(&["1000003"], "");
        assert_eq!(out, "1000003: 1000003\n");
        let (_, out, _) = run(&["18446744073709551615"], "");
        assert_eq!(out, "18446744073709551615: 3 5 17 257 641 65537 6700417\n");
        let (_, out, _) = run(&["123456789012345678"], "");
        assert_eq!(out, "123456789012345678: 2 3 3 3 21491747 106377431\n");
        let (_, out, _) = run(&["4611686018427387905"], "");
        assert_eq!(out, "4611686018427387905: 5 5581 8681 49477 384773\n");
        // large primes (Miller-Rabin vs GNU)
        let (_, out, _) = run(&["2147483647", "4294967291"], "");
        assert_eq!(out, "2147483647: 2147483647\n4294967291: 4294967291\n");
        // probed semiprime-shape number
        let (_, out, _) = run(&["4295109041"], "");
        assert_eq!(out, "4295109041: 17 17 2389 6221\n");
    }

    #[test]
    fn exponents_form() {
        let (_, out, _) = run(&["-h", "12"], "");
        assert_eq!(out, "12: 2^2 3\n");
        let (_, out, _) = run(&["--exponents", "8"], "");
        assert_eq!(out, "8: 2^3\n");
        let (_, out, _) = run(&["-h", "7"], "");
        assert_eq!(out, "7: 7\n");
        let (_, out, _) = run(&["-h", "4", "9"], "");
        assert_eq!(out, "4: 2^2\n9: 3^2\n");
        // stdin with -h (probed: 18 -> 2 3^2)
        let (_, out, _) = run(&["-h"], "18\n");
        assert_eq!(out, "18: 2 3^2\n");
    }

    #[test]
    fn operand_grammar() {
        // leading spaces skip; one '+'; leading zeros decimal
        let (_, out, _) = run(&[" 12"], "");
        assert_eq!(out, "12: 2 2 3\n");
        let (_, out, _) = run(&["+12"], "");
        assert_eq!(out, "12: 2 2 3\n");
        let (_, out, _) = run(&["010"], "");
        assert_eq!(out, "10: 2 5\n");
        // invalid operands: error + rc 1 + processing continues
        let (r, out, err) = run(&["xyz", "6"], "");
        assert_eq!(r, 1);
        assert_eq!(out, "6: 2 3\n");
        assert!(err.contains("factor: 'xyz' is not a valid positive integer"));
        let (r, _, err) = run(&["--", "-5"], "");
        assert_eq!(r, 1);
        assert!(err.contains("'-5' is not a valid positive integer"));
        let (r, _, err) = run(&[""], "");
        assert_eq!(r, 1);
        assert!(err.contains("'' is not a valid positive integer"));
        let (r, _, err) = run(&["12x"], "");
        assert_eq!(r, 1);
        assert!(err.contains("'12x' is not"));
        let (r, _, err) = run(&["12 "], "");
        assert_eq!(r, 1);
        assert!(err.contains("'12 ' is not"));
        // leading tab is invalid (only spaces skip)
        let (r, _, err) = run(&["\t12"], "");
        assert_eq!(r, 1);
        assert!(err.contains("is not a valid positive integer"));
        // beyond u64: factored in u128 (GNU prints the same, rc 0)
        let (r, out, _) = run(&["18446744073709551616"], "");
        assert_eq!(r, 0);
        assert_eq!(out, format!("18446744073709551616:{}\n", " 2".repeat(64)));
        // beyond u128: documented subset, rejected
        let (r, _, err) = run(&["340282366920938463463374607431768211456"], "");
        assert_eq!(r, 1);
        assert!(err.contains("is not a valid positive integer"));
    }

    #[test]
    fn stdin_mode() {
        let (r, out, _) = run(&[], "8\n9\n");
        assert_eq!(r, 0);
        assert_eq!(out, "8: 2 2 2\n9: 3 3\n");
        // blank lines skipped; surrounding spaces trimmed (probed)
        let (r, out, _) = run(&[], "  5  \n\n  \n7\n");
        assert_eq!(r, 0);
        assert_eq!(out, "5: 5\n7: 7\n");
        // no trailing newline still processed
        let (r, out, _) = run(&[], "6");
        assert_eq!(r, 0);
        assert_eq!(out, "6: 2 3\n");
        // CR is NOT trimmed: '6\r' is invalid (probed), processing continues
        let (r, out, err) = run(&[], "6\r\n");
        assert_eq!(r, 1);
        assert_eq!(out, "");
        assert!(err.contains("is not a valid positive integer"));
        // junk line continues to the next (probed: x then 5)
        let (r, out, err) = run(&[], "x\n5\n");
        assert_eq!(r, 1);
        assert_eq!(out, "5: 5\n");
        assert!(err.contains("'x'"));
        // tab-only line skipped (probed)
        let (r, out, _) = run(&[], "\t\n8\n");
        assert_eq!(r, 0);
        assert_eq!(out, "8: 2 2 2\n");
    }

    #[test]
    fn help_version_surface() {
        let (r, out, err) = run(&["--help"], "");
        assert_eq!(r, 0);
        assert!(err.is_empty());
        assert!(out.starts_with("Usage: factor [OPTION] [NUMBER]...\n"));
        assert!(out.contains("-h, --exponents"));
        assert!(out.ends_with("info '(coreutils) factor invocation'\n"));
        let (r, out, _) = run(&["--version"], "");
        assert_eq!(r, 0);
        assert!(out.starts_with("factor (GNU coreutils) 9.4\n"));
        assert!(out
            .ends_with("Written by Paul Rubin, Torbj\u{f6}rn Granlund, and Niels M\u{f6}ller.\n"));
        // help wins over operands (getopt permute, probed)
        let (r, out, _) = run(&["--help", "12"], "");
        assert_eq!(r, 0);
        assert!(out.starts_with("Usage:"));
        // option errors
        let (r, _, err) = run(&["--exponents=8"], "");
        assert_eq!(r, 1);
        assert!(err.contains("doesn't allow an argument"));
        let (r, _, err) = run(&["-q", "12"], "");
        assert_eq!(r, 1);
        assert!(err.contains("invalid option -- 'q'"));
        let (r, _, err) = run(&["--bogus", "12"], "");
        assert_eq!(r, 1);
        assert!(err.contains("unrecognized option '--bogus'"));
    }

    #[test]
    fn wide_operands_factor_correctly() {
        // two 33-bit primes times 3 (above u64), checked by multiplication back
        let mut p: u128 = (1u128 << 33) + 1;
        while !is_prime128(p) {
            p += 2;
        }
        let mut q = p + 2;
        while !is_prime128(q) {
            q += 2;
        }
        let n = 3 * p * q;
        let mut f = factorize_wide(n);
        f.sort_unstable();
        assert_eq!(f, vec![3, p, q]);
        assert_eq!(f.iter().product::<u128>(), n);
        // u128::MAX = 3 * 5 * 17 * 257 * 641 * 65537 * 274177 * 6700417 * 67280421310721
        let mut m = factorize_wide(u128::MAX);
        m.sort_unstable();
        assert_eq!(m, vec![3, 5, 17, 257, 641, 65537, 274177, 6700417, 67280421310721]);
        assert!(!is_prime128((1u128 << 100) + 1));
        assert!(is_prime128((1u128 << 89) - 1)); // Mersenne prime M89
    }

    #[test]
    fn unit_theory_sanity() {
        // direct core checks (the command-level values are GNU-probed)
        assert!(is_prime(2));
        assert!(is_prime(6700417));
        assert!(is_prime(4294967291));
        assert!(!is_prime(4294967290));
        assert_eq!(factorize(2u64.pow(63)), vec![2u64; 63]);
        assert_eq!(factorize(1000006000009), vec![1000003, 1000003]);
    }
}
