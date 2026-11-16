//! Applets ported from WinuxCmd's C++ to portable Rust, in the shape contract of `winux-cmds`: `run(args, &mut Io, &Ctx) -> CmdResult`,
//! IO injected, cwd and environment explicit, no process-global state. Unlike `winux-cmds` (Win32), these build and run on every host,
//! so they are tested on Linux against the GNU/util-linux originals. Registry: [`registry`]; the provider table of `ay applet` lists
//! every name here as `winux`.

use std::ffi::OsString;

use winux_core::{CmdResult, Ctx, Io};

pub mod envsubst;
pub mod eol;
pub mod look;
pub mod strings;

pub type CmdFn = fn(&[OsString], &mut Io, &Ctx) -> CmdResult;

/// Command name -> library function.
pub fn registry() -> Vec<(&'static str, CmdFn)> {
    vec![
        ("dos2unix", eol::dos2unix_cmd),
        ("d2u", eol::dos2unix_cmd),
        ("unix2dos", eol::unix2dos_cmd),
        ("u2d", eol::unix2dos_cmd),
        ("envsubst", envsubst::envsubst_cmd),
        ("look", look::look_cmd),
        ("strings", strings::strings_cmd),
    ]
}

/// Look up and run a command; `None` for names this crate does not carry.
pub fn dispatch(name: &str, args: &[OsString], io: &mut Io, ctx: &Ctx) -> Option<CmdResult> {
    registry().into_iter().find(|(n, _)| *n == name).map(|(_, f)| f(args, io, ctx))
}

/// Write a diagnostic `prog: msg` to stderr.
pub(crate) fn diag(io: &mut Io, prog: &str, msg: &str) {
    let _ = writeln!(io.stderr, "{prog}: {msg}");
}

use std::io::Write as _;

/// An I/O error as GNU tools print it: no `(os error N)` suffix.
pub(crate) fn err_text(e: &std::io::Error) -> String {
    let s = e.to_string();
    match s.find(" (os error") {
        Some(i) => s[..i].to_string(),
        None => s,
    }
}
