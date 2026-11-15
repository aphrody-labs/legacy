//! ARCH-003: the manifests of a package must match the code inside it.
use archguard::{AuditConfig, Severity, run_audit};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Ws(PathBuf);

impl Ws {
    fn new(label: &str) -> Self {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "archguard_manifest_{label}_{}_{id}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        for d in ["crates", "packages", "apps", "infra", "tools", "docs"] {
            fs::create_dir_all(dir.join(d)).unwrap();
        }
        Ws(dir)
    }

    fn write(&self, rel: &str, content: &str) {
        let p = self.0.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    fn arch003(&self) -> Vec<(Severity, String)> {
        let report = run_audit(&AuditConfig {
            root: Path::new(&self.0).to_path_buf(),
            strict: false,
            only_rule: Some("ARCH-003".into()),
            check_docs_emojis: false,
        });
        report
            .findings
            .into_iter()
            .map(|f| (f.severity, f.message))
            .collect()
    }
}

impl Drop for Ws {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

const PKG_JSON: &str = "{\"name\": \"@aphrody/x\", \"version\": \"1.0.0\"}\n";

#[test]
fn python_code_needs_pyproject() {
    let ws = Ws::new("py_missing");
    ws.write("packages/ml/src/train.py", "print(1)\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert_eq!(f[0].0, Severity::Error);
    assert!(f[0].1.contains("Python") && f[0].1.contains("pyproject.toml"));
}

#[test]
fn python_package_with_pyproject_is_clean() {
    let ws = Ws::new("py_ok");
    ws.write("packages/ml/pyproject.toml", "[project]\nname = \"ml\"\n");
    ws.write("packages/ml/src/train.py", "print(1)\n");
    assert!(ws.arch003().is_empty());
}

#[test]
fn go_package_with_root_go_mod_is_clean() {
    let ws = Ws::new("go_ok");
    ws.write("packages/deploy/go.mod", "module example/deploy\n\ngo 1.25\n");
    ws.write("packages/deploy/main.go", "package main\n");
    assert!(ws.arch003().is_empty());
}

#[test]
fn go_code_needs_go_mod() {
    let ws = Ws::new("go_missing");
    ws.write("packages/deploy/main.go", "package main\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert!(f[0].1.contains("Go") && f[0].1.contains("go.mod"));
}

#[test]
fn typescript_code_needs_package_json() {
    let ws = Ws::new("ts_missing");
    ws.write("packages/ui/src/index.ts", "export {};\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert!(f[0].1.contains("package.json"));
}

#[test]
fn mixed_package_needs_each_manifest() {
    let ws = Ws::new("mixed");
    ws.write("packages/mix/package.json", PKG_JSON);
    ws.write("packages/mix/src/index.ts", "export {};\n");
    ws.write("packages/mix/py/tool.py", "print(1)\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert!(f[0].1.contains("Python"));
    ws.write("packages/mix/py/pyproject.toml", "[project]\nname = \"mix\"\n");
    assert!(ws.arch003().is_empty());
}

#[test]
fn cmake_or_meson_covers_cpp() {
    let ws = Ws::new("cpp");
    ws.write("packages/native/src/a.cpp", "int main() {}\n");
    assert_eq!(ws.arch003().len(), 1);
    ws.write("packages/native/meson.build", "project('native', 'cpp')\n");
    assert!(ws.arch003().is_empty());
}

#[test]
fn manifest_without_its_code_is_a_warning() {
    let ws = Ws::new("orphan_manifest");
    ws.write("packages/empty/pyproject.toml", "[project]\nname = \"empty\"\n");
    ws.write("packages/empty/README.md", "x\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert_eq!(f[0].0, Severity::Warning);
}

#[test]
fn package_without_any_manifest_or_code_is_an_error() {
    let ws = Ws::new("nothing");
    ws.write("packages/bare/README.md", "x\n");
    let f = ws.arch003();
    assert_eq!(f.len(), 1, "{f:?}");
    assert_eq!(f[0].0, Severity::Error);
}

#[test]
fn node_modules_and_hidden_dirs_are_not_scanned() {
    let ws = Ws::new("skip");
    ws.write("packages/web/package.json", PKG_JSON);
    ws.write("packages/web/index.ts", "export {};\n");
    ws.write("packages/web/node_modules/dep/setup.py", "x\n");
    ws.write("packages/web/.venv/lib/a.py", "x\n");
    assert!(ws.arch003().is_empty());
}
