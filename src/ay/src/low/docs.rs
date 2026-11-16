//! `ay docs`: CLI over `aphrody-docs` (src/docs).

use aphrody_docs::{Config, SyncOptions};
use std::io::IsTerminal;
use std::path::PathBuf;

const EXAMPLES: &str = "\
Examples:
  ay docs sources                  the sources (src/docs/sources.toml): bun, linux, chromium, chromiumos, android
  ay docs sync                     import every source (incremental and resumable; docs are data, never committed)
  ay docs sync -s android          one source or an id prefix (android = android/source + android/developer); --offline skips the network
  ay docs search binder ipc -s android   search one source (also: ay docs bun ...)
  ay docs search --json -n 5 bunfig      machine output for agents (schema ay-docs-search/1)
  ay docs show runtime/bunfig      print a page (path, suffix or URL; <source>:<path> to pick the source)
  ay docs stats --json             documents per source, commit and last sync of each
  ay docs schedule --every 6       keep it fresh (Task Scheduler / systemd user timer)";

#[derive(clap::Args, Debug, PartialEq)]
#[command(after_help = EXAMPLES)]
pub struct DocsArgs {
    /// Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
    #[arg(long, global = true)]
    pub root: Option<PathBuf>,
    /// Sources file replacing the embedded sources.toml (default: $AY_DOCS_SOURCES)
    #[arg(long = "sources-file", global = true)]
    pub sources_file: Option<PathBuf>,
    #[command(subcommand)]
    pub cmd: DocsCmd,
}

#[derive(clap::Subcommand, Debug, PartialEq)]
pub enum DocsCmd {
    /// List the sources (id, kind, origin)
    Sources {
        #[arg(long)]
        json: bool,
    },
    /// Import and index the sources (incremental, resumable); the command the upstream watch runs
    Sync {
        /// Only these sources: an id or an id prefix, see `ay docs sources` (repeatable)
        #[arg(long = "source", short = 's')]
        sources: Vec<String>,
        /// Do not touch the network (bun.com, sitemaps, git fetch)
        #[arg(long)]
        offline: bool,
        /// JSON report (schema ay-docs-sync/1)
        #[arg(long)]
        json: bool,
        /// Print nothing unless a source fails
        #[arg(long, short = 'q')]
        quiet: bool,
    },
    /// Search the indexed documentation
    #[command(visible_alias = "search")]
    Bun(SearchArgs),
    /// Print one page
    Show {
        /// Path (docs/runtime/bunfig.mdx), suffix (runtime/bunfig), URL, or <source>:<path>
        key: String,
        #[arg(long)]
        json: bool,
    },
    /// Documents per source, fork commit, last sync
    Stats {
        #[arg(long)]
        json: bool,
    },
    /// Run `ay docs sync` every N hours (Task Scheduler on Windows, systemd user timer on Linux)
    Schedule {
        /// Hours between runs
        #[arg(long, default_value_t = 6, value_parser = clap::value_parser!(u32).range(1..=168))]
        every: u32,
        /// Remove the schedule
        #[arg(long)]
        remove: bool,
    },
}

#[derive(clap::Args, Debug, PartialEq)]
pub struct SearchArgs {
    /// Words to search for (all of them, else any)
    #[arg(required = true, num_args = 1..)]
    pub query: Vec<String>,
    /// Maximum results
    #[arg(long, short = 'n', default_value_t = 8)]
    pub limit: usize,
    /// Only one source or id prefix (see `ay docs sources`), e.g. android, linux, chromiumos/docs
    #[arg(long, short = 's')]
    pub source: Option<String>,
    /// JSON (schema ay-docs-search/1)
    #[arg(long)]
    pub json: bool,
}

fn config(root: Option<PathBuf>, sources: Option<PathBuf>) -> Config {
    let repo = root.or_else(|| {
        let r = crate::repo_root();
        r.join("src.lock.json").is_file().then_some(r)
    });
    let mut cfg = Config::new(repo);
    if sources.is_some() {
        cfg.sources_file = sources;
    }
    cfg
}

fn origin(s: &aphrody_docs::Source) -> String {
    [&s.url, &s.root, &s.prefix].into_iter().flatten().next().cloned().unwrap_or_default()
}

fn print_json(v: &serde_json::Value) {
    println!("{}", serde_json::to_string_pretty(v).unwrap_or_default());
}

pub fn run(a: DocsArgs) -> i32 {
    let cfg = config(a.root, a.sources_file);
    match a.cmd {
        DocsCmd::Sources { json } => match cfg.load_sources() {
            Ok(list) => {
                if json {
                    let rows: Vec<_> = list.iter().map(|s| serde_json::json!({"id": s.id, "kind": s.kind.name(), "origin": origin(s)})).collect();
                    print_json(&serde_json::json!({"sources": rows}));
                } else {
                    for s in &list {
                        println!("{:<18} {:<8} {}", s.id, s.kind.name(), origin(s));
                    }
                }
                0
            }
            Err(e) => {
                eprintln!("ay docs sources: {e}");
                1
            }
        },
        DocsCmd::Sync { sources, offline, json, quiet } => match aphrody_docs::sync(&cfg, &SyncOptions { sources, offline, progress: !json && !quiet }) {
            Ok(report) => {
                let ok = report["ok"] == true;
                if json {
                    print_json(&report);
                } else if !quiet || !ok {
                    for s in report["sources"].as_array().into_iter().flatten() {
                        if s["ok"] == true {
                            let failed = s["failed"].as_u64().unwrap_or(0);
                            println!(
                                "{:<18} {:>6} docs  +{} ~{} -{} ={}{}  {} ms",
                                s["source"].as_str().unwrap_or(""),
                                s["documents"],
                                s["added"],
                                s["updated"],
                                s["removed"],
                                s["unchanged"],
                                if failed > 0 { format!(" !{failed} to retry") } else { String::new() },
                                s["ms"]
                            );
                        } else {
                            eprintln!("{:<18} failed: {}", s["source"].as_str().unwrap_or(""), s["error"].as_str().unwrap_or(""));
                        }
                    }
                    if !quiet {
                        println!("index {}", cfg.db.display());
                    }
                }
                if ok { 0 } else { 1 }
            }
            Err(e) => {
                eprintln!("ay docs sync: {e}");
                1
            }
        },
        DocsCmd::Bun(s) => search(&cfg, s),
        DocsCmd::Show { key, json } => with_index(&cfg, |conn| match aphrody_docs::show(conn, &key) {
            Ok(Some((source, path, url, title, body))) => {
                if json {
                    print_json(&serde_json::json!({"source": source, "path": path, "url": url, "title": title, "body": body}));
                } else {
                    println!("# {title}\n{source}:{path}{}\n\n{body}", url.map(|u| format!("  {u}")).unwrap_or_default());
                }
                0
            }
            Ok(None) => {
                eprintln!("ay docs show: no page matches {key}");
                1
            }
            Err(e) => {
                eprintln!("ay docs show: {e}");
                1
            }
        }),
        DocsCmd::Stats { json } => with_index(&cfg, |conn| match aphrody_docs::stats(&cfg, conn) {
            Ok(v) => {
                if json {
                    print_json(&v);
                } else {
                    println!("index {} ({} bytes), {} documents", cfg.db.display(), v["db_bytes"], v["documents"]);
                    println!("synced at {} (unix)", v["synced_at"]);
                    for s in v["sources"].as_array().into_iter().flatten() {
                        let commit = s["commit"].as_str().map(|c| c.chars().take(10).collect::<String>()).unwrap_or_default();
                        println!("{:<18} {:>6} docs {:>11} bytes  {commit}", s["source"].as_str().unwrap_or(""), s["documents"], s["bytes"]);
                    }
                }
                0
            }
            Err(e) => {
                eprintln!("ay docs stats: {e}");
                1
            }
        }),
        DocsCmd::Schedule { every, remove } => {
            let r = if remove {
                aphrody_docs::schedule::remove()
            } else {
                std::env::current_exe()
                    .map_err(|e| e.to_string())
                    .and_then(|exe| aphrody_docs::schedule::install(&exe, cfg.repo.as_deref(), every))
            };
            match r {
                Ok(m) => {
                    println!("{m}");
                    0
                }
                Err(e) => {
                    eprintln!("ay docs schedule: {e}");
                    1
                }
            }
        }
    }
}

fn with_index(cfg: &Config, f: impl FnOnce(&aphrody_docs::Connection) -> i32) -> i32 {
    if !cfg.db.is_file() {
        eprintln!("ay docs: no index at {} (run `ay docs sync`)", cfg.db.display());
        return 1;
    }
    match aphrody_docs::open(&cfg.db) {
        Ok(conn) => f(&conn),
        Err(e) => {
            eprintln!("ay docs: {}: {e}", cfg.db.display());
            1
        }
    }
}

fn search(cfg: &Config, s: SearchArgs) -> i32 {
    let query = s.query.join(" ");
    with_index(cfg, |conn| match aphrody_docs::search(conn, &query, s.source.as_deref(), s.limit.max(1)) {
        Ok(hits) => {
            if s.json {
                print_json(&aphrody_docs::search_json(cfg, conn, &query, &hits));
                return 0;
            }
            if hits.is_empty() {
                eprintln!("no match for {query}");
                return 1;
            }
            let color = std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none();
            let (b, d, r) = if color { ("\x1b[1m", "\x1b[2m", "\x1b[0m") } else { ("", "", "") };
            for h in &hits {
                let at = h.url.as_deref().or(h.file.as_deref()).unwrap_or(&h.path);
                println!("{b}{}{r}  {d}{} {at}{r}", h.title, h.source);
                println!("  {}", h.snippet);
            }
            0
        }
        Err(e) => {
            eprintln!("ay docs search: {e}");
            1
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct T {
        #[command(flatten)]
        a: DocsArgs,
    }

    fn parse(line: &str) -> DocsCmd {
        T::try_parse_from(std::iter::once("docs").chain(line.split_whitespace())).expect("parse").a.cmd
    }

    #[test]
    fn subcommands() {
        assert_eq!(
            parse("bun serve websocket --json -n 3"),
            DocsCmd::Bun(SearchArgs { query: vec!["serve".into(), "websocket".into()], limit: 3, source: None, json: true })
        );
        assert!(matches!(parse("search bunfig"), DocsCmd::Bun(_)));
        assert_eq!(
            parse("search binder ipc --source android"),
            DocsCmd::Bun(SearchArgs { query: vec!["binder".into(), "ipc".into()], limit: 8, source: Some("android".into()), json: false })
        );
        assert_eq!(parse("sync -s android -s linux"), DocsCmd::Sync { sources: vec!["android".into(), "linux".into()], offline: false, json: false, quiet: false });
        assert_eq!(parse("sources --json"), DocsCmd::Sources { json: true });
        assert_eq!(parse("sync -s fork --offline"), DocsCmd::Sync { sources: vec!["fork".into()], offline: true, json: false, quiet: false });
        assert_eq!(parse("schedule --every 12"), DocsCmd::Schedule { every: 12, remove: false });
        assert!(T::try_parse_from(["docs", "schedule", "--every", "0"]).is_err());
        assert!(T::try_parse_from(["docs", "bun"]).is_err(), "a query is required");
    }
}
