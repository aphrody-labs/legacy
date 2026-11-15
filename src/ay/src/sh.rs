//! `ay sh`: the embedded rubash engine (GNU Bash 5.3 in Rust, `src/rubash`) driven through its Session API.
//!
//! The arguments are a bash command line, parsed by the engine's own `ShellInvocation` (so `$-`, `-e`, `-o pipefail`,
//! `--posix`... behave as in bash): `ay sh -c CMD [NAME [ARGS...]]`, `ay sh FILE [ARGS...]`, `ay sh -s` or `ay sh`
//! (commands from stdin). The engine is linked, not spawned. It respawns itself for process substitution, coprocs and
//! background jobs as `ay -c BODY`, which `ay::run` routes back here. No interactive REPL: use `niu` for that.

use rubash::api::{RunOptions, Session};
use rubash::invocation::ShellInvocation;

const USAGE: &str = "usage: ay sh [OPTIONS] -c COMMAND [NAME [ARGS...]] | ay sh [OPTIONS] FILE [ARGS...] | ay sh [OPTIONS] (stdin)";

/// What `ay sh` was asked to run, after the engine parsed the command line.
#[derive(Debug, PartialEq)]
pub enum Source {
    Command { text: String },
    File { path: String },
    Stdin,
}

/// Parse a bash command line (options, then command or script). `Err` carries the message to print.
pub fn parse(args: &[String]) -> Result<(ShellInvocation, Source), String> {
    if matches!(args.first().map(String::as_str), Some("-h" | "--help")) {
        return Err(USAGE.to_string());
    }
    let inv = ShellInvocation::parse(args).map_err(|e| format!("ay sh: {e}\n{USAGE}"))?;
    if inv.interactive {
        return Err("ay sh: interactive use is niu's job (the embedded engine runs commands and scripts)".to_string());
    }
    let source = if let Some(text) = inv.command.clone() {
        Source::Command { text }
    } else if let Some(path) = inv.script.clone() {
        Source::File { path }
    } else {
        Source::Stdin
    };
    Ok((inv, source))
}

/// Run the embedded engine; the return value is the shell's exit status.
pub fn run(args: &[String]) -> i32 {
    run_named(args, "ay-sh")
}

/// `run` with the shell name `$0` takes under `-c` when no NAME operand is given: bash uses its own argv[0], so the
/// multicall route (`ay -c BODY`, the engine's respawn, or `exec -a NAME ay -c BODY`) passes the real argv[0].
pub fn run_named(args: &[String], shell_name: &str) -> i32 {
    let (inv, source) = match parse(args) {
        Ok(p) => p,
        Err(msg) => {
            eprintln!("{msg}");
            return if msg == USAGE { 0 } else { 2 };
        }
    };
    // `$0`: the NAME operand of -c, the script path, else the shell name; diagnostics read `<$0>: -c: line N:` as in bash.
    let argv0 = match &source {
        Source::Command { .. } => inv.command_name.clone().unwrap_or_else(|| shell_name.to_string()),
        Source::File { path } => path.clone(),
        Source::Stdin => "ay-sh".to_string(),
    };
    let mut builder = Session::builder().argv0(argv0).process_exit_role(true);
    // bash sets BASH_EXECUTION_STRING for -c; `$-` renders its `c` from it.
    if let Source::Command { text } = &source {
        builder = builder.env("BASH_EXECUTION_STRING", text.clone());
    }
    let mut session = match builder.build() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("ay sh: cannot start the engine: {e:?}");
            return 2;
        }
    };
    if let Err(e) = session.apply_invocation_before_startup(&inv) {
        eprintln!("ay sh: {e}");
        return 2;
    }
    session.set_positional(inv.positional_params.clone());
    let outcome = match source {
        Source::Command { text } => {
            let mut opts = RunOptions::new();
            opts.source_name = Some("-c".to_string());
            session.set_command_string_mode(true);
            let outcome = session.run(&text, &opts);
            session.set_command_string_mode(false);
            outcome
        }
        Source::File { path } => match std::fs::read_to_string(&path) {
            Ok(text) => {
                let mut opts = RunOptions::new();
                opts.source_name = Some(path);
                session.run(&text, &opts)
            }
            Err(e) => {
                eprintln!("ay sh: {path}: {e}");
                return 127;
            }
        },
        Source::Stdin => session.run_stdin(),
    };
    match outcome {
        // `close` runs the EXIT trap and returns the final status.
        Ok(_) => session.close(),
        Err(e) => {
            eprintln!("ay sh: {e:?}");
            2
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &[&str]) -> Vec<String> {
        s.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn parses_the_three_forms() {
        assert_eq!(parse(&[]).unwrap().1, Source::Stdin);
        let (inv, src) = parse(&v(&["-c", "echo $1", "n", "a"])).unwrap();
        assert_eq!(src, Source::Command { text: "echo $1".into() });
        assert_eq!(inv.command_name.as_deref(), Some("n"));
        assert_eq!(inv.positional_params, v(&["a"]));
        let (inv, src) = parse(&v(&["x.sh", "a", "b"])).unwrap();
        assert_eq!(src, Source::File { path: "x.sh".into() });
        assert_eq!(inv.positional_params, v(&["a", "b"]));
        assert!(parse(&v(&["-c"])).is_err());
        assert!(parse(&v(&["-i"])).is_err());
    }

    #[test]
    fn runs_a_command_through_the_engine() {
        assert_eq!(run(&v(&["-c", "exit 7"])), 7);
        assert_eq!(run(&v(&["-c", "[ \"$1-$2\" = a-b ] && exit 0; exit 9", "n", "a", "b"])), 0);
        assert_eq!(run(&v(&["-c", "f() { return 3; }; f"])), 3);
        assert_eq!(run(&v(&["-e", "-c", "false; exit 0"])), 1);
    }
}
