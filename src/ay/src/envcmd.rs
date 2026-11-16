//! In-process `ay env`: inspect a dotenv file with redaction (aphrody-env).
//!
//!   ay env [--file path] [--required A,B] [--service name]
//!
//! Prints JSON `{ "path", "keys": { NAME: "UNSET" | "SET [len=N]" } }`; values are never printed.
//! Exit 1 when a required key is missing from both the file and the process environment.

use aphrody_env::{load_monorepo_env, LoadOptions};
use std::path::PathBuf;

const USAGE: &str = "ay env [--file path] [--required A,B] [--service name]   values are never printed: UNSET or SET [len=N]";

pub fn run(args: &[String]) -> i32 {
    let mut file: Option<PathBuf> = None;
    let mut required: Vec<String> = Vec::new();
    let mut service: Option<String> = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--file" => file = it.next().map(PathBuf::from),
            "--required" => {
                required = it.next().map(|v| v.split(',').filter(|s| !s.is_empty()).map(str::to_owned).collect()).unwrap_or_default();
            }
            "--service" => service = it.next().cloned(),
            "-h" | "--help" => {
                println!("{USAGE}");
                return 0;
            }
            other => {
                eprintln!("ay env: unknown argument {other}\n{USAGE}");
                return 2;
            }
        }
    }
    let req: Vec<&str> = required.iter().map(String::as_str).collect();
    let opts = LoadOptions { env_path: file.as_deref(), service: service.as_deref(), required: &req, ..LoadOptions::default() };
    match load_monorepo_env(opts) {
        Ok(env) => {
            let keys: serde_json::Map<String, serde_json::Value> = env
                .keys()
                .map(|k| {
                    let status = match env.get_secret(k) {
                        Some(s) if !s.is_empty() => format!("SET [len={}]", s.len()),
                        _ => "UNSET".to_owned(),
                    };
                    (k.to_owned(), serde_json::Value::String(status))
                })
                .collect();
            let out = serde_json::json!({ "path": env.env_path(), "keys": keys });
            println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
            0
        }
        Err(e) => {
            eprintln!("ay env: {e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn rejects_unknown_flags_and_reports_missing_required() {
        assert_eq!(run(&v(&["--bogus"])), 2);
        let dir = std::env::temp_dir().join("ay-env-test-missing");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(".env");
        std::fs::write(&file, "A_TOKEN=abc\n").unwrap();
        let f = file.to_string_lossy().into_owned();
        assert_eq!(run(&v(&["--file", &f, "--required", "A_TOKEN"])), 0);
        assert_eq!(run(&v(&["--file", &f, "--required", "AY_ENV_TEST_NOPE_XYZ"])), 1);
    }
}
