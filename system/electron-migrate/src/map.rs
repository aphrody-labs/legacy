//! Construct mapping: every construct found by `analyze` becomes one row with a status.
//!
//! - `1:1`: the generator emits working code or configuration for it with no manual step.
//! - `stubbed`: scaffold is emitted (a command, a sidecar route, a TODO) but behaviour needs review or work.
//! - `unsupported`: the target has no equivalent; nothing is emitted.

use crate::manifest::Manifest;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fmt::Write as _;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum Status {
    #[serde(rename = "1:1")]
    OneToOne,
    #[serde(rename = "stubbed")]
    Stubbed,
    #[serde(rename = "unsupported")]
    Unsupported,
}

impl Status {
    pub fn label(self) -> &'static str {
        match self {
            Status::OneToOne => "1:1",
            Status::Stubbed => "stubbed",
            Status::Unsupported => "unsupported",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Tauri,
    Gpui,
}

impl Target {
    pub fn parse(s: &str) -> Option<Target> {
        match s {
            "tauri" => Some(Target::Tauri),
            "gpui" => Some(Target::Gpui),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Target::Tauri => "tauri",
            Target::Gpui => "gpui",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Row {
    pub category: String,
    pub construct: String,
    pub status: Status,
    pub target: String,
    pub note: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Counts {
    #[serde(rename = "1:1")]
    pub one_to_one: usize,
    pub stubbed: usize,
    pub unsupported: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Coverage {
    pub target: String,
    pub total: Counts,
    pub by_category: BTreeMap<String, Counts>,
    pub percent_one_to_one: f64,
    pub percent_stubbed: f64,
    pub percent_unsupported: f64,
}

use Status::{OneToOne as O, Stubbed as S, Unsupported as U};

struct Api {
    api: &'static str,
    tauri: (Status, &'static str),
    gpui: (Status, &'static str),
}

macro_rules! api {
    ($a:expr, $ts:ident $tt:expr, $gs:ident $gt:expr) => {
        Api { api: $a, tauri: ($ts, $tt), gpui: ($gs, $gt) }
    };
}

static APIS: &[Api] = &[
    api!("app.getVersion", O "app.package_info().version", O "env!(\"CARGO_PKG_VERSION\")"),
    api!("app.getName", O "app.package_info().name", O "env!(\"CARGO_PKG_NAME\")"),
    api!("app.getPath", O "app.path() (tauri::path::BaseDirectory)", S "dirs crate"),
    api!("app.getAppPath", S "resource dir (app.path().resource_dir())", S "std::env::current_exe parent"),
    api!("app.isPackaged", O "!cfg!(debug_assertions)", O "!cfg!(debug_assertions)"),
    api!("app.whenReady", O "tauri::Builder::setup", O "Application::run callback"),
    api!("app.on", O "tauri::Builder::build + RunEvent", S "Application callbacks (cx.on_action, on_open_urls)"),
    api!("app.once", O "tauri::Builder::build + RunEvent", S "Application callbacks"),
    api!("app.quit", O "AppHandle::exit(0)", O "cx.quit()"),
    api!("app.exit", O "AppHandle::exit(code)", O "cx.quit()"),
    api!("app.relaunch", O "AppHandle::restart()", S "spawn current_exe then cx.quit()"),
    api!("app.focus", O "WebviewWindow::set_focus", O "cx.activate(true)"),
    api!("app.setBadgeCount", O "Window::set_badge_count", U "no GPUI API"),
    api!("app.requestSingleInstanceLock", O "tauri-plugin-single-instance", S "lock file in the app data dir"),
    api!("app.setAsDefaultProtocolClient", O "tauri-plugin-deep-link register()", S "OS registration done by the installer"),
    api!("app.setAppUserModelId", S "bundle identifier in tauri.conf.json", S "Windows AUMID in the installer"),
    api!("app.getLocale", S "tauri-plugin-os locale()", S "sys-locale crate"),
    api!("app.commandLine", S "std::env::args in Rust, process.argv in the sidecar", S "std::env::args"),
    api!("app.setLoginItemSettings", S "tauri-plugin-autostart", S "auto-launch crate"),
    api!("app.dock", U "no Dock API", U "no Dock API"),
    api!("app.getGPUInfo", U "no equivalent", U "no equivalent"),
    api!("app.getAppMetrics", U "no equivalent", U "no equivalent"),
    api!("app.disableHardwareAcceleration", S "WebView2 additional browser arguments", U "GPUI always renders on the GPU"),
    api!("app", S "no direct equivalent; review", S "no direct equivalent; review"),
    api!("shell.openExternal", O "tauri-plugin-opener open_url", O "cx.open_url"),
    api!("shell.openPath", O "tauri-plugin-opener open_path", S "open crate"),
    api!("shell.showItemInFolder", O "tauri-plugin-opener reveal_item_in_dir", S "open crate (reveal)"),
    api!("shell.trashItem", S "trash crate in the sidecar or Rust", S "trash crate"),
    api!("shell", U "no equivalent", U "no equivalent"),
    api!("dialog.showOpenDialog", O "tauri-plugin-dialog open", O "cx.prompt_for_paths"),
    api!("dialog.showSaveDialog", O "tauri-plugin-dialog save", O "cx.prompt_for_new_path"),
    api!("dialog.showMessageBox", S "tauri-plugin-dialog message (button model differs)", S "Window::prompt"),
    api!("dialog.showErrorBox", O "tauri-plugin-dialog message (error)", S "Window::prompt"),
    api!("dialog", S "tauri-plugin-dialog", S "Window::prompt"),
    api!("clipboard.readText", O "tauri-plugin-clipboard-manager read_text", O "cx.read_from_clipboard"),
    api!("clipboard.writeText", O "tauri-plugin-clipboard-manager write_text", O "cx.write_to_clipboard"),
    api!("clipboard", S "tauri-plugin-clipboard-manager (html/image/rtf differ)", S "ClipboardItem"),
    api!("new Notification", O "tauri-plugin-notification", U "no GPUI API"),
    api!("globalShortcut", O "tauri-plugin-global-shortcut", U "no GPUI API"),
    api!("nativeTheme", S "Window::theme / set_theme", S "Window::appearance"),
    api!("screen", O "available_monitors / primary_monitor", O "cx.displays()"),
    api!("powerMonitor", U "no equivalent", U "no equivalent"),
    api!("powerSaveBlocker", U "no equivalent", U "no equivalent"),
    api!("safeStorage", S "keyring crate (Rust or sidecar)", S "keyring crate"),
    api!("systemPreferences", U "no equivalent", U "no equivalent"),
    api!("session", U "no session object; cookies only through the webview cookie API", U "no webview session"),
    api!("net", S "Bun fetch in the sidecar", S "Bun fetch in the sidecar"),
    api!("protocol", S "Builder::register_uri_scheme_protocol", U "no custom scheme host"),
    api!("autoUpdater", S "tauri-plugin-updater (feed format and signatures differ)", U "no updater"),
    api!("crashReporter", U "no equivalent", U "no equivalent"),
    api!("desktopCapturer", U "no equivalent", U "no equivalent"),
    api!("utilityProcess", S "Bun sidecar", S "Bun sidecar"),
    api!("contentTracing", U "no equivalent", U "no equivalent"),
    api!("netLog", U "no equivalent", U "no equivalent"),
    api!("inAppPurchase", U "no equivalent", U "no equivalent"),
    api!("TouchBar", U "no equivalent", U "no equivalent"),
    api!("ipcMain.handle", O "tauri::command routed to the sidecar", S "sidecar RPC + webview bridge"),
    api!("ipcMain.handleOnce", O "tauri::command routed to the sidecar", S "sidecar RPC + webview bridge"),
    api!("ipcMain.on", O "electron_send routed to the sidecar", S "sidecar RPC + webview bridge"),
    api!("ipcMain.once", O "electron_send routed to the sidecar", S "sidecar RPC + webview bridge"),
    api!("ipcMain", S "sidecar electron shim", S "sidecar electron shim"),
    api!("ipcRenderer", O "shim/electron-compat.ts over invoke/listen", S "webview bridge shim"),
    api!("contextBridge", O "shim/electron-compat.ts (window[name])", S "webview bridge shim"),
    api!("BaseWindow.getAllWindows", S "AppHandle::windows()", S "cx.windows()"),
    api!("BaseWindow.setTitleBarOverlay", U "no equivalent", U "no equivalent"),
    api!("BaseWindow", S "tauri::window::Window (WindowBuilder, unstable) methods", O "gpui Window methods"),
    api!("WebContentsView.webContents.send", S "emit_to(view label)", U "no webview"),
    api!("WebContentsView.webContents.loadURL", S "Webview::navigate", U "no webview"),
    api!("WebContentsView.webContents.executeJavaScript", S "Webview::eval", U "no webview"),
    api!("WebContentsView.webContents.session", U "no session object", U "no webview"),
    api!("WebContentsView.webContents", S "Webview methods (multiwebview, unstable)", U "no webview"),
    api!("WebContentsView.setBounds", S "Webview::set_position + set_size", U "no webview"),
    api!("WebContentsView.setVisible", S "Webview::show / hide", U "no webview"),
    api!("WebContentsView", S "child Webview (multiwebview, unstable)", U "no webview"),
    api!("webContents.send", O "emit_to / emit", S "webview evaluate_script"),
    api!("webContents.loadURL", O "Webview::navigate", S "webview host URL"),
    api!("webContents.getURL", O "Webview::url", S "webview host"),
    api!("webContents.close", O "Webview::close", S "webview host"),
    api!("webContents.focus", O "Webview::set_focus", S "webview host"),
    api!("webContents.reloadIgnoringCache", S "Webview::reload", S "webview host"),
    api!("webContents.session", U "no session object", U "no webview"),
    api!("webContents.setWindowOpenHandler", S "on_new_window", U "no webview"),
    api!("webContents", S "Webview methods; review per call", S "webview host; review per call"),
    api!("nativeImage", S "tauri::image::Image", S "gpui::ImageSource"),
    api!("webFrame", U "no renderer-side Electron APIs", U "no renderer-side Electron APIs"),
    api!("BrowserWindow.webContents.send", O "emit_to / emit", S "webview evaluate_script"),
    api!("webContents.send", O "emit_to / emit", S "webview evaluate_script"),
    api!("BrowserWindow.webContents.openDevTools", O "WebviewWindow::open_devtools (devtools feature)", U "no webview"),
    api!("BrowserWindow.webContents.executeJavaScript", O "WebviewWindow::eval", S "webview evaluate_script"),
    api!("BrowserWindow.webContents.print", O "WebviewWindow::print", U "no webview"),
    api!("BrowserWindow.webContents.setWindowOpenHandler", S "WebviewWindowBuilder::on_new_window", U "no webview"),
    api!("BrowserWindow.webContents.capturePage", U "no equivalent", U "no equivalent"),
    api!("BrowserWindow.webContents", S "WebviewWindow methods; review per call", S "webview host; review per call"),
    api!("BrowserWindow.getAllWindows", O "webview_windows()", S "cx.windows()"),
    api!("BrowserWindow.loadURL", O "WebviewWindow::navigate / WebviewUrl::External", S "webview host URL"),
    api!("BrowserWindow.loadFile", O "WebviewUrl::App", S "webview host URL"),
    api!("BrowserWindow", O "WebviewWindow methods (show, hide, close, minimize, maximize, setTitle, ...)", S "gpui Window methods"),
    api!("new BrowserWindow", O "WebviewWindowBuilder::from_config", S "cx.open_window + webview host"),
    api!("new BaseWindow", S "tauri::window::WindowBuilder (unstable)", O "cx.open_window"),
    api!("new BrowserView", S "multiwebview (unstable feature)", U "no webview"),
    api!("new WebContentsView", S "multiwebview (unstable feature)", U "no webview"),
    api!("new Tray", O "tauri::tray::TrayIconBuilder", U "no GPUI API"),
    api!("Tray", O "tauri::tray::TrayIcon methods", U "no GPUI API"),
    api!("new Menu", O "tauri::menu::Menu", O "gpui::Menu"),
    api!("new MenuItem", O "tauri::menu::MenuItem", O "gpui::MenuItem"),
    api!("Menu", O "tauri::menu::Menu", O "cx.set_menus"),
    api!("MenuItem", O "tauri::menu::MenuItem", O "gpui::MenuItem"),
];

fn lookup_api(key: &str) -> Option<&'static Api> {
    APIS.iter().filter(|a| key == a.api || key.strip_prefix(a.api).is_some_and(|r| r.starts_with('.'))).max_by_key(|a| a.api.len())
}

struct Opt {
    key: &'static str,
    tauri: (Status, &'static str),
    gpui: (Status, &'static str),
}

static OPTIONS: &[Opt] = &[
    Opt { key: "width", tauri: (O, "windows[].width"), gpui: (O, "WindowBounds size") },
    Opt { key: "height", tauri: (O, "windows[].height"), gpui: (O, "WindowBounds size") },
    Opt { key: "minWidth", tauri: (O, "windows[].minWidth"), gpui: (O, "window_min_size") },
    Opt { key: "minHeight", tauri: (O, "windows[].minHeight"), gpui: (O, "window_min_size") },
    Opt { key: "maxWidth", tauri: (O, "windows[].maxWidth"), gpui: (U, "no max size") },
    Opt { key: "maxHeight", tauri: (O, "windows[].maxHeight"), gpui: (U, "no max size") },
    Opt { key: "x", tauri: (O, "windows[].x"), gpui: (O, "WindowBounds origin") },
    Opt { key: "y", tauri: (O, "windows[].y"), gpui: (O, "WindowBounds origin") },
    Opt { key: "center", tauri: (O, "windows[].center"), gpui: (O, "Bounds::centered") },
    Opt { key: "resizable", tauri: (O, "windows[].resizable"), gpui: (O, "is_resizable") },
    Opt { key: "fullscreen", tauri: (O, "windows[].fullscreen"), gpui: (O, "WindowBounds::Fullscreen") },
    Opt { key: "alwaysOnTop", tauri: (O, "windows[].alwaysOnTop"), gpui: (U, "no GPUI option") },
    Opt { key: "title", tauri: (O, "windows[].title"), gpui: (O, "TitlebarOptions::title") },
    Opt { key: "show", tauri: (O, "windows[].visible"), gpui: (O, "WindowOptions::show") },
    Opt { key: "skipTaskbar", tauri: (O, "windows[].skipTaskbar"), gpui: (U, "no GPUI option") },
    Opt { key: "minimizable", tauri: (O, "windows[].minimizable"), gpui: (O, "is_minimizable") },
    Opt { key: "maximizable", tauri: (O, "windows[].maximizable"), gpui: (U, "no GPUI option") },
    Opt { key: "closable", tauri: (O, "windows[].closable"), gpui: (U, "no GPUI option") },
    Opt { key: "focusable", tauri: (O, "windows[].focus"), gpui: (O, "WindowOptions::focus") },
    Opt { key: "movable", tauri: (U, "no Tauri option"), gpui: (O, "is_movable") },
    Opt { key: "frame", tauri: (O, "windows[].decorations"), gpui: (S, "window_decorations / custom titlebar") },
    Opt { key: "transparent", tauri: (O, "windows[].transparent (macOS needs macos-private-api)"), gpui: (S, "window_background") },
    Opt { key: "backgroundColor", tauri: (O, "windows[].backgroundColor"), gpui: (S, "root div background") },
    Opt { key: "titleBarStyle", tauri: (S, "windows[].titleBarStyle (macOS only)"), gpui: (S, "TitlebarOptions::appears_transparent") },
    Opt { key: "titleBarOverlay", tauri: (U, "no equivalent"), gpui: (U, "no equivalent") },
    Opt { key: "icon", tauri: (S, "bundle.icon in tauri.conf.json"), gpui: (S, "platform bundle icon") },
    Opt { key: "autoHideMenuBar", tauri: (U, "no equivalent"), gpui: (U, "no equivalent") },
    Opt { key: "opacity", tauri: (U, "no equivalent"), gpui: (U, "no equivalent") },
    Opt { key: "vibrancy", tauri: (S, "window-vibrancy effects"), gpui: (U, "no equivalent") },
    Opt { key: "kiosk", tauri: (S, "fullscreen + decorations off"), gpui: (S, "WindowBounds::Fullscreen") },
    Opt { key: "webPreferences.preload", tauri: (S, "initialization_script from shim/electron-compat.ts"), gpui: (S, "webview host initialization script") },
    Opt { key: "webPreferences.devTools", tauri: (O, "devtools cargo feature"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.contextIsolation", tauri: (U, "no main-world/isolated-world split; the shim runs in the page world"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.nodeIntegration", tauri: (U, "no Node in the webview; Node code runs in the Bun sidecar"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.sandbox", tauri: (U, "webview is always sandboxed"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.webSecurity", tauri: (U, "no switch"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.partition", tauri: (S, "data_directory / data_store_identifier"), gpui: (U, "no webview") },
    Opt { key: "webPreferences.webviewTag", tauri: (U, "no <webview> tag"), gpui: (U, "no webview") },
];

fn lookup_opt(key: &str) -> Option<&'static Opt> {
    OPTIONS.iter().find(|o| o.key == key)
}

fn node_status(module: &str) -> (Status, &'static str) {
    match module {
        "fs" | "path" | "os" | "crypto" | "events" | "util" | "url" | "buffer" | "stream" | "zlib" | "assert" | "timers" | "string_decoder"
        | "querystring" | "readline" | "process" | "child_process" | "net" | "http" | "https" | "dns" | "tls" | "dgram" | "perf_hooks"
        | "worker_threads" | "fs/promises" | "path/posix" | "path/win32" | "stream/promises" | "timers/promises" | "util/types" | "console" => {
            (O, "runs unchanged in the Bun sidecar (node:* compatibility layer)")
        }
        "vm" | "v8" | "cluster" | "http2" | "inspector" | "async_hooks" | "module" | "diagnostics_channel" | "domain" | "repl" | "trace_events"
        | "wasi" | "punycode" | "constants" | "sys" | "tty" => (S, "Bun support is partial or absent for this module; test in the sidecar"),
        _ => (S, "not a known builtin; review"),
    }
}

fn event_status(ev: &str) -> (Status, &'static str) {
    match ev {
        "ready" => (O, "tauri::Builder::setup"),
        "window-all-closed" => (O, "RunEvent::ExitRequested / WindowEvent::Destroyed"),
        "before-quit" | "will-quit" | "quit" => (O, "RunEvent::ExitRequested / RunEvent::Exit"),
        "second-instance" => (O, "tauri-plugin-single-instance callback"),
        "open-url" => (O, "tauri-plugin-deep-link on_open_url"),
        "activate" => (S, "RunEvent::Reopen (macOS only)"),
        "browser-window-created" | "web-contents-created" => (S, "WebviewWindow creation hook"),
        "browser-window-focus" | "browser-window-blur" => (O, "WindowEvent::Focused"),
        "open-file" => (S, "RunEvent::Opened (macOS) / argv"),
        _ => (S, "no direct event; review"),
    }
}

fn row(category: &str, construct: impl Into<String>, status: Status, target: impl Into<String>, note: impl Into<String>) -> Row {
    Row { category: category.into(), construct: construct.into(), status, target: target.into(), note: note.into() }
}

pub fn map_manifest(m: &Manifest, target: Target) -> Vec<Row> {
    let pick = |t: (Status, &'static str), g: (Status, &'static str)| if target == Target::Tauri { t } else { g };
    let mut rows = Vec::new();

    // windows
    for w in &m.windows {
        let key = format!("new {}", w.kind);
        let (mut st, tg) = lookup_api(&key).map_or((U, ""), |a| pick(a.tauri, a.gpui));
        let mut note = String::new();
        if w.options_dynamic && st == O {
            st = S;
            note = "options are built dynamically; review the generated window config".into();
        }
        rows.push(row("window", format!("{} at {}:{}", w.kind, w.site.file, w.site.line), st, tg, note));
    }
    let mut opts: BTreeMap<String, usize> = BTreeMap::new();
    for w in &m.windows {
        if let Some(o) = w.options.as_object() {
            for (k, v) in o {
                if k == "webPreferences" {
                    if let Some(wp) = v.as_object() {
                        for wk in wp.keys() {
                            *opts.entry(format!("webPreferences.{wk}")).or_default() += 1;
                        }
                    }
                } else if !k.starts_with('$') {
                    *opts.entry(k.clone()).or_default() += 1;
                }
            }
        }
    }
    for (k, n) in opts {
        match lookup_opt(&k) {
            Some(o) => {
                let (st, tg) = pick(o.tauri, o.gpui);
                rows.push(row("window-option", format!("{k} (x{n})"), st, tg, ""));
            }
            None => rows.push(row("window-option", format!("{k} (x{n})"), U, "", "option not in the mapping table")),
        }
    }

    // renderer
    for e in &m.renderer.entries {
        let (st, tg, note) = match target {
            Target::Tauri => (O, "frontend/ built by `bun build` into dist/ (frontendDist)", ""),
            Target::Gpui => (S, "served to the webview host fallback", "GPUI has no HTML renderer"),
        };
        rows.push(row("renderer", format!("entry {e}"), st, tg, note));
    }
    for u in &m.renderer.remote_urls {
        let (st, tg, note) = match target {
            Target::Tauri => (S, "WebviewUrl::External + capability remote.urls", "IPC injection into a remote origin needs the capability and the initialization script"),
            Target::Gpui => (S, "webview host fallback navigates to the URL", "no preload/IPC on remote content in the skeleton"),
        };
        rows.push(row("renderer", format!("remote {u}"), st, tg, note));
    }
    for p in &m.preloads {
        let (tg, note) = match target {
            Target::Tauri => ("original copied to shim/original/; contextBridge surface regenerated in shim/electron-compat.ts", "preload logic other than ipcRenderer/contextBridge forwarding is not translated"),
            Target::Gpui => ("copied to shim/original/", "needs a webview host to run"),
        };
        let note = if p.resolved_in_bundle { note.to_string() } else { format!("{note}; file not found in the bundle") };
        rows.push(row("preload", p.path.clone(), S, tg, note));
    }

    // IPC
    for c in &m.ipc.channels {
        let (st, tg, note): (Status, String, &str) = match (target, c.pattern.as_str()) {
            (Target::Tauri, "request-response") => (O, format!("command ipc_{}", crate::tauri::ident(&c.name)), "handler body runs unchanged in the sidecar through the electron shim"),
            (Target::Tauri, "fire-and-forget") => (O, "electron_send -> sidecar ipcMain.on".into(), "handler body runs in the sidecar"),
            (Target::Tauri, "push") => (O, format!("event {}", crate::tauri::event_name(&c.name)), "sidecar emits, shim listen()s"),
            (Target::Tauri, "sync") => (U, "none".into(), "ipcRenderer.sendSync is synchronous; Tauri IPC is asynchronous only"),
            (Target::Tauri, _) => (S, "electron_ipc / electron_send / event".into(), "channel is used with several patterns; review"),
            (Target::Gpui, "sync") => (U, "none".into(), "synchronous IPC"),
            (Target::Gpui, _) => (S, "sidecar RPC".into(), "webview host fallback required for the renderer side"),
        };
        rows.push(row("ipc", format!("{} [{}]", c.name, c.pattern), st, tg, note));
    }
    for d in &m.ipc.dynamic {
        rows.push(row("ipc", format!("dynamic channel `{}` ({})", d.expression, d.api), S, "electron_ipc generic dispatcher", "name computed at runtime; routed by the generic command"));
    }
    for b in &m.context_bridge {
        for k in &b.keys {
            let (st, tg, note) = match (&k.channel, &k.kind, target) {
                (Some(ch), Some(kind), Target::Tauri) => (O, format!("window.{}.{} -> {kind} \"{ch}\"", b.name, k.name), String::new()),
                (Some(_), Some(_), Target::Gpui) => (S, "webview bridge shim".to_string(), String::new()),
                _ => (S, format!("window.{}.{} throws `not migrated`", b.name, k.name), "property body is not a single literal ipcRenderer call; port it by hand".to_string()),
            };
            rows.push(row("bridge", format!("{}.{}", b.name, k.name), st, tg, note));
        }
        if b.dynamic {
            rows.push(row("bridge", format!("{} (dynamic members)", b.name), S, "shim", "the exposed object is not a literal; members unknown"));
        }
    }

    // node modules (main process)
    for (module, u) in &m.node_apis {
        let (st, note) = node_status(module);
        let apis: Vec<&str> = u.apis.keys().map(String::as_str).take(8).collect();
        rows.push(row("node", format!("node:{module} (imports {}, apis: {})", u.imports, apis.join(", ")), st, "Bun sidecar", note));
    }

    // electron APIs
    for (key, u) in &m.electron_apis {
        let (st, tg) = lookup_api(key).map_or((U, "no mapping".to_string()), |a| {
            let (s, t) = pick(a.tauri, a.gpui);
            (s, t.to_string())
        });
        let note = if u.heuristic > 0 { format!("x{} ({} by name only)", u.count, u.heuristic) } else { format!("x{}", u.count) };
        rows.push(row("electron-api", key.clone(), st, tg, note));
    }
    for (ev, n) in &m.app_events {
        let (st, tg) = event_status(ev);
        rows.push(row("app-event", format!("app.on(\"{ev}\") x{n}"), st, tg, if target == Target::Gpui && st == O { "tauri-specific; GPUI differs" } else { "" }));
    }

    // native modules
    for n in &m.native_modules {
        rows.push(row("native-module", n.path.clone(), S, "load in the Bun sidecar via process.dlopen", "N-API modules may load; nan / node-gyp modules need a rebuild; verify per module"));
    }
    for d in &m.native_dependencies {
        if !m.native_modules.iter().any(|n| n.package.as_deref() == Some(d.as_str())) {
            rows.push(row("native-module", format!("dependency {d}"), S, "Bun sidecar", "native dependency with no .node file in the app bundle (not packaged or bundled)"));
        }
    }

    // protocols
    for s in &m.protocols.privileged_schemes {
        let (st, tg) = if target == Target::Tauri { (S, "register_uri_scheme_protocol") } else { (U, "no custom scheme host") };
        rows.push(row("protocol", format!("privileged scheme {} {:?}", s.scheme, s.privileges), st, tg, "privilege flags map to the webview origin, not one-to-one"));
    }
    for h in &m.protocols.handlers {
        let (st, tg) = if target == Target::Tauri { (S, "register_uri_scheme_protocol responder") } else { (U, "no custom scheme host") };
        rows.push(row("protocol", format!("{} {}", h.api, h.scheme.clone().unwrap_or_else(|| "?".into())), st, tg, "handler body is Electron Request/Response code"));
    }
    for d in &m.protocols.default_clients {
        let (st, tg) = if target == Target::Tauri { (O, "tauri-plugin-deep-link register()") } else { (S, "installer registers the scheme") };
        rows.push(row("deep-link", format!("{} {}", d.api, d.scheme.clone().unwrap_or_else(|| "?".into())), st, tg, ""));
    }
    for s in &m.deep_links.package_json_protocols {
        let (st, tg) = if target == Target::Tauri { (O, "plugins.deep-link.desktop.schemes") } else { (S, "installer manifest") };
        rows.push(row("deep-link", format!("package.json protocol {s}"), st, tg, ""));
    }

    // menus
    for t in &m.menus.templates {
        let clicks = t.items.iter().filter(|i| i.has_click).count();
        let st = if t.dynamic || clicks > 0 || target == Target::Gpui { S } else { O };
        let tg = if target == Target::Tauri { "tauri::menu::Menu (menu.rs)" } else { "cx.set_menus (menu.rs)" };
        let note = if t.dynamic {
            "template is not a literal array".to_string()
        } else if target == Target::Gpui {
            "GPUI actions are generated per item with empty handlers; wire them to the sidecar".to_string()
        } else if clicks > 0 {
            format!("{clicks} item(s) have click handlers; they emit `menu-click` with the item id")
        } else {
            String::new()
        };
        rows.push(row("menu", format!("template with {} items at {}:{}", t.items.len(), t.site.file, t.site.line), st, tg, note));
    }
    for s in &m.menus.set_application_menu {
        rows.push(row("menu", format!("Menu.setApplicationMenu at {}:{}", s.file, s.line), O, if target == Target::Tauri { "Builder::menu / app.set_menu" } else { "cx.set_menus" }, ""));
    }

    // tray
    if m.tray.used {
        let (st, tg) = if target == Target::Tauri { (O, "tauri::tray::TrayIconBuilder (tray-icon feature)") } else { (U, "no GPUI tray API") };
        let apis: Vec<&str> = m.tray.apis.keys().map(String::as_str).collect();
        rows.push(row("tray", format!("Tray ({})", apis.join(", ")), st, tg, ""));
    }

    // updater
    for p in &m.auto_updater.providers {
        let (st, tg, note) = match (target, p.as_str()) {
            (Target::Tauri, "squirrel-startup" | "squirrel") => (S, "Tauri bundler (NSIS/MSI) installers", "Squirrel.Windows install and update flow is replaced, not translated"),
            (Target::Tauri, _) => (S, "tauri-plugin-updater", "update manifest (latest.json) and signing keys must be produced"),
            (Target::Gpui, _) => (U, "no updater", ""),
        };
        rows.push(row("updater", format!("{p} {:?}", m.auto_updater.apis.keys().collect::<Vec<_>>()), st, tg, note));
    }
    if m.deep_links.second_instance_handler || m.deep_links.single_instance_lock {
        let (st, tg) = if target == Target::Tauri { (O, "tauri-plugin-single-instance") } else { (S, "lock file") };
        rows.push(row("deep-link", "single-instance lock / second-instance", st, tg, ""));
    }
    rows
}

pub fn coverage(rows: &[Row], target: Target) -> Coverage {
    let mut c = Coverage { target: target.name().into(), ..Coverage::default() };
    let bump = |k: &mut Counts, s: Status| {
        k.total += 1;
        match s {
            Status::OneToOne => k.one_to_one += 1,
            Status::Stubbed => k.stubbed += 1,
            Status::Unsupported => k.unsupported += 1,
        }
    };
    for r in rows {
        bump(&mut c.total, r.status);
        bump(c.by_category.entry(r.category.clone()).or_default(), r.status);
    }
    let t = c.total.total.max(1) as f64;
    let pct = |n: usize| (n as f64 / t * 1000.0).round() / 10.0;
    c.percent_one_to_one = pct(c.total.one_to_one);
    c.percent_stubbed = pct(c.total.stubbed);
    c.percent_unsupported = pct(c.total.unsupported);
    c
}

fn esc(s: &str) -> String {
    s.replace('|', "\\|").replace('\n', " ")
}

pub fn markdown(m: &Manifest, target: Target, rows: &[Row], cov: &Coverage) -> String {
    let mut s = String::new();
    let _ = writeln!(s, "# Migration mapping: {} to {}\n", m.app.product_name.as_deref().or(m.app.name.as_deref()).unwrap_or("app"), target.name());
    let _ = writeln!(
        s,
        "Source: Electron {} ({} files). Generated by `ay electron migrate --to {}`. Generated from a heuristic static scan (see `limits` in the manifest).\n",
        m.electron.version.as_deref().unwrap_or("?"),
        m.packaging.files,
        target.name()
    );
    let _ = writeln!(s, "- `1:1`: emitted as working code or configuration.\n- `stubbed`: scaffold emitted; behaviour needs review or manual work.\n- `unsupported`: no equivalent; nothing emitted.\n");
    let _ = writeln!(s, "## Coverage\n\n| category | 1:1 | stubbed | unsupported | total |\n|---|---:|---:|---:|---:|");
    for (cat, c) in &cov.by_category {
        let _ = writeln!(s, "| {cat} | {} | {} | {} | {} |", c.one_to_one, c.stubbed, c.unsupported, c.total);
    }
    let _ = writeln!(
        s,
        "| **all** | **{}** | **{}** | **{}** | **{}** |\n\n1:1 {}%, stubbed {}%, unsupported {}%.\n",
        cov.total.one_to_one, cov.total.stubbed, cov.total.unsupported, cov.total.total, cov.percent_one_to_one, cov.percent_stubbed, cov.percent_unsupported
    );
    let mut cats: Vec<&String> = cov.by_category.keys().collect();
    cats.sort();
    for cat in cats {
        let _ = writeln!(s, "## {cat}\n\n| construct | status | target | note |\n|---|---|---|---|");
        for r in rows.iter().filter(|r| &r.category == cat) {
            let _ = writeln!(s, "| {} | {} | {} | {} |", esc(&r.construct), r.status.label(), esc(&r.target), esc(&r.note));
        }
        s.push('\n');
    }
    s
}
