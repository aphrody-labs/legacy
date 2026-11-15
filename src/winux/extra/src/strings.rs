//! `strings [-a] [-f] [-n MIN | -MIN] [-t o|d|x] [FILE...]`: runs of printable characters in binary data (GNU binutils defaults).
//!
//! A string is MIN or more (default 4) consecutive printable ASCII characters or tabs, ended by any other byte. `-t` prefixes each with
//! its offset in octal, decimal or hex; `-f` prefixes the file name. Reads stdin without FILE. `-a` is accepted (all of the file is
//! always scanned).

use std::ffi::OsString;
use std::io::Write as _;

use winux_core::{CmdResult, Ctx, Io};

fn printable(b: u8) -> bool {
    (0x20..0x7f).contains(&b) || b == b'\t'
}

/// (offset, text) of every run of at least `min` printable bytes.
pub fn scan(data: &[u8], min: usize) -> Vec<(usize, &[u8])> {
    let mut out = Vec::new();
    let mut start = None;
    for (i, &b) in data.iter().enumerate() {
        match (printable(b), start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                if i - s >= min {
                    out.push((s, &data[s..i]));
                }
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        if data.len() - s >= min {
            out.push((s, &data[s..]));
        }
    }
    out
}

pub fn strings_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    let (mut min, mut radix, mut with_name) = (4usize, None::<char>, false);
    let mut files: Vec<OsString> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let s = args[i].to_string_lossy().into_owned();
        match s.as_str() {
            "--" => {
                files.extend(args[i + 1..].iter().cloned());
                break;
            }
            "-a" | "--all" => {}
            "-f" | "--print-file-name" => with_name = true,
            "-n" | "--bytes" => {
                i += 1;
                match args.get(i).and_then(|a| a.to_string_lossy().parse().ok()) {
                    Some(n) => min = n,
                    None => {
                        crate::diag(io, "strings", "invalid minimum string length");
                        return Ok(1);
                    }
                }
            }
            "-t" | "--radix" => {
                i += 1;
                radix = args.get(i).and_then(|a| a.to_string_lossy().chars().next());
                if !matches!(radix, Some('o' | 'd' | 'x')) {
                    crate::diag(io, "strings", "invalid radix");
                    return Ok(1);
                }
            }
            _ if s.starts_with('-') && s.len() > 1 && s[1..].bytes().all(|b| b.is_ascii_digit()) => min = s[1..].parse().unwrap_or(4),
            _ if s.starts_with('-') && s.len() > 1 => {
                crate::diag(io, "strings", &format!("invalid option -- '{}'", &s[1..]));
                return Ok(1);
            }
            _ => files.push(args[i].clone()),
        }
        i += 1;
    }
    let mut status = 0;
    let mut emit = |io: &mut Io, name: &str, data: &[u8]| -> std::io::Result<()> {
        for (off, text) in scan(data, min) {
            if with_name {
                write!(io.stdout, "{name}: ")?;
            }
            match radix {
                Some('o') => write!(io.stdout, "{off:7o} ")?,
                Some('d') => write!(io.stdout, "{off:7} ")?,
                Some('x') => write!(io.stdout, "{off:7x} ")?,
                _ => {}
            }
            io.stdout.write_all(text)?;
            io.stdout.write_all(b"\n")?;
        }
        Ok(())
    };
    if files.is_empty() {
        let mut data = Vec::new();
        io.stdin.read_to_end(&mut data)?;
        emit(io, "{standard input}", &data)?;
        return Ok(0);
    }
    for f in &files {
        let path = winux_core::abs_path(ctx, std::path::Path::new(f));
        match std::fs::read(&path) {
            Ok(d) => emit(io, &f.to_string_lossy(), &d)?,
            Err(e) => {
                crate::diag(io, "strings", &format!("'{}': {}", f.to_string_lossy(), crate::err_text(&e).to_lowercase()));
                status = 1;
            }
        }
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_of_four_or_more_printable_bytes() {
        let data = b"\x00abc\x00hello\x01\x02wor\tld\xffx";
        let got: Vec<(usize, &[u8])> = scan(data, 4);
        assert_eq!(got, vec![(5, &b"hello"[..]), (12, &b"wor\tld"[..])]);
        assert_eq!(scan(data, 3).len(), 3);
    }
}
