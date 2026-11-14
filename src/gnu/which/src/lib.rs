//! `which`: locate a command in `$PATH` (GNU which 2.x CLI: -a, --skip-dot, --skip-tilde,
//! --show-dot, --show-tilde, --tty-only, -i/--read-alias and friends accepted and ignored).
//! Exit: 0 all found, 1 some not found, 2 bad option, 255 no argument.

use std::env;
use std::ffi::OsString;
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};

#[derive(Default)]
struct Opt {
    all: bool,
    skip_dot: bool,
    skip_tilde: bool,
    show_dot: bool,
    show_tilde: bool,
    tty_only: bool,
}

#[cfg(unix)]
fn is_exec(p: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    let Ok(m) = std::fs::metadata(p) else { return false };
    if !m.is_file() {
        return false;
    }
    let Ok(c) = std::ffi::CString::new(p.as_os_str().as_bytes()) else { return false };
    // SAFETY: `c` is a valid NUL-terminated path for the duration of the call.
    unsafe { libc::access(c.as_ptr(), libc::X_OK) == 0 }
}

#[cfg(not(unix))]
fn is_exec(p: &Path) -> bool {
    p.is_file()
}

/// Candidate file names for `name` in one directory (`PATHEXT` suffixes on Windows).
fn candidates(dir: &Path, name: &str) -> Vec<PathBuf> {
    let mut v = vec![dir.join(name)];
    if cfg!(windows) && Path::new(name).extension().is_none() {
        let ext = env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
        v.extend(ext.split(';').filter(|e| !e.is_empty()).map(|e| dir.join(format!("{name}{e}"))));
    }
    v
}

/// Printable form of a hit: absolute unless `--show-dot`, `~` for `$HOME` with `--show-tilde`.
fn show(o: &Opt, dir: &str, hit: &Path, home: Option<&str>) -> String {
    let h = hit.display().to_string();
    if o.show_dot && !Path::new(dir).is_absolute() && !dir.starts_with('~') {
        return if h.starts_with("./") { h } else { format!("./{h}") };
    }
    let abs = if hit.is_absolute() { hit.to_path_buf() } else { env::current_dir().unwrap_or_default().join(h.strip_prefix("./").unwrap_or(&h)) };
    let s = abs.display().to_string();
    match home {
        Some(h) if o.show_tilde && !h.is_empty() && s.starts_with(h) && s[h.len()..].starts_with('/') => {
            format!("~{}", &s[h.len()..])
        }
        _ => s,
    }
}

/// All matches of `name`, first match only unless `-a`.
fn find(o: &Opt, name: &str, path: &str, home: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    if name.contains('/') || (cfg!(windows) && name.contains('\\')) {
        let p = Path::new(name);
        if candidates(Path::new(""), name).iter().any(|c| is_exec(c)) || is_exec(p) {
            out.push(if p.is_absolute() || o.show_dot { name.to_owned() } else { show(o, "", p, home) });
        }
        return out;
    }
    let sep = if cfg!(windows) { ';' } else { ':' };
    for dir in path.split(sep) {
        if (o.skip_dot && !Path::new(dir).is_absolute() && !dir.starts_with('~')) || (o.skip_tilde && dir.starts_with('~')) {
            continue;
        }
        let base = match (dir.strip_prefix('~'), home) {
            (Some(rest), Some(h)) if rest.is_empty() || rest.starts_with('/') => PathBuf::from(format!("{h}{rest}")),
            _ if dir.is_empty() => PathBuf::from("."),
            _ => PathBuf::from(dir),
        };
        for c in candidates(&base, name) {
            if is_exec(&c) {
                out.push(show(o, dir, &c, home));
                if !o.all {
                    return out;
                }
                break;
            }
        }
    }
    out
}

const HELP: &str = "Usage: PROG [options] [--] COMMAND [...]
Write the full path of COMMAND(s) to standard output.

  --version, -[vV] Print version and exit successfully.
  --help,          Print this help and exit successfully.
  --skip-dot       Skip directories in PATH that start with a dot.
  --skip-tilde     Skip directories in PATH that start with a tilde.
  --show-dot       Don't expand a dot to current directory in output.
  --show-tilde     Output a tilde for HOME directory for non-root.
  --tty-only       Stop processing options on the right if not on tty.
  --all, -a        Print all matches in PATH, not just the first
  --read-alias, -i Accepted, no effect (shell aliases are not read).
  --skip-alias     Accepted, no effect.
  --read-functions Accepted, no effect (shell functions are not read).
  --skip-functions Accepted, no effect.

Rust port of GNU which (aphrody-gnu). Exit status: 0 all found, 1 some not found, 255 usage error.
";

fn version() -> String {
    format!("GNU which v2.25 (Rust port: aphrody-gnu {})\n", env!("CARGO_PKG_VERSION"))
}

pub fn main() -> i32 {
    let mut a = env::args_os();
    let prog = a.next().map_or_else(|| "which".into(), |p| p.to_string_lossy().into_owned());
    run(&prog, a.collect(), &mut std::io::stdout().lock(), &mut std::io::stderr().lock())
}

pub fn run(prog: &str, args: Vec<OsString>, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let usage = HELP.replace("PROG", prog);
    let mut o = Opt::default();
    let mut names = Vec::new();
    let mut opts = true;
    for a in args.iter().map(|a| a.to_string_lossy().into_owned()) {
        if !opts || !a.starts_with('-') || a == "-" {
            names.push(a);
            continue;
        }
        match a.as_str() {
            "--" => opts = false,
            "--all" => o.all = true,
            "--skip-dot" => o.skip_dot = true,
            "--skip-tilde" => o.skip_tilde = true,
            "--show-dot" => o.show_dot = true,
            "--show-tilde" => o.show_tilde = true,
            "--tty-only" => {
                o.tty_only = true;
                if !std::io::stdout().is_terminal() {
                    opts = false;
                }
            }
            "--read-alias" | "--skip-alias" | "--read-functions" | "--skip-functions" => {}
            "--version" => {
                let _ = out.write_all(version().as_bytes());
                return 0;
            }
            "--help" => {
                let _ = out.write_all(usage.as_bytes());
                return 0;
            }
            s if !s.starts_with("--") => {
                for c in s[1..].chars() {
                    match c {
                        'a' => o.all = true,
                        'i' => {}
                        'v' | 'V' => {
                            let _ = out.write_all(version().as_bytes());
                            return 0;
                        }
                        _ => {
                            let _ = write!(err, "{prog}: invalid option -- '{c}'\n{usage}");
                            return 255;
                        }
                    }
                }
            }
            s => {
                let _ = write!(err, "{prog}: unrecognized option '{s}'\n{usage}");
                return 255;
            }
        }
    }
    if names.is_empty() {
        let _ = err.write_all(usage.as_bytes());
        return 255;
    }
    let path = env::var("PATH").unwrap_or_default();
    let home = env::var("HOME").ok();
    let mut rc = 0;
    for n in &names {
        let hits = find(&o, n, &path, home.as_deref());
        if hits.is_empty() {
            let _ = writeln!(err, "{prog}: no {} in ({path})", n.rsplit('/').next().unwrap_or(n));
            rc = 1;
        }
        for h in hits {
            let _ = writeln!(out, "{h}");
        }
    }
    rc
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = env::temp_dir().join(format!("gnu-which-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn touch(p: &Path, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(p, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(p, std::fs::Permissions::from_mode(mode)).unwrap();
    }

    #[test]
    fn first_and_all() {
        let (a, b) = (tmp("a"), tmp("b"));
        touch(&a.join("x"), 0o755);
        touch(&b.join("x"), 0o755);
        touch(&b.join("noexec"), 0o644);
        let path = format!("{}:{}", a.display(), b.display());
        let o = Opt::default();
        assert_eq!(find(&o, "x", &path, None), vec![a.join("x").display().to_string()]);
        let all = Opt { all: true, ..Opt::default() };
        assert_eq!(find(&all, "x", &path, None).len(), 2);
        assert!(find(&o, "noexec", &path, None).is_empty());
        assert!(find(&o, "absent", &path, None).is_empty());
    }

    #[test]
    fn slash_names_and_skip_dot() {
        let d = tmp("s");
        touch(&d.join("p"), 0o755);
        let o = Opt::default();
        let abs = d.join("p").display().to_string();
        assert_eq!(find(&o, &abs, "", None), vec![abs.clone()]);
        let sd = Opt { skip_dot: true, ..Opt::default() };
        assert!(find(&sd, "p", ".", None).is_empty());
    }

    #[test]
    fn tilde_output() {
        let d = tmp("t");
        touch(&d.join("t"), 0o755);
        let o = Opt { show_tilde: true, ..Opt::default() };
        let h = d.display().to_string();
        assert_eq!(find(&o, "t", &h, Some(&h)), vec!["~/t".to_owned()]);
    }

    #[test]
    fn exit_codes() {
        let (mut out, mut err) = (Vec::new(), Vec::new());
        assert_eq!(run("which", vec![], &mut out, &mut err), 255);
        assert_eq!(run("which", vec!["--bogus".into()], &mut out, &mut err), 255);
        assert_eq!(run("which", vec!["--version".into()], &mut out, &mut err), 0);
        assert_eq!(run("which", vec!["gnu-which-no-such-cmd-xyz".into()], &mut out, &mut err), 1);
    }
}
