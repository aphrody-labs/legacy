//! Test fixtures: a synthetic ASAR built in memory (same Pickle envelope as Electron's packer) holding a
//! small but representative Electron app, laid out like a Squirrel install (`app-x/resources/app.asar`).

use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};

/// `files`: `(path, bytes, unpacked)`. Returns the archive and the unpacked files (path, bytes).
pub fn build_asar(files: &[(&str, &[u8], bool)]) -> (Vec<u8>, Vec<(String, Vec<u8>)>) {
    let mut root = Map::new();
    let mut data: Vec<u8> = Vec::new();
    let mut unpacked = Vec::new();
    for (path, bytes, is_unpacked) in files {
        let parts: Vec<&str> = path.split('/').collect();
        let mut cur = &mut root;
        for dir in &parts[..parts.len() - 1] {
            let entry = cur.entry("files".to_string()).or_insert_with(|| json!({}));
            let files_obj = entry.as_object_mut().expect("files object");
            let node = files_obj.entry((*dir).to_string()).or_insert_with(|| json!({ "files": {} }));
            cur = node.as_object_mut().expect("dir object");
        }
        let leaf = if *is_unpacked {
            unpacked.push(((*path).to_string(), bytes.to_vec()));
            json!({ "size": bytes.len(), "unpacked": true })
        } else {
            let off = data.len();
            data.extend_from_slice(bytes);
            json!({ "size": bytes.len(), "offset": off.to_string() })
        };
        cur.entry("files".to_string()).or_insert_with(|| json!({})).as_object_mut().expect("files").insert(parts[parts.len() - 1].to_string(), leaf);
    }
    let header = Value::Object(root).to_string();
    let json_bytes = header.as_bytes();
    let padded = json_bytes.len().div_ceil(4) * 4;
    let string_field = 4 + padded as u32;
    let payload = 4 + string_field;
    let mut out = Vec::new();
    out.extend_from_slice(&4u32.to_le_bytes());
    out.extend_from_slice(&payload.to_le_bytes());
    out.extend_from_slice(&string_field.to_le_bytes());
    out.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(json_bytes);
    out.extend(std::iter::repeat_n(0u8, padded - json_bytes.len()));
    out.extend_from_slice(&data);
    (out, unpacked)
}

pub const PACKAGE_JSON: &str = r#"{"name":"demo-app","productName":"Demo","version":"1.2.3","main":"main.js","description":"fixture","author":{"name":"Fixture"},
"dependencies":{"keytar":"^7.9.0","left-pad":"1.3.0"},"devDependencies":{"electron":"^44.6.0"},
"build":{"protocols":[{"name":"Demo","schemes":["demo-link"]}]}}"#;

pub const MAIN_JS: &str = r#"
const { app, BrowserWindow, ipcMain, shell, Menu, Tray, protocol, autoUpdater, dialog } = require("electron");
const path = require("node:path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const CH_READ = "file:read";
const PREFIX = process.platform;
protocol.registerSchemesAsPrivileged([{ scheme: "demo", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
protocol.handle("demo", (req) => new Response("ok"));
app.setAsDefaultProtocolClient("demo-link");
let tray = null;
function createWindow() {
  const win = new BrowserWindow({
    width: 1024, height: 768, minWidth: 400, minHeight: 300, frame: false, title: "Demo",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: true },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.send("app:ready", 1);
}
ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle(CH_READ, async (e, p) => fs.promises.readFile(p, "utf8"));
ipcMain.on("log", (e, m) => console.log(m));
ipcMain.handle(PREFIX + ":dynamic", () => os.platform());
ipcMain.on("sync:ask", (e) => { e.returnValue = 1; });
app.on("open-url", () => {});
app.on("second-instance", () => {});
app.requestSingleInstanceLock();
app.whenReady().then(() => {
  createWindow();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [{ label: "Open", accelerator: "CmdOrCtrl+O", click() {} }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }] },
  ]));
  tray = new Tray(path.join(__dirname, "icon.png"));
  tray.setToolTip("Demo");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Show" }]));
  shell.openExternal("https://example.com");
  spawn("ls", ["-la"]);
  autoUpdater.setFeedURL({ url: "https://updates.example.com/feed" });
  autoUpdater.checkForUpdates();
});
"#;

pub const PRELOAD_JS: &str = r#"
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  readFile: (p) => ipcRenderer.invoke("file:read", p),
  log: (m) => ipcRenderer.send("log", m),
  onReady: (cb) => ipcRenderer.on("app:ready", (_e, v) => cb(v)),
  ask: () => ipcRenderer.sendSync("sync:ask"),
  platform: process.platform,
  composite: async (a) => { const x = await ipcRenderer.invoke("a:one", a); return ipcRenderer.invoke("a:two", x); },
});
"#;

/// Minified style: esbuild interop wrapper, alias through a member, destructured alias, and a webpack runtime require.
pub const MIN_JS: &str = r#"var e=__toESM(require("electron")),t=e.ipcMain;t.handle("min:ping",(r)=>1);function f(){const{ipcMain:c}=require("electron");c.on("min:evt",()=>{})}
function g(ipcMain){ipcMain.handle("shadowed:not-electron",()=>0)}
const{ipcMain:z}=n(12);z.handle("wp:ch",()=>0);"#;

pub const INDEX_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>Demo</title></head><body><div id="app"></div><script src="app.js"></script></body></html>"#;
pub const RENDERER_JS: &str = "window.electronAPI.getVersion().then(v => { document.title = v; });\nwindow.electronAPI.readFile('x');\nwindow.electronAPI.onReady(() => {});\n";

pub fn fixture_files() -> Vec<(&'static str, Vec<u8>, bool)> {
    vec![
        ("package.json", PACKAGE_JSON.as_bytes().to_vec(), false),
        ("main.js", MAIN_JS.as_bytes().to_vec(), false),
        ("preload.js", PRELOAD_JS.as_bytes().to_vec(), false),
        ("min.js", MIN_JS.as_bytes().to_vec(), false),
        ("renderer/index.html", INDEX_HTML.as_bytes().to_vec(), false),
        ("renderer/app.js", RENDERER_JS.as_bytes().to_vec(), false),
        ("node_modules/keytar/build/Release/keytar.node", b"\x7fELF-fixture-native".to_vec(), true),
        ("node_modules/left-pad/index.js", b"module.exports=function(s){return s}".to_vec(), false),
    ]
}

/// Writes `<dir>/Demo/app-1.2.3/resources/app.asar` (+ `.unpacked`) and `<dir>/Demo/Update.exe`; returns the root `<dir>/Demo`.
pub fn write_fixture(dir: &Path) -> PathBuf {
    let root = dir.join("Demo");
    let install = root.join("app-1.2.3");
    let res = install.join("resources");
    std::fs::create_dir_all(&res).expect("mkdir");
    let files = fixture_files();
    let refs: Vec<(&str, &[u8], bool)> = files.iter().map(|(p, b, u)| (*p, b.as_slice(), *u)).collect();
    let (asar, unpacked) = build_asar(&refs);
    std::fs::write(res.join("app.asar"), asar).expect("asar");
    for (p, bytes) in unpacked {
        let dst = res.join("app.asar.unpacked").join(p);
        std::fs::create_dir_all(dst.parent().expect("parent")).expect("mkdir");
        std::fs::write(dst, bytes).expect("unpacked file");
    }
    std::fs::write(install.join("version"), "44.6.0\n").expect("version");
    std::fs::write(root.join("Update.exe"), b"squirrel").expect("update.exe");
    root
}
