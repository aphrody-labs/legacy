//! External programs that `ay` drives but does not link: `just` recipes and binaries
//! that have not been folded in yet.

use std::path::PathBuf;
use std::process::Command;

/// Environment override for a program: `gamescope-rs` -> `AY_GAMESCOPE_RS`.
pub fn override_var(program: &str) -> String {
    format!("AY_{}", program.to_ascii_uppercase().replace('-', "_"))
}

/// Resolution order: `$AY_<PROGRAM>`, the directory of the running `ay`, the root
/// workspace `target/release`, then `PATH`.
pub fn locate(program: &str) -> PathBuf {
    if let Some(path) = std::env::var_os(override_var(program)).filter(|v| !v.is_empty()) {
        return PathBuf::from(path);
    }
    let file = format!("{program}{}", std::env::consts::EXE_SUFFIX);
    let beside_ay = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|d| d.join(&file)));
    let in_target = Some(crate::repo_root().join("target").join("release").join(&file));
    beside_ay
        .into_iter()
        .chain(in_target)
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from(program))
}

pub fn run_external(program: &str, args: &[String]) -> i32 {
    crate::status_of(Command::new(locate(program)).args(args))
}

/// A Bun package CLI of the monorepo (`system/<name>/src/cli.ts` or `frameworks/<name>/src/cli.ts`, `-ts` suffix where a crate has the same name), run in place by bun with
/// `SRC_ROOT` set: `ay upstream` -> system/upstream.
pub fn run_package(name: &str, args: &[String]) -> i32 {
    let root = crate::repo_root();
    let ts = format!("{name}-ts");
    let cli = ["system", "frameworks"]
        .iter()
        .flat_map(|top| [name, ts.as_str()].map(|d| root.join(top).join(d).join("src").join("cli.ts")))
        .find(|c| c.is_file())
        .unwrap_or_else(|| root.join("system").join(name).join("src").join("cli.ts"));
    if !cli.is_file() {
        eprintln!("ay: {} not found (set SRC_ROOT to the monorepo root)", cli.display());
        return 127;
    }
    crate::status_of(Command::new(locate("bun")).arg(cli).args(args).env("SRC_ROOT", &root))
}

/// The env-kit CLI (`system/env-kit/src/cli.ts`), run in place by bun: `ay auth` and `ay secret`.
/// `SRC_ROOT` is passed on so env-kit finds device/deploy.toml from any working directory.
pub fn run_env_kit(args: &[String]) -> i32 {
    let root = crate::repo_root();
    let cli = root.join("system").join("env-kit").join("src").join("cli.ts");
    if !cli.is_file() {
        eprintln!("ay: {} not found (set SRC_ROOT to the monorepo root)", cli.display());
        return 127;
    }
    crate::status_of(Command::new(locate("bun")).arg(cli).args(args).env("SRC_ROOT", &root))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_variable_names() {
        assert_eq!(override_var("just"), "AY_JUST");
        assert_eq!(override_var("gamescope-rs"), "AY_GAMESCOPE_RS");
    }

    #[test]
    fn falls_back_to_path_lookup() {
        assert_eq!(locate("ay-test-no-such-program"), PathBuf::from("ay-test-no-such-program"));
    }
}
