//! `dos2unix` / `unix2dos` (and the `d2u` / `u2d` names): line-ending conversion, as a filter or in place.
//!
//! `dos2unix [-q] [-f] [-n IN OUT] [FILE...]`: CRLF becomes LF. `unix2dos`: LF not preceded by CR becomes CRLF. With no file the filter
//! reads stdin and writes stdout. A file holding a NUL byte is binary and is left alone unless `-f`. `-k` is accepted (the file time is
//! not changed by this port either way).

use std::ffi::OsString;

use winux_core::{CmdResult, Ctx, Io};

pub fn dos_to_unix(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        if data[i] == b'\r' && data.get(i + 1) == Some(&b'\n') {
            i += 1;
            continue;
        }
        out.push(data[i]);
        i += 1;
    }
    out
}

pub fn unix_to_dos(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() + data.len() / 16);
    let mut prev = 0u8;
    for &b in data {
        if b == b'\n' && prev != b'\r' {
            out.push(b'\r');
        }
        out.push(b);
        prev = b;
    }
    out
}

#[derive(Default)]
struct Opts {
    quiet: bool,
    force: bool,
    new_file: bool,
    files: Vec<OsString>,
}

fn parse(prog: &str, args: &[OsString], io: &mut Io) -> Result<Opts, u32> {
    let mut o = Opts::default();
    let mut rest = false;
    for a in args {
        let s = a.to_string_lossy();
        if rest || !s.starts_with('-') || s == "-" {
            o.files.push(a.clone());
            continue;
        }
        if s == "--" {
            rest = true;
            continue;
        }
        match s.as_ref() {
            "-q" | "--quiet" => o.quiet = true,
            "-f" | "--force" => o.force = true,
            "-n" | "--newfile" => o.new_file = true,
            "-k" | "--keepdate" | "-o" | "--oldfile" => {}
            _ => {
                crate::diag(io, prog, &format!("invalid option '{s}'"));
                return Err(1);
            }
        }
    }
    Ok(o)
}

fn convert(prog: &str, args: &[OsString], io: &mut Io, ctx: &Ctx, f: fn(&[u8]) -> Vec<u8>, verb: &str) -> CmdResult {
    let o = match parse(prog, args, io) {
        Ok(o) => o,
        Err(s) => return Ok(s),
    };
    if o.files.is_empty() {
        let mut data = Vec::new();
        io.stdin.read_to_end(&mut data)?;
        io.stdout.write_all(&f(&data))?;
        return Ok(0);
    }
    // `-n IN OUT [IN OUT...]`: pairs; otherwise every operand is converted in place.
    let jobs: Vec<(OsString, OsString)> = if o.new_file {
        if o.files.len() % 2 != 0 {
            crate::diag(io, prog, "option '-n' requires pairs of input and output files");
            return Ok(1);
        }
        o.files.chunks(2).map(|c| (c[0].clone(), c[1].clone())).collect()
    } else {
        o.files.iter().map(|p| (p.clone(), p.clone())).collect()
    };
    let mut status = 0;
    for (input, output) in jobs {
        let path = winux_core::abs_path(ctx, std::path::Path::new(&input));
        let data = match std::fs::read(&path) {
            Ok(d) => d,
            Err(e) => {
                crate::diag(io, prog, &format!("{}: {}", input.to_string_lossy(), crate::err_text(&e)));
                status = 1;
                continue;
            }
        };
        if !o.force && data.contains(&0) {
            if !o.quiet {
                crate::diag(io, prog, &format!("Skipping binary file {}", input.to_string_lossy()));
            }
            continue;
        }
        let out_path = winux_core::abs_path(ctx, std::path::Path::new(&output));
        if let Err(e) = std::fs::write(&out_path, f(&data)) {
            crate::diag(io, prog, &format!("{}: {}", output.to_string_lossy(), crate::err_text(&e)));
            status = 1;
            continue;
        }
        if !o.quiet {
            crate::diag(io, prog, &format!("converting file {} to file {} in {verb} format...", input.to_string_lossy(), output.to_string_lossy()));
        }
    }
    Ok(status)
}

pub fn dos2unix_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    convert("dos2unix", args, io, ctx, dos_to_unix, "Unix")
}

pub fn unix2dos_cmd(args: &[OsString], io: &mut Io, ctx: &Ctx) -> CmdResult {
    convert("unix2dos", args, io, ctx, unix_to_dos, "DOS")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crlf_round_trip_and_idempotence() {
        assert_eq!(dos_to_unix(b"a\r\nb\r\n\r\nc\r"), b"a\nb\n\nc\r");
        assert_eq!(unix_to_dos(b"a\nb\r\nc"), b"a\r\nb\r\nc");
        assert_eq!(unix_to_dos(&unix_to_dos(b"x\ny\n")), b"x\r\ny\r\n");
        assert_eq!(dos_to_unix(&unix_to_dos(b"x\ny\n")), b"x\ny\n");
    }
}
