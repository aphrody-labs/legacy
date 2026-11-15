use std::io::{Read, Write};
use std::process::ExitCode;

const USAGE: &str = "usage: py2bun-rs [FILE|-] [-o|--output OUT] [--json] [--strict]\n  FILE  Python source ('-' or absent: stdin); -o: output path (default stdout)\n  --json    print diagnostics as JSON lines on stderr\n  --strict  exit 1 if any diagnostic (warnings included)\n  --async / --sync  force async (await every call) or sync output; default: async when the script uses Ghidra\nexit: 0 ok, 1 diagnostics (errors; or any with --strict), 2 usage/io";

fn main() -> ExitCode {
    let mut input: Option<String> = None;
    let mut out: Option<String> = None;
    let (mut json, mut strict) = (false, false);
    let mut mode = py2bun::AsyncMode::Auto;
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "-o" | "--output" => match it.next() {
                Some(v) => out = Some(v),
                None => {
                    eprintln!("py2bun: {a} needs a value\n{USAGE}");
                    return ExitCode::from(2);
                }
            },
            "--json" => json = true,
            "--strict" => strict = true,
            "--async" => mode = py2bun::AsyncMode::On,
            "--sync" => mode = py2bun::AsyncMode::Off,
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            f if f.starts_with('-') && f != "-" => {
                eprintln!("py2bun: unknown option {f}\n{USAGE}");
                return ExitCode::from(2);
            }
            _ => {
                if input.is_some() {
                    eprintln!("py2bun: more than one input file\n{USAGE}");
                    return ExitCode::from(2);
                }
                input = Some(a)
            }
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
            Ok(b) => match String::from_utf8(b) {
                Ok(t) => src = t,
                Err(e) => {
                    eprintln!("py2bun: {p}: not valid UTF-8 ({e})");
                    return ExitCode::from(2);
                }
            },
            Err(e) => {
                eprintln!("py2bun: {p}: {e}");
                return ExitCode::from(2);
            }
        },
    }
    let res = py2bun::transpile_with(&src, mode);
    for d in &res.diagnostics {
        if json {
            eprintln!(
                "{{\"line\":{},\"col\":{},\"severity\":\"{}\",\"message\":{}}}",
                d.line,
                d.col,
                if d.severity == py2bun::Severity::Error { "error" } else { "warning" },
                json_str(&d.message)
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
                if let Err(e) = std::io::stdout().write_all(res.ts.as_bytes()) {
                    if e.kind() != std::io::ErrorKind::BrokenPipe {
                        eprintln!("py2bun: cannot write stdout: {e}");
                        return ExitCode::from(2);
                    }
                }
            }
        }
    }
    if syntax_fail || res.has_errors() || (strict && !res.diagnostics.is_empty()) {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

/// JSON string literal (Rust `{:?}` would emit invalid escapes such as `\u{1b}`).
fn json_str(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}
