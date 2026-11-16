//! `ay agents`: the ai-os orchestrator (`frameworks/ai-os/src/cli.ts orch`), run in place by bun
//! from `frameworks/ai-os`, as `just orch` does. `ay agents run <workflow.json>`, `ay agents plan
//! "<goal>"`, `ay agents lifecycle --task ...`; see frameworks/ai-os/docs/ORCHESTRATOR.md.
//! `ay agents install|sync|check|list` drive the agent toolchain instead (skills, plugins, MCP for Claude Code,
//! Codex, agy, Gemini CLI): `system/machine-ts/src/toolchain.ts`, manifest tools/agents/toolchain.toml.

use std::process::Command;

/// `--help`/`-h`/`help` alone become no argument: ai-os `orch` prints its usage then (its parser
/// rejects `--help`).
pub fn argv(args: &[String]) -> Vec<String> {
    let rest: &[String] = if is_help(args) { &[] } else { args };
    ["src/cli.ts".to_string(), "orch".to_string()].into_iter().chain(rest.iter().cloned()).collect()
}

fn is_help(args: &[String]) -> bool {
    matches!(args, [a] if a == "--help" || a == "-h" || a == "help")
}

/// Toolchain verbs, routed to system/machine-ts/src/toolchain.ts rather than the orchestrator.
pub fn is_toolchain(args: &[String]) -> bool {
    matches!(args.first().map(String::as_str), Some("install" | "sync" | "check" | "list"))
}

pub fn run(args: &[String]) -> i32 {
    let root = crate::repo_root();
    if is_toolchain(args) {
        let cli = root.join("system").join("machine-ts").join("src").join("toolchain.ts");
        if !cli.is_file() {
            eprintln!("ay agents: {} not found (set SRC_ROOT to the monorepo root)", cli.display());
            return 127;
        }
        return crate::status_of(Command::new(crate::exec::locate("bun")).arg(cli).args(args).env("SRC_ROOT", &root));
    }
    let dir = root.join("frameworks").join("ai-os");
    if !dir.join("src").join("cli.ts").is_file() {
        eprintln!("ay agents: {} not found (set SRC_ROOT to the monorepo root)", dir.display());
        return 127;
    }
    let code = crate::status_of(Command::new(crate::exec::locate("bun")).arg("run").args(argv(args)).current_dir(&dir).env("SRC_ROOT", &root));
    // The usage printed for --help is a success, whatever exit code `orch` gives a bare call.
    if is_help(args) && code != 127 { 0 } else { code }
}

#[cfg(test)]
mod tests {
    #[test]
    fn toolchain_verbs() {
        assert!(super::is_toolchain(&["sync".into()]));
        assert!(super::is_toolchain(&["list".into(), "--json".into()]));
        assert!(!super::is_toolchain(&["plan".into(), "goal".into()]));
        assert!(!super::is_toolchain(&[]));
    }

    #[test]
    fn orch_argv() {
        assert_eq!(super::argv(&["plan".into(), "goal".into()]), ["src/cli.ts", "orch", "plan", "goal"]);
        assert_eq!(super::argv(&["--help".into()]), ["src/cli.ts", "orch"]);
        assert_eq!(super::argv(&["run".into(), "--help".into()]), ["src/cli.ts", "orch", "run", "--help"]);
    }
}
