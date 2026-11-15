//! `ay electron bench`: original Electron app vs migrated app.
//!
//! - cold start: `hyperfine` times `ay electron bench-probe`, which launches the app with a Chromium
//!   remote-debugging port (`--remote-debugging-port` for Electron/CEF, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`
//!   for WebView2) and returns when a page target with a committed URL exists. This is "first navigation
//!   committed", not first paint; the OS file cache is not dropped. WebKitGTK has no CDP: use `--ready alive`.
//! - RSS: summed resident set of the process tree after a settle delay (sysinfo).
//! - binary size: the executable, plus the install directory unless it is a cargo target directory.
//! - IPC round trip: a JavaScript expression evaluated N times inside the page over CDP `Runtime.evaluate`
//!   (the migrated shim exposes `__electronCompat.ipcRenderer.invoke("__ay_ping__")`).

use crate::{Error, Result, io_err};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};
use walkdir::WalkDir;

pub const MIGRATED_PING_EXPR: &str = "window.__electronCompat.ipcRenderer.invoke('__ay_ping__')";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ready {
    /// A page target with a non-blank URL exists on the CDP port.
    Cdp,
    /// No readiness signal: the process is alive after spawn (WebKitGTK, headless services).
    Alive,
}

#[derive(Debug, Clone)]
pub struct ProbeOptions {
    pub exe: PathBuf,
    pub args: Vec<String>,
    pub port: u16,
    pub timeout_ms: u64,
    pub settle_ms: u64,
    pub ready: Ready,
    pub ipc_expr: Option<String>,
    pub ipc_iters: u32,
    pub sample_rss: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProbeResult {
    pub ready_ms: f64,
    pub rss_bytes: u64,
    pub procs: usize,
    pub ipc_us: Option<f64>,
    pub ipc_error: Option<String>,
}

fn descendants(sys: &System, root: Pid) -> Vec<Pid> {
    let mut set = vec![root];
    loop {
        let before = set.len();
        for (pid, p) in sys.processes() {
            // Linux lists every thread as a process with the same RSS: counting them would multiply the memory.
            if p.thread_kind().is_some() {
                continue;
            }
            if let Some(parent) = p.parent() {
                if set.contains(&parent) && !set.contains(pid) {
                    set.push(*pid);
                }
            }
        }
        if set.len() == before {
            return set;
        }
    }
}

fn cdp_targets(port: u16) -> Option<Vec<Value>> {
    let url = format!("http://127.0.0.1:{port}/json/list");
    let resp = ureq::get(&url).config().timeout_global(Some(Duration::from_millis(400))).build().call().ok()?;
    let mut body = resp.into_body();
    let text = body.read_to_string().ok()?;
    serde_json::from_str::<Value>(&text).ok()?.as_array().cloned()
}

fn ready_page(targets: &[Value]) -> Option<&Value> {
    targets.iter().find(|t| {
        t["type"] == "page" && t["url"].as_str().is_some_and(|u| !u.is_empty() && u != "about:blank" && !u.starts_with("devtools://"))
    })
}

/// Mean microseconds per evaluation of `expr` (awaited) inside the page behind `ws_url`.
fn cdp_eval_mean_us(ws_url: &str, expr: &str, iters: u32, deadline: Instant) -> std::result::Result<f64, String> {
    let (mut ws, _) = tungstenite::connect(ws_url).map_err(|e| format!("cdp connect: {e}"))?;
    let script = format!(
        "(async () => {{ for (let i = 0; i < 10; i++) await ({expr}); const t0 = performance.now(); for (let i = 0; i < {iters}; i++) await ({expr}); return (performance.now() - t0) * 1000 / {iters}; }})()"
    );
    let req = json!({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "awaitPromise": true, "returnByValue": true}});
    ws.send(tungstenite::Message::Text(req.to_string().into())).map_err(|e| format!("cdp send: {e}"))?;
    loop {
        if Instant::now() > deadline {
            return Err("cdp evaluate timed out".into());
        }
        let msg = ws.read().map_err(|e| format!("cdp read: {e}"))?;
        let tungstenite::Message::Text(t) = msg else { continue };
        let v: Value = serde_json::from_str(t.as_str()).map_err(|e| e.to_string())?;
        if v["id"] != 1 {
            continue;
        }
        if let Some(ex) = v["result"]["exceptionDetails"].as_object() {
            let text = ex.get("exception").and_then(|e| e["description"].as_str()).or_else(|| ex.get("text").and_then(Value::as_str)).unwrap_or("exception");
            return Err(format!("page exception: {}", text.lines().next().unwrap_or(text)));
        }
        return v["result"]["result"]["value"].as_f64().ok_or_else(|| format!("unexpected CDP result: {v}"));
    }
}

fn kill_tree(sys: &mut System, child: &mut Child) {
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let pids = descendants(sys, Pid::from_u32(child.id()));
    for pid in pids.iter().rev() {
        if let Some(p) = sys.process(*pid) {
            let _ = p.kill();
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Launch, wait for readiness, optionally sample RSS and measure the IPC round trip, then kill the tree.
pub fn probe(o: &ProbeOptions) -> Result<ProbeResult> {
    let mut cmd = Command::new(&o.exe);
    cmd.args(&o.args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    if o.ready == Ready::Cdp {
        let flag = format!("--remote-debugging-port={}", o.port);
        cmd.arg(&flag).env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &flag);
    }
    let t0 = Instant::now();
    let mut child = cmd.spawn().map_err(io_err(&o.exe))?;
    let deadline = t0 + Duration::from_millis(o.timeout_ms);
    let mut sys = System::new().map_err(|e| Error::msg(format!("sysinfo: {e}")))?;
    let mut res = ProbeResult::default();
    let mut ws_url: Option<String> = None;

    match o.ready {
        Ready::Alive => {
            std::thread::sleep(Duration::from_millis(50));
            if child.try_wait().ok().flatten().is_some() {
                return Err(Error::msg("process exited right after spawn"));
            }
            res.ready_ms = t0.elapsed().as_secs_f64() * 1000.0;
        }
        Ready::Cdp => loop {
            if let Some(status) = child.try_wait().ok().flatten() {
                return Err(Error::msg(format!("process exited before a page was ready ({status})")));
            }
            if let Some(targets) = cdp_targets(o.port) {
                if let Some(page) = ready_page(&targets) {
                    res.ready_ms = t0.elapsed().as_secs_f64() * 1000.0;
                    ws_url = page["webSocketDebuggerUrl"].as_str().map(String::from);
                    break;
                }
            }
            if Instant::now() > deadline {
                kill_tree(&mut sys, &mut child);
                return Err(Error::msg(format!("no page target on port {} within {} ms", o.port, o.timeout_ms)));
            }
            std::thread::sleep(Duration::from_millis(10));
        },
    }

    if o.settle_ms > 0 {
        std::thread::sleep(Duration::from_millis(o.settle_ms));
    }
    if o.sample_rss {
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let pids = descendants(&sys, Pid::from_u32(child.id()));
        res.procs = pids.len();
        res.rss_bytes = pids.iter().filter_map(|p| sys.process(*p)).map(|p| p.memory()).sum();
    }
    if let (Some(expr), Some(url)) = (&o.ipc_expr, &ws_url) {
        // The bridge may appear a moment after the first navigation: retry on page exceptions.
        loop {
            match cdp_eval_mean_us(url, expr, o.ipc_iters, deadline.max(Instant::now() + Duration::from_secs(10))) {
                Ok(us) => {
                    res.ipc_us = Some(us);
                    break;
                }
                Err(e) if Instant::now() > deadline => {
                    res.ipc_error = Some(e);
                    break;
                }
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    } else if o.ipc_expr.is_some() {
        res.ipc_error = Some("no CDP page target (ready mode alive)".into());
    }
    kill_tree(&mut sys, &mut child);
    Ok(res)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Stats {
    pub mean_ms: f64,
    pub stddev_ms: f64,
    pub median_ms: f64,
    pub min_ms: f64,
    pub max_ms: f64,
    pub runs: usize,
    pub method: String,
}

fn quote(p: &str) -> String {
    format!("\"{}\"", p.replace('\\', "/"))
}

/// Time `command` (no shell) with hyperfine; seconds in its JSON become milliseconds here.
pub fn hyperfine(command: &str, runs: u32, warmup: u32, tag: &str) -> Result<Stats> {
    let json_path = std::env::temp_dir().join(format!("ay-electron-bench-{}-{tag}.json", std::process::id()));
    let status = Command::new("hyperfine")
        .args(["--shell=none", "--style", "basic", "--warmup", &warmup.to_string(), "--runs", &runs.to_string(), "--export-json"])
        .arg(&json_path)
        .arg(command)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| Error::msg(format!("hyperfine: {e}")))?;
    if !status.success() {
        return Err(Error::msg(format!("hyperfine failed ({status}) on `{command}`")));
    }
    let text = std::fs::read_to_string(&json_path).map_err(io_err(&json_path))?;
    let _ = std::fs::remove_file(&json_path);
    let v: Value = serde_json::from_str(&text)?;
    let r = &v["results"][0];
    let ms = |k: &str| r[k].as_f64().map_or(0.0, |s| s * 1000.0);
    Ok(Stats {
        mean_ms: ms("mean"),
        stddev_ms: ms("stddev"),
        median_ms: ms("median"),
        min_ms: ms("min"),
        max_ms: ms("max"),
        runs: r["times"].as_array().map_or(runs as usize, Vec::len),
        method: "hyperfine".into(),
    })
}

fn median(v: &mut [f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 }
}

fn stats_of(mut v: Vec<f64>, method: &str) -> Stats {
    let n = v.len().max(1) as f64;
    let mean = v.iter().sum::<f64>() / n;
    let var = v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let (min, max) = (v.iter().copied().fold(f64::INFINITY, f64::min), v.iter().copied().fold(0.0, f64::max));
    let runs = v.len();
    Stats { mean_ms: mean, stddev_ms: var.sqrt(), median_ms: median(&mut v), min_ms: if min.is_finite() { min } else { 0.0 }, max_ms: max, runs, method: method.into() }
}

fn dir_bytes(dir: &Path) -> u64 {
    WalkDir::new(dir).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum()
}

/// `(executable bytes, install bytes)`; install is the exe directory unless that is a cargo target
/// directory (then only the sibling `electron-main*` sidecar files count).
pub fn sizes(exe: &Path) -> (u64, u64) {
    let exe_bytes = std::fs::metadata(exe).map_or(0, |m| m.len());
    let Some(dir) = exe.parent() else { return (exe_bytes, exe_bytes) };
    let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if matches!(dir_name, "release" | "debug") {
        let side: u64 = std::fs::read_dir(dir)
            .map(|rd| rd.flatten().filter(|e| e.file_name().to_string_lossy().starts_with("electron-main")).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum())
            .unwrap_or(0);
        (exe_bytes, exe_bytes + side)
    } else {
        (exe_bytes, dir_bytes(dir))
    }
}

#[derive(Debug, Clone)]
pub struct AppSpec {
    pub label: String,
    pub exe: PathBuf,
    pub args: Vec<String>,
    pub ipc_expr: Option<String>,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct BenchOptions {
    pub apps: Vec<AppSpec>,
    pub runs: u32,
    pub warmup: u32,
    pub settle_ms: u64,
    pub timeout_ms: u64,
    pub ready: Ready,
    pub ipc_iters: u32,
    /// Path of the `ay` executable that runs `electron bench-probe` for hyperfine.
    pub self_exe: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppMetrics {
    pub label: String,
    pub exe: String,
    pub binary_bytes: u64,
    pub install_bytes: u64,
    pub cold_start: Option<Stats>,
    pub ready_ms_median: Option<f64>,
    pub rss_bytes_median: Option<u64>,
    pub processes: Option<usize>,
    pub ipc_us_median: Option<f64>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BenchReport {
    pub schema: String,
    pub runs: u32,
    pub ready: Ready,
    pub apps: Vec<AppMetrics>,
    pub caveats: Vec<String>,
}

pub fn bench(o: &BenchOptions) -> Result<BenchReport> {
    let mut apps = Vec::new();
    for (i, a) in o.apps.iter().enumerate() {
        let (binary_bytes, install_bytes) = sizes(&a.exe);
        let mut m = AppMetrics { label: a.label.clone(), exe: a.exe.display().to_string(), binary_bytes, install_bytes, cold_start: None, ready_ms_median: None, rss_bytes_median: None, processes: None, ipc_us_median: None, notes: Vec::new() };
        let probe_cmd = |settle: u64, rss: bool| {
            let mut s = format!(
                "{} electron bench-probe --exe {} --port {} --timeout-ms {} --settle-ms {settle} --ready {}",
                quote(&o.self_exe.to_string_lossy()),
                quote(&a.exe.to_string_lossy()),
                a.port,
                o.timeout_ms,
                if o.ready == Ready::Cdp { "cdp" } else { "alive" }
            );
            if !rss {
                s.push_str(" --no-rss");
            }
            for arg in &a.args {
                s.push_str(&format!(" --arg {}", quote(arg)));
            }
            s
        };
        // Cold start: hyperfine over the probe without settle; probe-measured ready times as fallback.
        match hyperfine(&probe_cmd(0, false), o.runs, o.warmup, &format!("a{i}")) {
            Ok(s) => m.cold_start = Some(s),
            Err(e) => m.notes.push(format!("hyperfine unavailable or failed ({e}); using probe-measured ready times")),
        }
        let mut ready = Vec::new();
        let mut rss = Vec::new();
        let mut ipc = Vec::new();
        let mut procs = 0;
        let sample_runs = o.runs.clamp(1, 5);
        for _ in 0..sample_runs {
            let po = ProbeOptions {
                exe: a.exe.clone(),
                args: a.args.clone(),
                port: a.port,
                timeout_ms: o.timeout_ms,
                settle_ms: o.settle_ms,
                ready: o.ready,
                ipc_expr: a.ipc_expr.clone(),
                ipc_iters: o.ipc_iters,
                sample_rss: true,
            };
            match probe(&po) {
                Ok(r) => {
                    ready.push(r.ready_ms);
                    rss.push(r.rss_bytes as f64);
                    procs = procs.max(r.procs);
                    if let Some(us) = r.ipc_us {
                        ipc.push(us);
                    }
                    if let Some(e) = r.ipc_error {
                        m.notes.push(format!("ipc: {e}"));
                    }
                }
                Err(e) => m.notes.push(format!("probe: {e}")),
            }
        }
        if !ready.is_empty() {
            m.ready_ms_median = Some(median(&mut ready.clone()));
            if m.cold_start.is_none() {
                m.cold_start = Some(stats_of(ready, "probe ready time"));
            }
            m.rss_bytes_median = Some(median(&mut rss) as u64);
            m.processes = Some(procs);
        }
        if !ipc.is_empty() {
            m.ipc_us_median = Some(median(&mut ipc));
        } else if a.ipc_expr.is_none() {
            m.notes.push("ipc: no --ipc-expr for this app".into());
        }
        m.notes.dedup();
        apps.push(m);
    }
    Ok(BenchReport {
        schema: "ay-electron-bench/1".into(),
        runs: o.runs,
        ready: o.ready,
        apps,
        caveats: vec![
            "cold start = new process until a page target with a committed URL exists (CDP), not first paint; the OS file cache is not dropped".into(),
            "RSS = sum of the resident set of the whole process tree after the settle delay".into(),
            "IPC = mean time of an awaited page-side call, evaluated over CDP; Electron needs --ipc-expr-electron for its own bridge".into(),
        ],
    })
}

fn mb(b: u64) -> String {
    format!("{:.1} MB", b as f64 / 1_048_576.0)
}

pub fn markdown(r: &BenchReport) -> String {
    let mut s = String::from("| metric |");
    for a in &r.apps {
        let _ = write!(s, " {} |", a.label);
    }
    s.push_str("\n|---|");
    for _ in &r.apps {
        s.push_str("---:|");
    }
    s.push('\n');
    let mut row = |name: &str, f: &dyn Fn(&AppMetrics) -> String| {
        let _ = write!(s, "| {name} |");
        for a in &r.apps {
            let _ = write!(s, " {} |", f(a));
        }
        s.push('\n');
    };
    row("cold start mean (ms)", &|a| a.cold_start.as_ref().map_or("n/a".into(), |c| format!("{:.0} +/- {:.0} ({}, n={})", c.mean_ms, c.stddev_ms, c.method, c.runs)));
    row("cold start median (ms)", &|a| a.cold_start.as_ref().map_or("n/a".into(), |c| format!("{:.0}", c.median_ms)));
    row("RSS, process tree", &|a| a.rss_bytes_median.map_or("n/a".into(), |b| format!("{} ({} procs)", mb(b), a.processes.unwrap_or(0))));
    row("executable size", &|a| mb(a.binary_bytes));
    row("install size", &|a| mb(a.install_bytes));
    row("IPC round trip (us)", &|a| a.ipc_us_median.map_or("n/a".into(), |u| format!("{u:.1}")));
    s.push('\n');
    for c in &r.caveats {
        let _ = writeln!(s, "- {c}");
    }
    for a in &r.apps {
        for n in &a.notes {
            let _ = writeln!(s, "- {}: {n}", a.label);
        }
    }
    s
}
