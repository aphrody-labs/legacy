use crate::analyze::{self, Options};
use crate::manifest::Manifest;
use crate::map::{self, Status, Target};
use crate::migrate::{self, MigrateOptions};
use crate::optimize::{self, OptimizeOptions};
use crate::scan::{Facts, scan_source};
use crate::source::{Kind, Source};
use crate::testutil::{build_asar, write_fixture};
use crate::{bench, gpui, tauri};
use std::path::Path;

fn analyzed(dir: &Path) -> (Manifest, Source) {
    let root = write_fixture(dir);
    analyze::analyze_path(&root, &Options::default()).expect("analyze")
}

fn rust_ok(src: &str) -> bool {
    let mut p = tree_sitter::Parser::new();
    p.set_language(&tree_sitter_rust::LANGUAGE.into()).expect("language");
    !p.parse(src, None).expect("parse").root_node().has_error()
}

#[test]
fn asar_with_unpacked_dir_is_read_through_aphrody_re() {
    let tmp = tempfile::tempdir().unwrap();
    let root = write_fixture(tmp.path());
    let s = Source::open(&root).unwrap();
    assert_eq!(s.kind, Kind::Asar);
    assert!(s.unpacked_dir.is_some());
    assert!(s.find("main.js").is_some());
    let main = s.read_text("main.js").unwrap();
    assert!(main.contains("registerSchemesAsPrivileged"));
    let node = s.find("node_modules/keytar/build/Release/keytar.node").unwrap();
    assert!(node.unpacked);
    assert_eq!(s.read(node).unwrap(), b"\x7fELF-fixture-native");
    let p = s.packaging();
    assert_eq!(p.kind, "asar");
    assert_eq!(p.unpacked_files, 1);
    assert!(p.squirrel_layout, "Update.exe next to the app-x directory");
}

#[test]
fn asar_file_given_directly_and_plain_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let root = write_fixture(tmp.path());
    let asar = root.join("app-1.2.3/resources/app.asar");
    let s = Source::open(&asar).unwrap();
    assert_eq!(s.files().len(), 8);
    // Plain directory form.
    let plain = tmp.path().join("plain");
    s.extract_to(&plain, |_| true).unwrap();
    let d = Source::open(&plain).unwrap();
    assert_eq!(d.kind, Kind::Dir);
    assert!(d.find("renderer/index.html").is_some());
}

#[test]
fn extraction_rejects_unsafe_names() {
    // aphrody_re::asar refuses `..` names at parse time; a crafted tree never reaches extract_to.
    let (bytes, _) = build_asar(&[("a/../b.js", b"x", false)]);
    assert!(aphrody_re::asar::list(&bytes).is_err());
}

#[test]
fn version_comes_from_the_version_file() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    assert_eq!(m.electron.version.as_deref(), Some("44.6.0"));
    assert_eq!(m.electron.version_source, "version-file");
    assert_eq!(m.electron_major(), Some(44));
}

#[test]
fn manifest_windows_and_preloads() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    assert_eq!(m.app.name.as_deref(), Some("demo-app"));
    assert_eq!(m.windows.len(), 1);
    let w = &m.windows[0];
    assert_eq!(w.kind, "BrowserWindow");
    assert_eq!(w.options["width"], 1024);
    assert_eq!(w.options["frame"], false);
    assert_eq!(w.options["webPreferences"]["contextIsolation"], true);
    assert_eq!(w.preload.as_deref(), Some("preload.js"));
    assert_eq!(w.site.confidence, "resolved");
    assert_eq!(m.preloads.len(), 1);
    assert!(m.preloads[0].resolved_in_bundle);
    assert_eq!(m.load_targets.len(), 1);
    assert_eq!(m.load_targets[0].kind, "file");
    assert_eq!(m.load_targets[0].target, "renderer/index.html");
    assert_eq!(m.renderer.entries, vec!["renderer/index.html".to_string()]);
}

#[test]
fn manifest_ipc_channels_and_patterns() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    let ch = |n: &str| m.ipc.channels.iter().find(|c| c.name == n).unwrap_or_else(|| panic!("channel {n} missing: {:?}", m.ipc.channels.iter().map(|c| &c.name).collect::<Vec<_>>()));
    assert_eq!(ch("app:get-version").pattern, "request-response");
    assert_eq!(ch("file:read").pattern, "request-response", "constant resolved through const CH_READ");
    assert_eq!(ch("log").pattern, "fire-and-forget");
    assert_eq!(ch("app:ready").pattern, "push");
    assert_eq!(ch("sync:ask").pattern, "mixed", "ipcMain.on + ipcRenderer.sendSync");
    assert_eq!(m.ipc.dynamic.len(), 1, "PREFIX + ':dynamic'");
    assert!(m.ipc.dynamic[0].expression.contains("PREFIX"));
    // Minified alias forms.
    assert_eq!(ch("min:ping").sites[0].site.confidence, "resolved");
    assert_eq!(ch("min:evt").sites[0].site.confidence, "resolved");
    assert_eq!(ch("wp:ch").sites[0].site.confidence, "heuristic", "webpack runtime require cannot be resolved");
    assert!(m.ipc.channels.iter().all(|c| c.name != "shadowed:not-electron"), "a parameter named ipcMain shadows the alias");
    let h = ch("app:get-version").sites.iter().find(|s| s.api == "ipcMain.handle").unwrap();
    assert!(h.handler_snippet.as_deref().unwrap().contains("getVersion"));
}

#[test]
fn manifest_context_bridge() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    assert_eq!(m.context_bridge.len(), 1);
    let b = &m.context_bridge[0];
    assert_eq!(b.name, "electronAPI");
    let key = |n: &str| b.keys.iter().find(|k| k.name == n).unwrap();
    assert_eq!(key("getVersion").channel.as_deref(), Some("app:get-version"));
    assert_eq!(key("getVersion").kind.as_deref(), Some("invoke"));
    assert_eq!(key("log").kind.as_deref(), Some("send"));
    assert_eq!(key("onReady").kind.as_deref(), Some("on"));
    assert_eq!(key("ask").kind.as_deref(), Some("sendSync"));
    assert_eq!(key("platform").channel, None);
    assert_eq!(key("composite").channel, None, "two channels in one body is not a single mapping");
    assert_eq!(b.renderer_usage.get("getVersion"), Some(&1));
    assert_eq!(b.renderer_usage.get("readFile"), Some(&1));
}

#[test]
fn manifest_node_apis_natives_protocols_menus_tray_updater() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    for module in ["fs", "path", "child_process", "os", "process"] {
        assert!(m.node_apis.contains_key(module), "node:{module} missing: {:?}", m.node_apis.keys().collect::<Vec<_>>());
    }
    assert!(m.node_apis["fs"].apis.contains_key("promises"));
    assert!(m.node_apis["child_process"].apis.contains_key("spawn"));
    assert_eq!(m.native_modules.len(), 1);
    assert_eq!(m.native_modules[0].package.as_deref(), Some("keytar"));
    assert!(m.native_modules[0].unpacked);
    assert!(m.native_dependencies.contains(&"keytar".to_string()));
    assert_eq!(m.protocols.privileged_schemes.len(), 1);
    assert_eq!(m.protocols.privileged_schemes[0].scheme, "demo");
    assert!(m.protocols.privileged_schemes[0].privileges.contains(&"secure".to_string()));
    assert!(m.protocols.handlers.iter().any(|h| h.api == "protocol.handle" && h.scheme.as_deref() == Some("demo")));
    assert!(m.protocols.default_clients.iter().any(|h| h.scheme.as_deref() == Some("demo-link")));
    assert!(m.deep_links.schemes.contains(&"demo-link".to_string()));
    assert!(m.deep_links.open_url_handler && m.deep_links.second_instance_handler && m.deep_links.single_instance_lock);
    assert_eq!(m.app_events.get("open-url"), Some(&1));
    // menus: the application menu and the tray context menu
    assert_eq!(m.menus.templates.len(), 2);
    let big = m.menus.templates.iter().max_by_key(|t| t.items.len()).unwrap();
    assert_eq!(big.items.len(), 7);
    assert!(big.items.iter().any(|i| i.label.as_deref() == Some("Open") && i.accelerator.as_deref() == Some("CmdOrCtrl+O") && i.has_click));
    assert!(big.items.iter().any(|i| i.role.as_deref() == Some("quit")));
    assert!(m.tray.used);
    assert!(m.tray.apis.contains_key("setToolTip"));
    assert!(m.auto_updater.providers.contains(&"electron".to_string()));
    assert!(m.auto_updater.providers.contains(&"squirrel".to_string()));
    assert_eq!(m.auto_updater.feed_urls, vec!["https://updates.example.com/feed".to_string()]);
    assert!(m.electron_apis.contains_key("shell.openExternal"));
    assert!(m.electron_apis.contains_key("new BrowserWindow"));
    assert!(!m.limits.is_empty());
}

#[test]
fn manifest_round_trips_through_json() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    let text = analyze::to_json(&m);
    let back: Manifest = serde_json::from_str(&text).unwrap();
    assert_eq!(back.schema, crate::manifest::SCHEMA);
    assert_eq!(back.ipc.channels.len(), m.ipc.channels.len());
    assert!(analyze::summary(&m).contains("electron 44.6.0"));
}

#[test]
fn scanner_handles_garbage_and_imports() {
    let mut f = Facts::default();
    let err = scan_source("bad.js", "const = = {{{ ipcMain.handle(", &mut f).expect("tree-sitter recovers");
    assert!(err, "parse errors are reported, not fatal");
    let mut f = Facts::default();
    scan_source("esm.mjs", "import { ipcMain as m, shell } from 'electron';\nimport fs from 'node:fs';\nm.handle('esm:ch', () => fs.readFileSync('x'));\nshell.openExternal('u');", &mut f).unwrap();
    assert!(f.ipc.contains_key("esm:ch"));
    assert!(f.electron_apis.contains_key("shell.openExternal"));
    assert!(f.node["fs"].apis.contains_key("readFileSync"));
}

#[test]
fn mapping_statuses_and_coverage() {
    let tmp = tempfile::tempdir().unwrap();
    let (m, _) = analyzed(tmp.path());
    let rows = map::map_manifest(&m, Target::Tauri);
    let find = |cat: &str, needle: &str| rows.iter().find(|r| r.category == cat && r.construct.contains(needle)).unwrap_or_else(|| panic!("{cat}/{needle} missing"));
    assert_eq!(find("ipc", "app:get-version").status, Status::OneToOne);
    assert_eq!(find("ipc", "sync:ask").status, Status::Stubbed);
    assert_eq!(find("ipc", "app:ready").status, Status::OneToOne);
    assert_eq!(find("window-option", "width").status, Status::OneToOne);
    assert_eq!(find("window-option", "webPreferences.contextIsolation").status, Status::Unsupported);
    assert_eq!(find("electron-api", "shell.openExternal").status, Status::OneToOne);
    assert_eq!(find("node", "node:fs").status, Status::OneToOne);
    assert_eq!(find("bridge", "electronAPI.getVersion").status, Status::OneToOne);
    assert_eq!(find("bridge", "electronAPI.platform").status, Status::Stubbed);
    assert_eq!(find("native-module", "keytar").status, Status::Stubbed);
    assert_eq!(find("tray", "Tray").status, Status::OneToOne);
    let cov = map::coverage(&rows, Target::Tauri);
    assert_eq!(cov.total.total, rows.len());
    assert_eq!(cov.total.one_to_one + cov.total.stubbed + cov.total.unsupported, cov.total.total);
    let by_cat: usize = cov.by_category.values().map(|c| c.total).sum();
    assert_eq!(by_cat, cov.total.total);
    let g = map::map_manifest(&m, Target::Gpui);
    assert_eq!(g.iter().find(|r| r.category == "tray").unwrap().status, Status::Unsupported);
    let md = map::markdown(&m, Target::Tauri, &rows, &cov);
    assert!(md.contains("## ipc") && md.contains("| 1:1 |") && md.contains("unsupported"));
}

#[test]
fn tauri_project_is_complete_and_valid() {
    let tmp = tempfile::tempdir().unwrap();
    let root = write_fixture(tmp.path());
    let out = tmp.path().join("out-tauri");
    let rep = migrate::migrate(&root, &MigrateOptions { target: Target::Tauri, out: out.clone(), copy_main: true, analyze: Options::default() }).unwrap();
    assert!(rep.coverage.total.total > 20);
    for f in [
        "src-tauri/Cargo.toml", "src-tauri/build.rs", "src-tauri/tauri.conf.json", "src-tauri/capabilities/default.json", "src-tauri/src/main.rs",
        "src-tauri/src/sidecar.rs", "src-tauri/src/menu.rs", "shim/electron-compat.ts", "shim/original/preload.js", "frontend/index.html", "frontend/app.js",
        "sidecar/main.ts", "sidecar/shims/electron.ts", "sidecar/app/main.js", "scripts/build-sidecar.ts", "package.json", "MAPPING.md", "coverage.json", "manifest.json",
    ] {
        assert!(out.join(f).is_file(), "missing {f}");
    }
    // Cargo.toml: fork pin through [patch.crates-io] from the constants.
    let cargo: toml::Table = std::fs::read_to_string(out.join("src-tauri/Cargo.toml")).unwrap().parse().unwrap();
    let patch = &cargo["patch"]["crates-io"]["tauri"];
    assert_eq!(patch["git"].as_str(), Some(tauri::TAURI_FORK_REPO));
    assert_eq!(patch["rev"].as_str(), Some(tauri::TAURI_FORK_REV));
    assert!(cargo["dependencies"].as_table().unwrap().contains_key("tauri-plugin-opener"), "shell.openExternal needs opener");
    // tauri.conf.json
    let conf: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(out.join("src-tauri/tauri.conf.json")).unwrap()).unwrap();
    assert_eq!(conf["app"]["windows"][0]["width"], 1024);
    assert_eq!(conf["app"]["windows"][0]["decorations"], false);
    assert_eq!(conf["app"]["windows"][0]["create"], false);
    assert_eq!(conf["app"]["windows"][0]["url"], "index.html");
    assert_eq!(conf["plugins"]["deep-link"]["desktop"]["schemes"][0], "demo-link");
    assert_eq!(conf["bundle"]["externalBin"][0], "binaries/electron-main");
    // generated Rust parses
    for f in ["src-tauri/src/main.rs", "src-tauri/src/sidecar.rs", "src-tauri/src/menu.rs"] {
        let text = std::fs::read_to_string(out.join(f)).unwrap();
        assert!(rust_ok(&text), "{f} has syntax errors:\n{text}");
    }
    let main = std::fs::read_to_string(out.join("src-tauri/src/main.rs")).unwrap();
    assert!(main.contains("async fn ipc_app_get_version") && main.contains("async fn ipc_file_read"));
    let menu = std::fs::read_to_string(out.join("src-tauri/src/menu.rs")).unwrap();
    assert!(menu.contains(".quit()") && menu.contains("CmdOrCtrl+O"));
    // shim maps channels
    let shim = std::fs::read_to_string(out.join("shim/electron-compat.ts")).unwrap();
    assert!(shim.contains("\"app:get-version\":\"ipc_app_get_version\"") && shim.contains("expose(\"electronAPI\""));
    assert!(shim.contains("ipcRenderer.invoke(\"file:read\""));
    // MAPPING and coverage agree
    let cov: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(out.join("coverage.json")).unwrap()).unwrap();
    assert_eq!(cov["total"]["total"].as_u64().unwrap() as usize, rep.coverage.total.total);
    let md = std::fs::read_to_string(out.join("MAPPING.md")).unwrap();
    assert!(md.contains("app:get-version") && md.contains("1:1"));
    // frontend carries the renderer only; sidecar app carries main + node_modules but not the renderer
    assert!(!out.join("frontend/main.js").exists());
    assert!(out.join("sidecar/app/node_modules/left-pad/index.js").is_file());
    assert!(out.join("sidecar/app/renderer/index.html").is_file(), "main code may read pages next to it");
}

#[test]
fn gpui_project_is_valid() {
    let tmp = tempfile::tempdir().unwrap();
    let root = write_fixture(tmp.path());
    let out = tmp.path().join("out-gpui");
    migrate::migrate(&root, &MigrateOptions { target: Target::Gpui, out: out.clone(), copy_main: false, analyze: Options::default() }).unwrap();
    let cargo: toml::Table = std::fs::read_to_string(out.join("Cargo.toml")).unwrap().parse().unwrap();
    assert_eq!(cargo["dependencies"]["gpui"]["git"].as_str(), Some(gpui::GPUI_FORK_REPO));
    assert_eq!(cargo["dependencies"]["gpui"]["rev"].as_str(), Some(gpui::GPUI_FORK_REV));
    for f in ["src/main.rs", "src/sidecar.rs", "src/webview.rs"] {
        let text = std::fs::read_to_string(out.join(f)).unwrap();
        assert!(rust_ok(&text), "{f} has syntax errors:\n{text}");
    }
    let main = std::fs::read_to_string(out.join("src/main.rs")).unwrap();
    assert!(main.contains("WindowBounds::Windowed") && main.contains("px(1024.0)") && main.contains("window_min_size"));
    assert!(main.contains("Menu::new(\"File\")") && main.contains("MenuItem::action(\"Quit\", Quit)"));
    assert!(!out.join("sidecar/app").exists(), "copy_main=false");
    let md = std::fs::read_to_string(out.join("MAPPING.md")).unwrap();
    assert!(md.contains("gpui"));
}

#[test]
fn optimize_writes_profile_and_scripts() {
    let tmp = tempfile::tempdir().unwrap();
    let root = write_fixture(tmp.path());
    let out = tmp.path().join("proj");
    migrate::migrate(&root, &MigrateOptions { target: Target::Tauri, out: out.clone(), copy_main: false, analyze: Options::default() }).unwrap();
    // A pre-existing release profile is rewritten, not duplicated.
    let cargo_path = out.join("src-tauri/Cargo.toml");
    let mut text = std::fs::read_to_string(&cargo_path).unwrap();
    text.push_str("\n[profile.release]\nopt-level = 0\n");
    std::fs::write(&cargo_path, text).unwrap();
    std::fs::create_dir_all(out.join("src-tauri/binaries")).unwrap();
    std::fs::write(out.join("src-tauri/binaries/electron-main-x86_64-unknown-linux-gnu"), vec![0u8; 1234]).unwrap();
    let rep = optimize::optimize(&OptimizeOptions { project: out.clone(), opt_level: None, build: false }).unwrap();
    assert_eq!(rep.target, "tauri");
    assert_eq!(rep.before, vec![optimize::Artifact { path: "src-tauri/binaries/electron-main-x86_64-unknown-linux-gnu".into(), bytes: 1234 }]);
    let cargo: toml::Table = std::fs::read_to_string(&cargo_path).unwrap().parse().unwrap();
    let rel = &cargo["profile"]["release"];
    assert_eq!(rel["lto"].as_str(), Some("fat"));
    assert_eq!(rel["codegen-units"].as_integer(), Some(1));
    assert_eq!(rel["panic"].as_str(), Some("abort"));
    assert_eq!(rel["strip"].as_str(), Some("symbols"));
    assert_eq!(rel["opt-level"].as_str(), Some("s"));
    let script = std::fs::read_to_string(out.join("scripts/build-sidecar.ts")).unwrap();
    assert!(script.contains("--compile --minify --bytecode"));
    assert!(std::fs::read_to_string(out.join("scripts/pgo.ts")).unwrap().contains("-Cprofile-generate"));
    assert!(out.join("optimize-report.json").is_file());
    assert_eq!(rep.bun.flags, vec!["--compile", "--minify", "--bytecode"]);
    // GPUI default opt-level is 3.
    let (t, _) = optimize::apply_release_profile("[package]\nname=\"x\"\n", "3").unwrap();
    assert!(t.contains("opt-level = 3") && t.contains("lto = \"fat\""));
}

#[test]
fn bench_markdown_and_sizes() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = tmp.path().join("target/release/app");
    std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
    std::fs::write(&exe, vec![0u8; 2048]).unwrap();
    std::fs::write(exe.parent().unwrap().join("electron-main-x"), vec![0u8; 1000]).unwrap();
    std::fs::write(exe.parent().unwrap().join("unrelated.bin"), vec![0u8; 9000]).unwrap();
    assert_eq!(bench::sizes(&exe), (2048, 3048), "cargo target dir counts only the sidecar");
    let report = bench::BenchReport {
        schema: "ay-electron-bench/1".into(),
        runs: 3,
        ready: bench::Ready::Cdp,
        apps: vec![bench::AppMetrics {
            label: "electron".into(),
            exe: "x".into(),
            binary_bytes: 100 << 20,
            install_bytes: 300 << 20,
            cold_start: Some(bench::Stats { mean_ms: 812.0, stddev_ms: 20.0, median_ms: 800.0, min_ms: 790.0, max_ms: 860.0, runs: 3, method: "hyperfine".into() }),
            ready_ms_median: Some(800.0),
            rss_bytes_median: Some(420 << 20),
            processes: Some(7),
            ipc_us_median: Some(180.5),
            notes: vec![],
        }],
        caveats: vec!["c".into()],
    };
    let md = bench::markdown(&report);
    assert!(md.contains("| cold start mean (ms) |") && md.contains("812 +/- 20") && md.contains("420.0 MB (7 procs)") && md.contains("180.5"));
    assert!(serde_json::to_string(&report).unwrap().contains("\"ipc_us_median\":180.5"));
}

/// The probe launches a process, waits for a CDP page target served by a stub HTTP listener, samples RSS and kills the tree.
#[cfg(unix)]
#[test]
fn probe_waits_for_a_cdp_page_and_samples_rss() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut s = stream;
            let mut buf = [0u8; 1024];
            let _ = s.read(&mut buf);
            let body = r#"[{"type":"page","url":"http://app.test/","title":"t","webSocketDebuggerUrl":"ws://127.0.0.1:1/devtools/page/1"}]"#;
            let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        }
    });
    let o = bench::ProbeOptions {
        exe: "sh".into(),
        args: vec!["-c".into(), "sleep 30".into(), "sh".into()],
        port,
        timeout_ms: 10_000,
        settle_ms: 50,
        ready: bench::Ready::Cdp,
        ipc_expr: None,
        ipc_iters: 1,
        sample_rss: true,
    };
    let r = bench::probe(&o).unwrap();
    assert!(r.ready_ms > 0.0 && r.ready_ms < 10_000.0);
    assert!(r.procs >= 1 && r.rss_bytes > 0, "{r:?}");
    let alive = bench::probe(&bench::ProbeOptions { ready: bench::Ready::Alive, ..o }).unwrap();
    assert!(alive.ready_ms > 0.0);
}

/// `EM_APP_DIR=<install dir or app.asar> EM_OUT=<dir> cargo test -p aphrody-electron-migrate real_app -- --ignored --nocapture`:
/// analyzes a real Electron app and writes manifest.json plus both migration targets below EM_OUT.
#[test]
#[ignore]
fn real_app_from_env() {
    let (Some(app), Some(out)) = (std::env::var_os("EM_APP_DIR"), std::env::var_os("EM_OUT")) else { return };
    let out = std::path::PathBuf::from(out);
    let (m, _) = analyze::analyze_path(Path::new(&app), &Options::default()).expect("analyze");
    std::fs::create_dir_all(&out).unwrap();
    std::fs::write(out.join("manifest.json"), analyze::to_json(&m)).unwrap();
    println!("{}", analyze::summary(&m));
    for target in [Target::Tauri, Target::Gpui] {
        let dir = out.join(target.name());
        let rep = migrate::migrate(Path::new(&app), &MigrateOptions { target, out: dir, copy_main: true, analyze: Options::default() }).expect("migrate");
        println!("{}: {}", target.name(), serde_json::to_string(&rep.coverage).unwrap());
    }
}

#[test]
fn load_url_through_a_helper_resolves_bundle_pages() {
    let mut f = Facts::default();
    scan_source("src/main.js", "const w = new BrowserWindow({}); w.loadURL(z(\"minichat\", \"minichat.html\")); w.loadURL(\"https://gemini.example.com/app\"); w.loadURL(dyn);", &mut f).unwrap();
    let t = &f.load_targets;
    assert_eq!(t.len(), 2, "loadURL(dyn) has no literal and is not guessed");
    assert_eq!((t[0].kind.as_str(), t[0].target.as_str(), t[0].site.confidence.as_str()), ("file", "src/minichat/minichat.html", "heuristic"));
    assert_eq!((t[1].kind.as_str(), t[1].target.as_str()), ("url", "https://gemini.example.com/app"));
}

#[test]
fn renderer_root_is_the_common_directory_and_windows_get_their_own_page() {
    let mut m = Manifest::default();
    m.renderer.entries = vec!["src/a/a.html".into(), "src/b/b.html".into(), "src/loading.html".into()];
    assert_eq!(tauri::renderer_root(&m), "src");
    assert_eq!(tauri::frontend_path(&m, "src/a/a.html"), "a/a.html");
    assert_eq!(tauri::frontend_path(&m, "src/loading.html"), "loading.html");
    m.renderer.entries = vec!["x/index.html".into()];
    assert_eq!(tauri::renderer_root(&m), "x");
    m.renderer.entries = vec!["index.html".into(), "sub/p.html".into()];
    assert_eq!(tauri::renderer_root(&m), "");
    // Two windows in one file load different pages: the nearest load after each construction wins.
    m.renderer.entries = vec!["src/a/a.html".into(), "src/b/b.html".into()];
    let site = |line| crate::manifest::Site { file: "src/main.js".into(), line, confidence: "resolved".into() };
    m.windows = vec![
        crate::manifest::WindowDecl { kind: "BrowserWindow".into(), site: site(10), ..Default::default() },
        crate::manifest::WindowDecl { kind: "BrowserWindow".into(), site: site(30), ..Default::default() },
    ];
    m.load_targets = vec![
        crate::manifest::LoadTarget { kind: "file".into(), target: "src/a/a.html".into(), site: site(12) },
        crate::manifest::LoadTarget { kind: "file".into(), target: "src/b/b.html".into(), site: site(32) },
    ];
    let conf = tauri::tauri_conf(&m);
    assert_eq!(conf["app"]["windows"][0]["url"], "a/a.html");
    assert_eq!(conf["app"]["windows"][1]["url"], "b/b.html");
}
