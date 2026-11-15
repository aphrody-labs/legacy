//! `ay electron`: analyze an Electron app, migrate it to Tauri (aphrody-labs fork) or GPUI, optimize the
//! generated project, and benchmark the original against the migrated build. Thin wiring: the logic
//! lives in `aphrody-electron-migrate` (src/electron-migrate).

use clap::{Args, Subcommand, ValueEnum};
use electron_migrate::analyze::{self, Options};
use electron_migrate::bench::{self, AppSpec, BenchOptions, ProbeOptions, Ready};
use electron_migrate::map::Target;
use electron_migrate::migrate::{self, MigrateOptions};
use electron_migrate::optimize::{self, OptimizeOptions};
use std::path::PathBuf;

#[derive(Args, Debug, PartialEq)]
pub struct ElectronArgs {
    #[command(subcommand)]
    pub cmd: ElectronCmd,
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum To {
    Tauri,
    Gpui,
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadyMode {
    Cdp,
    Alive,
}

#[derive(Subcommand, Debug, PartialEq)]
pub enum ElectronCmd {
    /// Unpack an app dir or app.asar (+ .unpacked) and emit a JSON manifest: windows, preloads, IPC channels, bridges, Node APIs, natives, protocols, menus, tray, updater, deep links
    Analyze {
        /// App directory, install directory (resources/app.asar is found) or app.asar
        input: PathBuf,
        /// Write the manifest here instead of stdout
        #[arg(long)]
        out: Option<PathBuf>,
        /// Also scan node_modules JavaScript (slow)
        #[arg(long)]
        node_modules: bool,
    },
    /// Generate a Tauri v3 (aphrody-labs fork) or GPUI project, MAPPING.md and coverage.json
    Migrate {
        #[arg(long, value_enum)]
        to: To,
        input: PathBuf,
        #[arg(long)]
        out: PathBuf,
        /// Do not copy the original main-process files into sidecar/app/
        #[arg(long)]
        no_sidecar_app: bool,
        /// Print the report as JSON
        #[arg(long)]
        json: bool,
    },
    /// Release profile (fat LTO), PGO script and Bun --compile --minify --bytecode build for a generated project
    Optimize {
        project: PathBuf,
        /// Cargo opt-level: 3, 2, 1, s or z (default s for Tauri, 3 for GPUI)
        #[arg(long)]
        opt_level: Option<String>,
        /// Run bun and cargo builds and report sizes after
        #[arg(long)]
        build: bool,
        #[arg(long)]
        json: bool,
    },
    /// hyperfine cold start, RSS, binary size and IPC round trip: Electron vs migrated
    Bench {
        /// Electron app executable
        #[arg(long)]
        electron: Option<PathBuf>,
        /// Migrated app executable
        #[arg(long)]
        migrated: Option<PathBuf>,
        #[arg(long, default_value_t = 10)]
        runs: u32,
        #[arg(long, default_value_t = 2)]
        warmup: u32,
        /// Wait after readiness before sampling RSS
        #[arg(long, default_value_t = 3000)]
        settle_ms: u64,
        #[arg(long, default_value_t = 30_000)]
        timeout_ms: u64,
        #[arg(long, value_enum, default_value = "cdp")]
        ready: ReadyMode,
        /// Page-side expression awaited for the Electron IPC round trip, e.g. `window.electronAPI.getVersion()`
        #[arg(long)]
        ipc_expr_electron: Option<String>,
        /// Defaults to the migrated shim's built-in ping
        #[arg(long)]
        ipc_expr_migrated: Option<String>,
        #[arg(long, default_value_t = 200)]
        ipc_iters: u32,
        #[arg(long = "electron-arg", allow_hyphen_values = true)]
        electron_args: Vec<String>,
        #[arg(long = "migrated-arg", allow_hyphen_values = true)]
        migrated_args: Vec<String>,
        #[arg(long, default_value_t = 9331)]
        port_electron: u16,
        #[arg(long, default_value_t = 9332)]
        port_migrated: u16,
        /// Write the JSON report here (a .md table is written next to it)
        #[arg(long)]
        out: Option<PathBuf>,
        /// Print JSON instead of the Markdown table
        #[arg(long)]
        json: bool,
    },
    /// One launch measured for `bench` (hyperfine times this command)
    #[command(hide = true)]
    BenchProbe {
        #[arg(long)]
        exe: PathBuf,
        #[arg(long)]
        port: u16,
        #[arg(long, default_value_t = 30_000)]
        timeout_ms: u64,
        #[arg(long, default_value_t = 0)]
        settle_ms: u64,
        #[arg(long, value_enum, default_value = "cdp")]
        ready: ReadyMode,
        #[arg(long)]
        no_rss: bool,
        #[arg(long)]
        ipc_expr: Option<String>,
        #[arg(long, default_value_t = 200)]
        ipc_iters: u32,
        #[arg(long = "arg", allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

fn ready_of(m: ReadyMode) -> Ready {
    match m {
        ReadyMode::Cdp => Ready::Cdp,
        ReadyMode::Alive => Ready::Alive,
    }
}

pub fn run(a: ElectronArgs) -> i32 {
    match exec(a.cmd) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("ay electron: {e}");
            1
        }
    }
}

fn exec(cmd: ElectronCmd) -> electron_migrate::Result<i32> {
    match cmd {
        ElectronCmd::Analyze { input, out, node_modules } => {
            let opts = Options { scan_node_modules: node_modules, ..Options::default() };
            let (manifest, _) = analyze::analyze_path(&input, &opts)?;
            let json = analyze::to_json(&manifest);
            match out {
                Some(path) => {
                    std::fs::write(&path, &json).map_err(|e| electron_migrate::Error::Io { path: path.clone(), source: e })?;
                    print!("{}", analyze::summary(&manifest));
                    println!("manifest: {}", path.display());
                }
                None => {
                    println!("{json}");
                    eprint!("{}", analyze::summary(&manifest));
                }
            }
            Ok(0)
        }
        ElectronCmd::Migrate { to, input, out, no_sidecar_app, json } => {
            let target = match to {
                To::Tauri => Target::Tauri,
                To::Gpui => Target::Gpui,
            };
            let rep = migrate::migrate(&input, &MigrateOptions { target, out, copy_main: !no_sidecar_app, analyze: Options::default() })?;
            if json {
                println!("{}", serde_json::to_string_pretty(&rep)?);
            } else {
                let c = &rep.coverage;
                println!(
                    "{}: {} files in {}\ncoverage: {} constructs, 1:1 {} ({}%), stubbed {} ({}%), unsupported {} ({}%); MAPPING.md and coverage.json written",
                    target.name(),
                    rep.files_written,
                    rep.out,
                    c.total.total,
                    c.total.one_to_one,
                    c.percent_one_to_one,
                    c.total.stubbed,
                    c.percent_stubbed,
                    c.total.unsupported,
                    c.percent_unsupported
                );
            }
            Ok(0)
        }
        ElectronCmd::Optimize { project, opt_level, build, json } => {
            let rep = optimize::optimize(&OptimizeOptions { project, opt_level, build })?;
            if json {
                println!("{}", serde_json::to_string_pretty(&rep)?);
            } else {
                println!("{} ({}): profile {}", rep.project, rep.target, rep.release_profile);
                println!("bun flags {:?} verified={} ({})", rep.bun.flags, rep.bun.verified, rep.bun.source);
                for (label, list) in [("before", &rep.before), ("after", &rep.after)] {
                    for a in list {
                        println!("{label}: {} {} bytes", a.path, a.bytes);
                    }
                }
                for n in &rep.notes {
                    println!("- {n}");
                }
            }
            Ok(0)
        }
        ElectronCmd::Bench {
            electron, migrated, runs, warmup, settle_ms, timeout_ms, ready, ipc_expr_electron, ipc_expr_migrated, ipc_iters, electron_args, migrated_args, port_electron, port_migrated, out, json,
        } => {
            let mut apps = Vec::new();
            if let Some(exe) = electron {
                apps.push(AppSpec { label: "electron".into(), exe, args: electron_args, ipc_expr: ipc_expr_electron, port: port_electron });
            }
            if let Some(exe) = migrated {
                apps.push(AppSpec { label: "migrated".into(), exe, args: migrated_args, ipc_expr: Some(ipc_expr_migrated.unwrap_or_else(|| bench::MIGRATED_PING_EXPR.to_string())), port: port_migrated });
            }
            if apps.is_empty() {
                return Err(electron_migrate::Error::msg("pass --electron and/or --migrated"));
            }
            let self_exe = std::env::current_exe().map_err(|e| electron_migrate::Error::msg(format!("current_exe: {e}")))?;
            let report = bench::bench(&BenchOptions { apps, runs, warmup, settle_ms, timeout_ms, ready: ready_of(ready), ipc_iters, self_exe })?;
            let md = bench::markdown(&report);
            let js = serde_json::to_string_pretty(&report)?;
            if let Some(path) = out {
                std::fs::write(&path, &js).map_err(|e| electron_migrate::Error::Io { path: path.clone(), source: e })?;
                let md_path = path.with_extension("md");
                std::fs::write(&md_path, &md).map_err(|e| electron_migrate::Error::Io { path: md_path.clone(), source: e })?;
            }
            if json { println!("{js}") } else { print!("{md}") }
            Ok(0)
        }
        ElectronCmd::BenchProbe { exe, port, timeout_ms, settle_ms, ready, no_rss, ipc_expr, ipc_iters, args } => {
            let r = bench::probe(&ProbeOptions { exe, args, port, timeout_ms, settle_ms, ready: ready_of(ready), ipc_expr, ipc_iters, sample_rss: !no_rss })?;
            println!("{}", serde_json::to_string(&r)?);
            Ok(0)
        }
    }
}
