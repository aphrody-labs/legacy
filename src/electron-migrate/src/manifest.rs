//! Manifest schema emitted by `ay electron analyze`. Every fact carries its source file and a
//! confidence: `resolved` (the name was traced to `require("electron")` / a Node builtin through
//! the scope-aware alias table) or `heuristic` (only a distinctive identifier such as `ipcMain` matched).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const SCHEMA: &str = "ay-electron-manifest/1";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Site {
    pub file: String,
    pub line: usize,
    /// `resolved` or `heuristic`.
    pub confidence: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: Option<String>,
    pub product_name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub main: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub dependencies: BTreeMap<String, String>,
    pub dev_dependencies: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ElectronInfo {
    pub version: Option<String>,
    /// `version-file`, `binary`, `package.json` or `none`.
    pub version_source: String,
    pub chromium: Option<String>,
    pub node: Option<String>,
    pub executable: Option<String>,
    pub fuse_wire_found: bool,
    pub fuses: BTreeMap<String, String>,
    pub run_as_node: bool,
    pub asar_integrity: bool,
    pub only_load_app_from_asar: bool,
    pub v8_snapshot: bool,
    pub v8_code_cache: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Packaging {
    /// `asar` or `dir`.
    pub kind: String,
    pub asar_path: Option<String>,
    pub files: usize,
    pub total_bytes: u64,
    pub unpacked_files: usize,
    pub unpacked_dir_found: bool,
    /// Parent of the app directory holds `Update.exe` (Squirrel.Windows layout).
    pub squirrel_layout: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WindowDecl {
    /// `BrowserWindow`, `BrowserView`, `WebContentsView` or `BaseWindow`.
    pub kind: String,
    pub site: Site,
    /// Options object as written; non-literal values are `{"$expr": "<source>"}`.
    pub options: Value,
    /// The options argument was not an object literal (identifier, spread or call).
    pub options_dynamic: bool,
    pub preload: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LoadTarget {
    /// `url` (loadURL) or `file` (loadFile).
    pub kind: String,
    pub target: String,
    pub site: Site,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Preload {
    pub path: String,
    pub resolved_in_bundle: bool,
    pub referenced_by: Vec<Site>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IpcSite {
    pub api: String,
    pub site: Site,
    /// First 160 bytes of the handler source for `ipcMain.handle|on|once`.
    pub handler_snippet: Option<String>,
    pub handler_bytes: Option<usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IpcChannel {
    pub name: String,
    /// `request-response`, `fire-and-forget`, `push` (main to renderer), `sync` or `mixed`.
    pub pattern: String,
    pub sites: Vec<IpcSite>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DynamicChannel {
    pub api: String,
    pub expression: String,
    pub site: Site,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IpcSection {
    pub channels: Vec<IpcChannel>,
    pub dynamic: Vec<DynamicChannel>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BridgeKey {
    pub name: String,
    /// Channel used by the property's function body when it is a single literal ipcRenderer call.
    pub channel: Option<String>,
    /// `invoke`, `send`, `sendSync` or `on`.
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BridgeApi {
    pub world: String,
    pub name: String,
    pub keys: Vec<BridgeKey>,
    /// The exposed value was not an object literal; `keys` may be incomplete.
    pub dynamic: bool,
    pub site: Site,
    /// `window.<name>.<key>` accesses seen in non-main files: key to count.
    pub renderer_usage: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodeModuleUse {
    pub imports: usize,
    pub apis: BTreeMap<String, usize>,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApiUse {
    pub count: usize,
    pub heuristic: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NativeModule {
    pub path: String,
    pub size: u64,
    pub unpacked: bool,
    pub package: Option<String>,
    pub platform: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SchemeDecl {
    pub scheme: String,
    pub privileges: Vec<String>,
    pub site: Site,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProtocolHandler {
    pub api: String,
    pub scheme: Option<String>,
    pub site: Site,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProtocolInfo {
    pub privileged_schemes: Vec<SchemeDecl>,
    pub handlers: Vec<ProtocolHandler>,
    pub default_clients: Vec<ProtocolHandler>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MenuItemDecl {
    pub depth: usize,
    pub label: Option<String>,
    pub role: Option<String>,
    pub accelerator: Option<String>,
    /// `normal`, `separator`, `submenu`, `checkbox` or `radio`.
    pub kind: String,
    pub has_click: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MenuTemplate {
    pub site: Site,
    /// `application` (setApplicationMenu) or `context` / `unknown`.
    pub usage: String,
    pub items: Vec<MenuItemDecl>,
    pub dynamic: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MenuInfo {
    pub templates: Vec<MenuTemplate>,
    pub set_application_menu: Vec<Site>,
    pub menu_apis: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrayInfo {
    pub used: bool,
    pub sites: Vec<Site>,
    pub apis: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdaterInfo {
    /// `none`, `electron`, `electron-updater`, `update-electron-app` or `squirrel-startup`.
    pub providers: Vec<String>,
    pub apis: BTreeMap<String, usize>,
    pub feed_urls: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeepLinks {
    pub schemes: Vec<String>,
    pub open_url_handler: bool,
    pub second_instance_handler: bool,
    pub single_instance_lock: bool,
    pub package_json_protocols: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Renderer {
    /// HTML entry points present in the bundle that the main process loads (or that look like entries).
    pub entries: Vec<String>,
    pub remote_urls: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileRole {
    pub path: String,
    /// `main`, `preload`, `main+preload` or `other` (uses Electron APIs without either marker).
    pub role: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanStats {
    pub scanned: usize,
    pub scanned_bytes: u64,
    pub skipped: Vec<String>,
    pub parse_errors: Vec<String>,
    pub node_modules_scanned: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Manifest {
    pub schema: String,
    pub input: String,
    pub app: AppInfo,
    pub electron: ElectronInfo,
    pub packaging: Packaging,
    pub windows: Vec<WindowDecl>,
    pub load_targets: Vec<LoadTarget>,
    pub renderer: Renderer,
    pub preloads: Vec<Preload>,
    pub ipc: IpcSection,
    pub context_bridge: Vec<BridgeApi>,
    pub node_apis: BTreeMap<String, NodeModuleUse>,
    pub electron_apis: BTreeMap<String, ApiUse>,
    pub app_events: BTreeMap<String, usize>,
    pub native_modules: Vec<NativeModule>,
    pub native_dependencies: Vec<String>,
    pub protocols: ProtocolInfo,
    pub menus: MenuInfo,
    pub tray: TrayInfo,
    pub auto_updater: UpdaterInfo,
    pub deep_links: DeepLinks,
    pub files: Vec<FileRole>,
    pub scan: ScanStats,
    /// Heuristic limits of this scan, always emitted.
    pub limits: Vec<String>,
}

impl Manifest {
    /// Electron version major (`44` for `44.6.0`), when known.
    pub fn electron_major(&self) -> Option<u32> {
        self.electron.version.as_deref()?.split('.').next()?.parse().ok()
    }
}

/// Limits that hold for every scan; the output must never claim more than a static scan can know.
pub fn standard_limits() -> Vec<String> {
    [
        "static scan: tree-sitter-javascript AST with a scope-aware alias table; no code is executed",
        "channel names, protocol schemes and menu labels are found only when they are string literals or single-assignment constants; computed names are listed under ipc.dynamic",
        "bundler output (webpack/vite/esbuild) hides imports behind runtime require functions; unresolved calls fall back to distinctive identifier names (ipcMain, ipcRenderer, contextBridge, BrowserWindow, Menu, Tray, autoUpdater, webContents) and are marked heuristic",
        "generic names (app, shell, dialog, session, net, protocol) are counted only when resolved to require(\"electron\")",
        "bytenode (.jsc), V8 snapshots and encrypted or obfuscated JavaScript are not analysed",
        "ipcRenderer calls are attributed to channels, not to the renderer pages that issue them; renderer_usage counts window.<bridge>.<key> textual accesses",
        "node_modules is not scanned unless requested; native modules come from .node files and package.json dependencies",
        "BrowserWindow options built from variables, spreads or helper functions are reported as dynamic",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}
