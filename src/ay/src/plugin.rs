//! `ay plugin`: the one plugin surface of `ay`, read by both plugin hosts.
//!
//! A host (Bun through `@aphrody/omniu`, niu through its oh-my-niu plugin loader) loads the same
//! manifest, emitted by the binary itself so that it cannot drift from the command table:
//!
//! - `ay plugin manifest`: JSON, `{ api, name, version, engine, commands: [{ name, about }], hosts }`.
//! - `ay plugin names`: one command name per line (shell completion).
//!
//! The host adapters live in `system/omniu` (`plugins/ay/plugin.toml` for niu, `src/ay.ts` for Bun).

use clap::CommandFactory;
use serde_json::{json, Value};

/// Schema of the manifest. Hosts refuse a different major.
pub const API: &str = "aphrody:plugin@0.1.0";

/// Every subcommand of `ay` with its one-line description, in the order of `ay --help`.
pub fn commands() -> Vec<(String, String)> {
    crate::Cli::command()
        .get_subcommands()
        .filter(|c| !c.is_hide_set())
        .map(|c| (c.get_name().to_string(), c.get_about().map(|a| a.to_string()).unwrap_or_default()))
        .collect()
}

/// The manifest as a JSON value.
pub fn manifest() -> Value {
    let commands: Vec<Value> = commands().into_iter().map(|(name, about)| json!({ "name": name, "about": about })).collect();
    json!({
        "api": API,
        "name": "ay",
        "version": env!("CARGO_PKG_VERSION"),
        // `ay sh` runs this engine in-process; hosts need no bash of their own to call it.
        "engine": { "name": "rubash", "build": rubash::build_info::build_hash() },
        "commands": commands,
        "hosts": {
            "niu": { "api": "niubash:plugin@0.1.0", "manifest": "system/omniu/plugins/ay/plugin.toml" },
            "bun": { "module": "ay", "entry": "system/omniu/src/ay.ts" },
        },
    })
}

/// `ay plugin <manifest|names>`; returns the exit code.
pub fn run(args: &[String]) -> i32 {
    match args.first().map(String::as_str) {
        None | Some("manifest") => {
            println!("{}", serde_json::to_string_pretty(&manifest()).unwrap_or_default());
            0
        }
        Some("names") => {
            for (name, _) in commands() {
                println!("{name}");
            }
            0
        }
        Some(other) => {
            eprintln!("ay plugin: unknown subcommand {other:?}; usage: ay plugin [manifest|names]");
            2
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_lists_the_real_command_table() {
        let m = manifest();
        assert_eq!(m["api"], API);
        let names: Vec<&str> = m["commands"].as_array().unwrap().iter().map(|c| c["name"].as_str().unwrap()).collect();
        for expected in ["sh", "plugin", "up", "gnu"] {
            assert!(names.contains(&expected), "{expected} missing from {names:?}");
        }
    }

    #[test]
    fn unknown_subcommand_is_a_usage_error() {
        assert_eq!(run(&["nope".to_string()]), 2);
    }
}
