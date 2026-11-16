//! The data-driven list of sources (`sources.toml`, embedded; replaceable with `--sources <file>`).

use serde::Deserialize;

/// The sources shipped with `ay`.
pub const DEFAULT_SOURCES: &str = include_str!("../sources.toml");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    Local,
    Git,
    Llms,
    Sitemap,
    Skills,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Local => "local",
            Kind::Git => "git",
            Kind::Llms => "llms",
            Kind::Sitemap => "sitemap",
            Kind::Skills => "skills",
        }
    }
}

/// One `[[source]]` table.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub id: String,
    pub kind: Kind,
    /// git: repository; llms: llms-full.txt; sitemap: sitemap.xml.
    pub url: Option<String>,
    /// llms: the llms.txt whose links are counted.
    pub index: Option<String>,
    /// local: checkout root (repo-relative or absolute).
    pub root: Option<String>,
    /// git: an existing checkout used when it holds every path.
    pub local: Option<String>,
    /// git: branch or ref to fetch (default HEAD).
    #[serde(rename = "ref")]
    pub git_ref: Option<String>,
    /// local/git: directories to read; `*` matches one path segment. Empty = the whole checkout.
    #[serde(default)]
    pub paths: Vec<String>,
    /// local/git: file extensions (default md, mdx).
    #[serde(default)]
    pub exts: Vec<String>,
    #[serde(default)]
    pub url_base: Option<String>,
    #[serde(default)]
    pub url_suffix: Option<String>,
    #[serde(default)]
    pub strip_prefix: Option<String>,
    #[serde(default)]
    pub strip_ext: bool,
    /// skills: directory name prefix.
    pub prefix: Option<String>,
    /// sitemap: keep only URLs under one of these prefixes (empty = all).
    #[serde(default)]
    pub include: Vec<String>,
    /// sitemap: drop URLs under one of these prefixes.
    #[serde(default)]
    pub exclude: Vec<String>,
    /// sitemap: parallel page fetches (default 8).
    pub workers: Option<usize>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct File {
    #[serde(default)]
    source: Vec<Source>,
}

/// Parse and validate a sources file.
pub fn parse(text: &str) -> Result<Vec<Source>, String> {
    let file: File = toml::from_str(text).map_err(|e| format!("sources: {e}"))?;
    let mut seen = std::collections::HashSet::new();
    for s in &file.source {
        if s.id.is_empty() || s.id.contains(':') || s.id.starts_with('/') || s.id.ends_with('/') {
            return Err(format!("sources: bad id {:?}", s.id));
        }
        if !seen.insert(s.id.as_str()) {
            return Err(format!("sources: duplicate id {}", s.id));
        }
        let need = |what: &str, ok: bool| if ok { Ok(()) } else { Err(format!("sources: {} ({}) needs {what}", s.id, s.kind.name())) };
        match s.kind {
            Kind::Local => need("root", s.root.is_some())?,
            Kind::Git | Kind::Llms | Kind::Sitemap => need("url", s.url.is_some())?,
            Kind::Skills => {}
        }
    }
    Ok(file.source)
}

/// `selector` names the source itself or a prefix of its id (`android` selects `android/source`).
pub fn selects(id: &str, selector: &str) -> bool {
    id == selector || id.strip_prefix(selector).is_some_and(|rest| rest.starts_with('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_sources_are_valid() {
        let all = parse(DEFAULT_SOURCES).unwrap();
        let ids: Vec<&str> = all.iter().map(|s| s.id.as_str()).collect();
        for want in ["fork", "upstream", "skills", "linux", "chromium", "chromiumos/docs", "chromiumos/site", "android/source", "android/developer"] {
            assert!(ids.contains(&want), "{want} missing from {ids:?}");
        }
        assert_eq!(all.iter().find(|s| s.id == "linux").unwrap().kind, Kind::Git);
    }

    #[test]
    fn selectors() {
        assert!(selects("android/source", "android"));
        assert!(selects("android/source", "android/source"));
        assert!(!selects("androidx", "android"));
        assert!(!selects("linux", "lin"));
    }

    #[test]
    fn rejects_bad_files() {
        assert!(parse("[[source]]\nid = \"a\"\nkind = \"local\"\n").is_err(), "root required");
        assert!(parse("[[source]]\nid = \"a\"\nkind = \"skills\"\n[[source]]\nid = \"a\"\nkind = \"skills\"\n").is_err(), "duplicate id");
        assert!(parse("[[source]]\nid = \"a\"\nkind = \"skills\"\nbogus = 1\n").is_err(), "unknown key");
        assert!(parse("[[source]]\nid = \"a\"\nkind = \"nope\"\n").is_err(), "unknown kind");
    }
}
