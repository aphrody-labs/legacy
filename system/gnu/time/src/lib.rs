//! `time`: run a command and report its resource usage (GNU time 1.9 CLI: -a -f -o -p -q -v -V,
//! `$TIME`, the `%` format letters). Unix reads `wait4` rusage; elsewhere only the wall clock
//! is known and the other fields are zero.

use std::fs::OpenOptions;
use std::io::Write;
use std::process::Command;
use std::time::Instant;

pub const DEFAULT_FMT: &str = "%Uuser %Ssystem %Eelapsed %PCPU (%Xavgtext+%Davgdata %Mmaxresident)k\n%Iinputs+%Ooutputs (%Fmajor+%Rminor)pagefaults %Wswaps";
pub const POSIX_FMT: &str = "real %e\nuser %U\nsys %S";
pub const VERBOSE_FMT: &str = "\tCommand being timed: \"%C\"\n\tUser time (seconds): %U\n\tSystem time (seconds): %S\n\tPercent of CPU this job got: %P\n\tElapsed (wall clock) time (h:mm:ss or m:ss): %E\n\tAverage shared text size (kbytes): %X\n\tAverage unshared data size (kbytes): %D\n\tAverage stack size (kbytes): %p\n\tAverage total size (kbytes): %K\n\tMaximum resident set size (kbytes): %M\n\tAverage resident set size (kbytes): %t\n\tMajor (requiring I/O) page faults: %F\n\tMinor (reclaiming a frame) page faults: %R\n\tVoluntary context switches: %w\n\tInvoluntary context switches: %c\n\tSwaps: %W\n\tFile system inputs: %I\n\tFile system outputs: %O\n\tSocket messages sent: %s\n\tSocket messages received: %r\n\tSignals delivered: %k\n\tPage size (bytes): %Z\n\tExit status: %x";

/// What one run cost; times in seconds, memory in kbytes, counters raw.
#[derive(Default, Debug, Clone, PartialEq)]
pub struct Stats {
    pub real: f64,
    pub user: f64,
    pub sys: f64,
    pub maxrss: i64,
    pub ixrss: i64,
    pub idrss: i64,
    pub isrss: i64,
    pub minflt: i64,
    pub majflt: i64,
    pub nswap: i64,
    pub inblock: i64,
    pub oublock: i64,
    pub msgsnd: i64,
    pub msgrcv: i64,
    pub nsignals: i64,
    pub nvcsw: i64,
    pub nivcsw: i64,
    pub pagesize: i64,
    pub status: i32,
    /// Terminating signal (0: the command exited).
    pub sig: i32,
}

fn sigspec(n: i32) -> &'static str {
    const N: [&str; 32] = [
        "", "HUP", "INT", "QUIT", "ILL", "TRAP", "ABRT", "BUS", "FPE", "KILL", "USR1", "SEGV", "USR2", "PIPE", "ALRM", "TERM", "STKFLT", "CHLD", "CONT", "STOP", "TSTP",
        "TTIN", "TTOU", "URG", "XCPU", "XFSZ", "VTALRM", "PROF", "WINCH", "IO", "PWR", "SYS",
    ];
    usize::try_from(n).ok().and_then(|i| N.get(i)).copied().unwrap_or("")
}

fn elapsed(t: f64) -> String {
    let (h, m) = ((t / 3600.0) as u64, ((t % 3600.0) / 60.0) as u64);
    let s = t - (h * 3600 + m * 60) as f64;
    if h > 0 { format!("{h}:{m:02}:{:02}", s as u64) } else { format!("{m}:{s:05.2}") }
}

/// Expand the `%` letters of `fmt`; `\n` `\t` `\\` are escapes, `%` plus an unknown letter is kept.
pub fn format(fmt: &str, st: &Stats, cmd: &str) -> String {
    let mut o = String::new();
    let mut it = fmt.chars();
    while let Some(c) = it.next() {
        match c {
            '\\' => match it.next() {
                Some('n') => o.push('\n'),
                Some('t') => o.push('\t'),
                Some('\\') => o.push('\\'),
                Some(x) => o.extend(['?', '\\', x]),
                None => o.push_str("?\\"),
            },
            '%' => {
                let Some(l) = it.next() else {
                    o.push('%');
                    break;
                };
                let n = |v: i64| v.to_string();
                let s = match l {
                    '%' => "%".into(),
                    'C' => cmd.to_owned(),
                    'D' => n(st.idrss),
                    'E' => elapsed(st.real),
                    'F' => n(st.majflt),
                    'I' => n(st.inblock),
                    'K' => n(st.ixrss + st.idrss + st.isrss),
                    'M' => n(st.maxrss),
                    'O' => n(st.oublock),
                    'P' if st.real > 0.0 => format!("{}%", ((st.user + st.sys) / st.real * 100.0) as i64),
                    'P' => "?%".into(),
                    'R' => n(st.minflt),
                    'S' => format!("{:.2}", st.sys),
                    'U' => format!("{:.2}", st.user),
                    'W' => n(st.nswap),
                    'X' => n(st.ixrss),
                    'Z' => n(st.pagesize),
                    'c' => n(st.nivcsw),
                    'e' => format!("{:.2}", st.real),
                    'k' => n(st.nsignals),
                    'p' => n(st.isrss),
                    'r' => n(st.msgrcv),
                    's' => n(st.msgsnd),
                    't' => "0".into(),
                    'w' => n(st.nvcsw),
                    'x' => st.status.to_string(),
                    'T' => match it.next() {
                        Some('t') => (if st.sig != 0 { "signalled" } else { "normal" }).into(),
                        Some('x') if st.sig == 0 => st.status.to_string(),
                        Some('n') if st.sig != 0 => st.sig.to_string(),
                        Some('s') => sigspec(st.sig).into(),
                        Some('o') if st.sig == 0 && st.status == 0 => "ok".into(),
                        _ => String::new(),
                    },
                    x => format!("%{x}"),
                };
                o.push_str(&s);
            }
            c => o.push(c),
        }
    }
    o
}

#[cfg(unix)]
fn tv(t: libc::timeval) -> f64 {
    t.tv_sec as f64 + t.tv_usec as f64 / 1e6
}

/// Spawn and reap `argv`; the exit status is `Ok(code)` or `Err(signal)`.
#[cfg(unix)]
fn run_cmd(argv: &[String]) -> std::io::Result<(Stats, Result<i32, i32>)> {
    let t0 = Instant::now();
    let child = Command::new(&argv[0]).args(&argv[1..]).spawn()?;
    // SAFETY: zeroed rusage is a valid out-parameter; `pid` is our own unreaped child.
    let (st, ru) = unsafe {
        let (mut st, mut ru): (libc::c_int, libc::rusage) = (0, std::mem::zeroed());
        while libc::wait4(child.id() as libc::pid_t, &raw mut st, 0, &raw mut ru) < 0 {
            let e = std::io::Error::last_os_error();
            if e.kind() != std::io::ErrorKind::Interrupted {
                return Err(e);
            }
        }
        (st, ru)
    };
    let real = t0.elapsed().as_secs_f64();
    let res = if libc::WIFSIGNALED(st) { Err(libc::WTERMSIG(st)) } else { Ok(libc::WEXITSTATUS(st)) };
    // SAFETY: sysconf has no preconditions.
    let pagesize = unsafe { libc::sysconf(libc::_SC_PAGESIZE) } as i64;
    let s = Stats {
        real,
        user: tv(ru.ru_utime),
        sys: tv(ru.ru_stime),
        maxrss: ru.ru_maxrss,
        ixrss: ru.ru_ixrss,
        idrss: ru.ru_idrss,
        isrss: ru.ru_isrss,
        minflt: ru.ru_minflt,
        majflt: ru.ru_majflt,
        nswap: ru.ru_nswap,
        inblock: ru.ru_inblock,
        oublock: ru.ru_oublock,
        msgsnd: ru.ru_msgsnd,
        msgrcv: ru.ru_msgrcv,
        nsignals: ru.ru_nsignals,
        nvcsw: ru.ru_nvcsw,
        nivcsw: ru.ru_nivcsw,
        pagesize,
        status: res.unwrap_or_else(|s| s),
        sig: res.err().unwrap_or(0),
    };
    Ok((s, res))
}

#[cfg(not(unix))]
fn run_cmd(argv: &[String]) -> std::io::Result<(Stats, Result<i32, i32>)> {
    let t0 = Instant::now();
    let c = Command::new(&argv[0]).args(&argv[1..]).status()?.code().unwrap_or(1);
    Ok((Stats { real: t0.elapsed().as_secs_f64(), status: c, pagesize: 4096, ..Stats::default() }, Ok(c)))
}

const HELP: &str = "Usage: PROG [OPTIONS] COMMAND [ARG]...
Run COMMAND, then print system resource usage.

  -a, --append              with -o FILE, append instead of overwriting
  -f, --format=FORMAT       use the specified FORMAT instead of the default
  -o, --output=FILE         write to FILE instead of STDERR
  -p, --portability         print POSIX standard 1003.2 conformant string:
                              real %e
                              user %U
                              sys %S
  -q, --quiet               do not print information about abnormal program
                            termination (non-zero exit codes or signals)
  -v, --verbose             print all resource usage information instead of
                            the default format
       --help               display this help and exit
  -V,  --version            output version information and exit

Format sequences for -f/--format: %% %C %D %E %F %I %K %M %O %P %R %S %U %W %X %Z
%c %e %k %p %r %s %t %w %x, and %Tt (exit type normal/signalled), %Tx (exit code if
exited), %Tn (signal number), %Ts (signal name), %To ('ok' if exited with code 0).
An unknown backslash escape prints '?\\' followed by the character.

Default output format:
%Uuser %Ssystem %Eelapsed %PCPU (%Xavgtext+%Davgdata %Mmaxresident)k
%Iinputs+%Ooutputs (%Fmajor+%Rminor)pagefaults %Wswaps

Rust port of GNU time (aphrody-gnu); the exit status is the command's (125: time itself failed, 126/127: could not run it).
";

pub fn main() -> i32 {
    let mut a = std::env::args();
    let prog = a.next().unwrap_or_else(|| "time".into());
    run(&prog, a.collect(), &mut std::io::stdout().lock(), &mut std::io::stderr().lock())
}

/// `args` after argv[0]; the report goes to `-o FILE` or to `err`.
pub fn run(prog: &str, args: Vec<String>, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let mut fmt: Option<String> = None;
    let (mut append, mut quiet, mut verbose, mut posix, mut outf) = (false, false, false, false, None::<String>);
    let mut i = 0;
    let bad = |m: String, err: &mut dyn Write| {
        let _ = write!(err, "{prog}: {m}\nTry '{prog} --help' for more information.\n");
        125
    };
    let version = |out: &mut dyn Write| {
        let _ = writeln!(out, "time (GNU Time) 1.10\nRust port: aphrody-gnu {} (MIT OR Apache-2.0)", env!("CARGO_PKG_VERSION"));
    };
    while i < args.len() {
        let a = args[i].as_str();
        if a == "--" {
            i += 1;
            break;
        }
        if !a.starts_with('-') || a == "-" {
            break;
        }
        let long = a.strip_prefix("--");
        match long {
            Some("append") => append = true,
            Some("portability") => {
                posix = true;
                fmt = Some(POSIX_FMT.into());
            }
            Some("verbose") => verbose = true,
            Some("quiet") => quiet = true,
            Some("help") => {
                let _ = out.write_all(HELP.replace("PROG", prog).as_bytes());
                return 0;
            }
            Some("version") => {
                version(out);
                return 0;
            }
            Some(l) if l.starts_with("format=") => fmt = Some(l[7..].to_owned()),
            Some(l) if l.starts_with("output=") => outf = Some(l[7..].to_owned()),
            Some("format" | "output") => {
                i += 1;
                let Some(v) = args.get(i) else { return bad(format!("option '{a}' requires an argument"), err) };
                if a == "--format" { fmt = Some(v.clone()) } else { outf = Some(v.clone()) }
            }
            Some(l) => return bad(format!("unrecognized option '--{l}'"), err),
            None => {
                let cs: Vec<char> = a[1..].chars().collect();
                let mut k = 0;
                while k < cs.len() {
                    match cs[k] {
                        'a' => append = true,
                        'p' => {
                            posix = true;
                            fmt = Some(POSIX_FMT.into());
                        }
                        'v' => verbose = true,
                        'q' => quiet = true,
                        'V' => {
                            version(out);
                            return 0;
                        }
                        c @ ('f' | 'o') => {
                            let v = if k + 1 < cs.len() {
                                cs[k + 1..].iter().collect()
                            } else {
                                i += 1;
                                match args.get(i) {
                                    Some(v) => v.clone(),
                                    None => return bad(format!("option requires an argument -- '{c}'"), err),
                                }
                            };
                            if c == 'f' { fmt = Some(v) } else { outf = Some(v) }
                            k = cs.len();
                            continue;
                        }
                        c => return bad(format!("invalid option -- '{c}'"), err),
                    }
                    k += 1;
                }
            }
        }
        i += 1;
    }
    let argv = &args[i.min(args.len())..];
    if argv.is_empty() {
        return bad("missing program to run".into(), err);
    }
    let fmt = if verbose { Some(VERBOSE_FMT.to_owned()) } else { fmt.or_else(|| std::env::var("TIME").ok()) };
    let (st, res) = match run_cmd(argv) {
        Ok(r) => r,
        Err(e) => {
            let _ = writeln!(err, "{prog}: cannot run {}: {e}", argv[0]);
            return if e.kind() == std::io::ErrorKind::NotFound { 127 } else { 126 };
        }
    };
    let mut rep = String::new();
    if !quiet && !(posix && !verbose) {
        match res {
            Err(s) => rep.push_str(&format!("Command terminated by signal {s}\n")),
            Ok(c) if c != 0 => rep.push_str(&format!("Command exited with non-zero status {c}\n")),
            Ok(_) => {}
        }
    }
    rep.push_str(&format(fmt.as_deref().unwrap_or(DEFAULT_FMT), &st, &argv.join(" ")));
    rep.push('\n');
    match outf {
        Some(p) => match OpenOptions::new().create(true).write(true).append(append).truncate(!append).open(&p) {
            Ok(mut f) => {
                let _ = f.write_all(rep.as_bytes());
            }
            Err(e) => {
                let _ = writeln!(err, "{prog}: {p}: {e}");
                return 125;
            }
        },
        None => {
            let _ = err.write_all(rep.as_bytes());
        }
    }
    st.status
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st() -> Stats {
        Stats { real: 2.0, user: 0.5, sys: 0.25, maxrss: 1024, majflt: 3, minflt: 9, status: 7, ..Stats::default() }
    }

    #[test]
    fn letters() {
        assert_eq!(format("%e %U %S %P %M %F %R %x %%", &st(), "c"), "2.00 0.50 0.25 37% 1024 3 9 7 %");
        assert_eq!(format("%C|%q|\\t|\\n", &st(), "ls -l"), "ls -l|%q|\t|\n");
    }

    #[test]
    fn elapsed_forms() {
        assert_eq!(elapsed(2.0), "0:02.00");
        assert_eq!(elapsed(75.5), "1:15.50");
        assert_eq!(elapsed(3725.0), "1:02:05");
    }

    #[test]
    fn zero_elapsed_percent() {
        assert_eq!(format("%P", &Stats::default(), ""), "?%");
    }

    #[cfg(unix)]
    #[test]
    fn runs_and_reports_status() {
        let mut e = Vec::new();
        let rc = run("time", vec!["-p".into(), "sh".into(), "-c".into(), "exit 3".into()], &mut Vec::new(), &mut e);
        let t = String::from_utf8(e).unwrap();
        assert_eq!(rc, 3);
        assert!(t.starts_with("real "), "{t}");
        let mut e = Vec::new();
        assert_eq!(run("time", vec!["sh".into(), "-c".into(), "exit 3".into()], &mut Vec::new(), &mut e), 3);
        assert!(String::from_utf8(e).unwrap().starts_with("Command exited with non-zero status 3\n"));
        let rc = run("time", vec!["gnu-time-no-such-cmd".into()], &mut Vec::new(), &mut Vec::new());
        assert_eq!(rc, 127);
    }

    #[cfg(unix)]
    #[test]
    fn output_file_append() {
        let p = std::env::temp_dir().join(format!("gnu-time-{}", std::process::id()));
        let _ = std::fs::remove_file(&p);
        for _ in 0..2 {
            let a = ["-a", "-o", p.to_str().unwrap(), "-f", "x%x", "true"].map(String::from).to_vec();
            assert_eq!(run("time", a, &mut Vec::new(), &mut Vec::new()), 0);
        }
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "x0\nx0\n");
    }
}
