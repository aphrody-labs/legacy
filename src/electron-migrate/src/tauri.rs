//! Tauri target: `src-tauri/` project on the aphrody-labs/tauri fork, `tauri.conf.json`, capabilities,
//! the Rust host (commands per IPC channel, Bun sidecar bridge, menu, tray) and the renderer shim.
//!
//! Fork pin (read by `Cargo.toml` generation): [`TAURI_FORK_REPO`], [`TAURI_FORK_BRANCH`], [`TAURI_FORK_REV`].
//! The dependency is declared with a crates.io version requirement and redirected through `[patch.crates-io]`,
//! so changing the pin (or dropping the patch) never touches the rest of the manifest. Tauri v3 plugins come
//! from the `v3` branch of tauri-apps/plugins-workspace and resolve `tauri` through the same patch.

use crate::manifest::{Manifest, MenuItemDecl};
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;

/// aphrody-labs/tauri fork, branch `v3` (tauri 3.0.0-alpha.6 at this rev; pin supplied by the fork owner,
/// verified with `cargo check` on fr1 on 2026-11-15). `[patch.crates-io]` pins the rev (cargo rejects
/// `branch` together with `rev`); an empty rev falls back to the branch.
pub const TAURI_FORK_REPO: &str = "https://github.com/aphrody-labs/tauri";
pub const TAURI_FORK_BRANCH: &str = "v3";
pub const TAURI_FORK_REV: &str = "271c15e1eaebb8e12aac8c4e63eead1ff17fd93a";
/// Requirement the patched crates must satisfy (fork `v3` is 3.0.0-alpha.6).
pub const TAURI_VERSION_REQ: &str = "3.0.0-alpha";
/// `@tauri-apps/api` / `@tauri-apps/cli` on npm: dist-tag `next` is 3.0.0-alpha.3 (`bun pm view`, 2026-11-15).
pub const TAURI_NPM_API_REQ: &str = "^3.0.0-alpha.3";
pub const TAURI_NPM_CLI_REQ: &str = "next";
/// Tauri v3 plugins live on the `v3` branch of tauri-apps/plugins-workspace (no aphrody-labs fork yet).
pub const TAURI_PLUGINS_REPO: &str = "https://github.com/tauri-apps/plugins-workspace";
pub const TAURI_PLUGINS_BRANCH: &str = "v3";

const FORK_CRATES: &[&str] = &["tauri", "tauri-build", "tauri-codegen", "tauri-macros", "tauri-plugin", "tauri-runtime", "tauri-runtime-wry", "tauri-utils"];

fn fork_ref() -> String {
    if TAURI_FORK_REV.is_empty() { format!("branch = \"{TAURI_FORK_BRANCH}\"") } else { format!("rev = \"{TAURI_FORK_REV}\"") }
}

/// Rust identifier for a channel: `app:get-state` becomes `app_get_state`.
pub fn ident(channel: &str) -> String {
    let mut out = String::new();
    let mut last_us = true;
    for c in channel.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_us = false;
        } else if !last_us {
            out.push('_');
            last_us = true;
        }
    }
    while out.ends_with('_') {
        out.pop();
    }
    if out.is_empty() {
        return "channel".into();
    }
    if out.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        out.insert_str(0, "c_");
    }
    out
}

/// Tauri event names allow `[A-Za-z0-9-/:_]`; anything else becomes `_`. The shim uses the same rule.
pub fn event_name(channel: &str) -> String {
    channel.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '/' | ':' | '_') { c } else { '_' }).collect()
}

pub fn slug(s: &str) -> String {
    let id = ident(s).replace('_', "-");
    if id == "channel" && s.trim().is_empty() { "app".into() } else { id }
}

pub fn rust_str(s: &str) -> String {
    format!("{s:?}")
}

/// Unique `(channel, command ident)` pairs for the literal channels the main process handles.
pub fn command_channels(m: &Manifest) -> Vec<(String, String)> {
    let mut used = BTreeSet::new();
    let mut out = Vec::new();
    for c in &m.ipc.channels {
        let handled = c.sites.iter().any(|s| matches!(s.api.as_str(), "ipcMain.handle" | "ipcMain.handleOnce" | "ipcMain.on" | "ipcMain.once"));
        if !handled {
            continue;
        }
        let base = ident(&c.name);
        let mut id = base.clone();
        let mut n = 2;
        while !used.insert(id.clone()) {
            id = format!("{base}_{n}");
            n += 1;
        }
        out.push((c.name.clone(), id));
    }
    out
}

pub fn push_channels(m: &Manifest) -> Vec<String> {
    m.ipc.channels.iter().filter(|c| c.sites.iter().any(|s| s.api.starts_with("webContents.") || s.api == "event.sender.send" || s.api.starts_with("ipcRenderer.on"))).map(|c| c.name.clone()).collect()
}

fn plugins_used(m: &Manifest) -> BTreeSet<&'static str> {
    let has = |p: &str| m.electron_apis.keys().any(|k| k == p || k.starts_with(&format!("{p}.")));
    let mut s = BTreeSet::new();
    if has("shell") {
        s.insert("opener");
    }
    if has("dialog") {
        s.insert("dialog");
    }
    if has("clipboard") {
        s.insert("clipboard-manager");
    }
    if has("new Notification") || has("Notification") {
        s.insert("notification");
    }
    if has("globalShortcut") {
        s.insert("global-shortcut");
    }
    if has("autoUpdater") || !m.auto_updater.providers.is_empty() {
        s.insert("updater");
        s.insert("process");
    }
    if !m.deep_links.schemes.is_empty() || m.deep_links.open_url_handler {
        s.insert("deep-link");
    }
    if m.deep_links.single_instance_lock || m.deep_links.second_instance_handler {
        s.insert("single-instance");
    }
    s
}

/// Path of a bundle file inside `frontend/` (the renderer root is stripped).
pub fn frontend_path(m: &Manifest, bundle_path: &str) -> String {
    let root = renderer_root(m);
    bundle_path.strip_prefix(&root).map_or(bundle_path, |r| r.trim_start_matches('/')).to_string()
}

fn first_window_url(m: &Manifest) -> String {
    if let Some(e) = m.renderer.entries.first() {
        return frontend_path(m, e);
    }
    m.renderer.remote_urls.first().cloned().unwrap_or_else(|| "index.html".into())
}

/// URL of one window: the nearest `loadFile`/`loadURL` after its construction in the same file,
/// else the first renderer entry.
fn window_url(m: &Manifest, w: Option<&crate::manifest::WindowDecl>) -> String {
    let Some(w) = w else { return first_window_url(m) };
    let nearest = m.load_targets.iter().filter(|t| t.site.file == w.site.file && t.site.line >= w.site.line).min_by_key(|t| t.site.line);
    match nearest {
        Some(t) if t.kind == "file" => frontend_path(m, &t.target),
        Some(t) => t.target.clone(),
        None => first_window_url(m),
    }
}

/// Directory of an HTML entry inside the bundle (`""` when at the root).
pub fn renderer_dir(entry: &str) -> String {
    entry.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default()
}

/// Deepest directory containing every HTML entry (`""` when they share none): the `frontend/` root.
pub fn renderer_root(m: &Manifest) -> String {
    let mut common: Option<Vec<String>> = None;
    for e in &m.renderer.entries {
        let parts: Vec<String> = renderer_dir(e).split('/').filter(|p| !p.is_empty()).map(String::from).collect();
        common = Some(match common {
            None => parts,
            Some(c) => c.into_iter().zip(parts).take_while(|(a, b)| a == b).map(|(a, _)| a).collect(),
        });
    }
    common.unwrap_or_default().join("/")
}

fn window_config(m: &Manifest) -> Vec<Value> {
    let default_title = m.app.product_name.clone().or_else(|| m.app.name.clone()).unwrap_or_else(|| "App".into());
    let mut out = Vec::new();
    let wins: Vec<_> = m.windows.iter().filter(|w| w.kind == "BrowserWindow" || w.kind == "BaseWindow").collect();
    let list = if wins.is_empty() { vec![None] } else { wins.into_iter().map(Some).collect() };
    for (i, w) in list.into_iter().enumerate() {
        let mut cfg = Map::new();
        cfg.insert("label".into(), json!(if i == 0 { "main".to_string() } else { format!("window-{}", i + 1) }));
        cfg.insert("create".into(), json!(false));
        cfg.insert("title".into(), json!(default_title));
        cfg.insert("url".into(), json!(window_url(m, w)));
        if let Some(opts) = w.and_then(|w| w.options.as_object()) {
            let lit = |k: &str| opts.get(k).filter(|v| !v.is_null() && v.get("$expr").is_none());
            for (src, dst) in [
                ("width", "width"),
                ("height", "height"),
                ("minWidth", "minWidth"),
                ("minHeight", "minHeight"),
                ("maxWidth", "maxWidth"),
                ("maxHeight", "maxHeight"),
                ("x", "x"),
                ("y", "y"),
                ("center", "center"),
                ("resizable", "resizable"),
                ("fullscreen", "fullscreen"),
                ("alwaysOnTop", "alwaysOnTop"),
                ("title", "title"),
                ("show", "visible"),
                ("skipTaskbar", "skipTaskbar"),
                ("minimizable", "minimizable"),
                ("maximizable", "maximizable"),
                ("closable", "closable"),
                ("focusable", "focus"),
                ("frame", "decorations"),
                ("transparent", "transparent"),
                ("backgroundColor", "backgroundColor"),
            ] {
                if let Some(v) = lit(src) {
                    // Electron titles may be numbers or strings only; skip anything else.
                    if matches!(v, Value::Number(_) | Value::Bool(_) | Value::String(_)) {
                        cfg.insert(dst.into(), v.clone());
                    }
                }
            }
            if let Some(dt) = opts.get("webPreferences").and_then(|w| w.get("devTools")).filter(|v| v.is_boolean()) {
                cfg.insert("devtools".into(), dt.clone());
            }
        }
        out.push(Value::Object(cfg));
    }
    out
}

pub fn tauri_conf(m: &Manifest) -> Value {
    let name = m.app.product_name.clone().or_else(|| m.app.name.clone()).unwrap_or_else(|| "app".into());
    let mut conf = json!({
        "productName": name,
        "version": m.app.version.clone().unwrap_or_else(|| "0.1.0".into()),
        "identifier": format!("com.aphrody.migrated.{}", slug(&name).replace('-', "")),
        "build": { "beforeBuildCommand": "bun run build", "frontendDist": "../dist" },
        "app": { "withGlobalTauri": false, "security": { "csp": null }, "windows": window_config(m) },
        "bundle": { "active": true, "targets": "all", "icon": ["icons/icon.png", "icons/icon.ico"], "externalBin": ["binaries/electron-main"] },
    });
    if !m.deep_links.schemes.is_empty() {
        conf["plugins"] = json!({ "deep-link": { "desktop": { "schemes": m.deep_links.schemes } } });
    }
    conf
}

fn origin_pattern(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://").map(|r| ("https://", r)).or_else(|| url.strip_prefix("http://").map(|r| ("http://", r)))?;
    let host = rest.1.split('/').next()?;
    Some(format!("{}{host}/*", rest.0))
}

pub fn capabilities(m: &Manifest) -> Value {
    let mut perms: Vec<String> = vec!["core:default".into(), "core:event:default".into()];
    for p in plugins_used(m) {
        match p {
            "single-instance" => {}
            "clipboard-manager" => perms.extend(["clipboard-manager:allow-read-text".into(), "clipboard-manager:allow-write-text".into()]),
            other => perms.push(format!("{other}:default")),
        }
    }
    let mut cap = json!({ "identifier": "default", "windows": ["*"], "permissions": perms });
    let urls: Vec<String> = m.renderer.remote_urls.iter().filter_map(|u| origin_pattern(u)).collect::<BTreeSet<_>>().into_iter().collect();
    if !urls.is_empty() {
        cap["remote"] = json!({ "urls": urls });
    }
    cap
}

pub fn cargo_toml(m: &Manifest) -> String {
    let name = slug(m.app.product_name.as_deref().or(m.app.name.as_deref()).unwrap_or("app"));
    let plugins = plugins_used(m);
    let mut s = String::new();
    s.push_str(&format!(
        "# Generated by `ay electron migrate --to tauri`. Tauri v3 alpha comes from the aphrody-labs/tauri fork through\n# [patch.crates-io] (repo, branch and rev are constants of the generator: TAURI_FORK_*).\n[package]\nname = \"{name}\"\nversion = \"{}\"\nedition = \"2024\"\ndescription = {}\npublish = false\n\n[build-dependencies]\ntauri-build = \"{TAURI_VERSION_REQ}\"\n\n[dependencies]\n",
        m.app.version.as_deref().unwrap_or("0.1.0"),
        rust_str(m.app.description.as_deref().unwrap_or("Electron app migrated to Tauri")),
    ));
    let mut features = vec!["devtools"];
    if m.tray.used {
        features.push("tray-icon");
    }
    let feat = features.iter().map(|f| format!("\"{f}\"")).collect::<Vec<_>>().join(", ");
    s.push_str(&format!("tauri = {{ version = \"{TAURI_VERSION_REQ}\", features = [{feat}] }}\ntauri-runtime-wry = {{ version = \"{TAURI_VERSION_REQ}\", features = [\"devtools\"] }}\n"));
    for p in &plugins {
        s.push_str(&format!("tauri-plugin-{p} = {{ git = \"{TAURI_PLUGINS_REPO}\", branch = \"{TAURI_PLUGINS_BRANCH}\" }}\n"));
    }
    s.push_str("serde = { version = \"1\", features = [\"derive\"] }\nserde_json = \"1\"\ntokio = { version = \"1\", features = [\"sync\"] }\n\n[patch.crates-io]\n");
    for c in FORK_CRATES {
        s.push_str(&format!("{c} = {{ git = \"{TAURI_FORK_REPO}\", {} }}\n", fork_ref()));
    }
    s
}

pub fn build_rs() -> &'static str {
    "fn main() {\n    tauri_build::build();\n}\n"
}

const SIDECAR_RS: &str = r##"//! Host side of the Bun sidecar: newline-delimited JSON over stdin/stdout.
//! host -> sidecar: {"t":"invoke","id","channel","args"} | {"t":"send","channel","args"} | {"t":"hostresult","id","ok","value"|"error"}
//! sidecar -> host: {"t":"result","id","ok","value"|"error"} | {"t":"emit","channel","args"} | {"t":"host","id","api","args"}

use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::oneshot;

pub fn event_name(channel: &str) -> String {
    channel.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '/' | ':' | '_') { c } else { '_' }).collect()
}

#[derive(Default)]
pub struct Sidecar {
    stdin: Mutex<Option<ChildStdin>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    next: AtomicU64,
}

/// The compiled sidecar sits next to the app executable (`externalBin` strips the target triple on bundling);
/// `AY_SIDECAR` overrides it, `src-tauri/binaries/electron-main-<triple>` is the development fallback.
fn sidecar_path() -> std::path::PathBuf {
    if let Some(p) = std::env::var_os("AY_SIDECAR") {
        return p.into();
    }
    let exe = std::env::current_exe().expect("current exe");
    let dir = exe.parent().expect("exe dir");
    dir.join(if cfg!(windows) { "electron-main.exe" } else { "electron-main" })
}

fn app_paths<R: Runtime>(app: &AppHandle<R>) -> Value {
    let p = app.path();
    let s = |r: tauri::Result<std::path::PathBuf>| r.ok().map(|p| p.display().to_string());
    json!({
        "userData": s(p.app_data_dir()),
        "appData": s(p.data_dir()),
        "temp": s(p.temp_dir()),
        "home": s(p.home_dir()),
        "downloads": s(p.download_dir()),
        "documents": s(p.document_dir()),
        "desktop": s(p.desktop_dir()),
        "logs": s(p.app_log_dir()),
        "exe": std::env::current_exe().ok().map(|p| p.display().to_string()),
    })
}

impl Sidecar {
    pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
        let info = app.package_info();
        let mut child = Command::new(sidecar_path())
            .env("AY_APP_NAME", info.name.clone())
            .env("AY_APP_VERSION", info.version.to_string())
            .env("AY_APP_PATHS", app_paths(app).to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        *app.state::<Sidecar>().stdin.lock().unwrap() = child.stdin.take();
        let stdout = child.stdout.take().ok_or("sidecar stdout")?;
        let stderr = child.stderr.take().ok_or("sidecar stderr")?;
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[sidecar] {line}");
            }
        });
        let handle = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                on_line(&handle, line.as_bytes());
            }
            eprintln!("[sidecar] exited: {:?}", child.wait());
            let state = handle.state::<Sidecar>();
            let pending: Vec<_> = state.pending.lock().unwrap().drain().collect();
            for (_, tx) in pending {
                let _ = tx.send(Err("sidecar exited".into()));
            }
        });
        Ok(())
    }

    fn write(&self, msg: &Value) -> Result<(), String> {
        let mut line = serde_json::to_vec(msg).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let mut guard = self.stdin.lock().unwrap();
        let stdin = guard.as_mut().ok_or("sidecar is not running")?;
        stdin.write_all(&line).and_then(|()| stdin.flush()).map_err(|e| e.to_string())
    }

    pub async fn invoke(&self, channel: &str, args: Vec<Value>) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        if let Err(e) = self.write(&json!({ "t": "invoke", "id": id, "channel": channel, "args": args })) {
            self.pending.lock().unwrap().remove(&id);
            return Err(e);
        }
        rx.await.map_err(|_| "the sidecar dropped the request".to_string())?
    }

    pub fn send(&self, channel: &str, args: Vec<Value>) -> Result<(), String> {
        self.write(&json!({ "t": "send", "channel": channel, "args": args }))
    }
}

fn on_line<R: Runtime>(app: &AppHandle<R>, line: &[u8]) {
    let Ok(msg) = serde_json::from_slice::<Value>(line) else {
        eprintln!("[sidecar] stdout: {}", String::from_utf8_lossy(line).trim_end());
        return;
    };
    match msg["t"].as_str() {
        Some("result") => {
            let Some(id) = msg["id"].as_u64() else { return };
            let tx = app.state::<Sidecar>().pending.lock().unwrap().remove(&id);
            if let Some(tx) = tx {
                let r = if msg["ok"].as_bool().unwrap_or(false) { Ok(msg["value"].clone()) } else { Err(msg["error"].as_str().unwrap_or("error").to_string()) };
                let _ = tx.send(r);
            }
        }
        Some("emit") => {
            let channel = msg["channel"].as_str().unwrap_or_default();
            let _ = app.emit(&event_name(channel), msg["args"].clone());
        }
        Some("host") => {
            let id = msg["id"].clone();
            let api = msg["api"].as_str().unwrap_or_default().to_string();
            let args = msg["args"].as_array().cloned().unwrap_or_default();
            let reply = match host_call(app, &api, &args) {
                Ok(v) => json!({ "t": "hostresult", "id": id, "ok": true, "value": v }),
                Err(e) => json!({ "t": "hostresult", "id": id, "ok": false, "error": e }),
            };
            let _ = app.state::<Sidecar>().write(&reply);
        }
        _ => {}
    }
}

/// Electron APIs the sidecar cannot serve itself. Extend the match for the APIs the app uses.
fn host_call<R: Runtime>(app: &AppHandle<R>, api: &str, args: &[Value]) -> Result<Value, String> {
    let _ = args;
    match api {
@HOST_ARMS@
        "app.quit" | "app.exit" => {
            app.exit(0);
            Ok(Value::Null)
        }
        other => Err(format!("host API `{other}` is not implemented (see MAPPING.md)")),
    }
}
"##;

fn host_arms(m: &Manifest) -> String {
    let mut s = String::new();
    if plugins_used(m).contains("opener") {
        s.push_str("        \"shell.openExternal\" => {\n            use tauri_plugin_opener::OpenerExt;\n            let url = args.first().and_then(Value::as_str).ok_or(\"url required\")?;\n            app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;\n            Ok(Value::Null)\n        }\n        \"shell.openPath\" => {\n            use tauri_plugin_opener::OpenerExt;\n            let path = args.first().and_then(Value::as_str).ok_or(\"path required\")?;\n            app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;\n            Ok(Value::Null)\n        }\n");
    }
    s
}

pub fn sidecar_rs(m: &Manifest) -> String {
    SIDECAR_RS.replace("@HOST_ARMS@\n", &host_arms(m))
}

#[derive(Debug)]
struct MenuNode<'a> {
    decl: &'a MenuItemDecl,
    children: Vec<MenuNode<'a>>,
}

fn menu_tree(items: &[MenuItemDecl]) -> Vec<MenuNode<'_>> {
    fn build<'a>(items: &'a [MenuItemDecl], i: &mut usize, depth: usize) -> Vec<MenuNode<'a>> {
        let mut out = Vec::new();
        while *i < items.len() && items[*i].depth >= depth {
            if items[*i].depth > depth {
                // Orphan deeper item (malformed nesting): attach to the previous node or skip.
                *i += 1;
                continue;
            }
            let decl = &items[*i];
            *i += 1;
            let children = build(items, i, depth + 1);
            out.push(MenuNode { decl, children });
        }
        out
    }
    let mut i = 0;
    build(items, &mut i, 0)
}

fn role_method(role: &str) -> Option<&'static str> {
    Some(match role.to_ascii_lowercase().as_str() {
        "quit" => "quit()",
        "copy" => "copy()",
        "cut" => "cut()",
        "paste" => "paste()",
        "undo" => "undo()",
        "redo" => "redo()",
        "selectall" => "select_all()",
        "minimize" => "minimize()",
        "close" => "close_window()",
        "about" => "about(None)",
        "hide" => "hide()",
        "hideothers" => "hide_others()",
        "unhide" => "show_all()",
        "togglefullscreen" => "fullscreen()",
        "zoom" => "maximize()",
        _ => return None,
    })
}

fn emit_menu(nodes: &[MenuNode<'_>], ids: &mut Vec<String>, counter: &mut usize, out: &mut String, depth: usize) {
    let pad = "    ".repeat(depth + 2);
    for n in nodes {
        let d = n.decl;
        let label = d.label.clone().or_else(|| d.role.clone()).unwrap_or_else(|| "Item".into());
        if !n.children.is_empty() {
            out.push_str(&format!("{pad}.item(&{{\n{pad}    let sub = SubmenuBuilder::new(app, {})\n", rust_str(&label)));
            let mut inner = String::new();
            emit_menu(&n.children, ids, counter, &mut inner, depth + 1);
            out.push_str(&inner);
            out.push_str(&format!("{pad}    .build()?;\n{pad}    sub\n{pad}}})\n"));
            continue;
        }
        if d.kind == "separator" {
            out.push_str(&format!("{pad}.separator()\n"));
        } else if let Some(m) = d.role.as_deref().and_then(role_method) {
            out.push_str(&format!("{pad}.{m}\n"));
        } else {
            *counter += 1;
            let id = format!("menu:{}-{}", slug(&label), counter);
            ids.push(id.clone());
            let accel = d.accelerator.as_ref().map(|a| format!(".accelerator({})", rust_str(a))).unwrap_or_default();
            let role_note = d.role.as_ref().map(|r| format!(" // electron role `{r}` has no predefined Tauri item")).unwrap_or_default();
            out.push_str(&format!("{pad}.item(&MenuItemBuilder::with_id({}, {}){accel}.build(app)?){role_note}\n", rust_str(&id), rust_str(&label)));
        }
    }
}

pub fn menu_rs(m: &Manifest) -> Option<String> {
    let tpl = m.menus.templates.iter().filter(|t| !t.items.is_empty()).max_by_key(|t| t.items.len())?;
    let tree = menu_tree(&tpl.items);
    let mut body = String::new();
    let mut ids = Vec::new();
    let mut counter = 0;
    for n in &tree {
        let label = n.decl.label.clone().or_else(|| n.decl.role.clone()).unwrap_or_else(|| "Menu".into());
        body.push_str(&format!("    let sub = SubmenuBuilder::new(app, {})\n", rust_str(&label)));
        let mut inner = String::new();
        emit_menu(&n.children, &mut ids, &mut counter, &mut inner, 0);
        body.push_str(&inner);
        body.push_str("        .build()?;\n    menu = menu.item(&sub);\n");
    }
    Some(format!(
        "//! Application menu from the largest `Menu.buildFromTemplate` found ({} items at {}:{}).\n//! Items without a predefined role emit `menu-click` with their id; click bodies stay in the original code (MAPPING.md).\n\nuse tauri::menu::{{MenuBuilder, MenuItemBuilder, SubmenuBuilder}};\nuse tauri::{{AppHandle, Emitter, Runtime}};\n\npub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {{\n    let mut menu = MenuBuilder::new(app);\n{body}    app.set_menu(menu.build()?)?;\n    app.on_menu_event(|app, event| {{\n        let _ = app.emit(\"menu-click\", event.id().as_ref());\n    }});\n    Ok(())\n}}\n",
        tpl.items.len(),
        tpl.site.file,
        tpl.site.line
    ))
}

pub fn main_rs(m: &Manifest) -> String {
    let cmds = command_channels(m);
    let has_menu = menu_rs(m).is_some();
    let plugins = plugins_used(m);
    let mut s = String::new();
    s.push_str("//! Generated by `ay electron migrate --to tauri`. Do not edit the channel table by hand; re-run the migration.\n#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]\n\nmod sidecar;\n");
    if has_menu {
        s.push_str("mod menu;\n");
    }
    s.push_str("\nuse serde_json::Value;\nuse sidecar::Sidecar;\nuse tauri::{State, WebviewWindowBuilder};\n\n/// Renderer shim (`bun run build:shim`): window.electronAPI-style bridges over invoke/listen.\nconst SHIM: &str = include_str!(\"../shim/electron-compat.js\");\n\n");
    s.push_str("/// Generic dispatcher for channels without a typed command (dynamic names).\n#[tauri::command]\nasync fn electron_ipc(state: State<'_, Sidecar>, channel: String, args: Option<Vec<Value>>) -> Result<Value, String> {\n    state.invoke(&channel, args.unwrap_or_default()).await\n}\n\n#[tauri::command]\nfn electron_send(state: State<'_, Sidecar>, channel: String, args: Option<Vec<Value>>) -> Result<(), String> {\n    state.send(&channel, args.unwrap_or_default())\n}\n\n");
    for (channel, id) in &cmds {
        s.push_str(&format!("#[tauri::command]\nasync fn ipc_{id}(state: State<'_, Sidecar>, args: Option<Vec<Value>>) -> Result<Value, String> {{\n    state.invoke({}, args.unwrap_or_default()).await\n}}\n\n", rust_str(channel)));
    }
    s.push_str("fn main() {\n    // Tauri v3: the runtime is an explicit value (wry; the fork also ships tauri-runtime-cef).\n    tauri::Builder::default()\n        .runtime(tauri_runtime_wry::Wry::default())\n        .manage(Sidecar::default())\n");
    for p in &plugins {
        let init = match *p {
            "single-instance" => "        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {\n            use tauri::Emitter;\n            let _ = app.emit(\"second-instance\", argv);\n        }))\n".to_string(),
            "updater" => "        .plugin(tauri_plugin_updater::Builder::new().build())\n".to_string(),
            other => format!("        .plugin(tauri_plugin_{}::init())\n", other.replace('-', "_")),
        };
        s.push_str(&init);
    }
    let mut handlers = vec!["electron_ipc".to_string(), "electron_send".to_string()];
    handlers.extend(cmds.iter().map(|(_, id)| format!("ipc_{id}")));
    s.push_str(&format!("        .invoke_handler(tauri::generate_handler![{}])\n", handlers.join(", ")));
    s.push_str("        .setup(|app| {\n            Sidecar::start(app.handle())?;\n            let windows = app.config().app.windows.clone();\n            for cfg in windows.iter() {\n                WebviewWindowBuilder::from_config(app.handle(), cfg)?.initialization_script(SHIM).build()?;\n            }\n");
    if has_menu {
        s.push_str("            menu::install(app.handle())?;\n");
    }
    if m.tray.used {
        s.push_str("            let mut tray = tauri::tray::TrayIconBuilder::new();\n            if let Some(icon) = app.default_window_icon() {\n                tray = tray.icon(icon.clone());\n            }\n            tray.build(app)?;\n");
    }
    s.push_str("            Ok(())\n        })\n        .run(tauri::generate_context!())\n        .expect(\"error while running the Tauri application\");\n}\n");
    s
}

/// Renderer-side compat layer. Channel -> command / event names are embedded so the shim never guesses.
pub fn shim_ts(m: &Manifest) -> String {
    let cmds = command_channels(m);
    let cmd_map: Map<String, Value> = cmds.iter().map(|(c, id)| (c.clone(), json!(format!("ipc_{id}")))).collect();
    let mut bridges = String::new();
    for b in &m.context_bridge {
        bridges.push_str(&format!("  expose({}, {{\n", rust_str(&b.name)));
        for k in &b.keys {
            let key = rust_str(&k.name);
            match (&k.channel, k.kind.as_deref()) {
                (Some(ch), Some("invoke")) => bridges.push_str(&format!("    {key}: (...args: unknown[]) => ipcRenderer.invoke({}, ...args),\n", rust_str(ch))),
                (Some(ch), Some("send")) => bridges.push_str(&format!("    {key}: (...args: unknown[]) => ipcRenderer.send({}, ...args),\n", rust_str(ch))),
                (Some(ch), Some("sendSync")) => bridges.push_str(&format!("    {key}: (..._args: unknown[]) => notSupported({}),\n", rust_str(&format!("ipcRenderer.sendSync(\"{ch}\")")))),
                (Some(ch), Some("on" | "once")) => bridges.push_str(&format!("    {key}: (cb: Listener) => {{ ipcRenderer.on({}, cb); return () => ipcRenderer.removeListener({}, cb); }},\n", rust_str(ch), rust_str(ch))),
                _ => bridges.push_str(&format!("    {key}: (..._args: unknown[]) => notMigrated({}),\n", rust_str(&format!("{}.{}", b.name, k.name)))),
            }
        }
        bridges.push_str("  });\n");
    }
    SHIM_TS.replace("@COMMANDS@", &Value::Object(cmd_map).to_string()).replace("@BRIDGES@", &bridges)
}

const SHIM_TS: &str = r##"// Generated by `ay electron migrate --to tauri`. window.<bridge> compat over @tauri-apps/api invoke/listen.
// Built by `bun run build:shim` into src-tauri/shim/electron-compat.js (iife) and injected into every window.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Listener = (event: { sender: unknown }, ...args: unknown[]) => void;

const COMMANDS: Record<string, string> = @COMMANDS@;

const eventName = (channel: string) => channel.replace(/[^A-Za-z0-9\-/:_]/g, "_");
const notSupported = (what: string): never => { throw new Error(`${what} has no Tauri equivalent`); };
const notMigrated = (what: string): never => { throw new Error(`${what} was not migrated automatically (see MAPPING.md)`); };

const unlisteners = new Map<string, Map<Listener, Promise<UnlistenFn>>>();

export const ipcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const cmd = COMMANDS[channel];
    return cmd ? invoke(cmd, { args }) : invoke("electron_ipc", { channel, args });
  },
  send(channel: string, ...args: unknown[]): void {
    void invoke("electron_send", { channel, args });
  },
  sendSync(channel: string): never {
    return notSupported(`ipcRenderer.sendSync("${channel}")`);
  },
  on(channel: string, listener: Listener) {
    const map = unlisteners.get(channel) ?? new Map();
    unlisteners.set(channel, map);
    map.set(listener, listen<unknown[]>(eventName(channel), (e) => listener({ sender: ipcRenderer }, ...(Array.isArray(e.payload) ? e.payload : [e.payload]))));
    return ipcRenderer;
  },
  once(channel: string, listener: Listener) {
    const wrapped: Listener = (ev, ...a) => { ipcRenderer.removeListener(channel, wrapped); listener(ev, ...a); };
    return ipcRenderer.on(channel, wrapped);
  },
  removeListener(channel: string, listener: Listener) {
    const un = unlisteners.get(channel)?.get(listener);
    if (un) { void un.then((f) => f()); unlisteners.get(channel)?.delete(listener); }
    return ipcRenderer;
  },
  removeAllListeners(channel?: string) {
    for (const [ch, map] of [...unlisteners]) {
      if (channel && ch !== channel) continue;
      for (const l of [...map.keys()]) ipcRenderer.removeListener(ch, l);
    }
    return ipcRenderer;
  },
};

function expose(name: string, api: Record<string, unknown>) {
  (window as unknown as Record<string, unknown>)[name] = Object.freeze(api);
}

(window as unknown as Record<string, unknown>).__electronCompat = { ipcRenderer };

@BRIDGES@
"##;

pub fn package_json(m: &Manifest) -> String {
    let name = slug(m.app.product_name.as_deref().or(m.app.name.as_deref()).unwrap_or("app"));
    let html: Vec<String> = if m.renderer.entries.is_empty() { vec!["frontend/index.html".into()] } else { m.renderer.entries.iter().map(|e| format!("frontend/{}", frontend_path(m, e))).collect() };
    let build_frontend = if m.renderer.entries.is_empty() { "bun run scripts/placeholder-frontend.ts".to_string() } else { format!("bun build {} --outdir dist --minify", html.join(" ")) };
    let v = json!({
        "name": format!("{name}-tauri"),
        "private": true,
        "type": "module",
        "scripts": {
            "build:shim": "bun build shim/electron-compat.ts --outfile src-tauri/shim/electron-compat.js --format=iife --target=browser --minify",
            "build:frontend": build_frontend,
            "build:sidecar": "bun run scripts/build-sidecar.ts",
            "build": "bun run build:shim && bun run build:frontend && bun run build:sidecar",
            "tauri": "tauri",
            "dev": "bun run build && tauri dev",
        },
        "dependencies": { "@tauri-apps/api": TAURI_NPM_API_REQ },
        "devDependencies": { "@tauri-apps/cli": TAURI_NPM_CLI_REQ, "@types/bun": "latest" },
    });
    serde_json::to_string_pretty(&v).unwrap_or_default() + "\n"
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = if crc & 1 == 1 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

fn png_chunk(out: &mut Vec<u8>, kind: &[u8; 4], body: &[u8]) {
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    let mut crc_in = kind.to_vec();
    crc_in.extend_from_slice(body);
    out.extend_from_slice(&crc_in);
    out.extend_from_slice(&crc32(&crc_in).to_be_bytes());
}

/// A valid 32x32 RGBA PNG (flat dark square) for apps whose bundle ships no icon: `tauri::generate_context!`
/// fails without `icons/icon.png`. Stored (uncompressed) zlib blocks keep the encoder dependency-free.
pub fn placeholder_png() -> Vec<u8> {
    const N: usize = 32;
    let mut raw = Vec::with_capacity(N * (1 + N * 4));
    for _ in 0..N {
        raw.push(0);
        for _ in 0..N {
            raw.extend_from_slice(&[0x1e, 0x1e, 0x1e, 0xff]);
        }
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &x in &raw {
        a = (a + u32::from(x)) % 65521;
        b = (b + a) % 65521;
    }
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(65535).collect();
    for (i, blk) in blocks.iter().enumerate() {
        z.push(u8::from(i + 1 == blocks.len()));
        z.extend_from_slice(&(blk.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(blk.len() as u16)).to_le_bytes());
        z.extend_from_slice(blk);
    }
    z.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&(N as u32).to_be_bytes());
    ihdr.extend_from_slice(&(N as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    png_chunk(&mut out, b"IHDR", &ihdr);
    png_chunk(&mut out, b"IDAT", &z);
    png_chunk(&mut out, b"IEND", &[]);
    out
}

/// Wrap a PNG into a single-image `.ico` (PNG-compressed entries are valid since Windows Vista).
pub fn ico_from_png(png: &[u8]) -> Option<Vec<u8>> {
    if png.len() < 24 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes(png[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(png[20..24].try_into().ok()?);
    if w == 0 || h == 0 || w > 256 || h > 256 {
        return None;
    }
    let mut out = vec![0, 0, 1, 0, 1, 0, if w == 256 { 0 } else { w as u8 }, if h == 256 { 0 } else { h as u8 }, 0, 0, 1, 0, 32, 0];
    out.extend_from_slice(&(png.len() as u32).to_le_bytes());
    out.extend_from_slice(&22u32.to_le_bytes());
    out.extend_from_slice(png);
    Some(out)
}

/// Frontend placeholder for apps that only load a remote URL: the window navigates away at once.
pub fn placeholder_frontend_ts() -> &'static str {
    "// Remote-only app: the window loads its URL directly; dist/ only needs an index.html for `frontendDist`.\nimport { mkdir, writeFile } from \"node:fs/promises\";\nawait mkdir(\"dist\", { recursive: true });\nawait writeFile(\"dist/index.html\", \"<!doctype html><title>loading</title>\");\n"
}
