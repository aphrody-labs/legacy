//! `ay index`: the monorepo index pipeline in process (aphrody-core::pipeline + aphrody-re stages).
//! No subprocess per file, no JSON round trip: files go from disk to SQLite inside this process.
//!
//!   ay index [root] [--all] [--include a,b] [--db path] [--deep off|queue|inline] [--sniff] [--force]
//!   ay index watch [root]        incremental on file events (notify), pulls deep results from the fleet
//!   ay index worker [--role heavy] [--root path] [--once]   run queued heavy stages (ghidra)
//!   ay index sync                apply finished deep results from the shared cache
//!   ay index query <name> [--exact] [--limit N]    ay index text <words>    ay index status
//!   ay index bench [--queries N] [--binary path]   latency percentiles
//!   ay index gen|gen-docs|search|users             forwarded to system/core-ts (bun)

use aphrody_core::pipeline::{Deep, Engine, Options, Shared, Stage, Store, WorkOptions};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

const USAGE: &str = "ay index [root] [--all] [--include a,b] [--db path] [--deep off|queue|inline] [--sniff] [--force] [--no-shared]
ay index watch [root] | worker [--role heavy] [--once] | sync | status
ay index query <name> [--exact] [--limit N] | text <words> | bench [--queries N] [--binary path] [--publish]
ay index gen | gen-docs | search | users   (system/core-ts, bun)";

const VALUE_FLAGS: &[&str] = &["include", "db", "deep", "limit", "role", "queries", "binary", "root", "consumer"];

#[derive(Default)]
struct Flags {
    val: HashMap<String, String>,
    on: HashSet<String>,
    pos: Vec<String>,
}

impl Flags {
    fn parse(args: &[String]) -> Result<Self, String> {
        let mut f = Self::default();
        let mut it = args.iter();
        while let Some(a) = it.next() {
            if let Some(name) = a.strip_prefix("--") {
                let (name, inline) = name.split_once('=').map_or((name, None), |(n, v)| (n, Some(v.to_string())));
                if VALUE_FLAGS.contains(&name) {
                    let v = inline.or_else(|| it.next().cloned()).ok_or_else(|| format!("--{name} needs a value"))?;
                    f.val.insert(name.to_string(), v);
                } else {
                    f.on.insert(name.to_string());
                }
            } else {
                f.pos.push(a.clone());
            }
        }
        Ok(f)
    }

    fn has(&self, n: &str) -> bool {
        self.on.contains(n)
    }

    fn get(&self, n: &str) -> Option<&str> {
        self.val.get(n).map(String::as_str)
    }
}

fn engine() -> Engine {
    aphrody_re::index::engine()
}

fn root_of(f: &Flags, pos: usize) -> PathBuf {
    let r = f.get("root").map(PathBuf::from).or_else(|| f.pos.get(pos).map(PathBuf::from)).unwrap_or_else(crate::repo_root);
    std::path::absolute(&r).unwrap_or(r)
}

fn db_of(f: &Flags, root: &Path) -> PathBuf {
    f.get("db")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("AY_INDEX_DB").map(PathBuf::from))
        .unwrap_or_else(|| root.join("var").join("index").join("core.db"))
}

fn shared_of(f: &Flags) -> Option<Shared> {
    if f.has("no-shared") { None } else { Shared::from_env() }
}

fn options(f: &Flags, root: PathBuf, shared: bool) -> Result<Options, String> {
    let mut o = Options::new(root.clone(), db_of(f, &root));
    o.all = f.has("all");
    o.sniff = f.has("sniff");
    o.force = f.has("force");
    o.blobs = f.has("blobs");
    o.cache_cheap = f.has("cache-cheap");
    o.cache_write = shared;
    o.include = f.get("include").map(|s| s.split(',').filter(|p| !p.is_empty()).map(PathBuf::from).collect()).unwrap_or_default();
    o.deep = match f.get("deep") {
        Some("off") => Deep::Off,
        Some("queue") => Deep::Queue,
        Some("inline") => Deep::Inline,
        Some(x) => return Err(format!("--deep {x}: expected off, queue or inline")),
        None if shared => Deep::Queue,
        None => Deep::Off,
    };
    Ok(o)
}

fn hostname() -> String {
    std::env::var("HOSTNAME").or_else(|_| std::env::var("COMPUTERNAME")).unwrap_or_else(|_| "host".into())
}

pub fn run(args: &[String]) -> i32 {
    let (sub, rest) = match args.split_first() {
        Some((s, r)) if !s.starts_with('-') && !Path::new(s).exists() => (s.as_str(), r),
        _ => ("index", args),
    };
    if matches!(sub, "gen" | "gen-docs" | "search" | "users") {
        return crate::exec::run_package("core", args);
    }
    let flags = match Flags::parse(rest) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("ay index: {e}");
            return 2;
        }
    };
    let out = match sub {
        "index" => cmd_index(&flags),
        "watch" => cmd_watch(&flags),
        "worker" => cmd_worker(&flags),
        "sync" => cmd_sync(&flags),
        "query" => cmd_query(&flags),
        "text" => cmd_text(&flags),
        "status" => cmd_status(&flags),
        "bench" => cmd_bench(&flags),
        "help" => {
            println!("{USAGE}");
            Ok(())
        }
        other => Err(format!("unknown subcommand {other:?} (ay index help)")),
    };
    match out {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("ay index: {e}");
            1
        }
    }
}

fn cmd_index(f: &Flags) -> Result<(), String> {
    let root = root_of(f, 0);
    let mut shared = shared_of(f);
    let o = options(f, root, shared.is_some())?;
    let rep = engine().index(&o, shared.as_mut())?;
    println!("{}", serde_json::to_string(&rep).map_err(|e| e.to_string())?);
    Ok(())
}

fn cmd_sync(f: &Flags) -> Result<(), String> {
    let root = root_of(f, 0);
    let mut shared = Shared::from_env().ok_or("shared cache unavailable")?;
    let n = engine().sync(&db_of(f, &root), &mut shared)?;
    println!("{{\"deep_applied\":{n}}}");
    Ok(())
}

fn cmd_watch(f: &Flags) -> Result<(), String> {
    use notify::{EventKind, RecursiveMode, Watcher};
    let root = root_of(f, 0);
    let eng = std::sync::Arc::new(engine());
    let mut shared = shared_of(f);
    let o = options(f, root.clone(), shared.is_some())?;

    // Pull finished deep results as the fleet publishes them.
    if let Some(sh) = shared.as_ref()
        && let (Ok(sub_conn), Ok(mut sync_conn)) = (sh.fork(), sh.fork())
    {
        let mut sub = sub_conn.subscribe()?;
        let (eng, db) = (eng.clone(), o.db.clone());
        std::thread::spawn(move || {
            loop {
                let t = Instant::now();
                let event = sub.next(Duration::from_secs(60));
                if event.is_none() && t.elapsed() < Duration::from_secs(1) {
                    std::thread::sleep(Duration::from_secs(2)); // connection lost: do not spin
                }
                let _ = eng.sync(&db, &mut sync_conn); // also on timeout: events are hints, the cache is the truth
            }
        });
    }

    // First pass catches up with whatever changed while the watcher was down.
    let rep = eng.index(&o, shared.as_mut())?;
    println!("{}", serde_json::to_string(&rep).map_err(|e| e.to_string())?);

    let (tx, rx) = std::sync::mpsc::channel::<notify::Event>();
    let mut w = notify::recommended_watcher(move |r: notify::Result<notify::Event>| {
        if let Ok(ev) = r {
            let _ = tx.send(ev);
        }
    })
    .map_err(|e| e.to_string())?;
    w.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    eprintln!("ay index watch: {} -> {}", root.display(), o.db.display());
    loop {
        let mut paths: HashSet<PathBuf> = HashSet::new();
        let first = rx.recv().map_err(|_| "watcher closed".to_string())?;
        let mut take = |ev: notify::Event| {
            if !matches!(ev.kind, EventKind::Access(_)) {
                paths.extend(ev.paths);
            }
        };
        take(first);
        while let Ok(ev) = rx.recv_timeout(Duration::from_millis(150)) {
            take(ev);
        }
        if paths.is_empty() {
            continue;
        }
        let list: Vec<PathBuf> = paths.into_iter().collect();
        match eng.index_paths(&o, &list, shared.as_mut()) {
            Ok(r) if r.changed + r.removed + r.touched > 0 => {
                println!("{}", serde_json::json!({"changed": r.changed, "removed": r.removed, "touched": r.touched, "queued": r.queued, "ms": r.total_ms}));
            }
            Ok(_) => {}
            Err(e) => eprintln!("ay index watch: {e}"),
        }
        if shared.is_none() && !f.has("no-shared") {
            shared = Shared::from_env();
        }
    }
}

fn cmd_worker(f: &Flags) -> Result<(), String> {
    let root = root_of(f, 0);
    let eng = engine();
    let w = WorkOptions {
        root,
        role: f.get("role").unwrap_or("heavy").to_string(),
        consumer: f.get("consumer").map_or_else(|| format!("{}-{}", hostname(), std::process::id()), str::to_string),
        block_ms: 5000,
        once: f.has("once"),
    };
    let stop = AtomicBool::new(false);
    let mut done = 0usize;
    loop {
        match Shared::from_env() {
            Some(mut sh) => match eng.work(&mut sh, &w, &stop) {
                Ok(n) => {
                    done += n;
                    if w.once {
                        println!("{{\"jobs\":{done}}}");
                        return Ok(());
                    }
                }
                Err(e) => eprintln!("ay index worker: {e}"),
            },
            None if w.once => return Err("shared cache unavailable".into()),
            None => {}
        }
        // Valkey restarted or unreachable: wait, reconnect, keep going (survives reboot of either side).
        std::thread::sleep(Duration::from_secs(2));
    }
}

fn cmd_query(f: &Flags) -> Result<(), String> {
    let q = f.pos.first().ok_or("usage: ay index query <name> [--exact] [--limit N]")?;
    let root = root_of(f, usize::MAX);
    let st = Store::open(&db_of(f, &root))?;
    let limit = f.get("limit").and_then(|s| s.parse().ok()).unwrap_or(20);
    let hits = if f.has("exact") { st.lookup(q, limit)? } else { st.search(q, limit)? };
    for h in hits {
        println!("{}", serde_json::to_string(&h).map_err(|e| e.to_string())?);
    }
    Ok(())
}

fn cmd_text(f: &Flags) -> Result<(), String> {
    let q = f.pos.join(" ");
    let root = root_of(f, usize::MAX);
    let st = Store::open(&db_of(f, &root))?;
    let limit = f.get("limit").and_then(|s| s.parse().ok()).unwrap_or(10);
    for (path, snip) in st.text(&q, limit)? {
        println!("{}", serde_json::json!({"path": path, "snippet": snip}));
    }
    Ok(())
}

fn cmd_status(f: &Flags) -> Result<(), String> {
    let root = root_of(f, usize::MAX);
    let st = Store::open(&db_of(f, &root))?;
    let mut v = serde_json::json!({"db": db_of(f, &root), "totals": st.totals()?});
    if let Some(mut sh) = shared_of(f) {
        v["shared"] = serde_json::json!({"host": sh.host_label(), "keys": sh.dbsize().ok(), "jobs_heavy": sh.queue_len("heavy").ok()});
    }
    println!("{v}");
    Ok(())
}

fn pctl(v: &mut [f64], p: f64) -> f64 {
    v.sort_by(f64::total_cmp);
    if v.is_empty() { 0.0 } else { v[(((v.len() - 1) as f64) * p).round() as usize] }
}

fn summarize(mut us: Vec<f64>) -> serde_json::Value {
    let n = us.len();
    serde_json::json!({"n": n, "p50_us": pctl(&mut us, 0.5).round(), "p99_us": pctl(&mut us, 0.99).round(), "max_us": pctl(&mut us, 1.0).round()})
}

fn time_each<T>(items: &[String], mut f: impl FnMut(&str) -> T) -> Vec<f64> {
    items
        .iter()
        .map(|q| {
            let t = Instant::now();
            std::hint::black_box(f(q));
            t.elapsed().as_secs_f64() * 1e6
        })
        .collect()
}

fn cmd_bench(f: &Flags) -> Result<(), String> {
    let root = root_of(f, usize::MAX);
    let n: usize = f.get("queries").and_then(|s| s.parse().ok()).unwrap_or(2000);
    let st = Store::open(&db_of(f, &root))?;
    let names = st.sample_names(n)?;
    let subs: Vec<String> = names
        .iter()
        .filter_map(|s| {
            let c: Vec<char> = s.chars().collect();
            (c.len() >= 5).then(|| c[1..c.len() - 1].iter().collect())
        })
        .collect();
    let mut out = serde_json::json!({"host": hostname(), "symbols": st.totals()?.symbols, "queries": names.len()});
    let t = Instant::now();
    st.ensure_fts()?;
    out["fts_build_ms"] = serde_json::json!((t.elapsed().as_secs_f64() * 1e3).round());
    out["lookup_exact"] = summarize(time_each(&names, |q| st.lookup(q, 20)));
    out["search_fts"] = summarize(time_each(&subs, |q| st.search(q, 20)));
    let few: Vec<String> = subs.iter().take(100).cloned().collect();
    out["search_like_scan"] = summarize(time_each(&few, |q| st.search_like(q, 20)));

    if let Some(mut sh) = shared_of(f) {
        let key = "ay:1:bench:probe";
        sh.set_many(&[(key.into(), vec![b'x'; 1024])], 60)?;
        let keys: Vec<String> = (0..200).map(|_| key.to_string()).collect();
        out["shared_get_1k"] = summarize(time_each(&keys, |k| sh.get_many(&[k.to_string()])));
        let batch: Vec<String> = (0..256).map(|_| key.to_string()).collect();
        let t = Instant::now();
        sh.get_many(&batch)?;
        out["shared_mget_256_ms"] = serde_json::json!(t.elapsed().as_secs_f64() * 1e3);
        if f.has("publish") {
            let _ = sh.publish(&serde_json::json!({"t": "bench", "host": hostname()}).to_string());
        }
    }

    if let Some(bin) = f.get("binary") {
        let bytes = std::fs::read(bin).map_err(|e| format!("{bin}: {e}"))?;
        let det = aphrody_core::pipeline::Detected::new(aphrody_core::pipeline::Kind::Binary, "pe");
        let info = aphrody_core::pipeline::FileInfo { path: "bench.bin", abs: Path::new(bin), size: bytes.len() as u64, hash: "0", det: &det };
        let stage = aphrody_re::index::TriageStage;
        let reps: Vec<String> = (0..50).map(|i| i.to_string()).collect();
        out["triage_binary"] = summarize(time_each(&reps, |_| stage.run(&info, &bytes)));
        out["triage_binary"]["bytes"] = serde_json::json!(bytes.len());
    }
    // One line (JSON Lines) so a timer can append runs to a history file; `--pretty` for people.
    let text = if f.has("pretty") { serde_json::to_string_pretty(&out) } else { serde_json::to_string(&out) };
    println!("{}", text.map_err(|e| e.to_string())?);
    Ok(())
}
