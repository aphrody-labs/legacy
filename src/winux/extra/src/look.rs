//! `look [-df] [-t CHAR] STRING [FILE]`: print the lines of a sorted FILE that begin with STRING (util-linux semantics).
//!
//! Without FILE the dictionary `/usr/share/dict/words` is read with `-d -f`. `-d` compares alphanumerics and blanks only, `-f` ignores
//! case, `-t CHAR` ends STRING at its first CHAR (inclusive). `-a` is accepted. Exit status 1 when no line matches.

use std::ffi::OsString;

use winux_core::{CmdResult, Ctx, Io};

const DEFAULT_DICT: &str = "/usr/share/dict/words";

fn key(line: &[u8], dict: bool, fold: bool) -> Vec<u8> {
    line.iter()
        .copied()
        .filter(|b| !dict || b.is_ascii_alphanumeric() || *b == b' ' || *b == b'\t')
        .map(|b| if fold { b.to_ascii_lowercase() } else { b })
        .collect()
}

/// The lines of `data` whose comparison key starts with the comparison key of `needle`.
pub fn matching_lines<'a>(data: &'a [u8], needle: &[u8], dict: bool, fold: bool) -> Vec<&'a [u8]> {
    let want = key(needle, dict, fold);
    data.split(|b| *b == b'\n')
        .filter(|l| key(l, dict, fold).starts_with(&want))
        .collect()
}

pub fn look_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    let (mut dict, mut fold, mut term) = (false, false, None::<u8>);
    let mut operands: Vec<OsString> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let s = args[i].to_string_lossy().into_owned();
        if s == "--" {
            operands.extend(args[i + 1..].iter().cloned());
            break;
        }
        if !s.starts_with('-') || s == "-" || !operands.is_empty() {
            operands.push(args[i].clone());
            i += 1;
            continue;
        }
        let mut chars = s[1..].chars();
        while let Some(c) = chars.next() {
            match c {
                'd' => dict = true,
                'f' => fold = true,
                'a' => {}
                't' => {
                    let rest: String = chars.by_ref().collect();
                    let v = if rest.is_empty() {
                        i += 1;
                        args.get(i).map(|a| a.to_string_lossy().into_owned()).unwrap_or_default()
                    } else {
                        rest
                    };
                    term = v.bytes().next();
                }
                _ => {
                    crate::diag(io, "look", &format!("invalid option -- '{c}'"));
                    return Ok(2);
                }
            }
        }
        i += 1;
    }
    let Some(first) = operands.first() else {
        crate::diag(io, "look", "missing operand");
        return Ok(2);
    };
    let mut needle = first.to_string_lossy().into_owned().into_bytes();
    if let Some(t) = term {
        if let Some(p) = needle.iter().position(|b| *b == t) {
            needle.truncate(p + 1);
        }
    }
    let file = operands.get(1);
    if file.is_none() {
        dict = true;
        fold = true;
    }
    let path = file.map(|f| winux_core::abs_path(ctx, std::path::Path::new(f))).unwrap_or_else(|| DEFAULT_DICT.into());
    let data = match std::fs::read(&path) {
        Ok(d) => d,
        Err(e) => {
            crate::diag(io, "look", &format!("{}: {}", path.display(), crate::err_text(&e)));
            return Ok(2);
        }
    };
    let body = data.strip_suffix(b"\n").unwrap_or(&data);
    let hits = matching_lines(body, &needle, dict, fold);
    for l in &hits {
        io.stdout.write_all(l)?;
        io.stdout.write_all(b"\n")?;
    }
    Ok(if hits.is_empty() { 1 } else { 0 })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_match_with_dictionary_order_and_case_folding() {
        let data = b"Apple\napple pie\nbanana\nB-an\n";
        assert_eq!(matching_lines(data.strip_suffix(b"\n").unwrap(), b"app", false, false), vec![&b"apple pie"[..]]);
        assert_eq!(matching_lines(data.strip_suffix(b"\n").unwrap(), b"APP", false, true).len(), 2);
        assert_eq!(matching_lines(data.strip_suffix(b"\n").unwrap(), b"ban", true, true).len(), 2);
    }
}
