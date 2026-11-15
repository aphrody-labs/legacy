use crate::constants::{ALLOWED_ROOT_PHYSICAL_DIRS, is_reparse_point, normalize_rel};
use crate::models::{ArchFinding, Severity};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Rule ARCH-005: Root Topology & Junction Integrity
pub fn check_root_topology(root: &Path, findings: &mut Vec<ArchFinding>) {
    let allowed: BTreeSet<&str> = ALLOWED_ROOT_PHYSICAL_DIRS.iter().copied().collect();
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let p = entry.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if is_reparse_point(&p) {
            // Verify junction target exists and is not dangling
            if fs::metadata(&p).is_err() {
                findings.push(ArchFinding {
                    rule_id: "ARCH-005".into(),
                    category: "root-topology-junctions".into(),
                    severity: Severity::Error,
                    path: normalize_rel(root, &p),
                    line: None,
                    message: format!("Broken/dangling root junction or symlink `{name}`"),
                    remediation: format!(
                        "Remove dangling junction `{name}` or repoint it to an existing target under apps/, packages/, src/, or third_party/."
                    ),
                });
            }
            continue;
        }

        if p.is_dir() && !allowed.contains(name) {
            findings.push(ArchFinding {
                rule_id: "ARCH-005".into(),
                category: "root-topology-junctions".into(),
                severity: Severity::Error,
                path: normalize_rel(root, &p),
                line: None,
                message: format!(
                    "Unapproved physical directory `{name}` at monorepo root (violates canonical hierarchy: apps/, packages/, src/, infra/, tools/, docs/, test/, bench/, scripts/, third_party/)"
                ),
                remediation: format!(
                    "Move `{name}` into its canonical domain (`apps/`, `packages/`, `src/`, `infra/`, `tools/`, `test/`, or `third_party/`) and create a junction if backwards path compatibility is required."
                ),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("archguard-topology-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn allowlist_is_the_bun_layout() {
        for d in ["apps", "assets", "bench", "completions", "docs", "infra", "packages", "scripts", "src", "test", "third_party", "tools"] {
            assert!(ALLOWED_ROOT_PHYSICAL_DIRS.contains(&d), "{d} must be allowed at the root");
        }
        for d in ["conformance", "plugins", "crates"] {
            assert!(!ALLOWED_ROOT_PHYSICAL_DIRS.contains(&d), "{d} no longer lives at the root");
        }
    }

    #[test]
    fn flags_only_unapproved_root_directories() {
        let root = scratch("flags");
        for d in ["src", "test", "bench", "completions", "tools", "conformance", "plugins", "stray"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        let mut findings = Vec::new();
        check_root_topology(&root, &mut findings);
        let mut paths: Vec<_> = findings.iter().map(|f| f.path.clone()).collect();
        paths.sort();
        let _ = fs::remove_dir_all(&root);
        assert_eq!(paths, ["conformance", "plugins", "stray"]);
    }
}
