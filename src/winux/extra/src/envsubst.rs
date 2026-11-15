//! `envsubst [OPTION] [SHELL-FORMAT]`: substitute `$VAR` and `${VAR}` of the environment in stdin (GNU gettext semantics).
//!
//! Without SHELL-FORMAT every variable reference is substituted (an unset variable becomes empty). With SHELL-FORMAT only the variables
//! it names are. `-v`/`--variables` prints the variables SHELL-FORMAT references, one per line in order of appearance.

use std::collections::BTreeSet;
use std::ffi::OsString;

use winux_core::{CmdResult, Ctx, Io};

fn is_name_start(b: u8) -> bool {
    b == b'_' || b.is_ascii_alphabetic()
}

fn is_name(b: u8) -> bool {
    b == b'_' || b.is_ascii_alphanumeric()
}

/// The references of `text`: (start, end, name) for each `$NAME` and `${NAME}`.
pub fn references(text: &[u8]) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < text.len() {
        if text[i] != b'$' {
            i += 1;
            continue;
        }
        if text.get(i + 1) == Some(&b'{') {
            let mut j = i + 2;
            if j < text.len() && is_name_start(text[j]) {
                while j < text.len() && is_name(text[j]) {
                    j += 1;
                }
                if text.get(j) == Some(&b'}') {
                    out.push((i, j + 1, String::from_utf8_lossy(&text[i + 2..j]).into_owned()));
                    i = j + 1;
                    continue;
                }
            }
            i += 1;
        } else if text.get(i + 1).is_some_and(|b| is_name_start(*b)) {
            let mut j = i + 1;
            while j < text.len() && is_name(text[j]) {
                j += 1;
            }
            out.push((i, j, String::from_utf8_lossy(&text[i + 1..j]).into_owned()));
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// Substitute; `only` restricts the variables replaced (None: all).
pub fn substitute(text: &[u8], only: Option<&BTreeSet<String>>, get: &dyn Fn(&str) -> Option<String>) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len());
    let mut last = 0;
    for (start, end, name) in references(text) {
        if only.is_some_and(|o| !o.contains(&name)) {
            continue;
        }
        out.extend_from_slice(&text[last..start]);
        out.extend_from_slice(get(&name).unwrap_or_default().as_bytes());
        last = end;
    }
    out.extend_from_slice(&text[last..]);
    out
}

pub fn envsubst_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    let mut variables = false;
    let mut format: Option<String> = None;
    for a in args {
        let s = a.to_string_lossy().into_owned();
        match s.as_str() {
            "-v" | "--variables" => variables = true,
            "-h" | "--help" | "-V" | "--version" => return Ok(0),
            _ if s.starts_with('-') && s.len() > 1 => {
                crate::diag(io, "envsubst", &format!("invalid option -- '{}'", s.trim_start_matches('-')));
                return Ok(1);
            }
            _ if format.is_none() => format = Some(s),
            _ => {
                crate::diag(io, "envsubst", "too many arguments");
                return Ok(1);
            }
        }
    }
    let only: Option<BTreeSet<String>> = format.as_ref().map(|f| references(f.as_bytes()).into_iter().map(|(_, _, n)| n).collect());
    if variables {
        // GNU lists the references of SHELL-FORMAT in order of appearance, repeats included; -v needs a SHELL-FORMAT.
        let Some(f) = &format else {
            crate::diag(io, "envsubst", "missing arguments\nTry 'envsubst --help' for more information.");
            return Ok(1);
        };
        for (_, _, n) in references(f.as_bytes()) {
            writeln!(io.stdout, "{n}")?;
        }
        return Ok(0);
    }
    let mut data = Vec::new();
    io.stdin.read_to_end(&mut data)?;
    let out = substitute(&data, only.as_ref(), &|n| ctx.env.get(n).map(|v| v.to_string_lossy().into_owned()));
    io.stdout.write_all(&out)?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitutes_both_forms_and_leaves_the_rest() {
        let get = |n: &str| (n == "A").then(|| "x".to_string());
        assert_eq!(substitute(b"$A ${A} $B ${B} $ ${ $1 $A_ ${A", None, &get), b"x x   $ ${ $1  ${A");
        let only: BTreeSet<String> = ["A".to_string()].into();
        assert_eq!(substitute(b"$A $B", Some(&only), &|_| Some("v".into())), b"v $B");
    }
}
