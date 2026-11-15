//! Python AST (ruff_python_ast) -> Bun TypeScript emitter.
//!
//! Policy: every construct is either translated faithfully or reported as a diagnostic.
//! Unsupported constructs emit `__py.unsupported("...")`, which throws at run time.

use crate::names::*;
use ruff_python_ast::visitor::{self, Visitor};
use ruff_python_ast::*;
use ruff_text_size::{Ranged, TextRange};
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug)]
pub struct Diagnostic {
    pub line: usize,
    pub col: usize,
    pub severity: Severity,
    pub message: String,
}

impl std::fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        write!(f, "{}:{}: {}: {}", self.line, self.col, s, self.message)
    }
}

#[derive(Debug, Default)]
pub struct Output {
    pub ts: String,
    pub diagnostics: Vec<Diagnostic>,
}

impl Output {
    pub fn has_errors(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == Severity::Error)
    }
}

/// Async code generation: Ghidra calls cross a process boundary (every call returns a Promise).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum AsyncMode {
    /// async when the script uses Ghidra (flat API names, Java imports, pyghidra)
    #[default]
    Auto,
    On,
    Off,
}

/// Transpile Python 3 source to Bun TypeScript. Parse errors yield empty `ts` plus errors.
pub fn transpile(source: &str) -> Output {
    transpile_with(source, AsyncMode::Auto)
}

pub fn transpile_with(source: &str, mode: AsyncMode) -> Output {
    let mut fixed_lines: Vec<usize> = vec![];
    let fixed_src: String;
    let mut source = source;
    let parsed = match ruff_python_parser::parse_module(source) {
        Ok(p) => p,
        Err(e) => {
            let (line, col) = line_col(source, e.location.start().to_usize());
            let fail = |m: String| Output {
                ts: String::new(),
                diagnostics: vec![Diagnostic { line, col, severity: Severity::Error, message: m }],
            };
            let (fs, changed) = crate::py2::fix(source);
            if changed.is_empty() {
                return fail(format!("syntax error: {}", e.error));
            }
            fixed_src = fs;
            match ruff_python_parser::parse_module(&fixed_src) {
                Ok(p) => {
                    fixed_lines = changed;
                    source = &fixed_src;
                    p
                }
                Err(_) => return fail(format!("syntax error: {}", e.error)),
            }
        }
    };
    let module = parsed.into_syntax();
    let mut em = Emitter::new(source);
    em.mode = mode;
    for l in &fixed_lines {
        em.diags.push(Diagnostic {
            line: *l,
            col: 1,
            severity: Severity::Warning,
            message: "Python 2 syntax (print statement / except X, e) rewritten to Python 3".into(),
        });
    }
    em.module(&module.body);
    Output { ts: em.finish(), diagnostics: em.diags }
}

fn line_col(src: &str, off: usize) -> (usize, usize) {
    let off = off.min(src.len());
    let mut off = off;
    while !src.is_char_boundary(off) {
        off -= 1;
    }
    let pre = &src[..off];
    let line = pre.matches('\n').count() + 1;
    let start = pre.rfind('\n').map(|p| p + 1).unwrap_or(0);
    let col = pre[start..].chars().count() + 1; // characters, not bytes
    (line, col)
}

const JS_RESERVED: &[&str] = &[
    "new", "var", "function", "this", "delete", "switch", "case", "default", "typeof", "void",
    "let", "const", "enum", "export", "package", "interface", "static", "arguments", "eval",
    "undefined", "null", "NaN", "Infinity", "catch", "do", "debugger", "extends", "finally",
    "implements", "private", "protected", "public", "super", "throw", "instanceof", "in", "yield",
    "await", "async", "of", "constructor", "Symbol", "Math", "JSON", "Promise", "Reflect", "Proxy",
    "Number", "String", "Boolean", "Array", "Object", "Map", "Set", "Error", "Date", "RegExp",
    "BigInt", "console", "globalThis", "process", "Bun", "require", "module", "exports", "type",
    "declare", "namespace", "abstract", "readonly", "keyof", "never", "unknown", "any", "is",
];

fn ident(id: &str) -> String {
    if JS_RESERVED.contains(&id) && id != "constructor" {
        format!("{id}_")
    } else if id.starts_with("__") && !id.ends_with("__") {
        // user names starting with `__` must not collide with the emitter's `__py`, `__kw`, `__tN`, ...
        format!("$u{id}")
    } else {
        id.to_string()
    }
}

fn js_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            '\u{2028}' => o.push_str("\\u2028"),
            '\u{2029}' => o.push_str("\\u2029"),
            c if (c as u32) < 0x20 || c == '\u{7f}' => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn tpl_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 8);
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '`' => o.push_str("\\`"),
            '\\' => o.push_str("\\\\"),
            '$' if it.peek() == Some(&'{') => o.push_str("\\$"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\u{2028}' => o.push_str("\\u2028"),
            '\u{2029}' => o.push_str("\\u2029"),
            c if ((c as u32) < 0x20 && c != '\t') || c == '\u{7f}' => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}

/// Scope pre-pass: names bound in a scope (not descending into nested scopes unless `deep`).
#[derive(Default)]
struct Collector<'a> {
    deep: bool,
    assigned: BTreeSet<String>,
    defs: BTreeSet<String>,
    imported: BTreeSet<String>,
    globals: BTreeSet<String>,
    nonlocals: BTreeSet<String>,
    imports: Vec<&'a Stmt>,
    has_yield: bool,
    ghidra_hit: bool,
    funcs: Vec<&'a StmtFunctionDef>,
    classes: BTreeSet<String>,
}

impl<'a> Visitor<'a> for Collector<'a> {
    fn visit_stmt(&mut self, stmt: &'a Stmt) {
        match stmt {
            Stmt::FunctionDef(f) => {
                self.defs.insert(f.name.as_str().to_string());
                if self.deep {
                    self.funcs.push(f);
                    visitor::walk_stmt(self, stmt);
                }
            }
            Stmt::ClassDef(c) => {
                self.defs.insert(c.name.as_str().to_string());
                self.classes.insert(c.name.as_str().to_string());
                if self.deep {
                    visitor::walk_stmt(self, stmt);
                }
            }
            Stmt::Import(i) => {
                for a in &i.names {
                    let n = a
                        .asname
                        .as_ref()
                        .map(|x| x.as_str().to_string())
                        .unwrap_or_else(|| a.name.as_str().split('.').next().unwrap().to_string());
                    self.imported.insert(n);
                }
                self.imports.push(stmt);
            }
            Stmt::ImportFrom(i) => {
                for a in &i.names {
                    if a.name.as_str() == "*" {
                        continue;
                    }
                    let n = a.asname.as_ref().unwrap_or(&a.name).as_str().to_string();
                    self.imported.insert(n);
                }
                self.imports.push(stmt);
            }
            Stmt::Global(g) => {
                for n in &g.names {
                    self.globals.insert(n.as_str().to_string());
                }
            }
            Stmt::Nonlocal(g) => {
                for n in &g.names {
                    self.nonlocals.insert(n.as_str().to_string());
                }
            }
            _ => visitor::walk_stmt(self, stmt),
        }
    }
    fn visit_expr(&mut self, expr: &'a Expr) {
        match expr {
            Expr::Name(n) => {
                let id = n.id.as_str();
                if n.ctx == ExprContext::Load && (is_flat(id) || JAVA_ROOTS.contains(&id)) {
                    self.ghidra_hit = true;
                }
                if n.ctx == ExprContext::Store {
                    self.assigned.insert(id.to_string());
                }
            }
            Expr::ListComp(_) | Expr::SetComp(_) | Expr::DictComp(_) | Expr::Generator(_) => {
                // a walrus target inside a comprehension binds in the enclosing scope
                let mut nc = NamedTargets::default();
                nc.visit_expr(expr);
                self.assigned.extend(nc.0);
            }
            Expr::Lambda(_) => {}
            Expr::Yield(_) | Expr::YieldFrom(_) => self.has_yield = true,
            _ => visitor::walk_expr(self, expr),
        }
    }
    fn visit_except_handler(&mut self, h: &'a ExceptHandler) {
        let ExceptHandler::ExceptHandler(x) = h;
        if let Some(n) = &x.name {
            self.assigned.insert(n.as_str().to_string());
        }
        visitor::walk_except_handler(self, h);
    }
}

#[derive(Default)]
struct NamedTargets(BTreeSet<String>);

impl<'a> Visitor<'a> for NamedTargets {
    fn visit_expr(&mut self, expr: &'a Expr) {
        if let Expr::Named(n) = expr {
            if let Expr::Name(t) = &*n.target {
                self.0.insert(t.id.as_str().to_string());
            }
        }
        visitor::walk_expr(self, expr);
    }
}

#[derive(Clone)]
struct FuncSig {
    params: Vec<String>,
    has_kw: bool,
    has_vararg: bool,
}

struct ClassCtx {
    derived: bool,
}

struct Emitter<'s> {
    src: &'s str,
    diags: Vec<Diagnostic>,
    out: String,
    ind: usize,
    scopes: Vec<HashSet<String>>,
    flat_used: BTreeSet<&'static str>,
    imports: Vec<String>,
    tmp: usize,
    loops: Vec<Option<String>>,
    exc_stack: Vec<String>,
    user_funcs: HashMap<String, FuncSig>,
    user_classes: HashSet<String>,
    java_names: HashSet<String>,
    class_stack: Vec<ClassCtx>,
    star_pkgs: Vec<String>,
    star_names: BTreeSet<String>,
    asyncs: bool,
    no_await: u32,
    ghidra_seen: bool,
    mode: AsyncMode,
    pyghidra_names: HashSet<String>,
    /// while emitting a class body: (class name, attributes assigned so far, scope depth of the body)
    class_attr: Option<(String, HashSet<String>, usize)>,
    class_has_str: bool,
}

fn is_const(e: &Expr) -> bool {
    matches!(
        e,
        Expr::NumberLiteral(_) | Expr::StringLiteral(_) | Expr::BooleanLiteral(_) | Expr::NoneLiteral(_)
    )
}

/// True when `js` contains `name` as a whole identifier token.
fn mentions_ident(js: &str, name: &str) -> bool {
    let b = js.as_bytes();
    let isid = |c: u8| c.is_ascii_alphanumeric() || c == b'_' || c == b'$';
    let mut from = 0;
    while let Some(i) = js[from..].find(name) {
        let st = from + i;
        let en = st + name.len();
        if (st == 0 || !isid(b[st - 1])) && (en >= b.len() || !isid(b[en])) {
            return true;
        }
        from = st + 1;
    }
    false
}

fn is_pure(e: &Expr) -> bool {
    match e {
        Expr::Name(_) => true,
        Expr::Attribute(a) => is_pure(&a.value),
        Expr::Subscript(s) => is_pure(&s.value) && is_pure(&s.slice),
        _ => is_const(e),
    }
}

impl<'s> Emitter<'s> {
    fn new(src: &'s str) -> Self {
        Emitter {
            src,
            diags: vec![],
            out: String::new(),
            ind: 0,
            scopes: vec![],
            flat_used: BTreeSet::new(),
            imports: vec![],
            tmp: 0,
            loops: vec![],
            exc_stack: vec![],
            user_funcs: HashMap::new(),
            user_classes: HashSet::new(),
            java_names: HashSet::new(),
            class_stack: vec![],
            class_attr: None,
            class_has_str: false,
            star_pkgs: vec![],
            star_names: BTreeSet::new(),
            asyncs: false,
            no_await: 0,
            ghidra_seen: false,
            mode: AsyncMode::Auto,
            pyghidra_names: HashSet::new(),
        }
    }

    fn diag(&mut self, r: TextRange, sev: Severity, msg: impl Into<String>) {
        let (line, col) = line_col(self.src, r.start().to_usize());
        self.diags.push(Diagnostic { line, col, severity: sev, message: msg.into() });
    }

    fn unsupported(&mut self, r: TextRange, what: &str) -> String {
        self.diag(r, Severity::Error, format!("unsupported: {what}"));
        format!("__py.unsupported({})", js_str(what))
    }

    fn fresh(&mut self, p: &str) -> String {
        self.tmp += 1;
        format!("__{p}{}", self.tmp)
    }

    fn line(&mut self, s: &str) {
        for _ in 0..self.ind {
            self.out.push_str("  ");
        }
        self.out.push_str(s);
        self.out.push('\n');
    }

    fn lookup(&self, n: &str) -> bool {
        self.scopes.iter().any(|s| s.contains(n))
    }

    fn finish(&mut self) -> String {
        let mut head = String::from("// @ts-nocheck\n// generated by py2bun; do not edit\nimport * as __py from \"@aphrody/py2bun/runtime\";\n");
        let mut seen = HashSet::new();
        for i in &self.imports {
            if seen.insert(i.clone()) {
                head.push_str(i);
                head.push('\n');
            }
        }
        if !self.flat_used.is_empty() {
            let v: Vec<&str> = self.flat_used.iter().copied().collect();
            head.push_str(&format!("import {{ {} }} from \"@aphrody/ghidra/script\";\n", v.join(", ")));
        }
        if !self.star_names.is_empty() {
            let paths: Vec<String> = self.star_pkgs.iter().map(|p| js_str(p)).collect();
            for n in &self.star_names {
                head.push_str(&format!("const {} = await __py.starPick([{}], {});\n", ident(n), paths.join(", "), js_str(n)));
            }
        }
        for d in &self.diags {
            head.push_str(&format!("// py2bun {d}\n"));
        }
        head + &self.out
    }

    // ---------- module & scopes ----------

    fn module(&mut self, body: &[Stmt]) {
        let mut shallow = Collector::default();
        for s in body {
            shallow.visit_stmt(s);
        }
        let mut deep = Collector { deep: true, ..Default::default() };
        for s in body {
            deep.visit_stmt(s);
        }
        let mut names: HashSet<String> = HashSet::new();
        names.extend(shallow.assigned.iter().cloned());
        names.extend(shallow.defs.iter().cloned());
        names.extend(deep.imported.iter().cloned());
        names.extend(deep.globals.iter().cloned());
        for f in body {
            if let Stmt::FunctionDef(f) = f {
                self.user_funcs.insert(f.name.as_str().to_string(), sig_of(&f.parameters));
            }
        }
        self.user_classes.extend(deep.classes.iter().cloned());
        for imp in &deep.imports {
            self.handle_import(imp);
        }
        self.asyncs = match self.mode {
            AsyncMode::On => true,
            AsyncMode::Off => false,
            AsyncMode::Auto => deep.ghidra_hit || self.ghidra_seen || !self.java_names.is_empty(),
        };
        self.scopes.push(names);
        let mut lets: BTreeSet<String> = shallow.assigned.clone();
        lets.extend(deep.globals.iter().cloned());
        for n in shallow.defs.iter().chain(deep.imported.iter()) {
            lets.remove(n);
        }
        if !lets.is_empty() {
            let v: Vec<String> = lets.iter().map(|n| ident(n)).collect();
            self.line(&format!("let {};", v.join(", ")));
        }
        self.stmts(body);
        self.scopes.pop();
    }

    fn handle_import(&mut self, s: &Stmt) {
        match s {
            Stmt::Import(i) => {
                for a in &i.names {
                    let full = a.name.as_str();
                    let root = full.split('.').next().unwrap();
                    if JAVA_ROOTS.contains(&root) {
                        let bind = a.asname.as_ref().map(|x| x.as_str()).unwrap_or(root);
                        self.java_names.insert(bind.to_string());
                        if a.asname.is_some() && full.contains('.') {
                            let path = full.replace('.', "/");
                            self.imports.push(format!(
                                "import * as {} from \"@aphrody/ghidra/java/{}\";",
                                ident(bind),
                                path
                            ));
                        } else {
                            self.imports.push(format!(
                                "import {{ {}{} }} from \"@aphrody/ghidra/java\";",
                                root,
                                if bind != root { format!(" as {}", ident(bind)) } else { String::new() }
                            ));
                        }
                    } else if full == "pyghidra" {
                        // snake_case API -> camelCase in @aphrody/ghidra (packages/ghidra/PARITY.md)
                        let bind = a.asname.as_ref().map(|x| x.as_str()).unwrap_or("pyghidra").to_string();
                        self.ghidra_seen = true;
                        self.imports.push(format!("import * as {} from \"@aphrody/ghidra\";", ident(&bind)));
                        self.pyghidra_names.insert(bind);
                    } else if STDLIB.contains(&root) && (!full.contains('.') || full == "os.path") {
                        let bind = a.asname.as_ref().map(|x| x.as_str()).unwrap_or(root);
                        self.imports.push(format!(
                            "import * as {} from \"@aphrody/py2bun/runtime/{}\";",
                            ident(bind),
                            root
                        ));
                    } else if IGNORED_MODULES.contains(&root) {
                    } else {
                        self.diag(a.range(), Severity::Error, format!("unsupported import: module `{full}` has no Bun mapping"));
                    }
                }
            }
            Stmt::ImportFrom(i) => {
                let module = i.module.as_ref().map(|m| m.as_str()).unwrap_or("");
                let root = module.split('.').next().unwrap();
                let names: Vec<String> = i
                    .names
                    .iter()
                    .map(|a| match &a.asname {
                        Some(x) => format!("{} as {}", a.name.as_str(), ident(x.as_str())),
                        None => ident_import(a.name.as_str()),
                    })
                    .collect();
                let star = i.names.iter().any(|a| a.name.as_str() == "*");
                if star {
                    let path = if i.level == 0 && JAVA_ROOTS.contains(&root) {
                        Some(format!("@aphrody/ghidra/java/{}", module.replace('.', "/")))
                    } else if i.level == 0 && STDLIB.contains(&root) && !module.contains('.') {
                        Some(format!("@aphrody/py2bun/runtime/{module}"))
                    } else {
                        None
                    };
                    match path {
                        Some(p) => {
                            self.star_pkgs.push(p);
                            self.diag(i.range(), Severity::Warning, format!("star import from `{module}` resolved lazily, name by name (top-level await)"));
                        }
                        None => self.diag(i.range(), Severity::Error, format!("unsupported: star import from `{module}`")),
                    }
                } else if module == "os.path" && i.level == 0 {
                    let parts: Vec<String> = i
                        .names
                        .iter()
                        .map(|a| match &a.asname {
                            Some(x) => format!("{}: {}", a.name.as_str(), ident(x.as_str())),
                            None => ident(a.name.as_str()),
                        })
                        .collect();
                    self.imports.push("import { path as __ospath } from \"@aphrody/py2bun/runtime/os\";".into());
                    self.imports.push(format!("const {{ {} }} = __ospath;", parts.join(", ")));
                } else if i.level > 0 {
                    let p = format!("{}{}", if i.level == 1 { "./".to_string() } else { "../".repeat(i.level as usize - 1) }, module.replace('.', "/"));
                    self.imports.push(format!("import {{ {} }} from \"{}\";", names.join(", "), p));
                } else if JAVA_ROOTS.contains(&root) {
                    for a in &i.names {
                        let b = a.asname.as_ref().unwrap_or(&a.name).as_str();
                        self.java_names.insert(b.to_string());
                    }
                    self.imports.push(format!(
                        "import {{ {} }} from \"@aphrody/ghidra/java/{}\";",
                        names.join(", "),
                        module.replace('.', "/")
                    ));
                } else if module == "pyghidra" || module.starts_with("pyghidra.") {
                    self.ghidra_seen = true;
                    let nm: Vec<String> = i
                        .names
                        .iter()
                        .map(|a| {
                            let bind = a.asname.as_ref().unwrap_or(&a.name).as_str();
                            let c = camel(a.name.as_str());
                            if c == bind { c } else { format!("{c} as {}", ident(bind)) }
                        })
                        .collect();
                    self.imports.push(format!("import {{ {} }} from \"@aphrody/ghidra\";", nm.join(", ")));
                } else if STDLIB.contains(&root) && !module.contains('.') {
                    self.imports.push(format!(
                        "import {{ {} }} from \"@aphrody/py2bun/runtime/{}\";",
                        names.join(", "),
                        module
                    ));
                } else if IGNORED_MODULES.contains(&root) {
                } else {
                    self.diag(i.range(), Severity::Error, format!("unsupported import: module `{module}` has no Bun mapping"));
                }
            }
            _ => {}
        }
    }

    fn stmts(&mut self, body: &[Stmt]) {
        for s in body {
            self.stmt(s);
        }
    }

    fn block(&mut self, body: &[Stmt]) {
        self.ind += 1;
        self.stmts(body);
        self.ind -= 1;
    }

    // ---------- statements ----------

    fn stmt(&mut self, s: &Stmt) {
        match s {
            Stmt::FunctionDef(f) => {
                let head = self.function(f, false, None);
                self.line_multi(&head);
            }
            Stmt::ClassDef(c) => self.class(c),
            Stmt::Return(r) => match &r.value {
                Some(v) => {
                    let e = self.expr(v);
                    self.line(&format!("return {e};"));
                }
                None => self.line("return;"),
            },
            Stmt::Delete(d) => {
                for t in &d.targets {
                    match t {
                        Expr::Subscript(sub) => {
                            let (o, k) = (self.expr(&sub.value), self.subscript_key(&sub.slice));
                            self.line(&format!("__py.delitem({o}, {k});"));
                        }
                        Expr::Attribute(a) => {
                            let o = self.expr(&a.value);
                            self.line(&format!("delete {o}.{};", a.attr.as_str()));
                        }
                        _ => {
                            let m = self.unsupported(t.range(), "del of a plain name");
                            self.line(&format!("{m};"));
                        }
                    }
                }
            }
            Stmt::Assign(a) => self.assign(a),
            Stmt::AugAssign(a) => self.aug_assign(a),
            Stmt::AnnAssign(a) => {
                if let Some(v) = &a.value {
                    let val = self.expr(v);
                    let l = self.store(&a.target, &val);
                    self.line(&format!("{l};"));
                }
            }
            Stmt::For(f) => self.for_stmt(f),
            Stmt::While(w) => {
                let flag = if w.orelse.is_empty() { None } else { Some(self.fresh("f")) };
                if let Some(fl) = &flag {
                    self.line(&format!("let {fl} = true;"));
                }
                let c = self.cond(&w.test);
                self.line(&format!("while ({c}) {{"));
                self.loops.push(flag.clone());
                self.block(&w.body);
                self.loops.pop();
                self.line("}");
                if let Some(fl) = flag {
                    self.line(&format!("if ({fl}) {{"));
                    self.block(&w.orelse);
                    self.line("}");
                }
            }
            Stmt::If(i) => {
                let c = self.cond(&i.test);
                self.line(&format!("if ({c}) {{"));
                self.block(&i.body);
                for cl in &i.elif_else_clauses {
                    match &cl.test {
                        Some(t) => {
                            let c = self.cond(t);
                            self.line(&format!("}} else if ({c}) {{"));
                        }
                        None => self.line("} else {"),
                    }
                    self.block(&cl.body);
                }
                self.line("}");
            }
            Stmt::With(w) => self.with_stmt(w),
            Stmt::Match(m) => {
                let msg = self.unsupported(m.range(), "match statement");
                self.line(&format!("{msg};"));
            }
            Stmt::Raise(r) => match (&r.exc, &r.cause) {
                (Some(e), None) => {
                    let x = self.exc_expr(e);
                    self.line(&format!("throw {x};"));
                }
                (Some(e), Some(c)) => {
                    let (x, c) = (self.exc_expr(e), self.expr(c));
                    self.line(&format!("throw __py.withCause({x}, {c});"));
                }
                _ => match self.exc_stack.last().cloned() {
                    Some(v) => self.line(&format!("throw {v};")),
                    None => {
                        let m = self.unsupported(r.range(), "bare raise outside except");
                        self.line(&format!("{m};"));
                    }
                },
            },
            Stmt::Try(t) => self.try_stmt(t),
            Stmt::Assert(a) => {
                let c = self.cond(&a.test);
                let m = a.msg.as_ref().map(|m| self.expr(m)).unwrap_or_default();
                self.line(&format!("if (!({c})) throw new __py.AssertionError({m});"));
            }
            Stmt::Import(_) | Stmt::ImportFrom(_) => {}
            Stmt::Global(_) | Stmt::Nonlocal(_) | Stmt::Pass(_) => {}
            Stmt::Expr(e) => {
                if let Expr::StringLiteral(_) = &*e.value {
                    return; // docstring / bare string
                }
                let x = self.expr(&e.value);
                self.line(&format!("{x};"));
            }
            Stmt::Break(_) => match self.loops.last() {
                Some(Some(f)) => {
                    let f = f.clone();
                    self.line(&format!("{{ {f} = false; break; }}"));
                }
                _ => self.line("break;"),
            },
            Stmt::Continue(_) => self.line("continue;"),
            Stmt::TypeAlias(t) => {
                let m = self.unsupported(t.range(), "type alias statement");
                self.line(&format!("{m};"));
            }
            Stmt::IpyEscapeCommand(t) => {
                let m = self.unsupported(t.range(), "IPython escape command");
                self.line(&format!("{m};"));
            }
        }
    }

    fn line_multi(&mut self, text: &str) {
        for l in text.lines() {
            self.line(l);
        }
    }

    fn exc_expr(&mut self, e: &Expr) -> String {
        // `raise Foo` (class) -> new Foo(); `raise Foo(...)` already constructs.
        match e {
            Expr::Name(n) if self.is_class_name(n.id.as_str()) => {
                let c = self.expr(e);
                format!("new {c}()")
            }
            _ => self.expr(e),
        }
    }

    fn is_class_name(&self, n: &str) -> bool {
        (self.user_classes.contains(n) && self.lookup(n))
            || (EXCEPTIONS.contains(&n) && !self.lookup(n))
            || (self.java_names.contains(n) && n.chars().next().map_or(false, |c| c.is_uppercase()))
            || (!self.star_pkgs.is_empty()
                && !self.lookup(n)
                && n.chars().next().map_or(false, |c| c.is_uppercase())
                && n.chars().any(|c| c.is_lowercase())
                && !BUILTINS.contains(&n)
                && !is_flat(n))
    }

    fn assign(&mut self, a: &StmtAssign) {
        if a.targets.len() == 1 {
            // tuple swap fast path / plain
            let v = self.expr(&a.value);
            let l = self.store(&a.targets[0], &v);
            self.line(&format!("{l};"));
            return;
        }
        let t = self.fresh("t");
        let v = self.expr(&a.value);
        self.line(&format!("const {t} = {v};"));
        for tg in &a.targets {
            let l = self.store(tg, &t);
            self.line(&format!("{l};"));
        }
    }

    /// Store `val` (already-emitted JS) into target; returns a JS statement without the `;`.
    fn store(&mut self, target: &Expr, val: &str) -> String {
        match target {
            Expr::Name(n) => format!("{} = {}", self.target_name(n.id.as_str()), val),
            Expr::Attribute(a) => format!("{}.{} = {}", self.expr(&a.value), a.attr.as_str(), val),
            Expr::Subscript(s) => {
                let (o, k) = (self.expr(&s.value), self.subscript_key(&s.slice));
                format!("__py.setitem({o}, {k}, {val})")
            }
            Expr::Tuple(_) | Expr::List(_) if self.simple_pattern(target) => format!("{} = {}", self.pattern(target), val),
            Expr::Tuple(t) => self.store_unpack(&t.elts, val),
            Expr::List(t) => self.store_unpack(&t.elts, val),
            _ => self.unsupported(target.range(), "assignment target"),
        }
    }

    /// True when the target maps onto a JS destructuring pattern (no subscript, `*x` only last).
    fn simple_pattern(&self, e: &Expr) -> bool {
        match e {
            Expr::Name(_) | Expr::Attribute(_) => true,
            Expr::Starred(s) => self.simple_pattern(&s.value),
            Expr::Tuple(t) => self.simple_list(&t.elts),
            Expr::List(t) => self.simple_list(&t.elts),
            _ => false,
        }
    }

    fn simple_list(&self, v: &[Expr]) -> bool {
        let n = v.len();
        v.iter().enumerate().all(|(i, e)| (!matches!(e, Expr::Starred(_)) || i + 1 == n) && self.simple_pattern(e))
    }

    /// General unpacking: bind a temporary array, then `store()` each element (subscripts, mid `*x`).
    fn store_unpack(&mut self, elts: &[Expr], val: &str) -> String {
        let t = self.fresh("u");
        let n = elts.len();
        let star = elts.iter().position(|e| matches!(e, Expr::Starred(_)));
        let mut parts = vec![format!("const {t} = [...__py.iter({val})];")];
        for (i, e) in elts.iter().enumerate() {
            let (inner, v) = match (star, e) {
                (Some(s), Expr::Starred(st)) if s == i => (&*st.value, format!("{t}.slice({i}, {t}.length - {})", n - i - 1)),
                (Some(s), _) if i > s => (e, format!("{t}[{t}.length - {}]", n - i)),
                _ => (e, format!("{t}[{i}]")),
            };
            let st = self.store(inner, &v);
            parts.push(format!("{st};"));
        }
        format!("{{ {} }}", parts.join(" "))
    }

    fn target_name(&mut self, n: &str) -> String {
        ident(n)
    }

    /// Destructuring pattern (assignment form) for tuple/list/starred/name targets.
    fn pattern(&mut self, e: &Expr) -> String {
        match e {
            Expr::Name(n) => ident(n.id.as_str()),
            Expr::Tuple(t) => format!("[{}]", self.pattern_list(&t.elts)),
            Expr::List(t) => format!("[{}]", self.pattern_list(&t.elts)),
            Expr::Starred(s) => format!("...{}", self.pattern(&s.value)),
            Expr::Attribute(a) => format!("{}.{}", self.expr(&a.value), a.attr.as_str()),
            Expr::Subscript(_) => self.unsupported(e.range(), "subscript inside destructuring target"),
            _ => self.unsupported(e.range(), "destructuring target"),
        }
    }

    fn pattern_list(&mut self, v: &[Expr]) -> String {
        let n = v.len();
        let mut out = vec![];
        for (i, e) in v.iter().enumerate() {
            if matches!(e, Expr::Starred(_)) && i + 1 != n {
                out.push(self.unsupported(e.range(), "starred target not in last position"));
            } else {
                out.push(self.pattern(e));
            }
        }
        out.join(", ")
    }

    fn aug_assign(&mut self, a: &StmtAugAssign) {
        if matches!(a.op, Operator::MatMult) {
            let u = self.unsupported(a.range(), "matrix multiplication");
            self.line(&format!("{u};"));
            return;
        }
        let v = self.expr(&a.value);
        if let Expr::Name(n) = &*a.target {
            let t = ident(n.id.as_str());
            let line = format!("{t} = {};", self.binop_str(a.op, &t, &v, true));
            self.line(&line);
            return;
        }
        if !is_pure(&a.target) {
            self.diag(a.range(), Severity::Warning, "augmented assignment target with side effects is evaluated twice");
        }
        let cur = self.expr(&a.target);
        let newv = self.binop_str(a.op, &cur, &v, true);
        let l = self.store(&a.target, &newv);
        self.line(&format!("{l};"));
    }

    fn for_stmt(&mut self, f: &StmtFor) {
        let flag = if f.orelse.is_empty() { None } else { Some(self.fresh("f")) };
        if let Some(fl) = &flag {
            self.line(&format!("let {fl} = true;"));
        }
        let it = self.expr(&f.iter);
        let (pat, pre) = if self.simple_pattern(&f.target) {
            (self.pattern(&f.target), None)
        } else {
            let t = self.fresh("e");
            let st = self.store(&f.target, &t);
            (format!("const {t}"), Some(st))
        };
        let use_async = self.asyncs && self.no_await == 0;
        let aw = if f.is_async || use_async { " await" } else { "" };
        let iter = if f.is_async {
            it
        } else if use_async {
            format!("__py.aiter({it})")
        } else {
            format!("__py.iter({it})")
        };
        self.line(&format!("for{aw} ({pat} of {iter}) {{"));
        if let Some(st) = pre {
            self.ind += 1;
            self.line(&format!("{st};"));
            self.ind -= 1;
        }
        self.loops.push(flag.clone());
        self.block(&f.body);
        self.loops.pop();
        self.line("}");
        if let Some(fl) = flag {
            self.line(&format!("if ({fl}) {{"));
            self.block(&f.orelse);
            self.line("}");
        }
    }

    fn with_stmt(&mut self, w: &StmtWith) {
        // nested: with a as x, b as y -> nested try/finally
        let mut closers = vec![];
        self.line("{");
        self.ind += 1;
        for item in &w.items {
            let cm = self.fresh("cm");
            let e = self.expr(&item.context_expr);
            let aw = if w.is_async || (self.asyncs && self.no_await == 0) { "await " } else { "" };
            self.line(&format!("const {cm} = {e};"));
            let enter = format!("{aw}__py.ctxEnter({cm})");
            match &item.optional_vars {
                Some(v) => {
                    let l = self.store(v, &enter);
                    self.line(&format!("{l};"));
                }
                None => self.line(&format!("{enter};")),
            }
            self.line("try {");
            self.ind += 1;
            closers.push((cm, aw));
        }
        self.stmts(&w.body);
        for (cm, aw) in closers.into_iter().rev() {
            self.ind -= 1;
            self.line("} finally {");
            self.ind += 1;
            self.line(&format!("{aw}__py.ctxExit({cm});"));
            self.ind -= 1;
            self.line("}");
        }
        self.ind -= 1;
        self.line("}");
    }

    fn try_stmt(&mut self, t: &StmtTry) {
        if t.is_star {
            let m = self.unsupported(t.range(), "except* (exception groups)");
            self.line(&format!("{m};"));
            return;
        }
        let has_fin = !t.finalbody.is_empty();
        if has_fin {
            self.line("try {");
            self.ind += 1;
        }
        if t.handlers.is_empty() {
            self.line("{");
            self.block(&t.body);
            self.block(&t.orelse);
            self.line("}");
        } else {
            let ok = if t.orelse.is_empty() { None } else { Some(self.fresh("ok")) };
            if let Some(o) = &ok {
                self.line(&format!("let {o} = false;"));
            }
            let ev = self.fresh("e");
            self.line("try {");
            self.block(&t.body);
            if let Some(o) = &ok {
                self.ind += 1;
                self.line(&format!("{o} = true;"));
                self.ind -= 1;
            }
            self.line(&format!("}} catch ({ev}) {{"));
            self.ind += 1;
            self.exc_stack.push(ev.clone());
            let mut first = true;
            let mut closed = false;
            for h in &t.handlers {
                let ExceptHandler::ExceptHandler(h) = h;
                let kw = if first { "if" } else { "} else if" };
                // Python 2 `except A, e:` parses as the PEP 758 tuple `A, e`: read it as `except A as e`
                let mut py2name: Option<String> = None;
                let mut ty_expr: Option<&Expr> = h.type_.as_deref();
                if let Some(Expr::Tuple(tp)) = ty_expr {
                    if !tp.parenthesized && tp.elts.len() == 2 {
                        if let Expr::Name(n) = &tp.elts[1] {
                            let id = n.id.as_str();
                            if !self.lookup(id) && !EXCEPTIONS.contains(&id) && !BUILTINS.contains(&id) && !is_flat(id) && !self.java_names.contains(id) {
                                py2name = Some(id.to_string());
                                ty_expr = Some(&tp.elts[0]);
                                self.diag(h.range(), Severity::Warning, "Python 2 `except A, e` read as `except A as e`");
                            }
                        }
                    }
                }
                let hname: Option<String> = h.name.as_ref().map(|n| n.as_str().to_string());
                let bind = |em: &mut Self| {
                    if let Some(n) = &hname {
                        em.line(&format!("{} = {ev};", ident(n)));
                    } else if let Some(n) = &py2name {
                        em.line(&format!("let {} = {ev};", ident(n)));
                    }
                };
                if let Some(n) = &py2name {
                    self.scopes.push(HashSet::from([n.clone()]));
                }
                let scoped = py2name.is_some();
                match ty_expr {
                    Some(ty) => {
                        let tys = self.expr(ty);
                        self.line(&format!("{kw} (__py.catches({ev}, {tys})) {{"));
                        self.ind += 1;
                        bind(self);
                        self.ind -= 1;
                        self.block(&h.body);
                        if scoped {
                            self.scopes.pop();
                        }
                    }
                    None => {
                        self.line(if first { "{" } else { "} else {" });
                        self.ind += 1;
                        bind(self);
                        self.ind -= 1;
                        self.block(&h.body);
                        if scoped {
                            self.scopes.pop();
                        }
                        closed = true;
                        break;
                    }
                }
                first = false;
            }
            if !closed {
                self.line("} else {");
                self.ind += 1;
                self.line(&format!("throw {ev};"));
                self.ind -= 1;
            }
            self.line("}");
            self.exc_stack.pop();
            self.ind -= 1;
            self.line("}");
            if let Some(o) = ok {
                self.line(&format!("if ({o}) {{"));
                self.block(&t.orelse);
                self.line("}");
            }
        }
        if has_fin {
            self.ind -= 1;
            self.line("} finally {");
            self.block(&t.finalbody);
            self.line("}");
        }
    }

    // ---------- functions & classes ----------

    /// Emit a function definition. `method`: Some(kind) when inside a class.
    fn function(&mut self, f: &StmtFunctionDef, as_method: bool, class: Option<&ClassCtx>) -> String {
        let mut c = Collector::default();
        for s in &f.body {
            c.visit_stmt(s);
        }
        let mut names: HashSet<String> = HashSet::new();
        let mut pnames: Vec<String> = vec![];
        let p = &*f.parameters;
        for pd in p.posonlyargs.iter().chain(p.args.iter()).chain(p.kwonlyargs.iter()) {
            pnames.push(pd.parameter.name.as_str().to_string());
        }
        if let Some(v) = &p.vararg {
            pnames.push(v.name.as_str().to_string());
        }
        if let Some(v) = &p.kwarg {
            pnames.push(v.name.as_str().to_string());
        }
        names.extend(pnames.iter().cloned());
        names.extend(c.assigned.iter().cloned());
        names.extend(c.defs.iter().cloned());
        names.extend(c.imported.iter().cloned());

        // decorators
        let mut deco_static = false;
        let mut deco_class = false;
        let mut deco_prop = false;
        let mut deco_setter = false;
        for d in &f.decorator_list {
            match &d.expression {
                Expr::Name(n) if n.id.as_str() == "staticmethod" => deco_static = true,
                Expr::Name(n) if n.id.as_str() == "classmethod" => deco_class = true,
                Expr::Name(n) if n.id.as_str() == "property" => deco_prop = true,
                Expr::Attribute(a) if a.attr.as_str() == "setter" => deco_setter = true,
                _ => self.diag(d.range(), Severity::Error, "unsupported: decorator (function emitted undecorated)"),
            }
        }

        let skip_first = as_method && !deco_static;
        let selfname: Option<String> = if skip_first {
            p.posonlyargs.iter().chain(p.args.iter()).next().map(|x| x.parameter.name.as_str().to_string())
        } else {
            None
        };

        let has_kw = p.kwarg.is_some() || !p.kwonlyargs.is_empty();
        let mut prologue: Vec<String> = vec![];
        let mut sig_params = String::new();
        let positional: Vec<&ParameterWithDefault> =
            p.posonlyargs.iter().chain(p.args.iter()).skip(if skip_first { 1 } else { 0 }).collect();
        // defaults are evaluated in the enclosing scope (`def f(x=x)` must not hit the param TDZ)
        let mut default_js: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        for pd in positional.iter().copied().chain(p.kwonlyargs.iter()) {
            if let Some(d) = &pd.default {
                let js = self.expr(d);
                default_js.insert(pd.parameter.name.as_str().to_string(), js);
            }
        }
        if !as_method {
            // a default naming any parameter would read the parameter (TDZ): hoist it into a const first
            let pn = pnames.clone();
            let keys: Vec<String> = default_js.keys().cloned().collect();
            for k in keys {
                if pn.iter().any(|q| mentions_ident(&default_js[&k], &ident(q))) {
                    let t = self.fresh("d");
                    let js = default_js[&k].clone();
                    self.line(&format!("const {t} = {js};"));
                    default_js.insert(k, t);
                }
            }
        }
        // the signature body must be emitted with the new scope active
        let mut sc = names.clone();
        sc.remove(selfname.as_deref().unwrap_or("\0"));
        if let Some(sn) = &selfname {
            sc.insert(sn.clone());
        }
        self.scopes.push(sc);
        let saved_loops = std::mem::take(&mut self.loops);
        let saved_exc = std::mem::take(&mut self.exc_stack);

        if has_kw {
            sig_params.push_str("...__a");
            let kwname = "__kw";
            prologue.push(format!("const {kwname} = __py.popkw(__a);"));
            if !positional.is_empty() || p.vararg.is_some() {
                let mut pats: Vec<String> = vec![];
                for pd in &positional {
                    let n = ident(pd.parameter.name.as_str());
                    match default_js.get(pd.parameter.name.as_str()) {
                        Some(d) => pats.push(format!("{n} = {d}")),
                        None => pats.push(n),
                    }
                }
                if let Some(v) = &p.vararg {
                    pats.push(format!("...{}", ident(v.name.as_str())));
                }
                prologue.push(format!("let [{}] = __a;", pats.join(", ")));
            }
            let mut kwpats: Vec<String> = vec![];
            for pd in &p.kwonlyargs {
                let n = ident(pd.parameter.name.as_str());
                match default_js.get(pd.parameter.name.as_str()) {
                    Some(d) => kwpats.push(format!("{n} = {d}")),
                    None => kwpats.push(n),
                }
            }
            if let Some(k) = &p.kwarg {
                kwpats.push(format!("...{}", ident(k.name.as_str())));
            }
            prologue.push(format!("let {{ {} }} = {kwname};", kwpats.join(", ")));
        } else {
            let mut ps: Vec<String> = vec![];
            for pd in &positional {
                let n = ident(pd.parameter.name.as_str());
                match default_js.get(pd.parameter.name.as_str()) {
                    Some(d) => ps.push(format!("{n} = {d}")),
                    None => ps.push(n),
                }
            }
            if let Some(v) = &p.vararg {
                ps.push(format!("...{}", ident(v.name.as_str())));
            }
            sig_params = ps.join(", ");
        }

        // hoisted locals
        let mut lets: BTreeSet<String> = c.assigned.clone();
        for n in c.globals.iter().chain(c.nonlocals.iter()).chain(c.defs.iter()).chain(c.imported.iter()) {
            lets.remove(n);
        }
        for n in &pnames {
            lets.remove(n);
        }
        if let Some(sn) = &selfname {
            lets.remove(sn);
        }

        let saved_out = std::mem::take(&mut self.out);
        let saved_ind = self.ind;
        self.ind = 1;
        let derived = class.map(|c| c.derived).unwrap_or(false);
        let is_ctor = as_method && f.name.as_str() == "__init__";
        // JS constructors, accessors and toString cannot be async: calls inside are not awaited
        let sync_forced = as_method && (is_ctor || deco_prop || deco_setter || matches!(f.name.as_str(), "__str__" | "__repr__"));
        let saved_no_await = self.no_await;
        self.no_await = if sync_forced { 1 } else { 0 };
        let decl = if c.assigned.contains(selfname.as_deref().unwrap_or("\0")) { "let" } else { "const" };
        let alias = |sn: &str| format!("{decl} {} = this;", ident(sn));
        let mut self_alias_done = false;
        if let Some(sn) = &selfname {
            if !(is_ctor && derived) {
                self.line(&alias(sn));
                self_alias_done = true;
            }
        }
        for pl in &prologue {
            self.line(pl);
        }
        if !lets.is_empty() {
            let v: Vec<String> = lets.iter().map(|n| ident(n)).collect();
            self.line(&format!("let {};", v.join(", ")));
        }
        let body: &[Stmt] = &f.body;
        let mut start = 0;
        if is_ctor && derived {
            // derived constructors: translate leading super().__init__(..) / Base.__init__(self, ..)
            let mut handled = false;
            for (i, s) in body.iter().enumerate() {
                if let Stmt::Expr(e) = s {
                    if let Expr::Call(call) = &*e.value {
                        if let Some(args) = self.super_init_args(call, selfname.as_deref()) {
                            // statements before super(..) that never touch `self` stay before it (JS requires super first for `this`)
                            let touches = |st: &Stmt, src: &str| {
                                selfname.as_deref().map_or(false, |sn| {
                                    let r = st.range();
                                    mentions_ident(&src[r.start().to_usize()..r.end().to_usize()], sn)
                                })
                            };
                            let src = self.src;
                            for (j, s2) in body.iter().enumerate() {
                                if j < i && !touches(s2, src) {
                                    self.stmt(s2);
                                }
                            }
                            self.line(&format!("super({args});"));
                            if let Some(sn) = &selfname {
                                self.line(&alias(sn));
                            }
                            self_alias_done = true;
                            for (j, s2) in body.iter().enumerate() {
                                if j < i && touches(s2, src) {
                                    self.stmt(s2);
                                }
                            }
                            start = i + 1;
                            handled = true;
                            break;
                        }
                    }
                }
            }
            if !handled {
                self.line("super();");
                if let Some(sn) = &selfname {
                    self.line(&alias(sn));
                }
                self_alias_done = true;
            }
        }
        let _ = self_alias_done;
        if let Some(Stmt::Expr(e)) = body.first() {
            if matches!(&*e.value, Expr::StringLiteral(_)) && start == 0 {
                start = 1;
            }
        }
        for s in body.iter().skip(start) {
            self.stmt(s);
        }
        let inner = std::mem::replace(&mut self.out, saved_out);
        self.ind = saved_ind;
        self.loops = saved_loops;
        self.exc_stack = saved_exc;
        self.no_await = saved_no_await;
        self.scopes.pop();

        let is_gen = c.has_yield;
        if sync_forced && (f.is_async || is_gen) {
            self.diag(f.range(), Severity::Error, "unsupported: async or generator constructor/accessor/__str__ (JS cannot express it)");
        }
        let asy = if !sync_forced && (f.is_async || self.asyncs) { "async " } else { "" };
        let star = if is_gen && !sync_forced { "*" } else { "" };
        let name = f.name.as_str();
        let (pre, mname) = if as_method {
            let n = match name {
                "__init__" => "constructor".to_string(),
                "__str__" => "toString".to_string(),
                "__repr__" if !self.class_has_str => "toString".to_string(),
                n => n.to_string(),
            };
            let st = if deco_static || deco_class { "static " } else { "" };
            let acc = if deco_prop { "get " } else if deco_setter { "set " } else { "" };
            (format!("{st}{asy}{acc}{star}"), n)
        } else {
            (format!("{asy}function{star} "), ident(name))
        };
        let mut s = format!("{pre}{mname}({sig_params}) {{\n");
        s.push_str(&inner);
        s.push('}');
        s
    }

    fn super_init_args(&mut self, call: &ExprCall, selfname: Option<&str>) -> Option<String> {
        match &*call.func {
            Expr::Attribute(a) if a.attr.as_str() == "__init__" => match &*a.value {
                Expr::Call(sc) if matches!(&*sc.func, Expr::Name(n) if n.id.as_str() == "super") => {
                    Some(self.args_list(&call.arguments.args, &call.arguments.keywords))
                }
                Expr::Name(_) => {
                    // Base.__init__(self, ...)
                    let first_is_self = matches!(call.arguments.args.first(), Some(Expr::Name(n)) if Some(n.id.as_str()) == selfname);
                    if first_is_self {
                        let rest: Vec<Expr> = call.arguments.args.iter().skip(1).cloned().collect();
                        Some(self.args_list(&rest, &call.arguments.keywords))
                    } else {
                        None
                    }
                }
                _ => None,
            },
            _ => None,
        }
    }

    fn args_list(&mut self, args: &[Expr], kws: &[Keyword]) -> String {
        let mut v: Vec<String> = args.iter().map(|a| self.call_arg(a)).collect();
        if !kws.is_empty() {
            v.push(self.kw_object(kws));
        }
        v.join(", ")
    }

    fn call_arg(&mut self, a: &Expr) -> String {
        match a {
            Expr::Starred(s) => format!("...__py.iter({})", self.expr(&s.value)),
            _ => self.expr(a),
        }
    }

    fn kw_object(&mut self, kws: &[Keyword]) -> String {
        let mut parts = vec![];
        for k in kws {
            let v = self.expr(&k.value);
            match &k.arg {
                Some(n) => parts.push(format!("{}: {}", js_str(n.as_str()), v)),
                None => parts.push(format!("...__py.mapObject({v})")),
            }
        }
        format!("__py.kw({{ {} }})", parts.join(", "))
    }

    fn class(&mut self, c: &StmtClassDef) {
        for d in &c.decorator_list {
            self.diag(d.range(), Severity::Error, "unsupported: class decorator (class emitted undecorated)");
        }
        let mut ext = String::new();
        let mut derived = false;
        if let Some(a) = &c.arguments {
            let mut bases = vec![];
            for b in &a.args {
                if matches!(b, Expr::Name(n) if n.id.as_str() == "object") {
                    continue;
                }
                bases.push(self.expr(b));
            }
            if !a.keywords.is_empty() {
                self.diag(c.range(), Severity::Error, "unsupported: class keywords (metaclass)");
            }
            if bases.len() > 1 {
                self.diag(c.range(), Severity::Error, "unsupported: multiple inheritance (only the first base is used)");
            }
            if let Some(b) = bases.first() {
                ext = format!(" extends {b}");
                derived = true;
            }
        }
        let name = ident(c.name.as_str());
        self.line(&format!("class {name}{ext} {{"));
        self.ind += 1;
        self.class_stack.push(ClassCtx { derived });
        self.scopes.push(HashSet::new());
        let saved_attr = self.class_attr.replace((name.clone(), HashSet::new(), self.scopes.len()));
        let saved_has_str = std::mem::replace(
            &mut self.class_has_str,
            c.body.iter().any(|b| matches!(b, Stmt::FunctionDef(f) if f.name.as_str() == "__str__")),
        );
        for s in &c.body {
            match s {
                Stmt::FunctionDef(f) => {
                    let ctx = ClassCtx { derived };
                    let t = self.function(f, true, Some(&ctx));
                    self.line_multi(&t);
                }
                Stmt::Pass(_) => {}
                Stmt::Expr(e) if matches!(&*e.value, Expr::StringLiteral(_)) => {}
                Stmt::Assign(a) if a.targets.len() == 1 && matches!(&a.targets[0], Expr::Name(_)) => {
                    let n = if let Expr::Name(n) = &a.targets[0] { n.id.as_str().to_string() } else { unreachable!() };
                    let v = self.expr(&a.value);
                    self.diag(a.range(), Severity::Warning, "class attribute emitted as `static` (not visible through instances)");
                    self.line(&format!("static {} = {};", ident(&n), v));
                    if let Some((_, attrs, _)) = &mut self.class_attr {
                        attrs.insert(n);
                    }
                }
                Stmt::AnnAssign(a) if matches!(&*a.target, Expr::Name(_)) => {
                    // `x: int = 1` is a static attribute; a bare annotation emits nothing
                    if let (Expr::Name(n), Some(v)) = (&*a.target, &a.value) {
                        let n = n.id.as_str().to_string();
                        let js = self.expr(v);
                        self.line(&format!("static {} = {};", ident(&n), js));
                        if let Some((_, attrs, _)) = &mut self.class_attr {
                            attrs.insert(n);
                        }
                    }
                }
                other => {
                    let m = self.unsupported(other.range(), "statement in class body");
                    self.line(&format!("static {{ {m}; }}"));
                }
            }
        }
        self.class_attr = saved_attr;
        self.class_has_str = saved_has_str;
        self.scopes.pop();
        self.class_stack.pop();
        self.ind -= 1;
        self.line("}");
    }

    // ---------- expressions ----------

    fn cond(&mut self, e: &Expr) -> String {
        match e {
            Expr::Compare(_) | Expr::BooleanLiteral(_) => self.expr(e),
            Expr::UnaryOp(u) if u.op == UnaryOp::Not => format!("!{}", self.paren_cond(&u.operand)),
            Expr::BoolOp(b) => {
                let op = if b.op == BoolOp::And { " && " } else { " || " };
                let parts: Vec<String> = b.values.iter().map(|v| self.paren_cond(v)).collect();
                format!("({})", parts.join(op))
            }
            Expr::Call(c) => {
                if let Expr::Name(n) = &*c.func {
                    if matches!(n.id.as_str(), "isinstance" | "hasattr" | "callable" | "bool" | "issubclass" | "any" | "all")
                        && !self.lookup(n.id.as_str())
                    {
                        return self.expr(e);
                    }
                }
                format!("__py.truth({})", self.expr(e))
            }
            _ => format!("__py.truth({})", self.expr(e)),
        }
    }

    fn paren_cond(&mut self, e: &Expr) -> String {
        let c = self.cond(e);
        if c.starts_with('(') && c.ends_with(')') || c.starts_with("__py.truth(") || c.starts_with('!') {
            c
        } else {
            format!("({c})")
        }
    }

    fn name_expr(&mut self, id: &str, r: TextRange) -> String {
        if let Some((cn, attrs, depth)) = &self.class_attr {
            if self.scopes.len() == *depth && attrs.contains(id) {
                return format!("{cn}.{}", ident(id)); // class-body name: JS static initializers cannot see sibling statics
            }
        }
        if self.lookup(id) {
            return ident(id);
        }
        match id {
            "__name__" => return "\"__main__\"".into(),
            "__file__" => return "import.meta.path".into(),
            _ => {}
        }
        if BUILTINS.contains(&id) || EXCEPTIONS.contains(&id) {
            return format!("__py.{id}");
        }
        if let Some(n) = GHIDRA_FLAT.iter().find(|n| **n == id && is_flat(id)) {
            self.flat_used.insert(n);
            return ident(id);
        }
        if JAVA_ROOTS.contains(&id) {
            // Jython-style implicit package root (`java.util.ArrayList()` without an import)
            self.imports.push(format!("import {{ {id} }} from \"@aphrody/ghidra/java\";"));
            self.java_names.insert(id.to_string());
            return ident(id);
        }
        if !self.star_pkgs.is_empty() {
            self.star_names.insert(id.to_string());
            return ident(id);
        }
        self.diag(r, Severity::Warning, format!("unresolved name `{id}` (not a builtin, local, import or Ghidra script global)"));
        ident(id)
    }

    fn expr(&mut self, e: &Expr) -> String {
        match e {
            Expr::Name(n) => self.name_expr(n.id.as_str(), n.range()),
            Expr::NoneLiteral(_) => "null".into(),
            Expr::BooleanLiteral(b) => b.value.to_string(),
            Expr::EllipsisLiteral(_) => "__py.Ellipsis".into(),
            Expr::NumberLiteral(n) => match &n.value {
                Number::Int(i) => {
                    let s = i.to_string();
                    if s.len() > 16 || (s.len() == 16 && s.as_str() > "9007199254740991") {
                        format!("{s}n")
                    } else {
                        s
                    }
                }
                Number::Float(f) => {
                    if f.is_infinite() {
                        "Infinity".to_string()
                    } else if f.is_nan() {
                        "NaN".to_string()
                    } else if f.fract() == 0.0 && f.abs() < 1e15 {
                        format!("{f:.1}")
                    } else {
                        format!("{f:?}")
                    }
                }
                Number::Complex { .. } => self.unsupported(n.range(), "complex literal"),
            },
            Expr::StringLiteral(s) => js_str(s.value.to_str()),
            Expr::BytesLiteral(b) => {
                let v: Vec<String> = b.value.bytes().map(|x| x.to_string()).collect();
                format!("__py.bytes([{}])", v.join(","))
            }
            Expr::FString(f) => self.fstring(f),
            Expr::TString(t) => self.unsupported(t.range(), "t-string"),
            Expr::List(l) => format!("[{}]", self.elts(&l.elts)),
            Expr::Tuple(l) => format!("[{}]", self.elts(&l.elts)),
            Expr::Set(l) => format!("new Set([{}])", self.elts(&l.elts)),
            Expr::Dict(d) => {
                let mut parts = vec![];
                for it in &d.items {
                    match &it.key {
                        Some(k) => parts.push(format!("[{}, {}]", self.expr(k), self.expr(&it.value))),
                        None => parts.push(format!("...__py.items({})", self.expr(&it.value))),
                    }
                }
                format!("new Map([{}])", parts.join(", "))
            }
            Expr::BoolOp(b) => {
                let f = if b.op == BoolOp::And { "and" } else { "or" };
                if self.asyncs && self.no_await == 0 {
                    let parts: Vec<String> = b.values.iter().map(|v| format!("async () => {}", self.expr(v))).collect();
                    return format!("(await __py.a_{f}({}))", parts.join(", "));
                }
                let parts: Vec<String> = b.values.iter().map(|v| format!("() => {}", self.expr(v))).collect();
                format!("__py.{f}({})", parts.join(", "))
            }
            Expr::Named(n) => {
                let v = self.expr(&n.value);
                let t = self.expr(&n.target);
                format!("({t} = {v})")
            }
            Expr::BinOp(b) if matches!(b.op, Operator::MatMult) => self.unsupported(b.range(), "matrix multiplication"),
            Expr::BinOp(b) => {
                let (l, r) = (self.expr(&b.left), self.expr(&b.right));
                let num = |e: &Expr| matches!(e, Expr::NumberLiteral(_));
                if matches!(b.op, Operator::Add) && num(&b.left) && num(&b.right) {
                    return format!("({l} + {r})");
                }
                if matches!(b.op, Operator::Mod) && self.asyncs && self.no_await == 0 && matches!(&*b.left, Expr::StringLiteral(_)) {
                    return format!("(await __py.a_mod({l}, {r}))");
                }
                self.binop_str(b.op, &l, &r, false)
            }
            Expr::UnaryOp(u) => {
                if u.op == UnaryOp::Not {
                    return format!("!{}", self.paren_cond(&u.operand));
                }
                let o = self.expr(&u.operand);
                match u.op {
                    UnaryOp::Not => unreachable!(),
                    UnaryOp::USub => format!("(-{o})"),
                    UnaryOp::UAdd => format!("(+{o})"),
                    UnaryOp::Invert => format!("__py.inv({o})"),
                }
            }
            Expr::Lambda(l) => {
                let mut names = HashSet::new();
                let mut ps = vec![];
                let mut outer: Vec<(String, String)> = vec![];
                if let Some(p) = &l.parameters {
                    for pd in p.posonlyargs.iter().chain(p.args.iter()).chain(p.kwonlyargs.iter()) {
                        names.insert(pd.parameter.name.as_str().to_string());
                    }
                    // defaults use the enclosing scope (`lambda x=x: x`)
                    let mut defs: Vec<Option<String>> =
                        p.posonlyargs.iter().chain(p.args.iter()).map(|pd| pd.default.as_ref().map(|d| self.expr(d))).collect();
                    for d in defs.iter_mut().flatten() {
                        if names.iter().any(|q| mentions_ident(d, &ident(q))) {
                            let t = self.fresh("d");
                            outer.push((t.clone(), std::mem::replace(d, t)));
                        }
                    }
                    self.scopes.push(names);
                    for (pd, d) in p.posonlyargs.iter().chain(p.args.iter()).zip(defs) {
                        let n = ident(pd.parameter.name.as_str());
                        match d {
                            Some(d) => ps.push(format!("{n} = {d}")),
                            None => ps.push(n),
                        }
                    }
                    if let Some(v) = &p.vararg {
                        ps.push(format!("...{}", ident(v.name.as_str())));
                    }
                    if !p.kwonlyargs.is_empty() || p.kwarg.is_some() {
                        self.diag(l.range(), Severity::Error, "unsupported: keyword-only/**kwargs parameters in lambda");
                    }
                } else {
                    self.scopes.push(names);
                }
                self.no_await += 1; // lambdas stay synchronous
                let b = self.expr(&l.body);
                self.no_await -= 1;
                self.scopes.pop();
                let lam = format!("(({}) => {})", ps.join(", "), if b.starts_with('{') { format!("({b})") } else { b });
                if outer.is_empty() {
                    lam
                } else {
                    let (ts, vs): (Vec<String>, Vec<String>) = outer.into_iter().unzip();
                    format!("(({}) => {lam})({})", ts.join(", "), vs.join(", "))
                }
            }
            Expr::If(i) => {
                let (c, a, b) = (self.cond(&i.test), self.expr(&i.body), self.expr(&i.orelse));
                format!("({c} ? {a} : {b})")
            }
            Expr::ListComp(c) => self.comp(&c.generators, &CompOut::List(&c.elt)),
            Expr::SetComp(c) => self.comp(&c.generators, &CompOut::Set(&c.elt)),
            Expr::Generator(c) => {
                self.diag(c.range(), Severity::Warning, "generator expression evaluated eagerly as a list");
                self.comp(&c.generators, &CompOut::List(&c.elt))
            }
            Expr::DictComp(c) => match &c.key {
                Some(k) => self.comp(&c.generators, &CompOut::Dict(k, &c.value)),
                None => self.unsupported(c.range(), "dict comprehension with ** unpacking"),
            },
            Expr::Await(a) => format!("(await {})", self.expr(&a.value)),
            Expr::Yield(y) => match &y.value {
                Some(v) => format!("(yield {})", self.expr(v)),
                None => "(yield)".into(),
            },
            Expr::YieldFrom(y) => format!("(yield* {})", self.expr(&y.value)),
            Expr::Compare(c) => self.compare(c),
            Expr::Call(c) => self.call(c),
            Expr::Attribute(a) => {
                let o = self.expr(&a.value);
                let n = a.attr.as_str();
                let from_pyghidra = matches!(&*a.value, Expr::Name(x) if self.pyghidra_names.contains(x.id.as_str()));
                if from_pyghidra {
                    format!("{}.{}", o, camel(n))
                } else {
                    format!("{}.{}", o, n)
                }
            }
            Expr::Subscript(s) => {
                let (o, k) = (self.expr(&s.value), self.subscript_key(&s.slice));
                format!("__py.getitem({o}, {k})")
            }
            Expr::Starred(s) => format!("...{}", self.expr(&s.value)),
            Expr::Slice(s) => self.slice(s),
            Expr::IpyEscapeCommand(c) => self.unsupported(c.range(), "IPython escape command"),
        }
    }

    fn elts(&mut self, v: &[Expr]) -> String {
        v.iter()
            .map(|e| match e {
                Expr::Starred(s) => format!("...__py.iter({})", self.expr(&s.value)),
                _ => self.expr(e),
            })
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn slice(&mut self, s: &ExprSlice) -> String {
        let f = |em: &mut Self, o: &Option<Box<Expr>>| o.as_ref().map(|e| em.expr(e)).unwrap_or_else(|| "null".into());
        let (a, b, c) = (f(self, &s.lower), f(self, &s.upper), f(self, &s.step));
        format!("__py.slice({a}, {b}, {c})")
    }

    fn subscript_key(&mut self, k: &Expr) -> String {
        match k {
            Expr::Slice(s) => self.slice(s),
            Expr::Tuple(t) if t.elts.iter().any(|e| matches!(e, Expr::Slice(_))) => {
                self.unsupported(k.range(), "multi-dimensional slice")
            }
            _ => self.expr(k),
        }
    }

    fn binop_str(&mut self, op: Operator, l: &str, r: &str, _aug: bool) -> String {
        match op {
            Operator::Add if _aug => format!("__py.iadd({l}, {r})"),
            Operator::Add => format!("__py.add({l}, {r})"),
            Operator::Sub => format!("({l} - {r})"),
            Operator::Mult => format!("__py.mul({l}, {r})"),
            Operator::Div => format!("({l} / {r})"),
            Operator::FloorDiv => format!("__py.floordiv({l}, {r})"),
            Operator::Mod => format!("__py.mod({l}, {r})"),
            Operator::Pow => format!("__py.pow({l}, {r})"),
            Operator::BitAnd => format!("__py.band({l}, {r})"),
            Operator::BitOr => format!("__py.bor({l}, {r})"),
            Operator::BitXor => format!("__py.bxor({l}, {r})"),
            Operator::LShift => format!("__py.shl({l}, {r})"),
            Operator::RShift => format!("__py.shr({l}, {r})"),
            Operator::MatMult => "__py.unsupported(\"matrix multiplication\")".into(),
        }
    }

    fn compare(&mut self, c: &ExprCompare) -> String {
        if c.ops.len() == 1 {
            return self.cmp1(c.ops[0], &c.operands[0], &c.operands[1]);
        }
        // chained: each operand evaluated once, later operands only when the previous comparison held
        let n = c.operands.len();
        let tmps: Vec<String> = (0..n).map(|_| self.fresh("c")).collect();
        let vals: Vec<String> = c.operands.iter().map(|e| self.expr(e)).collect();
        self.no_await += 1; // the comparison runs inside plain arrow functions
        let cmps: Vec<String> = c.ops.iter().enumerate().map(|(i, op)| self.cmp_strs(*op, &tmps[i], &tmps[i + 1], None, None)).collect();
        self.no_await -= 1;
        let mut inner = String::new();
        for i in (0..n - 1).rev() {
            inner = if i == n - 2 {
                cmps[i].clone()
            } else {
                format!("{} && {}", cmps[i], inner)
            };
            inner = format!("(({}) => {})({})", tmps[i + 1], inner, vals[i + 1]);
        }
        format!("(({}) => {})({})", tmps[0], inner, vals[0])
    }

    fn cmp1(&mut self, op: CmpOp, l: &Expr, r: &Expr) -> String {
        let (ls, rs) = (self.expr(l), self.expr(r));
        self.cmp_strs(op, &ls, &rs, Some(l), Some(r))
    }

    fn cmp_strs(&mut self, op: CmpOp, l: &str, r: &str, le: Option<&Expr>, re: Option<&Expr>) -> String {
        let none = |e: Option<&Expr>| matches!(e, Some(Expr::NoneLiteral(_)));
        let konst = |e: Option<&Expr>| e.map_or(false, |e| is_const(e) && !matches!(e, Expr::NoneLiteral(_)));
        match op {
            CmpOp::Is | CmpOp::Eq if none(re) => format!("({l} == null)"),
            CmpOp::IsNot | CmpOp::NotEq if none(re) => format!("({l} != null)"),
            CmpOp::Is => format!("({l} === {r})"),
            CmpOp::IsNot => format!("({l} !== {r})"),
            CmpOp::Eq if konst(le) || konst(re) => format!("({l} === {r})"),
            CmpOp::NotEq if konst(le) || konst(re) => format!("({l} !== {r})"),
            CmpOp::Eq if self.asyncs && self.no_await == 0 => format!("(await __py.a_eq({l}, {r}))"),
            CmpOp::NotEq if self.asyncs && self.no_await == 0 => format!("!(await __py.a_eq({l}, {r}))"),
            CmpOp::Eq => format!("__py.eq({l}, {r})"),
            CmpOp::NotEq => format!("!__py.eq({l}, {r})"),
            CmpOp::Lt => format!("({l} < {r})"),
            CmpOp::LtE => format!("({l} <= {r})"),
            CmpOp::Gt => format!("({l} > {r})"),
            CmpOp::GtE => format!("({l} >= {r})"),
            CmpOp::In => format!("__py.contains({r}, {l})"),
            CmpOp::NotIn => format!("!__py.contains({r}, {l})"),
        }
    }

    fn comp(&mut self, gens: &[Comprehension], out: &CompOut) -> String {
        let mut names = HashSet::new();
        for g in gens {
            let mut c = Collector::default();
            c.visit_expr(&g.target);
            // visit_expr only records Store names
            names.extend(c.assigned.into_iter());
            collect_names(&g.target, &mut names);
        }
        // the first iterable is evaluated in the enclosing scope (`[x for x in x]`, no TDZ)
        let it0 = self.expr(&gens[0].iter);
        self.scopes.push(names);
        let acc = "__r";
        let aw = gens.iter().any(|g| g.is_async) || (self.asyncs && self.no_await == 0);
        let mut s = format!("({}(__i0) => {{ const {acc} = ", if aw { "async " } else { "" });
        s.push_str(match out {
            CompOut::List(_) => "[];",
            CompOut::Set(_) => "new Set();",
            CompOut::Dict(..) => "new Map();",
        });
        let mut close = String::new();
        for (gi, g) in gens.iter().enumerate() {
            let it = if gi == 0 { "__i0".to_string() } else { self.expr(&g.iter) };
            let (pat, pre) = if self.simple_pattern(&g.target) && !matches!(&g.target, Expr::Attribute(_)) && !self.has_attr(&g.target) {
                (self.decl_pattern(&g.target), None)
            } else {
                let t = self.fresh("e");
                let st = self.store(&g.target, &t);
                (t, Some(st))
            };
            if g.is_async {
                s.push_str(&format!(" for await (const {pat} of {it}) {{"));
            } else if aw {
                s.push_str(&format!(" for await (const {pat} of __py.aiter({it})) {{"));
            } else {
                s.push_str(&format!(" for (const {pat} of __py.iter({it})) {{"));
            }
            close.push('}');
            if let Some(st) = pre {
                s.push_str(&format!(" {st};"));
            }
            for cnd in &g.ifs {
                let c = self.cond(cnd);
                s.push_str(&format!(" if ({c}) {{"));
                close.push('}');
            }
        }
        match out {
            CompOut::List(e) => {
                let v = self.expr(e);
                s.push_str(&format!(" {acc}.push({v});"));
            }
            CompOut::Set(e) => {
                let v = self.expr(e);
                s.push_str(&format!(" {acc}.add({v});"));
            }
            CompOut::Dict(k, v) => {
                let (k, v) = (self.expr(k), self.expr(v));
                s.push_str(&format!(" {acc}.set({k}, {v});"));
            }
        }
        s.push_str(&close);
        s.push_str(&format!(" return {acc}; }})({it0})"));
        self.scopes.pop();
        if aw {
            format!("(await {s})")
        } else {
            s
        }
    }

    fn has_attr(&self, e: &Expr) -> bool {
        match e {
            Expr::Attribute(_) => true,
            Expr::Starred(s) => self.has_attr(&s.value),
            Expr::Tuple(t) => t.elts.iter().any(|x| self.has_attr(x)),
            Expr::List(t) => t.elts.iter().any(|x| self.has_attr(x)),
            _ => false,
        }
    }

    /// Declaration-style pattern (inside `for (const <pat> of ...)`).
    fn decl_pattern(&mut self, e: &Expr) -> String {
        self.pattern(e)
    }

    fn fstring(&mut self, f: &ExprFString) -> String {
        let mut body = String::new();
        for part in f.value.iter() {
            match part {
                FStringPartRef::Literal(l) => body.push_str(&tpl_escape(&l.value)),
                FStringPartRef::FString(fs) => body.push_str(&self.interp_elements(fs.elements.iter())),
            }
        }
        format!("`{body}`")
    }

    fn interp_elements<'a>(&mut self, it: impl Iterator<Item = &'a InterpolatedStringElement>) -> String {
        let mut body = String::new();
        for el in it {
            match el {
                InterpolatedStringElement::Literal(l) => body.push_str(&tpl_escape(&l.value)),
                InterpolatedStringElement::Interpolation(i) => {
                    let mut v = self.expr(&i.expression);
                    let mut dbg_default_repr = false;
                    if i.debug_text.is_some() {
                        let (rs, re) = (i.range().start().to_usize(), i.range().end().to_usize());
                        let (es, ee) = (i.expression.range().start().to_usize(), i.expression.range().end().to_usize());
                        let tail = &self.src[ee..re];
                        let eq = tail.find('=').map(|p| p + 1).unwrap_or(0);
                        let after: String = tail[eq..].chars().take_while(|c| c.is_whitespace()).collect();
                        let text = format!("{}{}{}{}", &self.src[rs + 1..es], &self.src[es..ee], &tail[..eq], after);
                        body.push_str(&tpl_escape(&text));
                        dbg_default_repr = i.format_spec.is_none() && matches!(i.conversion, ConversionFlag::None);
                    }
                    match i.conversion {
                        ConversionFlag::Repr | ConversionFlag::Ascii => v = format!("__py.repr({v})"),
                        _ => {
                            if dbg_default_repr {
                                v = format!("__py.repr({v})")
                            }
                        }
                    }
                    let s = match &i.format_spec {
                        Some(spec) => {
                            let sp = self.interp_elements(spec.elements.iter());
                            format!("__py.format({v}, `{sp}`)")
                        }
                        None if self.asyncs && self.no_await == 0 => format!("await __py.a_str({v})"),
                        None => format!("__py.str({v})"),
                    };
                    body.push_str(&format!("${{{s}}}"));
                }
            }
        }
        body
    }

    /// 0 = plain call, 1 = JS class (`new X()`), 2 = Java class (`X.new_()` through the proxy).
    fn new_kind(&self, f: &Expr) -> u8 {
        match f {
            Expr::Name(n) => {
                let id = n.id.as_str();
                if (self.user_classes.contains(id) && self.lookup(id)) || (EXCEPTIONS.contains(&id) && !self.lookup(id)) {
                    1
                } else if self.is_class_name(id) {
                    2
                } else {
                    0
                }
            }
            Expr::Attribute(a) => {
                let last = a.attr.as_str();
                let upper = last.chars().next().map_or(false, |c| c.is_uppercase())
                    && last.chars().any(|c| c.is_lowercase());
                if !upper {
                    return 0;
                }
                let mut cur: &Expr = &a.value;
                loop {
                    match cur {
                        Expr::Attribute(x) => cur = &x.value,
                        Expr::Name(n) => {
                            let r = n.id.as_str();
                            return if self.java_names.contains(r) || (JAVA_ROOTS.contains(&r) && !self.lookup(r)) { 2 } else { 0 };
                        }
                        _ => return 0,
                    }
                }
            }
            _ => 0,
        }
    }

    fn is_new_callee(&self, f: &Expr) -> bool {
        self.new_kind(f) != 0
    }

    fn call(&mut self, c: &ExprCall) -> String {
        let (s, awaitable) = self.call_inner(c);
        if !(awaitable && self.asyncs) {
            return s;
        }
        if self.no_await > 0 {
            self.diag(c.range(), Severity::Warning, "call not awaited: JS constructors, accessors, toString and lambdas cannot await");
            return s;
        }
        format!("(await {s})")
    }

    fn call_inner(&mut self, c: &ExprCall) -> (String, bool) {
        let args = &c.arguments.args;
        let kws = &c.arguments.keywords;
        // super().method(...)
        if let Expr::Attribute(a) = &*c.func {
            if let Expr::Call(sc) = &*a.value {
                if matches!(&*sc.func, Expr::Name(n) if n.id.as_str() == "super") && !self.lookup("super") {
                    let m = a.attr.as_str();
                    if m == "__init__" {
                        self.diag(c.range(), Severity::Error, "unsupported: super().__init__ outside the first statements of a derived constructor");
                        return ("__py.unsupported(\"super().__init__ placement\")".into(), false);
                    }
                    let al = self.args_list(args, kws);
                    let m = match m {
                        "__str__" => "toString",
                        "__repr__" if !self.class_has_str => "toString",
                        m => m,
                    };
                    return (format!("super.{m}({al})"), true);
                }
            }
        }
        // method rewrite
        if let Expr::Attribute(a) = &*c.func {
            let m = a.attr.as_str();
            if METHODS.contains(&m) && !self.is_new_callee(&c.func) {
                // 1-arg dict.get / no-arg forms behave natively; the runtime dispatches by receiver type
                let recv = self.expr(&a.value);
                let al = self.args_list(args, kws);
                return (
                    if al.is_empty() { format!("__py.m.{m}({recv})") } else { format!("__py.m.{m}({recv}, {al})") },
                    true,
                );
            }
        }
        let nk = self.new_kind(&c.func);
        let newk = if nk == 1 { "new " } else { "" };
        // user function with keywords: map to positional
        if let Expr::Name(n) = &*c.func {
            let nm = n.id.as_str();
            // only a module-level function that no inner scope shadows, no `*args`, no overflow, no duplicate slots
            let module_level = self.scopes.first().map_or(false, |s| s.contains(nm)) && !self.scopes.iter().skip(1).any(|s| s.contains(nm));
            let no_star = !args.iter().any(|a| matches!(a, Expr::Starred(_)));
            if !kws.is_empty() && module_level && no_star {
                if let Some(sig) = self.user_funcs.get(nm).cloned() {
                    let dup = kws.iter().any(|k| k.arg.as_ref().map_or(false, |a| sig.params.iter().position(|p| p == a.as_str()).map_or(false, |ix| ix < args.len())));
                    if args.len() <= sig.params.len() && !dup && !sig.has_kw && !sig.has_vararg && kws.iter().all(|k| k.arg.as_ref().map_or(false, |a| sig.params.iter().any(|p| p == a.as_str()))) {
                        let mut slots: Vec<Option<String>> = vec![None; sig.params.len()];
                        for (i, a) in args.iter().enumerate() {
                            if i < slots.len() {
                                slots[i] = Some(self.call_arg(a));
                            }
                        }
                        for k in kws {
                            let idx = sig.params.iter().position(|p| p == k.arg.as_ref().unwrap().as_str()).unwrap();
                            slots[idx] = Some(self.expr(&k.value));
                        }
                        while matches!(slots.last(), Some(None)) {
                            slots.pop();
                        }
                        let v: Vec<String> = slots.into_iter().map(|s| s.unwrap_or_else(|| "undefined".into())).collect();
                        return (format!("{}({})", ident(nm), v.join(", ")), true);
                    }
                }
            }
        }
        let f = match &*c.func {
            Expr::Name(_) | Expr::Attribute(_) => self.expr(&c.func),
            other => format!("({})", self.expr(other)),
        };
        if !kws.is_empty() {
            let user_kw = matches!(&*c.func, Expr::Name(n) if self.lookup(n.id.as_str()) && self.user_funcs.get(n.id.as_str()).map_or(false, |s| s.has_kw));
            let builtin = matches!(&*c.func, Expr::Name(n) if !self.lookup(n.id.as_str()) && (BUILTINS.contains(&n.id.as_str()) || EXCEPTIONS.contains(&n.id.as_str())));
            let ghidra = matches!(&*c.func, Expr::Name(n) if !self.lookup(n.id.as_str()) && is_flat(n.id.as_str()));
            if !(user_kw || builtin || ghidra) {
                self.diag(c.range(), Severity::Warning, "keyword arguments to an unresolved callee are passed as a trailing __py.kw({...}) object");
            }
        }
        let al = self.args_list(args, kws);
        if nk == 2 {
            return (format!("{f}.new_({al})"), true);
        }
        if nk == 1 {
            return (format!("new {f}({al})"), false);
        }
        // builtins: sync, except those that read Java iterables/objects (async-aware variants)
        if let Expr::Name(n) = &*c.func {
            let id = n.id.as_str();
            if self.asyncs && self.no_await == 0 && !self.lookup(id) {
                if ASYNC_BUILTINS.contains(&id) {
                    return (format!("__py.a_{id}({al})"), true);
                }
                if ASYNC_GEN_BUILTINS.contains(&id) {
                    return (format!("__py.a_{id}({al})"), false);
                }
            }
            if !self.lookup(id) && (BUILTINS.contains(&id) || EXCEPTIONS.contains(&id)) {
                return (format!("{f}({al})"), false);
            }
        }
        let _ = newk;
        (format!("{f}({al})"), true)
    }
}

enum CompOut<'a> {
    List(&'a Expr),
    Set(&'a Expr),
    Dict(&'a Expr, &'a Expr),
}

fn collect_names(e: &Expr, out: &mut HashSet<String>) {
    match e {
        Expr::Name(n) => {
            out.insert(n.id.as_str().to_string());
        }
        Expr::Tuple(t) => t.elts.iter().for_each(|x| collect_names(x, out)),
        Expr::List(t) => t.elts.iter().for_each(|x| collect_names(x, out)),
        Expr::Starred(s) => collect_names(&s.value, out),
        _ => {}
    }
}

fn sig_of(p: &Parameters) -> FuncSig {
    FuncSig {
        params: p.posonlyargs.iter().chain(p.args.iter()).map(|x| x.parameter.name.as_str().to_string()).collect(),
        has_kw: p.kwarg.is_some() || !p.kwonlyargs.is_empty(),
        has_vararg: p.vararg.is_some(),
    }
}

fn camel(s: &str) -> String {
    // dunders stay as they are; leading and trailing underscores are kept; only interior `_x` is folded
    if s.starts_with("__") && s.ends_with("__") {
        return s.to_string();
    }
    let lead = s.len() - s.trim_start_matches('_').len();
    let trail = s.len() - s.trim_end_matches('_').len();
    if lead + trail >= s.len() {
        return s.to_string();
    }
    let core = &s[lead..s.len() - trail];
    let mut o = String::with_capacity(s.len());
    o.push_str(&s[..lead]);
    let mut up = false;
    for c in core.chars() {
        if c == '_' {
            up = true;
        } else if up {
            o.extend(c.to_uppercase());
            up = false;
        } else {
            o.push(c);
        }
    }
    if up {
        o.push('_');
    }
    o.push_str(&s[s.len() - trail..]);
    o
}

fn ident_import(n: &str) -> String {
    n.to_string()
}
