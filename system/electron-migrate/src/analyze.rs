//! `ay electron analyze`: bundle -> [`Manifest`].

use crate::Result;
use crate::manifest::*;
use crate::scan::{Facts, is_native_package, scan_source};
use crate::source::Source;
use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Options {
    /// Also scan `node_modules` JavaScript (slow; the manifest describes app code by default).
    pub scan_node_modules: bool,
    pub max_file_bytes: u64,
}

impl Default for Options {
    fn default() -> Self {
        Options { scan_node_modules: false, max_file_bytes: 32 * 1024 * 1024 }
    }
}

pub fn analyze_path(input: &Path, opts: &Options) -> Result<(Manifest, Source)> {
    let source = Source::open(input)?;
    let manifest = analyze_source(&source, opts);
    Ok((manifest, source))
}

fn is_script(path: &str) -> bool {
    matches!(path.rsplit_once('.').map(|(_, e)| e), Some("js" | "cjs" | "mjs"))
}

fn in_node_modules(path: &str) -> bool {
    path.starts_with("node_modules/") || path.contains("/node_modules/")
}

/// `rel` resolved against the bundle directory `dir`; `None` when it climbs above the bundle root.
fn resolve_rel(dir: &str, rel: &str) -> Option<String> {
    let mut parts: Vec<&str> = dir.split('/').filter(|p| !p.is_empty()).collect();
    for p in rel.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            p => parts.push(p),
        }
    }
    Some(parts.join("/"))
}

/// Bundle files outside the entries' common directory that the pages and the CSS they link reference with relative
/// paths (`../../assets/spark.svg`); `tauri::renderer_root` widens `frontend/` to keep them.
fn outside_refs(source: &Source, entries: &[String], all_paths: &[&str]) -> Vec<String> {
    let Ok(re) = Regex::new(r#"(?i)(?:\b(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')\s]+))"#) else { return Vec::new() };
    let mut probe = Manifest::default();
    probe.renderer.entries = entries.to_vec();
    let common = crate::tauri::renderer_root(&probe);
    let mut seen: BTreeSet<String> = entries.iter().cloned().collect();
    let mut work: Vec<String> = entries.to_vec();
    let mut outside = BTreeSet::new();
    while let Some(file) = work.pop() {
        let Some(text) = source.read_text(&file) else { continue };
        let dir = file.rsplit_once('/').map_or("", |(d, _)| d);
        for c in re.captures_iter(&text) {
            let raw = c.get(1).or_else(|| c.get(2)).map_or("", |m| m.as_str());
            let raw = raw.split(['#', '?']).next().unwrap_or("");
            if raw.is_empty() || raw.starts_with('/') || raw.contains(':') {
                continue;
            }
            let Some(target) = resolve_rel(dir, raw) else { continue };
            if !all_paths.contains(&target.as_str()) {
                continue;
            }
            if !common.is_empty() && !target.strip_prefix(common.as_str()).is_some_and(|r| r.starts_with('/')) {
                outside.insert(target.clone());
            }
            if (target.ends_with(".css") || target.ends_with(".html")) && seen.insert(target.clone()) {
                work.push(target);
            }
        }
    }
    outside.into_iter().collect()
}

fn string_map(v: Option<&Value>) -> BTreeMap<String, String> {
    v.and_then(Value::as_object)
        .map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
        .unwrap_or_default()
}

fn str_field(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(String::from)
}

fn protocols_from_package(pkg: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |v: Option<&Value>| {
        if let Some(arr) = v.and_then(Value::as_array) {
            for p in arr {
                if let Some(schemes) = p.get("schemes").and_then(Value::as_array) {
                    out.extend(schemes.iter().filter_map(Value::as_str).map(String::from));
                }
            }
        }
    };
    push(pkg.pointer("/build/protocols"));
    push(pkg.pointer("/build/mac/protocols"));
    push(pkg.pointer("/config/forge/packagerConfig/protocols"));
    push(pkg.pointer("/build/linux/protocols"));
    out.sort();
    out.dedup();
    out
}

fn native_info(path: &str, size: u64, unpacked: bool) -> NativeModule {
    let package = path.rsplit_once("node_modules/").map(|(_, tail)| {
        let mut it = tail.split('/');
        match it.next() {
            Some(s) if s.starts_with('@') => format!("{s}/{}", it.next().unwrap_or("")),
            Some(s) => s.to_string(),
            None => String::new(),
        }
    });
    let lower = path.to_ascii_lowercase();
    let platform = ["win32", "darwin", "linux", "freebsd", "android"].iter().find(|p| lower.contains(*p)).map(|s| s.to_string());
    let arch = ["arm64", "x64", "ia32", "x86_64", "armv7"].iter().find(|a| lower.contains(*a)).map(|s| s.to_string());
    NativeModule { path: path.to_string(), size, unpacked, package, platform, arch }
}

pub fn analyze_source(source: &Source, opts: &Options) -> Manifest {
    let mut m = Manifest { schema: SCHEMA.into(), input: source.input.display().to_string(), limits: standard_limits(), ..Manifest::default() };
    m.packaging = source.packaging();

    // package.json
    let pkg: Value = source.read_text("package.json").and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    m.app = AppInfo {
        name: str_field(&pkg, "name"),
        product_name: str_field(&pkg, "productName"),
        version: str_field(&pkg, "version"),
        description: str_field(&pkg, "description"),
        main: str_field(&pkg, "main"),
        author: pkg.get("author").and_then(|a| a.as_str().map(String::from).or_else(|| a.get("name").and_then(Value::as_str).map(String::from))),
        homepage: str_field(&pkg, "homepage"),
        dependencies: string_map(pkg.get("dependencies")),
        dev_dependencies: string_map(pkg.get("devDependencies")),
    };
    let range = m.app.dev_dependencies.get("electron").or_else(|| m.app.dependencies.get("electron")).cloned();
    m.electron = source.detect_electron(range.as_deref());

    // scan
    let mut facts = Facts::default();
    let mut role_bytes: BTreeMap<String, usize> = BTreeMap::new();
    m.scan.node_modules_scanned = opts.scan_node_modules;
    for f in source.files() {
        if !is_script(&f.path) {
            continue;
        }
        if !opts.scan_node_modules && in_node_modules(&f.path) {
            continue;
        }
        if f.size > opts.max_file_bytes {
            m.scan.skipped.push(format!("{} ({} bytes over limit)", f.path, f.size));
            continue;
        }
        let Ok(bytes) = source.read(f) else {
            m.scan.skipped.push(format!("{} (unreadable)", f.path));
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);
        m.scan.scanned += 1;
        m.scan.scanned_bytes += bytes.len() as u64;
        role_bytes.insert(f.path.clone(), bytes.len());
        match scan_source(&f.path, &text, &mut facts) {
            Ok(true) => m.scan.parse_errors.push(f.path.clone()),
            Ok(false) => {}
            Err(e) => m.scan.skipped.push(format!("{} ({e})", f.path)),
        }
    }

    // windows, loads
    m.windows = facts.windows;
    m.load_targets = facts.load_targets;

    // IPC channels
    for (name, sites) in facts.ipc {
        let mut kinds: BTreeSet<&str> = BTreeSet::new();
        for s in &sites {
            kinds.insert(match s.api.as_str() {
                "ipcMain.handle" | "ipcMain.handleOnce" | "ipcRenderer.invoke" => "request-response",
                "ipcRenderer.sendSync" => "sync",
                "webContents.send" | "webContents.postMessage" | "webContents.sendToFrame" | "event.sender.send" | "ipcRenderer.on" | "ipcRenderer.once" | "ipcRenderer.addListener" => "push",
                _ => "fire-and-forget",
            });
        }
        let pattern = if kinds.len() == 1 { kinds.into_iter().next().unwrap_or("mixed").to_string() } else { "mixed".to_string() };
        m.ipc.channels.push(IpcChannel { name, pattern, sites });
    }
    m.ipc.dynamic = facts.ipc_dynamic;

    // preloads
    let all_paths: Vec<&str> = source.files().iter().map(|f| f.path.as_str()).collect();
    let mut preloads: BTreeMap<String, Preload> = BTreeMap::new();
    for w in &m.windows {
        let Some(p) = &w.preload else { continue };
        let (path, ok) = if all_paths.contains(&p.as_str()) {
            (p.clone(), true)
        } else {
            let base = p.rsplit('/').next().unwrap_or(p);
            match all_paths.iter().find(|x| x.rsplit('/').next() == Some(base) && !in_node_modules(x)) {
                Some(found) => (found.to_string(), true),
                None => (p.clone(), false),
            }
        };
        let e = preloads.entry(path.clone()).or_insert_with(|| Preload { path, resolved_in_bundle: ok, referenced_by: Vec::new() });
        e.referenced_by.push(w.site.clone());
    }
    for (file, (main, pre, _)) in &facts.file_flags {
        if *pre && !*main && !preloads.contains_key(file) {
            preloads.insert(file.clone(), Preload { path: file.clone(), resolved_in_bundle: true, referenced_by: Vec::new() });
        }
    }
    m.preloads = preloads.into_values().collect();

    // context bridge + renderer usage
    m.context_bridge = facts.bridge;
    if !m.context_bridge.is_empty() {
        for api in &mut m.context_bridge {
            let Ok(re) = Regex::new(&format!(r"\b{}\.([A-Za-z_$][\w$]*)", regex::escape(&api.name))) else { continue };
            for f in source.files() {
                let ext = f.path.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
                let main_like = facts.file_flags.get(&f.path).is_some_and(|(main, _, _)| *main);
                if !matches!(ext, "js" | "mjs" | "cjs" | "html") || in_node_modules(&f.path) || main_like || f.size > opts.max_file_bytes {
                    continue;
                }
                if let Some(t) = source.read_text(&f.path) {
                    for c in re.captures_iter(&t) {
                        *api.renderer_usage.entry(c[1].to_string()).or_default() += 1;
                    }
                }
            }
        }
    }

    m.node_apis = facts.node;
    m.electron_apis = facts.electron_apis;
    m.app_events = facts.app_events;

    // native modules
    for f in source.files() {
        if f.path.ends_with(".node") {
            m.native_modules.push(native_info(&f.path, f.size, f.unpacked));
        }
    }
    let mut native_deps: BTreeSet<String> = facts.native_imports;
    native_deps.extend(m.app.dependencies.keys().filter(|k| is_native_package(k)).cloned());
    native_deps.extend(m.native_modules.iter().filter_map(|n| n.package.clone()));
    m.native_dependencies = native_deps.into_iter().collect();

    // protocols and deep links
    m.protocols = ProtocolInfo { privileged_schemes: facts.schemes, handlers: facts.proto_handlers, default_clients: facts.default_clients };
    m.deep_links = facts.deep;
    m.deep_links.package_json_protocols = protocols_from_package(&pkg);
    for s in m.deep_links.package_json_protocols.clone() {
        if !m.deep_links.schemes.contains(&s) {
            m.deep_links.schemes.push(s);
        }
    }

    // menus, tray, updater
    m.menus = facts.menus;
    m.tray = facts.tray;
    m.tray.used = m.tray.used || !m.tray.sites.is_empty();
    m.auto_updater = facts.updater;
    if m.packaging.squirrel_layout && !m.auto_updater.providers.iter().any(|p| p == "squirrel") {
        m.auto_updater.providers.push("squirrel".into());
    }

    // renderer entries
    let mut entries: BTreeSet<String> = BTreeSet::new();
    let mut remote: BTreeSet<String> = BTreeSet::new();
    for t in &m.load_targets {
        if t.kind == "file" && all_paths.contains(&t.target.as_str()) {
            entries.insert(t.target.clone());
        } else if t.kind == "url" && (t.target.starts_with("http://") || t.target.starts_with("https://")) {
            remote.insert(t.target.clone());
        }
    }
    if entries.is_empty() && remote.is_empty() {
        for p in &all_paths {
            if p.ends_with(".html") && !in_node_modules(p) && entries.len() < 8 {
                entries.insert((*p).to_string());
            }
        }
    }
    let entries: Vec<String> = entries.into_iter().collect();
    let outside_refs = outside_refs(source, &entries, &all_paths);
    m.renderer = Renderer { entries, remote_urls: remote.into_iter().collect(), outside_refs };

    // file roles
    for (file, (main, pre, _)) in &facts.file_flags {
        let role = match (*main, *pre) {
            (true, true) => "main+preload",
            (true, false) => "main",
            (false, true) => "preload",
            (false, false) => continue,
        };
        m.files.push(FileRole { path: file.clone(), role: role.into(), bytes: role_bytes.get(file).copied().unwrap_or(0) });
    }
    m
}

pub fn to_json(m: &Manifest) -> String {
    serde_json::to_string_pretty(m).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
}

/// Human summary printed next to the JSON manifest.
pub fn summary(m: &Manifest) -> String {
    let n = |x: usize| x.to_string();
    let mut s = String::new();
    s.push_str(&format!(
        "{} {}  electron {} ({})  {} files, {} bytes\n",
        m.app.product_name.as_deref().or(m.app.name.as_deref()).unwrap_or("?"),
        m.app.version.as_deref().unwrap_or("?"),
        m.electron.version.as_deref().unwrap_or("?"),
        m.electron.version_source,
        m.packaging.files,
        m.packaging.total_bytes
    ));
    s.push_str(&format!(
        "windows {}  preloads {}  ipc channels {} (+{} dynamic)  bridge APIs {}  native modules {}  menus {}  tray {}  updater {:?}  schemes {:?}\n",
        n(m.windows.len()),
        n(m.preloads.len()),
        n(m.ipc.channels.len()),
        n(m.ipc.dynamic.len()),
        n(m.context_bridge.len()),
        n(m.native_modules.len()),
        n(m.menus.templates.len()),
        m.tray.used,
        m.auto_updater.providers,
        m.deep_links.schemes
    ));
    s.push_str(&format!("scanned {} scripts ({} parse errors, {} skipped); heuristic scan, see `limits`\n", m.scan.scanned, m.scan.parse_errors.len(), m.scan.skipped.len()));
    s
}
