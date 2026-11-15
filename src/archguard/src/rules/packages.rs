use crate::constants::{is_reparse_point, normalize_rel};
use crate::models::{ArchFinding, Severity};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

const ALLOWED_NATIVE_SUBDIRS: &[&str] = &[
    "crates",
    "native",
    "rust-core",
    "rust-desktop",
    "loaders",
    "zig",
    "python",
];

/// Source languages a package can hold, each tied to the manifests that declare it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Lang {
    TypeScript,
    Python,
    Go,
    Rust,
    Cpp,
}

impl Lang {
    fn name(self) -> &'static str {
        match self {
            Lang::TypeScript => "TypeScript/JavaScript",
            Lang::Python => "Python",
            Lang::Go => "Go",
            Lang::Rust => "Rust",
            Lang::Cpp => "C/C++",
        }
    }

    fn manifests(self) -> &'static [&'static str] {
        match self {
            Lang::TypeScript => &["package.json"],
            Lang::Python => &["pyproject.toml"],
            Lang::Go => &["go.mod"],
            Lang::Rust => &["Cargo.toml"],
            Lang::Cpp => &["CMakeLists.txt", "meson.build"],
        }
    }

    fn of_extension(ext: &str) -> Option<Lang> {
        match ext {
            "ts" | "tsx" | "mts" | "cts" | "js" | "mjs" | "cjs" | "jsx" => Some(Lang::TypeScript),
            "py" => Some(Lang::Python),
            "go" => Some(Lang::Go),
            "rs" => Some(Lang::Rust),
            "c" | "cc" | "cpp" | "cxx" | "h" | "hpp" => Some(Lang::Cpp),
            _ => None,
        }
    }

    fn of_manifest(file: &str) -> Option<Lang> {
        [Lang::TypeScript, Lang::Python, Lang::Go, Lang::Rust, Lang::Cpp]
            .into_iter()
            .find(|l| l.manifests().contains(&file))
    }
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    "__pycache__",
];
const MAX_SCAN_DEPTH: usize = 8;

/// Collects the languages of the code and of the manifests found below `dir`.
fn scan_languages(dir: &Path, depth: usize, code: &mut BTreeSet<Lang>, manifests: &mut BTreeSet<Lang>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if p.is_dir() {
            if depth >= MAX_SCAN_DEPTH
                || fname.starts_with('.')
                || SKIP_DIRS.contains(&fname)
                || is_reparse_point(&p)
            {
                continue;
            }
            scan_languages(&p, depth + 1, code, manifests);
        } else if let Some(l) = Lang::of_manifest(fname) {
            manifests.insert(l);
        } else if let Some(l) = p
            .extension()
            .and_then(|x| x.to_str())
            .and_then(Lang::of_extension)
        {
            code.insert(l);
        }
    }
}

/// ARCH-003 manifest rule: the manifests of a package must match the code inside it.
/// Code of a language needs a manifest of that language (any depth); a Rust, Python, Go or C/C++
/// manifest without code of its language is a warning; a package with neither is an error.
fn manifest_findings(root: &Path, pkg_path: &Path, findings: &mut Vec<ArchFinding>) {
    let name = pkg_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let rel = normalize_rel(root, pkg_path);
    let mut code = BTreeSet::new();
    let mut manifests = BTreeSet::new();
    scan_languages(pkg_path, 0, &mut code, &mut manifests);

    if code.is_empty() && manifests.is_empty() {
        findings.push(ArchFinding {
            rule_id: "ARCH-003".into(),
            category: "package-domain-purity".into(),
            severity: Severity::Error,
            path: rel,
            line: None,
            message: format!("Package `{name}` has no manifest (package.json, pyproject.toml, go.mod, Cargo.toml, CMakeLists.txt or meson.build)"),
            remediation: "Add the manifest of the language the package is written in.".into(),
        });
        return;
    }
    for lang in code.difference(&manifests) {
        findings.push(ArchFinding {
            rule_id: "ARCH-003".into(),
            category: "package-domain-purity".into(),
            severity: Severity::Error,
            path: rel.clone(),
            line: None,
            message: format!(
                "Package `{name}` holds {} code but no {} manifest",
                lang.name(),
                lang.manifests().join(" or ")
            ),
            remediation: format!("Add `{}` to the package.", lang.manifests()[0]),
        });
    }
    for lang in manifests.difference(&code) {
        if *lang == Lang::TypeScript {
            continue; // package.json also carries metadata-only and data packages
        }
        findings.push(ArchFinding {
            rule_id: "ARCH-003".into(),
            category: "package-domain-purity".into(),
            severity: Severity::Warning,
            path: rel.clone(),
            line: None,
            message: format!(
                "Package `{name}` has a {} manifest but no {} code",
                lang.manifests().join(" or "),
                lang.name()
            ),
            remediation: "Remove the manifest or add the code it describes.".into(),
        });
    }
}

/// Rules ARCH-003 & ARCH-016: Audit `packages/*`
pub fn check_packages_domain(root: &Path, findings: &mut Vec<ArchFinding>) {
    let pkgs_dir = root.join("packages");
    let Ok(entries) = fs::read_dir(&pkgs_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let pkg_path = entry.path();
        if !pkg_path.is_dir() || is_reparse_point(&pkg_path) {
            continue;
        }
        let pkg_dir_name = pkg_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if pkg_dir_name.starts_with('.') {
            continue;
        }

        manifest_findings(root, &pkg_path, findings);

        // The npm checks below apply to packages that carry a package.json at their root
        // (the read below fails harmlessly for the others).
        let pkg_json = pkg_path.join("package.json");

        // Parse package.json
        if let Ok(content) = fs::read_to_string(&pkg_json) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                // Scope verification
                if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                    if !name.starts_with("@aphrody/") {
                        findings.push(ArchFinding {
                            rule_id: "ARCH-003".into(),
                            category: "package-domain-purity".into(),
                            severity: Severity::Error,
                            path: normalize_rel(root, &pkg_json),
                            line: None,
                            message: format!(
                                "Package `{name}` lacks required `@aphrody/` monorepo scope prefix"
                            ),
                            remediation: format!(
                                "Rename package to `@aphrody/{name}` in `package.json`."
                            ),
                        });
                    }
                } else {
                    findings.push(ArchFinding {
                        rule_id: "ARCH-003".into(),
                        category: "package-domain-purity".into(),
                        severity: Severity::Error,
                        path: normalize_rel(root, &pkg_json),
                        line: None,
                        message: format!(
                            "Package `{pkg_dir_name}` has missing `name` field in `package.json`"
                        ),
                        remediation: format!(
                            "Declare `\"name\": \"@aphrody/{pkg_dir_name}\"` in `package.json`."
                        ),
                    });
                }

                // Zero-NPM dependency enforcement (Sumner / Page principle)
                for dep_field in ["dependencies", "devDependencies"] {
                    if let Some(deps_map) = val.get(dep_field).and_then(|d| d.as_object()) {
                        for (dep_name, dep_ver) in deps_map {
                            let ver_str = dep_ver.as_str().unwrap_or("");
                            let is_workspace = ver_str.starts_with("workspace:")
                                || dep_name.starts_with("@aphrody/");
                            let is_approved_bun_types = dep_name == "@types/bun";
                            let is_approved_types = dep_name.starts_with("@types/");

                            if !is_workspace && !is_approved_bun_types && !is_approved_types {
                                findings.push(ArchFinding {
                                    rule_id: "ARCH-003".into(),
                                    category: "package-domain-purity".into(),
                                    severity: Severity::Error,
                                    path: normalize_rel(root, &pkg_json),
                                    line: None,
                                    message: format!(
                                        "Forbidden external npm dependency `{dep_name}: {ver_str}` in package `{pkg_dir_name}` (Zero-NPM directive)"
                                    ),
                                    remediation: format!(
                                        "Replace `{dep_name}` with native Bun v1.4.4 APIs (`bun:sqlite`, `Bun.serve`, `Bun.build`) or link to internal `@aphrody/*` workspace packages."
                                    ),
                                });
                            }
                        }
                    }
                }

                // ARCH-016: Bun Upstream Zero-Glue & Speed Hygiene
                if let Some(scripts) = val.get("scripts").and_then(|s| s.as_object()) {
                    for hook in ["postinstall", "preinstall"] {
                        if let Some(script_body) = scripts.get(hook).and_then(|b| b.as_str()) {
                            if script_body.contains("node-gyp")
                                || script_body.contains("npm rebuild")
                            {
                                findings.push(ArchFinding {
                                    rule_id: "ARCH-016".into(),
                                    category: "bun-speed-zero-glue-hygiene".into(),
                                    severity: Severity::Error,
                                    path: normalize_rel(root, &pkg_json),
                                    line: None,
                                    message: format!(
                                        "Forbidden legacy native build hook `{hook}: {script_body}` in package `{pkg_dir_name}`"
                                    ),
                                    remediation: "Compile native extensions via sovereign Rust/Zig toolchains into `native/` or `crates/`, eliminating npm postinstall hooks.".into(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // ARCH-016: Check for forbidden binding.gyp
        let binding_gyp = pkg_path.join("binding.gyp");
        if binding_gyp.is_file() {
            findings.push(ArchFinding {
                rule_id: "ARCH-016".into(),
                category: "bun-speed-zero-glue-hygiene".into(),
                severity: Severity::Error,
                path: normalize_rel(root, &binding_gyp),
                line: None,
                message: format!(
                    "Forbidden node-gyp build descriptor `binding.gyp` in package `{pkg_dir_name}`"
                ),
                remediation: "Use pure Rust FFI or Bun native WASM/C bindings instead of node-gyp."
                    .into(),
            });
        }

        // Forbidden lockfiles inside packages
        for lock in ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"] {
            let p = pkg_path.join(lock);
            if p.is_file() {
                findings.push(ArchFinding {
                    rule_id: "ARCH-003".into(),
                    category: "package-domain-purity".into(),
                    severity: Severity::Error,
                    path: normalize_rel(root, &p),
                    line: None,
                    message: format!("Forbidden legacy lockfile `{lock}` in `{pkg_dir_name}` (Bun v1.4.4 workspace uses root bun.lock)"),
                    remediation: format!("Delete `{}`.", normalize_rel(root, &p)),
                });
            }
        }

        // Forbidden root Cargo.toml directly under packages/* (Rust crates live in src/* or in native/ subdirs)
        let root_cargo = pkg_path.join("Cargo.toml");
        if root_cargo.is_file() {
            findings.push(ArchFinding {
                rule_id: "ARCH-003".into(),
                category: "package-domain-purity".into(),
                severity: Severity::Error,
                path: normalize_rel(root, &root_cargo),
                line: None,
                message: format!(
                    "Root `Cargo.toml` found directly inside package `{pkg_dir_name}`"
                ),
                remediation: format!(
                    "Move `{}` into `native/`, `crates/`, or `rust-core/` within the package.",
                    normalize_rel(root, &root_cargo)
                ),
            });
        }

        // Check for stray root-level .rs files in packages (should be in native subdirs)
        if let Ok(entries) = fs::read_dir(&pkg_path) {
            for e in entries.flatten() {
                let p = e.path();
                let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if p.is_dir() {
                    let ext_rs = p.join("src").join("main.rs");
                    if ext_rs.is_file() && !ALLOWED_NATIVE_SUBDIRS.contains(&fname) {
                        findings.push(ArchFinding {
                            rule_id: "ARCH-003".into(),
                            category: "package-domain-purity".into(),
                            severity: Severity::Error,
                            path: normalize_rel(root, &p),
                            line: None,
                            message: format!("Unapproved native directory `{fname}` in `{pkg_dir_name}` (expected one of: {ALLOWED_NATIVE_SUBDIRS:?})"),
                            remediation: format!("Rename `{fname}` to `native/` or `crates/`."),
                        });
                    }
                } else if p.is_file() {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext == "rs" && fname != "build.rs" {
                        findings.push(ArchFinding {
                            rule_id: "ARCH-003".into(),
                            category: "package-domain-purity".into(),
                            severity: Severity::Error,
                            path: normalize_rel(root, &p),
                            line: None,
                            message: format!("Loose Rust source file `{fname}` at root of package `{pkg_dir_name}`"),
                            remediation: "Isolate native Rust source inside `native/` or `crates/` subfolder.".into(),
                        });
                    }
                }
            }
        }
    }
}
