use std::io::{Read, Write};
use std::process::ExitCode;

const USAGE: &str = "usage: py2bun [FILE|-] [-o OUT] [--json] [--strict]\n  FILE  Python source ('-' or absent: stdin); -o: output path (default stdout)\n  --json    print diagnostics as JSON lines on stderr\n  --strict  exit 1 if any diagnostic (warnings included)\nexit: 0 ok, 1 diagnostics (errors; or any with --strict), 2 usage/io";

fn main() -> ExitCode {
    let mut input: Option<String> = None;
    let mut out: Option<String> = None;
    let (mut json, mut strict) = (false, false);
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "-o" | "--output" => out = it.next(),
            "--json" => json = true,
            "--strict" => strict = true,
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            _ => input = Some(a),
        }
    }
    let mut src = String::new();
    match input.as_deref() {
        None | Some("-") => {
            if std::io::stdin().read_to_string(&mut src).is_err() {
                eprintln!("py2bun: cannot read stdin");
                return ExitCode::from(2);
            }
        }
        Some(p) => match std::fs::read(p) {
            Ok(b) => src = String::from_utf8_lossy(&b).into_owned(),
            Err(e) => {
                eprintln!("py2bun: {p}: {e}");
                return ExitCode::from(2);
            }
        },
    }
    let res = py2bun::transpile(&src);
    for d in &res.diagnostics {
        if json {
            eprintln!(
                "{{\"line\":{},\"col\":{},\"severity\":\"{}\",\"message\":{:?}}}",
                d.line,
                d.col,
                if d.severity == py2bun::Severity::Error { "error" } else { "warning" },
                d.message
            );
        } else {
            eprintln!("{}: {d}", input.as_deref().unwrap_or("<stdin>"));
        }
    }
    let syntax_fail = res.ts.is_empty();
    if !syntax_fail {
        match out {
            Some(p) => {
                if let Err(e) = std::fs::write(&p, &res.ts) {
                    eprintln!("py2bun: {p}: {e}");
                    return ExitCode::from(2);
                }
            }
            None => {
                let _ = std::io::stdout().write_all(res.ts.as_bytes());
            }
        }
    }
    if syntax_fail || res.has_errors() || (strict && !res.diagnostics.is_empty()) {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}
