//! Tree-sitter scan of one JavaScript file. A single pre-order walk keeps a scope-aware alias table
//! (`const {ipcMain: a} = require("electron")`, `import {shell as s} from "electron"`, TypeScript and
//! esbuild interop wrappers) so minified code resolves to canonical names such as `electron.ipcMain.handle`
//! or `node:fs.readFileSync`. When a name cannot be resolved (webpack runtime requires), a distinctive
//! identifier (`ipcMain`, `contextBridge`, ...) still matches and the fact is marked `heuristic`.

use crate::manifest::*;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use tree_sitter::{Node, Parser};

const RAW: &str = "raw:?";

/// Electron names distinctive enough to match without being traced to `require("electron")`.
const DISTINCT: &[&str] = &[
    "ipcMain",
    "ipcRenderer",
    "contextBridge",
    "BrowserWindow",
    "BrowserView",
    "WebContentsView",
    "BaseWindow",
    "Menu",
    "MenuItem",
    "Tray",
    "autoUpdater",
    "webContents",
    "globalShortcut",
    "powerMonitor",
    "safeStorage",
    "nativeTheme",
];

const NODE_BUILTINS: &[&str] = &[
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram",
    "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder",
    "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
];

const KNOWN_NATIVE: &[&str] = &[
    "keytar", "better-sqlite3", "sqlite3", "node-pty", "sharp", "canvas", "robotjs", "@nut-tree/nut-js", "node-hid",
    "usb", "serialport", "fsevents", "ffi-napi", "koffi", "@parcel/watcher", "bufferutil", "utf-8-validate",
    "cpu-features", "drivelist", "node-gyp-build", "bindings", "nan", "node-addon-api", "onnxruntime-node",
    "msgpackr-extract", "win32-api", "node-window-manager", "active-win", "get-windows", "iohook", "uiohook-napi",
    "@electron/windows-sign", "node-notifier", "windows-foreground-love", "registry-js", "ref-napi", "dtrace-provider",
];

pub fn is_native_package(name: &str) -> bool {
    KNOWN_NATIVE.contains(&name) || name.starts_with("@napi-rs/") || name.ends_with(".node")
}

#[derive(Default)]
pub struct Facts {
    pub windows: Vec<WindowDecl>,
    pub load_targets: Vec<LoadTarget>,
    pub ipc: BTreeMap<String, Vec<IpcSite>>,
    pub ipc_dynamic: Vec<DynamicChannel>,
    pub bridge: Vec<BridgeApi>,
    pub node: BTreeMap<String, NodeModuleUse>,
    pub electron_apis: BTreeMap<String, ApiUse>,
    pub app_events: BTreeMap<String, usize>,
    pub native_imports: BTreeSet<String>,
    pub imports: BTreeMap<String, usize>,
    pub schemes: Vec<SchemeDecl>,
    pub proto_handlers: Vec<ProtocolHandler>,
    pub default_clients: Vec<ProtocolHandler>,
    pub menus: MenuInfo,
    pub tray: TrayInfo,
    pub updater: UpdaterInfo,
    pub deep: DeepLinks,
    pub file_flags: BTreeMap<String, (bool, bool, bool)>,
}

#[derive(Clone)]
struct Binding {
    at: usize,
    scope_end: usize,
    canon: String,
    init: Option<(usize, usize)>,
}

struct Cx<'a> {
    src: &'a str,
    file: &'a str,
    dir: String,
    root: Node<'a>,
    bindings: HashMap<&'a str, Vec<Binding>>,
    facts: &'a mut Facts,
    flags: (bool, bool, bool),
}

/// Scan `src` (the contents of `file`, a bundle-relative path). Returns whether the parse tree has errors.
pub fn scan_source(file: &str, src: &str, facts: &mut Facts) -> Result<bool, String> {
    let mut parser = Parser::new();
    parser.set_language(&tree_sitter_javascript::LANGUAGE.into()).map_err(|e| e.to_string())?;
    let tree = parser.parse(src, None).ok_or_else(|| "tree-sitter returned no tree".to_string())?;
    let root = tree.root_node();
    let dir = file.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
    let mut cx = Cx { src, file, dir, root, bindings: HashMap::new(), facts, flags: (false, false, false) };
    let mut stack = vec![root];
    while let Some(n) = stack.pop() {
        cx.visit(n);
        if matches!(n.kind(), "string" | "comment" | "regex") {
            continue;
        }
        let mut c = n.walk();
        let kids: Vec<Node> = n.children(&mut c).collect();
        stack.extend(kids.into_iter().rev());
    }
    if cx.flags != (false, false, false) {
        let e = cx.facts.file_flags.entry(file.to_string()).or_default();
        e.0 |= cx.flags.0;
        e.1 |= cx.flags.1;
        e.2 |= cx.flags.2;
    }
    Ok(root.has_error())
}

fn is_function(kind: &str) -> bool {
    matches!(
        kind,
        "function_declaration"
            | "function_expression"
            | "function"
            | "generator_function"
            | "generator_function_declaration"
            | "arrow_function"
            | "method_definition"
            | "program"
    )
}

fn module_canon(spec: &str) -> String {
    let s = spec.strip_prefix("node:").unwrap_or(spec);
    if matches!(s, "electron" | "electron/main" | "electron/renderer" | "electron/common" | "electron/utility") {
        return "electron".into();
    }
    let head = s.split('/').next().unwrap_or(s);
    if NODE_BUILTINS.contains(&head) {
        return format!("node:{s}");
    }
    format!("mod:{spec}")
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match it.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some(o) => out.push(o),
            None => {}
        }
    }
    out
}

fn join(base: &str, prop: &str) -> String {
    if base.starts_with("str:") {
        return RAW.into();
    }
    if prop == "default" && (base == "electron" || base.starts_with("node:") || base.starts_with("mod:")) {
        return base.to_string();
    }
    format!("{base}.{prop}")
}

/// Split a canonical chain into `(segments from the Electron API root, resolved)`.
fn electron_path(canon: &str) -> Option<(Vec<String>, bool)> {
    if canon == "electron" {
        return Some((Vec::new(), true));
    }
    if let Some(rest) = canon.strip_prefix("electron.") {
        return Some((rest.split('.').map(String::from).collect(), true));
    }
    let raw = canon.strip_prefix("raw:")?;
    let segs: Vec<&str> = raw.split('.').collect();
    let i = segs.iter().position(|s| DISTINCT.contains(&s.trim_end_matches("#new")))?;
    Some((segs[i..].iter().map(|s| s.to_string()).collect(), false))
}

fn conf(resolved: bool) -> String {
    if resolved { "resolved" } else { "heuristic" }.into()
}

struct Prop<'t> {
    key: String,
    value: Option<Node<'t>>,
    node: Node<'t>,
}

impl<'a> Cx<'a> {
    fn text(&self, n: Node) -> &'a str {
        self.src.get(n.byte_range()).unwrap_or("")
    }

    fn snippet(&self, n: Node, max: usize) -> String {
        let t = self.text(n);
        let mut s: String = t.split_whitespace().collect::<Vec<_>>().join(" ");
        if s.len() > max {
            let mut cut = max;
            while !s.is_char_boundary(cut) {
                cut -= 1;
            }
            s.truncate(cut);
            s.push_str("...");
        }
        s
    }

    fn site(&self, n: Node, resolved: bool) -> Site {
        Site { file: self.file.to_string(), line: n.start_position().row + 1, confidence: conf(resolved) }
    }

    fn named_kids(&self, n: Node<'a>) -> Vec<Node<'a>> {
        let mut c = n.walk();
        n.named_children(&mut c).collect()
    }

    fn arg(&self, args: Option<Node<'a>>, i: usize) -> Option<Node<'a>> {
        args?.named_child(u32::try_from(i).ok()?)
    }

    // ---------- scopes and bindings ----------

    fn scope_of(&self, n: Node) -> (usize, usize) {
        let mut cur = n.parent();
        while let Some(p) = cur {
            if is_function(p.kind()) {
                return (p.start_byte(), p.end_byte());
            }
            cur = p.parent();
        }
        (0, self.src.len())
    }

    fn bind(&mut self, name: &'a str, scope: (usize, usize), at: usize, canon: String, init: Option<(usize, usize)>) {
        self.bindings.entry(name).or_default().push(Binding { at: at.max(scope.0), scope_end: scope.1, canon, init });
    }

    fn lookup(&self, name: &str, pos: usize) -> Option<&Binding> {
        let list = self.bindings.get(name)?;
        let upto = list.partition_point(|b| b.at <= pos);
        list[..upto].iter().rev().find(|b| pos < b.scope_end)
    }

    fn bind_pattern(&mut self, pat: Node<'a>, canon: String, scope: (usize, usize), at: usize, init: Option<(usize, usize)>) {
        match pat.kind() {
            "identifier" => self.bind(self.text(pat), scope, at, canon, init),
            "shorthand_property_identifier_pattern" => {
                let name = self.text(pat);
                self.bind(name, scope, at, join(&canon, name), None);
            }
            "object_assignment_pattern" => {
                if let Some(l) = pat.child_by_field_name("left") {
                    self.bind_pattern(l, canon, scope, at, None);
                }
            }
            "object_pattern" => {
                for k in self.named_kids(pat) {
                    match k.kind() {
                        "pair_pattern" => {
                            let key = k.child_by_field_name("key").and_then(|x| self.key_text(x));
                            let val = k.child_by_field_name("value");
                            if let Some(v) = val {
                                let c = key.map_or_else(|| RAW.to_string(), |kk| join(&canon, &kk));
                                self.bind_pattern(v, c, scope, at, None);
                            }
                        }
                        "rest_pattern" => {
                            if let Some(x) = k.named_child(0) {
                                self.bind_pattern(x, RAW.into(), scope, at, None);
                            }
                        }
                        _ => self.bind_pattern(k, canon.clone(), scope, at, None),
                    }
                }
            }
            "array_pattern" | "rest_pattern" => {
                for k in self.named_kids(pat) {
                    self.bind_pattern(k, RAW.into(), scope, at, None);
                }
            }
            "assignment_pattern" => {
                if let Some(l) = pat.child_by_field_name("left") {
                    self.bind_pattern(l, RAW.into(), scope, at, None);
                }
            }
            _ => {}
        }
    }

    fn key_text(&self, k: Node<'a>) -> Option<String> {
        match k.kind() {
            "property_identifier" | "identifier" | "shorthand_property_identifier" | "number" => Some(self.text(k).to_string()),
            "string" | "template_string" => self.string_literal(k),
            _ => None,
        }
    }

    // ---------- values ----------

    fn string_literal(&self, n: Node<'a>) -> Option<String> {
        let t = self.text(n);
        match n.kind() {
            "string" if t.len() >= 2 => Some(unescape(&t[1..t.len() - 1])),
            "template_string" if t.len() >= 2 => {
                let has_subst = self.named_kids(n).iter().any(|k| k.kind() == "template_substitution");
                (!has_subst).then(|| unescape(&t[1..t.len() - 1]))
            }
            _ => None,
        }
    }

    /// String literal or a name bound to one (`const CH = "app:ready"`).
    fn string_value(&self, n: Node<'a>) -> Option<String> {
        if let Some(s) = self.string_literal(n) {
            return Some(s);
        }
        self.canon(n, 0).strip_prefix("str:").map(String::from)
    }

    fn canon(&self, n: Node<'a>, depth: u32) -> String {
        if depth > 32 {
            return RAW.into();
        }
        match n.kind() {
            "identifier" => {
                let name = self.text(n);
                if let Some(b) = self.lookup(name, n.start_byte()) {
                    return b.canon.clone();
                }
                if name == "process" {
                    return "global:process".into();
                }
                format!("raw:{name}")
            }
            "this" => "raw:this".into(),
            "parenthesized_expression" => u32::try_from(n.named_child_count().saturating_sub(1)).ok().and_then(|i| n.named_child(i)).map_or_else(|| RAW.into(), |c| self.canon(c, depth + 1)),
            "sequence_expression" => n.child_by_field_name("right").map_or_else(|| RAW.into(), |c| self.canon(c, depth + 1)),
            "await_expression" => n.named_child(0).map_or_else(|| RAW.into(), |c| self.canon(c, depth + 1)),
            "member_expression" => {
                let (Some(o), Some(p)) = (n.child_by_field_name("object"), n.child_by_field_name("property")) else {
                    return RAW.into();
                };
                join(&self.canon(o, depth + 1), self.text(p))
            }
            "subscript_expression" => {
                let (Some(o), Some(i)) = (n.child_by_field_name("object"), n.child_by_field_name("index")) else {
                    return RAW.into();
                };
                match self.string_literal(i) {
                    Some(s) => join(&self.canon(o, depth + 1), &s),
                    None => RAW.into(),
                }
            }
            "call_expression" => self.canon_call(n, depth),
            "new_expression" => n
                .child_by_field_name("constructor")
                .map_or_else(|| RAW.into(), |c| format!("{}#new", self.canon(c, depth + 1))),
            "string" | "template_string" => self.string_literal(n).map_or_else(|| RAW.into(), |s| format!("str:{s}")),
            _ => RAW.into(),
        }
    }

    fn canon_call(&self, n: Node<'a>, depth: u32) -> String {
        let (Some(f), args) = (n.child_by_field_name("function"), n.child_by_field_name("arguments")) else {
            return RAW.into();
        };
        if f.kind() == "identifier" && self.text(f) == "require" && self.lookup("require", f.start_byte()).is_none() {
            return match self.arg(args, 0).and_then(|a| self.string_literal(a)) {
                Some(spec) => module_canon(&spec),
                None => RAW.into(),
            };
        }
        let callee_text = self.text(f);
        let last = callee_text.rsplit(['.', ' ']).next().unwrap_or(callee_text).to_ascii_lowercase();
        let wrapper = ["interop", "toesm", "importdefault", "importstar", "__import", "__toesm"].iter().any(|w| last.contains(w));
        if wrapper && args.is_some_and(|a| a.named_child_count() == 1) {
            return self.arg(args, 0).map_or_else(|| RAW.into(), |a| self.canon(a, depth + 1));
        }
        RAW.into()
    }

    fn resolve_object(&self, n: Node<'a>) -> Option<Node<'a>> {
        match n.kind() {
            "object" | "array" => Some(n),
            "parenthesized_expression" => n.named_child(0).and_then(|c| self.resolve_object(c)),
            "identifier" => {
                let b = self.lookup(self.text(n), n.start_byte())?;
                let (s, e) = b.init?;
                let found = self.root.descendant_for_byte_range(s, e)?;
                matches!(found.kind(), "object" | "array").then_some(found)
            }
            _ => None,
        }
    }

    fn props(&self, obj: Node<'a>) -> Vec<Prop<'a>> {
        let mut out = Vec::new();
        for k in self.named_kids(obj) {
            match k.kind() {
                "pair" => {
                    let key = k.child_by_field_name("key").and_then(|x| self.key_text(x)).unwrap_or_else(|| "?".into());
                    out.push(Prop { key, value: k.child_by_field_name("value"), node: k });
                }
                "method_definition" => {
                    let key = k.child_by_field_name("name").and_then(|x| self.key_text(x)).unwrap_or_else(|| "?".into());
                    out.push(Prop { key, value: Some(k), node: k });
                }
                "shorthand_property_identifier" => out.push(Prop { key: self.text(k).to_string(), value: None, node: k }),
                "spread_element" => out.push(Prop { key: "...".into(), value: k.named_child(0), node: k }),
                _ => {}
            }
        }
        out
    }

    fn value_json(&self, n: Node<'a>, depth: u32) -> Value {
        if depth > 6 {
            return json!({"$expr": self.snippet(n, 80)});
        }
        match n.kind() {
            "number" => self.text(n).parse::<f64>().ok().and_then(|f| {
                if f.fract() == 0.0 && f.abs() < 9e15 { Some(json!(f as i64)) } else { serde_json::Number::from_f64(f).map(Value::Number) }
            }).unwrap_or_else(|| json!({"$expr": self.text(n)})),
            "true" => json!(true),
            "false" => json!(false),
            "null" | "undefined" => Value::Null,
            "string" | "template_string" => self.string_literal(n).map_or_else(|| json!({"$expr": self.snippet(n, 80)}), Value::String),
            "unary_expression" if self.text(n).starts_with('-') => {
                n.named_child(0).map_or(Value::Null, |c| match self.value_json(c, depth + 1) {
                    Value::Number(x) => x.as_i64().map_or_else(|| json!({"$expr": self.snippet(n, 80)}), |i| json!(-i)),
                    _ => json!({"$expr": self.snippet(n, 80)}),
                })
            }
            "object" => {
                let mut m = Map::new();
                for p in self.props(n) {
                    if p.key == "..." {
                        m.insert("$spread".into(), json!(p.value.map_or(String::new(), |v| self.snippet(v, 80))));
                    } else if let Some(v) = p.value.filter(|v| !matches!(v.kind(), "method_definition")) {
                        m.insert(p.key, self.value_json(v, depth + 1));
                    } else {
                        m.insert(p.key, json!({"$expr": self.snippet(p.node, 80)}));
                    }
                }
                Value::Object(m)
            }
            "array" => Value::Array(self.named_kids(n).into_iter().take(32).map(|k| self.value_json(k, depth + 1)).collect()),
            "identifier" => match self.canon(n, 0).strip_prefix("str:") {
                Some(s) => Value::String(s.to_string()),
                None => json!({"$expr": self.snippet(n, 80)}),
            },
            _ => json!({"$expr": self.snippet(n, 80)}),
        }
    }

    /// String literals found anywhere inside an expression such as `path.join(__dirname, "a", "b.js")`.
    fn literals_in(&self, n: Node<'a>) -> Vec<String> {
        let mut out = Vec::new();
        let mut stack = vec![n];
        let mut seen = 0;
        while let Some(x) = stack.pop() {
            seen += 1;
            if seen > 200 {
                break;
            }
            if let Some(s) = self.string_literal(x) {
                out.push(s);
                continue;
            }
            let mut kids = self.named_kids(x);
            kids.reverse();
            stack.extend(kids);
        }
        out
    }

    fn join_literals(&self, lits: &[String]) -> Option<String> {
        if lits.is_empty() {
            return None;
        }
        Some(lits.join("/").trim_start_matches("./").to_string())
    }

    fn rel_to_bundle(&self, p: &str) -> String {
        let mut parts: Vec<&str> = if p.starts_with('/') || self.dir.is_empty() { Vec::new() } else { self.dir.split('/').collect() };
        for seg in p.split(['/', '\\']) {
            match seg {
                "" | "." => {}
                ".." => {
                    parts.pop();
                }
                s => parts.push(s),
            }
        }
        parts.join("/")
    }

    // ---------- visitor ----------

    fn visit(&mut self, n: Node<'a>) {
        match n.kind() {
            "import_statement" => self.import_statement(n),
            "variable_declarator" => self.declarator(n),
            "assignment_expression" => self.assignment(n),
            "function_declaration" | "generator_function_declaration" => {
                if let Some(name) = n.child_by_field_name("name") {
                    let sc = self.scope_of(n);
                    self.bind(self.text(name), sc, n.start_byte(), RAW.into(), None);
                }
                self.params(n);
            }
            "function_expression" | "function" | "generator_function" => {
                if let Some(name) = n.child_by_field_name("name") {
                    self.bind(self.text(name), (n.start_byte(), n.end_byte()), n.start_byte(), RAW.into(), None);
                }
                self.params(n);
            }
            "arrow_function" | "method_definition" => self.params(n),
            "catch_clause" => {
                if let Some(p) = n.child_by_field_name("parameter") {
                    self.bind_pattern(p, RAW.into(), (n.start_byte(), n.end_byte()), n.start_byte(), None);
                }
            }
            "call_expression" => self.call(n),
            "new_expression" => self.new_expr(n),
            "member_expression" | "subscript_expression" => self.member_use(n),
            _ => {}
        }
    }

    fn params(&mut self, f: Node<'a>) {
        let scope = (f.start_byte(), f.end_byte());
        if let Some(p) = f.child_by_field_name("parameter") {
            self.bind_pattern(p, RAW.into(), scope, f.start_byte(), None);
        }
        if let Some(ps) = f.child_by_field_name("parameters") {
            for p in self.named_kids(ps) {
                self.bind_pattern(p, RAW.into(), scope, f.start_byte(), None);
            }
        }
    }

    fn declarator(&mut self, n: Node<'a>) {
        let Some(name) = n.child_by_field_name("name") else { return };
        let scope = self.scope_of(n);
        let (canon, init) = match n.child_by_field_name("value") {
            Some(v) => (self.canon(v, 0), matches!(v.kind(), "object" | "array").then(|| (v.start_byte(), v.end_byte()))),
            None => (RAW.to_string(), None),
        };
        self.bind_pattern(name, canon, scope, n.start_byte(), init);
    }

    fn assignment(&mut self, n: Node<'a>) {
        let (Some(l), Some(r)) = (n.child_by_field_name("left"), n.child_by_field_name("right")) else { return };
        if l.kind() == "identifier" {
            let scope = self.scope_of(n);
            let canon = self.canon(r, 0);
            self.bind(self.text(l), scope, n.start_byte(), canon, None);
        }
    }

    fn import_statement(&mut self, n: Node<'a>) {
        let Some(spec) = n.child_by_field_name("source").and_then(|s| self.string_literal(s)) else { return };
        self.record_import(&spec);
        let base = module_canon(&spec);
        let scope = (0, self.src.len());
        for clause in self.named_kids(n).into_iter().filter(|k| k.kind() == "import_clause") {
            for part in self.named_kids(clause) {
                match part.kind() {
                    "identifier" => self.bind(self.text(part), scope, n.start_byte(), base.clone(), None),
                    "namespace_import" => {
                        if let Some(id) = part.named_child(0) {
                            self.bind(self.text(id), scope, n.start_byte(), base.clone(), None);
                        }
                    }
                    "named_imports" => {
                        for s in self.named_kids(part).into_iter().filter(|k| k.kind() == "import_specifier") {
                            let name = s.child_by_field_name("name").map(|x| self.text(x)).unwrap_or("");
                            let local = s.child_by_field_name("alias").map(|x| self.text(x)).unwrap_or(name);
                            let c = if name == "default" { base.clone() } else { join(&base, name) };
                            self.bind(local, scope, n.start_byte(), c, None);
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    fn record_import(&mut self, spec: &str) {
        let canon = module_canon(spec);
        if let Some(m) = canon.strip_prefix("node:") {
            let e = self.facts.node.entry(m.to_string()).or_default();
            e.imports += 1;
            if !e.files.iter().any(|f| f == self.file) {
                e.files.push(self.file.to_string());
            }
        } else if canon.starts_with("mod:") && !spec.starts_with('.') && !spec.starts_with('/') {
            *self.facts.imports.entry(spec.to_string()).or_default() += 1;
            if is_native_package(spec) {
                self.facts.native_imports.insert(spec.to_string());
            }
            let up = &mut self.facts.updater;
            let provider = match spec {
                "electron-updater" => Some("electron-updater"),
                "update-electron-app" => Some("update-electron-app"),
                "electron-squirrel-startup" => Some("squirrel-startup"),
                _ => None,
            };
            if let Some(p) = provider {
                if !up.providers.iter().any(|x| x == p) {
                    up.providers.push(p.into());
                }
            }
        } else if spec.ends_with(".node") {
            self.facts.native_imports.insert(spec.to_string());
        }
    }

    fn member_use(&mut self, n: Node<'a>) {
        if let Some(p) = n.parent() {
            if matches!(p.kind(), "member_expression" | "subscript_expression") && p.child_by_field_name("object") == Some(n) {
                return;
            }
        }
        let canon = self.canon(n, 0);
        if let Some((mut segs, resolved)) = electron_path(&canon) {
            if segs.is_empty() {
                return;
            }
            for s in &mut segs {
                *s = s.replace("#new", "");
            }
            segs.truncate(3);
            let e = self.facts.electron_apis.entry(segs.join(".")).or_default();
            e.count += 1;
            if !resolved {
                e.heuristic += 1;
            }
        } else {
            self.node_use(&canon);
        }
    }

    /// `node:fs.readFileSync` / `global:process.platform` style canonical names (member chains and
    /// bare calls of destructured imports such as `const { spawn } = require("child_process")`).
    fn node_use(&mut self, canon: &str) {
        let Some(rest) = canon.strip_prefix("node:").or_else(|| canon.strip_prefix("global:")) else { return };
        let mut it = rest.splitn(2, '.');
        let module = it.next().unwrap_or("").to_string();
        if let Some(api) = it.next() {
            let api = api.split('.').next().unwrap_or(api).to_string();
            let e = self.facts.node.entry(module).or_default();
            *e.apis.entry(api).or_default() += 1;
            if !e.files.iter().any(|f| f == self.file) {
                e.files.push(self.file.to_string());
            }
        }
    }

    fn new_expr(&mut self, n: Node<'a>) {
        let Some(c) = n.child_by_field_name("constructor") else { return };
        let args = n.child_by_field_name("arguments");
        let canon = self.canon(c, 0);
        let Some((segs, resolved)) = electron_path(&canon) else { return };
        let Some(name) = segs.first().map(|s| s.replace("#new", "")) else { return };
        let e = self.facts.electron_apis.entry(format!("new {name}")).or_default();
        e.count += 1;
        if !resolved {
            e.heuristic += 1;
        }
        match name.as_str() {
            "BrowserWindow" | "BrowserView" | "WebContentsView" | "BaseWindow" => {
                self.flags.0 = true;
                self.window(n, &name, args, resolved);
            }
            "Tray" => {
                self.flags.0 = true;
                self.facts.tray.used = true;
                let site = self.site(n, resolved);
                self.facts.tray.sites.push(site);
            }
            _ => {}
        }
    }

    fn window(&mut self, n: Node<'a>, kind: &str, args: Option<Node<'a>>, resolved: bool) {
        let mut decl = WindowDecl { kind: kind.into(), site: self.site(n, resolved), options: json!({}), ..WindowDecl::default() };
        if let Some(a0) = self.arg(args, 0) {
            match self.resolve_object(a0).filter(|o| o.kind() == "object") {
                Some(obj) => {
                    decl.options = self.value_json(obj, 0);
                    decl.options_dynamic = a0.kind() != "object";
                    let wp = self.props(obj).into_iter().find(|p| p.key == "webPreferences").and_then(|p| p.value);
                    if let Some(wp_obj) = wp.and_then(|w| self.resolve_object(w)) {
                        if let Some(pre) = self.props(wp_obj).into_iter().find(|p| p.key == "preload").and_then(|p| p.value) {
                            let lits = self.literals_in(pre);
                            decl.preload = self.join_literals(&lits).map(|p| self.rel_to_bundle(&p));
                        }
                    }
                }
                None => {
                    decl.options = json!({"$expr": self.snippet(a0, 120)});
                    decl.options_dynamic = true;
                }
            }
        }
        self.facts.windows.push(decl);
    }

    fn channel(&self, n: Node<'a>) -> Result<String, String> {
        self.string_value(n).ok_or_else(|| self.snippet(n, 100))
    }

    fn record_channel(&mut self, api: &str, arg0: Option<Node<'a>>, handler: Option<Node<'a>>, site_node: Node<'a>, resolved: bool) {
        let Some(a0) = arg0 else { return };
        match self.channel(a0) {
            Ok(name) => {
                let site = self.site(site_node, resolved);
                let (snippet, bytes) = match handler {
                    Some(h) => (Some(self.snippet(h, 160)), Some(h.end_byte() - h.start_byte())),
                    None => (None, None),
                };
                self.facts.ipc.entry(name).or_default().push(IpcSite { api: api.into(), site, handler_snippet: snippet, handler_bytes: bytes });
            }
            Err(expr) => {
                let site = self.site(site_node, resolved);
                self.facts.ipc_dynamic.push(DynamicChannel { api: api.into(), expression: expr, site });
            }
        }
    }

    fn call(&mut self, n: Node<'a>) {
        let Some(f) = n.child_by_field_name("function") else { return };
        let args = n.child_by_field_name("arguments");
        if f.kind() == "identifier" && self.text(f) == "require" && self.lookup("require", f.start_byte()).is_none() {
            if let Some(spec) = self.arg(args, 0).and_then(|a| self.string_literal(a)) {
                self.record_import(&spec);
            }
            return;
        }
        if f.kind() == "import" {
            if let Some(spec) = self.arg(args, 0).and_then(|a| self.string_literal(a)) {
                self.record_import(&spec);
            }
            return;
        }
        let callee = self.canon(f, 0);
        if f.kind() == "identifier" {
            self.node_use(&callee);
        }
        let path = electron_path(&callee);
        let (segs, resolved): (Vec<String>, bool) = match &path {
            Some((s, r)) => (s.iter().map(|x| x.replace("#new", "")).collect(), *r),
            None => (Vec::new(), false),
        };
        let all: Vec<&str> = callee.rsplit('.').collect();
        let last = all.first().copied().unwrap_or("");
        let s = |i: usize| segs.get(i).map(String::as_str).unwrap_or("");

        // loadURL / loadFile: distinctive method names, any receiver.
        if matches!(last, "loadURL" | "loadFile") && !callee.starts_with("str:") {
            if let Some(a0) = self.arg(args, 0) {
                let lits = self.literals_in(a0);
                let direct = a0.kind() == "string" || a0.kind() == "template_string";
                let (kind, target, via_helper) = if last == "loadURL" {
                    match self.string_value(a0).or_else(|| lits.iter().find(|l| l.contains("://")).cloned()) {
                        Some(u) => ("url", Some(u), !direct),
                        // loadURL(helper("dir", "page.html")): a bundle-relative page behind a URL helper.
                        None if lits.iter().any(|l| l.ends_with(".html")) => ("file", self.join_literals(&lits).map(|p| self.rel_to_bundle(&p)), true),
                        None => ("url", None, true),
                    }
                } else {
                    ("file", self.join_literals(&lits).map(|p| self.rel_to_bundle(&p)), false)
                };
                if let Some(t) = target {
                    let site = self.site(n, resolved && !via_helper);
                    self.facts.load_targets.push(LoadTarget { kind: kind.into(), target: t, site });
                }
            }
        }
        // Electron's webContents.send / event.sender.send.
        let nseg = segs.len();
        let ends = |a: &str, b: &str| nseg >= 2 && s(nseg - 2) == a && s(nseg - 1) == b;
        if path.is_some() && (ends("webContents", "send") || ends("webContents", "postMessage") || ends("webContents", "sendToFrame")) {
            self.flags.0 = true;
            let api = format!("webContents.{}", s(nseg - 1));
            // sendToFrame takes (frame, channel, ...).
            let idx = usize::from(s(nseg - 1) == "sendToFrame");
            self.record_channel(&api, self.arg(args, idx), None, n, resolved);
            return;
        }
        let raw_tail: Vec<&str> = callee.strip_prefix("raw:").map(|r| r.rsplit('.').take(2).collect()).unwrap_or_default();
        if raw_tail == ["send", "sender"] {
            self.flags.0 = true;
            self.record_channel("event.sender.send", self.arg(args, 0), None, n, false);
            return;
        }
        if callee.starts_with("mod:electron-updater") && callee.contains("autoUpdater") {
            let m = callee.rsplit('.').next().unwrap_or("").to_string();
            *self.facts.updater.apis.entry(format!("electron-updater.{m}")).or_default() += 1;
            return;
        }
        if callee == "mod:update-electron-app" || callee.starts_with("mod:update-electron-app.") {
            return;
        }
        if segs.is_empty() {
            return;
        }
        match (s(0), s(1)) {
            ("ipcMain", m @ ("handle" | "handleOnce" | "on" | "once" | "addListener")) => {
                self.flags.0 = true;
                let api = format!("ipcMain.{m}");
                self.record_channel(&api, self.arg(args, 0), self.arg(args, 1), n, resolved);
            }
            ("ipcRenderer", m @ ("invoke" | "send" | "sendSync" | "sendToHost" | "on" | "once" | "addListener" | "postMessage")) => {
                self.flags.1 = true;
                let api = format!("ipcRenderer.{m}");
                self.record_channel(&api, self.arg(args, 0), None, n, resolved);
            }
            ("contextBridge", m @ ("exposeInMainWorld" | "exposeInIsolatedWorld")) => {
                self.flags.1 = true;
                self.expose(n, m, args, resolved);
            }
            ("protocol", m) if resolved => self.protocol(n, m, args),
            ("app", m) if resolved => self.app_call(n, m, args),
            ("Menu", m @ ("buildFromTemplate" | "setApplicationMenu" | "getApplicationMenu" | "sendActionToFirstResponder")) => {
                self.flags.0 = true;
                *self.facts.menus.menu_apis.entry(m.to_string()).or_default() += 1;
                if m == "setApplicationMenu" {
                    let site = self.site(n, resolved);
                    self.facts.menus.set_application_menu.push(site);
                }
                if m == "buildFromTemplate" {
                    self.menu_template(n, args, resolved);
                }
            }
            ("Tray", m) if nseg == 2 => {
                *self.facts.tray.apis.entry(m.to_string()).or_default() += 1;
            }
            ("autoUpdater", m) => {
                self.flags.0 = true;
                if !self.facts.updater.providers.iter().any(|p| p == "electron") {
                    self.facts.updater.providers.push("electron".into());
                }
                *self.facts.updater.apis.entry(m.to_string()).or_default() += 1;
                if m == "setFeedURL" {
                    if let Some(a0) = self.arg(args, 0) {
                        let url = self.string_value(a0).or_else(|| {
                            self.resolve_object(a0).and_then(|o| self.props(o).into_iter().find(|p| p.key == "url").and_then(|p| p.value).and_then(|v| self.string_value(v)))
                        });
                        if let Some(u) = url {
                            self.facts.updater.feed_urls.push(u);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn app_call(&mut self, n: Node<'a>, m: &str, args: Option<Node<'a>>) {
        self.flags.0 = true;
        match m {
            "on" | "once" | "addListener" | "prependListener" => {
                if let Some(ev) = self.arg(args, 0).and_then(|a| self.string_value(a)) {
                    match ev.as_str() {
                        "open-url" => self.facts.deep.open_url_handler = true,
                        "second-instance" => self.facts.deep.second_instance_handler = true,
                        _ => {}
                    }
                    *self.facts.app_events.entry(ev).or_default() += 1;
                }
            }
            "requestSingleInstanceLock" => self.facts.deep.single_instance_lock = true,
            "setAsDefaultProtocolClient" | "removeAsDefaultProtocolClient" => {
                let scheme = self.arg(args, 0).and_then(|a| self.string_value(a));
                if let Some(sc) = &scheme {
                    if m == "setAsDefaultProtocolClient" && !self.facts.deep.schemes.contains(sc) {
                        self.facts.deep.schemes.push(sc.clone());
                    }
                }
                let site = self.site(n, true);
                self.facts.default_clients.push(ProtocolHandler { api: format!("app.{m}"), scheme, site });
            }
            _ => {}
        }
    }

    fn protocol(&mut self, n: Node<'a>, m: &str, args: Option<Node<'a>>) {
        self.flags.0 = true;
        if m == "registerSchemesAsPrivileged" {
            let Some(arr) = self.arg(args, 0).and_then(|a| self.resolve_object(a)) else { return };
            for item in self.named_kids(arr) {
                let Some(obj) = self.resolve_object(item) else { continue };
                let props = self.props(obj);
                let scheme = props.iter().find(|p| p.key == "scheme").and_then(|p| p.value).and_then(|v| self.string_value(v));
                let privileges: Vec<String> = props
                    .iter()
                    .find(|p| p.key == "privileges")
                    .and_then(|p| p.value)
                    .and_then(|v| self.resolve_object(v))
                    .map(|o| self.props(o).into_iter().filter(|p| p.value.is_some_and(|v| self.text(v) == "true" || self.text(v) == "!0")).map(|p| p.key).collect())
                    .unwrap_or_default();
                if let Some(scheme) = scheme {
                    let site = self.site(n, true);
                    self.facts.schemes.push(SchemeDecl { scheme, privileges, site });
                }
            }
            return;
        }
        if m.starts_with("register") || m.starts_with("intercept") || matches!(m, "handle" | "unhandle" | "isProtocolHandled") {
            let scheme = self.arg(args, 0).and_then(|a| self.string_value(a));
            let site = self.site(n, true);
            self.facts.proto_handlers.push(ProtocolHandler { api: format!("protocol.{m}"), scheme, site });
        }
    }

    fn menu_template(&mut self, n: Node<'a>, args: Option<Node<'a>>, resolved: bool) {
        let mut tpl = MenuTemplate { site: self.site(n, resolved), usage: "buildFromTemplate".into(), ..MenuTemplate::default() };
        match self.arg(args, 0).and_then(|a| self.resolve_object(a)).filter(|a| a.kind() == "array") {
            Some(arr) => self.collect_menu(arr, 0, &mut tpl.items),
            None => tpl.dynamic = true,
        }
        self.facts.menus.templates.push(tpl);
    }

    fn collect_menu(&self, arr: Node<'a>, depth: usize, out: &mut Vec<MenuItemDecl>) {
        if depth > 8 || out.len() > 400 {
            return;
        }
        for item in self.named_kids(arr) {
            let Some(obj) = self.resolve_object(item).filter(|o| o.kind() == "object") else { continue };
            let props = self.props(obj);
            let get = |k: &str| props.iter().find(|p| p.key == k).and_then(|p| p.value);
            let str_of = |k: &str| get(k).and_then(|v| self.string_value(v));
            let submenu = get("submenu").and_then(|v| self.resolve_object(v)).filter(|v| v.kind() == "array");
            let kind = str_of("type").unwrap_or_else(|| if submenu.is_some() { "submenu".into() } else { "normal".into() });
            out.push(MenuItemDecl {
                depth,
                label: str_of("label"),
                role: str_of("role"),
                accelerator: str_of("accelerator"),
                kind,
                has_click: props.iter().any(|p| p.key == "click"),
            });
            if let Some(sub) = submenu {
                self.collect_menu(sub, depth + 1, out);
            }
        }
    }

    fn expose(&mut self, n: Node<'a>, world_api: &str, args: Option<Node<'a>>, resolved: bool) {
        let (world, name_idx) = if world_api == "exposeInIsolatedWorld" {
            (self.arg(args, 0).map_or_else(|| "?".to_string(), |a| self.text(a).to_string()), 1)
        } else {
            ("main".to_string(), 0)
        };
        let Some(name) = self.arg(args, name_idx).and_then(|a| self.string_value(a)) else { return };
        let mut api = BridgeApi { world, name, site: self.site(n, resolved), ..BridgeApi::default() };
        match self.arg(args, name_idx + 1).and_then(|a| self.resolve_object(a)).filter(|o| o.kind() == "object") {
            Some(obj) => {
                for p in self.props(obj) {
                    if p.key == "..." {
                        api.dynamic = true;
                        continue;
                    }
                    let (channel, kind) = p.value.map_or((None, None), |v| self.bridge_call(v));
                    api.keys.push(BridgeKey { name: p.key, channel, kind });
                }
            }
            None => api.dynamic = true,
        }
        self.facts.bridge.push(api);
    }

    /// The single literal `ipcRenderer.<kind>(<channel>, ...)` inside a bridge property's function, if there is exactly one.
    fn bridge_call(&self, v: Node<'a>) -> (Option<String>, Option<String>) {
        let mut found: Vec<(String, String)> = Vec::new();
        let mut stack = vec![v];
        let mut seen = 0;
        while let Some(x) = stack.pop() {
            seen += 1;
            if seen > 4000 {
                break;
            }
            if x.kind() == "call_expression" {
                if let Some(f) = x.child_by_field_name("function") {
                    if let Some((segs, _)) = electron_path(&self.canon(f, 0)) {
                        if segs.len() == 2 && segs[0] == "ipcRenderer" && matches!(segs[1].as_str(), "invoke" | "send" | "sendSync" | "on" | "once") {
                            let a0 = x.child_by_field_name("arguments").and_then(|a| a.named_child(0));
                            if let Some(ch) = a0.and_then(|a| self.string_value(a)) {
                                found.push((ch, segs[1].clone()));
                            }
                        }
                    }
                }
            }
            if matches!(x.kind(), "string" | "comment") {
                continue;
            }
            stack.extend(self.named_kids(x));
        }
        found.dedup();
        if found.len() == 1 { (Some(found[0].0.clone()), Some(found[0].1.clone())) } else { (None, None) }
    }
}
