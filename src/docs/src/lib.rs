//! Documentation inside `ay`: `ay docs sync` imports the sources of `sources.toml` into one SQLite FTS5 index,
//! `ay docs search <query>` searches it (text or `--json` for agents), `ay docs show` prints a page,
//! `ay docs stats` describes the index, `ay docs sources` lists the sources, `ay docs schedule` keeps it fresh.
//!
//! The sources are data (`sources.toml`, embedded; `--sources <file>` or `$AY_DOCS_SOURCES` replaces it), of five kinds:
//! - `local`: the files of a checkout (Bun's docs/ of the fork, with their bun.com URLs);
//! - `git`: a checkout when one exists in the tree (Chromium), else a shallow partial sparse clone kept in the cache
//!   directory, never in the git tree (kernel Documentation/, chromiumos/docs);
//! - `llms`: a `llms-full.txt` split into its pages (bun.com);
//! - `sitemap`: a sitemap.xml and the HTML pages it lists, as text (source.android.com, developer.android.com,
//!   chromium.org/chromium-os). The sitemap's `<lastmod>` (per shard and per page) decides what is fetched again;
//!   batches are committed as they arrive, so an interrupted sync resumes where it stopped;
//! - `skills`: agent skills whose directory starts with a prefix.
//!
//! Sync is incremental: a document is rewritten only when its wyhash (Bun's `bun_wyhash` crate) changes, and documents
//! gone from a source are deleted. `sync` is the command shared by the scheduled task and the upstream watch
//! (`ay bun watch`). Plan: docs/ay/MIGRATION.md.

pub mod html;
pub mod schedule;
pub mod sources;
mod web;

use bun_sort_by_number::SortByNumber;
use bun_wyhash::Wyhash;
use rusqlite::{OptionalExtension, Transaction, params};
/// Re-exported so callers need no direct rusqlite dependency.
pub use rusqlite::Connection;
use serde_json::{Value, json};
pub use sources::{Kind, Source};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// JSON schema tags of the machine outputs.
pub const SYNC_SCHEMA: &str = "ay-docs-sync/1";
pub const SEARCH_SCHEMA: &str = "ay-docs-search/1";
pub const STATS_SCHEMA: &str = "ay-docs-stats/1";

/// Files above this size are not documents.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

/// Where things are.
#[derive(Debug, Clone)]
pub struct Config {
    /// The SQLite index.
    pub db: PathBuf,
    /// Monorepo root (`third_party/`, `.agents/skills`), if known.
    pub repo: Option<PathBuf>,
    /// Home directory (`~/.claude/skills`).
    pub home: Option<PathBuf>,
    /// A sources file replacing the embedded `sources.toml`.
    pub sources_file: Option<PathBuf>,
}

impl Config {
    /// `$AY_DOCS_DB`, else `<repo>/var/index/docs.db`, else `~/.local/share/ay/docs.db`.
    pub fn new(repo: Option<PathBuf>) -> Self {
        let home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .filter(|v| !v.is_empty())
            .map(PathBuf::from);
        let db = std::env::var_os("AY_DOCS_DB")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| repo.as_ref().map(|r| r.join("var").join("index").join("docs.db")))
            .or_else(|| home.as_ref().map(|h| h.join(".local").join("share").join("ay").join("docs.db")))
            .unwrap_or_else(|| PathBuf::from("docs.db"));
        let sources_file = std::env::var_os("AY_DOCS_SOURCES").filter(|v| !v.is_empty()).map(PathBuf::from);
        Self { db, repo, home, sources_file }
    }

    /// The sources: the sources file, else the embedded default.
    pub fn load_sources(&self) -> Result<Vec<Source>, String> {
        match &self.sources_file {
            Some(f) => sources::parse(&std::fs::read_to_string(f).map_err(|e| format!("{}: {e}", f.display()))?),
            None => sources::parse(sources::DEFAULT_SOURCES),
        }
    }

    /// A repo-relative path made absolute (absolute paths stay).
    pub fn resolve(&self, p: &str) -> PathBuf {
        let p = Path::new(p);
        match (&self.repo, p.is_absolute()) {
            (Some(r), false) => r.join(p),
            _ => p.to_path_buf(),
        }
    }

    /// Where git sources are cloned: `$AY_DOCS_CACHE`, else `<repo>/var/cache/docs`, else `~/.local/share/ay/docs-src`.
    pub fn cache_dir(&self) -> PathBuf {
        std::env::var_os("AY_DOCS_CACHE")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| self.repo.as_ref().map(|r| r.join("var").join("cache").join("docs")))
            .or_else(|| self.home.as_ref().map(|h| h.join(".local").join("share").join("ay").join("docs-src")))
            .unwrap_or_else(|| PathBuf::from("docs-src"))
    }

    /// Skill directories whose name starts with `prefix`.
    pub fn skill_dirs(&self, prefix: &str) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(h) = &self.home {
            roots.push(h.join(".claude").join("skills"));
        }
        if let Some(r) = &self.repo {
            roots.push(r.join(".agents").join("skills"));
        }
        let mut dirs: Vec<PathBuf> = roots
            .iter()
            .flat_map(|root| std::fs::read_dir(root).into_iter().flatten().flatten())
            .filter(|e| e.file_name().to_string_lossy().starts_with(prefix) && e.path().is_dir())
            .map(|e| e.path())
            .collect();
        dirs.sort();
        dirs
    }
}

/// One document ready for the index.
#[derive(Debug, Clone, PartialEq)]
pub struct Doc {
    pub path: String,
    pub url: Option<String>,
    pub file: Option<String>,
    pub title: String,
    pub description: String,
    pub body: String,
}

/// Open (and create) the index.
pub fn open(db: &Path) -> rusqlite::Result<Connection> {
    if let Some(dir) = db.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(db)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS docs(
           id INTEGER PRIMARY KEY, source TEXT NOT NULL, path TEXT NOT NULL, url TEXT, file TEXT,
           title TEXT NOT NULL, description TEXT NOT NULL, hash INTEGER NOT NULL, bytes INTEGER NOT NULL,
           UNIQUE(source, path));
         CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(title, description, body, tokenize='porter unicode61');
         CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS stamps(
           source TEXT NOT NULL, path TEXT NOT NULL, shard TEXT NOT NULL, stamp TEXT NOT NULL,
           PRIMARY KEY(source, path));",
    )?;
    Ok(conn)
}

fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute("INSERT INTO meta(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value])?;
    Ok(())
}

fn get_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional().ok().flatten()
}

/// Content hash used for change detection (bun's wyhash, final4 variant, seed 0).
pub fn content_hash(doc: &Doc) -> u64 {
    let mut h = Wyhash::init(0);
    for part in [doc.title.as_bytes(), doc.description.as_bytes(), doc.body.as_bytes(), doc.url.as_deref().unwrap_or("").as_bytes()] {
        h.update(part);
        h.update(&[0]);
    }
    h.final_()
}

/// Counts of one source's sync.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Counts {
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub removed: usize,
}

/// Insert or update one document, counting what happened.
fn upsert(tx: &Transaction<'_>, source: &str, doc: &Doc, counts: &mut Counts) -> rusqlite::Result<()> {
    let hash = content_hash(doc) as i64;
    let found: Option<(i64, i64)> = tx
        .prepare_cached("SELECT id, hash FROM docs WHERE source = ?1 AND path = ?2")?
        .query_row(params![source, doc.path], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    let id = match found {
        Some((_, old)) if old == hash => {
            counts.unchanged += 1;
            return Ok(());
        }
        Some((id, _)) => {
            tx.execute(
                "UPDATE docs SET url = ?2, file = ?3, title = ?4, description = ?5, hash = ?6, bytes = ?7 WHERE id = ?1",
                params![id, doc.url, doc.file, doc.title, doc.description, hash, doc.body.len() as i64],
            )?;
            tx.execute("DELETE FROM docs_fts WHERE rowid = ?1", [id])?;
            counts.updated += 1;
            id
        }
        None => {
            tx.execute(
                "INSERT INTO docs(source, path, url, file, title, description, hash, bytes) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![source, doc.path, doc.url, doc.file, doc.title, doc.description, hash, doc.body.len() as i64],
            )?;
            counts.added += 1;
            tx.last_insert_rowid()
        }
    };
    tx.execute("INSERT INTO docs_fts(rowid, title, description, body) VALUES(?1, ?2, ?3, ?4)", params![id, doc.title, doc.description, doc.body])?;
    Ok(())
}

/// Delete one document; true when it existed.
fn delete_doc(tx: &Transaction<'_>, source: &str, path: &str) -> rusqlite::Result<bool> {
    let id: Option<i64> = tx.query_row("SELECT id FROM docs WHERE source = ?1 AND path = ?2", params![source, path], |r| r.get(0)).optional()?;
    let Some(id) = id else { return Ok(false) };
    tx.execute("DELETE FROM docs WHERE id = ?1", [id])?;
    tx.execute("DELETE FROM docs_fts WHERE rowid = ?1", [id])?;
    Ok(true)
}

/// Replace the documents of `source` with `docs`, touching only what changed.
pub fn apply(conn: &mut Connection, source: &str, docs: &[Doc]) -> rusqlite::Result<Counts> {
    let tx = conn.transaction()?;
    let mut counts = Counts::default();
    let mut seen = HashSet::new();
    for doc in docs {
        if seen.insert(doc.path.as_str()) {
            upsert(&tx, source, doc, &mut counts)?;
        }
    }
    let stale: Vec<String> = {
        let mut all = tx.prepare("SELECT path FROM docs WHERE source = ?1")?;
        let rows = all.query_map([source], |r| r.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().filter(|p| !seen.contains(p.as_str())).collect()
    };
    for path in stale {
        delete_doc(&tx, source, &path)?;
        counts.removed += 1;
    }
    tx.commit()?;
    Ok(counts)
}

/// Frontmatter (`---` block) as (key, value) pairs and the rest of the text.
pub fn split_frontmatter(text: &str) -> (Vec<(String, String)>, &str) {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(rest) = t.strip_prefix("---\n").or_else(|| t.strip_prefix("---\r\n")) else {
        return (Vec::new(), t);
    };
    let Some(end) = rest.find("\n---") else {
        return (Vec::new(), t);
    };
    let block = &rest[..end];
    let after = rest[end + 4..].trim_start_matches(['\r', '\n']);
    let pairs = block
        .lines()
        .filter_map(|l| {
            let (k, v) = l.split_once(':')?;
            if k.starts_with(' ') {
                return None;
            }
            let v = v.trim().trim_matches(|c| c == '"' || c == '\'');
            Some((k.trim().to_string(), v.to_string()))
        })
        .collect();
    (pairs, after)
}

fn first_heading(body: &str) -> Option<String> {
    body.lines().find_map(|l| l.strip_prefix("# ").map(|t| t.trim().to_string()))
}

/// reStructuredText section underline: one punctuation character, three or more times.
fn is_rst_rule(line: &str) -> bool {
    let l = line.trim_end();
    l.len() >= 3 && l.chars().all(|c| c == l.chars().next().unwrap_or(' ')) && l.starts_with(|c: char| c.is_ascii_punctuation())
}

/// First reStructuredText title: a line followed by an underline (an overline is skipped as a rule).
fn rst_title(body: &str) -> Option<String> {
    let lines: Vec<&str> = body.lines().collect();
    lines.windows(2).find_map(|w| {
        let t = w[0].trim();
        (!t.is_empty() && !t.starts_with("..") && !is_rst_rule(t) && is_rst_rule(w[1])).then(|| t.to_string())
    })
}

/// First prose paragraph (at most 240 characters) for the description of a page that has none.
fn first_paragraph(body: &str) -> Option<String> {
    let p = body.split("\n\n").map(str::trim).find(|p| {
        !p.is_empty()
            && !p.starts_with(['#', '=', '-', '.', '`', '<', '|', '*', '+', '~', '[', ':', '!'])
            && p.chars().any(char::is_alphabetic)
            && !p.lines().nth(1).is_some_and(is_rst_rule)
    })?;
    let one = p.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(one.chars().take(240).collect())
}

/// MDX module lines (`import`, `export`) carry no prose.
fn strip_mdx(body: &str) -> String {
    body.lines()
        .filter(|l| !(l.starts_with("import ") || l.starts_with("export ")))
        .collect::<Vec<_>>()
        .join("\n")
}

fn walk(dir: &Path, exts: &[&str], out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name();
        if name == "node_modules" || name.to_string_lossy().starts_with('.') || e.file_type().is_ok_and(|t| t.is_symlink()) {
            continue;
        }
        if p.is_dir() {
            walk(&p, exts, out);
        } else if p.extension().and_then(|x| x.to_str()).is_some_and(|x| exts.contains(&x)) {
            out.push(p);
        }
    }
}

fn rel_slash(path: &Path, base: &Path) -> String {
    path.strip_prefix(base).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// Directories of `root` matching a `/`-separated pattern whose `*` segments match any one directory.
fn expand(root: &Path, pattern: &str) -> Vec<PathBuf> {
    let mut cur = vec![root.to_path_buf()];
    for seg in pattern.split('/').filter(|s| !s.is_empty()) {
        let mut next = Vec::new();
        for base in &cur {
            if seg == "*" {
                for e in std::fs::read_dir(base).into_iter().flatten().flatten() {
                    let name = e.file_name();
                    if e.path().is_dir() && name != "node_modules" && !name.to_string_lossy().starts_with('.') {
                        next.push(e.path());
                    }
                }
            } else if base.join(seg).is_dir() {
                next.push(base.join(seg));
            }
        }
        cur = next;
    }
    cur.sort();
    cur
}

fn paths_present(root: &Path, paths: &[String]) -> bool {
    root.is_dir() && paths.iter().all(|p| !expand(root, p).is_empty())
}

/// The documents of a checkout: `paths` (else the whole root) filtered by extension, with their URLs.
pub fn tree_docs(root: &Path, src: &Source) -> Vec<Doc> {
    let exts: Vec<&str> = if src.exts.is_empty() { vec!["md", "mdx"] } else { src.exts.iter().map(String::as_str).collect() };
    let dirs: Vec<PathBuf> = if src.paths.is_empty() { vec![root.to_path_buf()] } else { src.paths.iter().flat_map(|p| expand(root, p)).collect() };
    let mut files = Vec::new();
    for d in &dirs {
        walk(d, &exts, &mut files);
    }
    files.sort();
    files.dedup();
    files.iter().filter_map(|f| file_doc(root, src, f)).collect()
}

fn file_doc(root: &Path, src: &Source, f: &Path) -> Option<Doc> {
    if f.metadata().ok()?.len() > MAX_FILE_BYTES {
        return None;
    }
    let bytes = std::fs::read(f).ok()?;
    let mut text = String::from_utf8_lossy(&bytes).into_owned();
    if text.contains('\r') {
        text = text.replace("\r\n", "\n");
    }
    let rel = rel_slash(f, root);
    let (front, body) = split_frontmatter(&text);
    let get = |k: &str| front.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
    let ext = f.extension().and_then(|x| x.to_str()).unwrap_or("");
    let body = if ext == "mdx" { strip_mdx(body) } else { body.to_string() };
    let stem = if ext.is_empty() { rel.as_str() } else { rel.strip_suffix(&format!(".{ext}")).unwrap_or(&rel) };
    let url = src.url_base.as_ref().map(|base| {
        let shown = src.strip_prefix.as_deref().and_then(|p| rel.strip_prefix(p)).unwrap_or(&rel);
        let shown = if src.strip_ext { shown.strip_suffix(&format!(".{ext}")).unwrap_or(shown) } else { shown };
        format!("{base}{shown}{}", src.url_suffix.as_deref().unwrap_or(""))
    });
    Some(Doc {
        path: rel.clone(),
        url,
        file: Some(f.to_string_lossy().into_owned()),
        title: get("title").or_else(|| first_heading(&body)).or_else(|| rst_title(&body)).unwrap_or_else(|| stem.to_string()),
        description: get("description").or_else(|| first_paragraph(&body)).unwrap_or_default(),
        body,
    })
}

/// Pages of `llms-full.txt`: each starts with `# Title` and a `Source: <url>` line.
pub fn split_llms_full(text: &str) -> Vec<Doc> {
    let lines: Vec<&str> = text.lines().collect();
    // A `# ` line inside a fenced code block is shell or Python, not a page title.
    let mut fenced = false;
    let mut starts = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
        } else if !fenced && line.starts_with("# ") && lines.get(i + 1).is_some_and(|n| n.starts_with("Source: ")) {
            starts.push(i);
        }
    }
    starts
        .iter()
        .enumerate()
        .map(|(n, &i)| {
            let end = starts.get(n + 1).copied().unwrap_or(lines.len());
            let url = lines[i + 1]["Source: ".len()..].trim().to_string();
            let body = lines[i + 2..end].join("\n");
            let description = body.split("\n\n").map(str::trim).find(|p| !p.is_empty()).unwrap_or("").to_string();
            let path = url.split_once("://").map_or(url.as_str(), |(_, r)| r.split_once('/').map_or("", |(_, p)| p)).to_string();
            Doc { path, url: Some(url), file: None, title: lines[i][2..].trim().to_string(), description, body }
        })
        .collect()
}

/// Number of page links in `llms.txt`.
pub fn count_llms_links(text: &str) -> usize {
    text.lines().filter(|l| l.trim_start().starts_with("- [")).count()
}

/// Every markdown file of the skill directories.
pub fn skill_docs(dirs: &[PathBuf]) -> Vec<Doc> {
    let mut docs = Vec::new();
    for dir in dirs {
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let mut files = Vec::new();
        walk(dir, &["md", "mdx"], &mut files);
        files.sort();
        for f in files {
            let Ok(text) = std::fs::read_to_string(&f) else { continue };
            let (front, body) = split_frontmatter(&text);
            let get = |k: &str| front.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
            let rel = rel_slash(&f, dir);
            docs.push(Doc {
                path: format!("{name}/{rel}"),
                url: None,
                file: Some(f.to_string_lossy().into_owned()),
                title: get("name").map(|n| format!("skill {n}")).or_else(|| first_heading(body)).unwrap_or_else(|| format!("{name}/{rel}")),
                description: get("description").unwrap_or_default(),
                body: body.to_string(),
            });
        }
    }
    docs
}

/// A failed HTTP request: the status when the server answered.
#[derive(Debug)]
pub(crate) struct HttpError {
    pub status: Option<u16>,
    pub msg: String,
}

pub(crate) fn agent() -> ureq::Agent {
    ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(90)))
            .http_status_as_error(false)
            .user_agent(concat!("ay-docs/", env!("CARGO_PKG_VERSION")))
            .build(),
    )
}

/// GET a text body; 429 and 5xx and network errors are retried three times, other statuses fail at once.
pub(crate) fn get(agent: &ureq::Agent, url: &str, limit: u64) -> Result<String, HttpError> {
    let mut last = HttpError { status: None, msg: "no attempt".into() };
    for attempt in 0..3u32 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(600 << attempt));
        }
        match agent.get(url).call() {
            Ok(mut resp) => {
                let status = resp.status().as_u16();
                if (200..300).contains(&status) {
                    match resp.body_mut().with_config().limit(limit).read_to_string() {
                        Ok(s) => return Ok(s),
                        Err(e) => last = HttpError { status: None, msg: e.to_string() },
                    }
                } else if status == 429 || status >= 500 {
                    last = HttpError { status: Some(status), msg: format!("status {status}") };
                } else {
                    return Err(HttpError { status: Some(status), msg: format!("status {status}") });
                }
            }
            Err(e) => last = HttpError { status: None, msg: e.to_string() },
        }
    }
    Err(last)
}

fn fetch(url: &str) -> Result<String, String> {
    get(&agent(), url, 64 * 1024 * 1024).map_err(|e| format!("{url}: {}", e.msg))
}

fn git_cmd(dir: Option<&Path>, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new("git");
    c.env("GIT_TERMINAL_PROMPT", "0").args(["-c", "core.longpaths=true"]);
    if let Some(d) = dir {
        c.arg("-C").arg(d);
    }
    let out = c.args(args).output().map_err(|e| format!("git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(format!("git {}: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim()))
    }
}

fn git_head(dir: &Path) -> Option<String> {
    git_cmd(Some(dir), &["rev-parse", "HEAD"]).ok().filter(|h| !h.is_empty())
}

/// A checkout holding the source's paths: the `local` one when it has them, else the cached shallow partial
/// sparse clone of `url` (fetched again unless offline). Returns the root, its commit and a note.
fn git_checkout(cfg: &Config, src: &Source, offline: bool) -> Result<(PathBuf, Option<String>, String), String> {
    if let Some(local) = src.local.as_deref().map(|l| cfg.resolve(l)) {
        if paths_present(&local, &src.paths) {
            let head = git_head(&local);
            return Ok((local, head, "local checkout".into()));
        }
    }
    let url = src.url.as_deref().ok_or("git source without url")?;
    let dir = cfg.cache_dir().join(src.id.replace('/', "-"));
    let rev = src.git_ref.as_deref().unwrap_or("HEAD");
    let cone = !src.paths.iter().any(|p| p.contains('*'));
    let patterns: Vec<String> = src.paths.iter().map(|p| if cone { p.clone() } else { format!("/{p}/") }).collect();
    let mut set: Vec<&str> = vec!["sparse-checkout", "set"];
    set.push(if cone { "--cone" } else { "--no-cone" });
    set.extend(patterns.iter().map(String::as_str));
    let mut note = String::from("cached clone");
    if dir.join(".git").exists() {
        if !offline {
            let step = git_cmd(Some(&dir), &["fetch", "--depth", "1", "--filter=blob:none", "origin", rev]).and_then(|_| {
                if src.paths.is_empty() { Ok(String::new()) } else { git_cmd(Some(&dir), &set) }
            });
            match step.and_then(|_| git_cmd(Some(&dir), &["reset", "--hard", "FETCH_HEAD"])) {
                Ok(_) => {}
                Err(e) => note = format!("cached clone (not refreshed: {e})"),
            }
        }
    } else {
        if offline {
            return Err(format!("{}: not cloned yet and offline", src.id));
        }
        std::fs::create_dir_all(&cfg.cache_dir()).map_err(|e| format!("{}: {e}", cfg.cache_dir().display()))?;
        let dir_s = dir.to_string_lossy().into_owned();
        let mut clone = vec!["clone", "--depth", "1", "--filter=blob:none"];
        if !src.paths.is_empty() {
            clone.push("--sparse");
        }
        if rev != "HEAD" {
            clone.extend(["--branch", rev]);
        }
        clone.extend([url, dir_s.as_str()]);
        git_cmd(None, &clone)?;
        if !src.paths.is_empty() {
            git_cmd(Some(&dir), &set)?;
        }
        note = "cloned".into();
    }
    let head = git_head(&dir);
    Ok((dir, head, note))
}

/// What `ay docs sync` does.
#[derive(Debug, Clone, Default)]
pub struct SyncOptions {
    /// Source ids or id prefixes (`android` = `android/source` + `android/developer`); empty = all.
    pub sources: Vec<String>,
    /// Skip the network: llms and sitemap sources, and the refresh of cached clones.
    pub offline: bool,
    /// Progress lines on stderr while pages are fetched.
    pub progress: bool,
}

/// A failed source: its own problem (reported, the others go on) or the index's (aborts).
pub(crate) enum Fail {
    Source(String),
    Index(String),
}

impl From<rusqlite::Error> for Fail {
    fn from(e: rusqlite::Error) -> Self {
        Fail::Index(e.to_string())
    }
}

/// Result of one source's sync.
pub(crate) struct Outcome {
    pub counts: Counts,
    /// Pages that could not be fetched (retried at the next sync).
    pub failed: usize,
    pub info: Value,
}

fn count_docs(conn: &Connection, source: &str) -> rusqlite::Result<i64> {
    conn.query_row("SELECT count(*) FROM docs WHERE source = ?1", [source], |r| r.get(0))
}

/// Load a whole source and apply it as the new state of that source.
fn replace_source(conn: &mut Connection, src: &Source, docs: Vec<Doc>, info: Value) -> Result<Outcome, Fail> {
    if docs.is_empty() {
        return Err(Fail::Source("no documents found (nothing was removed)".into()));
    }
    let counts = apply(conn, &src.id, &docs)?;
    Ok(Outcome { counts, failed: 0, info })
}

fn sync_source(conn: &mut Connection, cfg: &Config, src: &Source, opts: &SyncOptions) -> Result<Outcome, Fail> {
    match src.kind {
        Kind::Local => {
            let root = cfg.resolve(src.root.as_deref().unwrap_or("."));
            if !paths_present(&root, &src.paths) {
                return Err(Fail::Source(format!("{} not checked out (set SRC_ROOT or --root)", root.display())));
            }
            let commit = git_head(&root);
            let info = json!({"root": root.to_string_lossy(), "commit": commit});
            replace_source(conn, src, tree_docs(&root, src), info)
        }
        Kind::Git => {
            let (root, commit, note) = git_checkout(cfg, src, opts.offline).map_err(Fail::Source)?;
            let info = json!({"root": root.to_string_lossy(), "commit": commit, "checkout": note});
            replace_source(conn, src, tree_docs(&root, src), info)
        }
        Kind::Llms => {
            let url = src.url.as_deref().unwrap_or_default();
            let full = fetch(url).map_err(Fail::Source)?;
            let listed = src.index.as_deref().and_then(|i| fetch(i).ok()).map(|t| count_llms_links(&t));
            let pages = split_llms_full(&full);
            if pages.is_empty() {
                return Err(Fail::Source(format!("{url}: no `# Title` / `Source:` pages found")));
            }
            let info = json!({
                "llms_full_bytes": full.len(),
                "llms_full_hash": format!("{:016x}", Wyhash::hash(0, full.as_bytes())),
                "llms_txt_pages": listed,
            });
            replace_source(conn, src, pages, info)
        }
        Kind::Skills => {
            let dirs = cfg.skill_dirs(src.prefix.as_deref().unwrap_or(""));
            let names: Vec<String> = dirs.iter().map(|d| d.to_string_lossy().into_owned()).collect();
            let counts = apply(conn, &src.id, &skill_docs(&dirs))?;
            Ok(Outcome { counts, failed: 0, info: json!({"dirs": names}) })
        }
        Kind::Sitemap => web::sync_sitemap(conn, src, opts),
    }
}

/// Run the sync and return its JSON report (schema [`SYNC_SCHEMA`]).
pub fn sync(cfg: &Config, opts: &SyncOptions) -> Result<Value, String> {
    let all = cfg.load_sources()?;
    for s in &opts.sources {
        if !all.iter().any(|d| sources::selects(&d.id, s)) {
            let ids: Vec<&str> = all.iter().map(|d| d.id.as_str()).collect();
            return Err(format!("unknown source {s} ({})", ids.join(", ")));
        }
    }
    let mut conn = open(&cfg.db).map_err(|e| format!("{}: {e}", cfg.db.display()))?;
    let mut report = Vec::new();
    for src in all.iter().filter(|d| opts.sources.is_empty() || opts.sources.iter().any(|s| sources::selects(&d.id, s))) {
        if opts.offline && matches!(src.kind, Kind::Llms | Kind::Sitemap) {
            continue;
        }
        let t = Instant::now();
        match sync_source(&mut conn, cfg, src, opts) {
            Ok(o) => {
                let documents = count_docs(&conn, &src.id).map_err(|e| e.to_string())?;
                if let Some(commit) = o.info["commit"].as_str() {
                    set_meta(&conn, &format!("commit:{}", src.id), commit).map_err(|e| e.to_string())?;
                    if src.id == "fork" {
                        set_meta(&conn, "fork_commit", commit).map_err(|e| e.to_string())?;
                    }
                }
                if o.failed == 0 {
                    set_meta(&conn, &format!("synced:{}", src.id), &now_unix().to_string()).map_err(|e| e.to_string())?;
                }
                report.push(json!({
                    "source": src.id, "kind": src.kind.name(), "ok": true, "documents": documents,
                    "added": o.counts.added, "updated": o.counts.updated, "unchanged": o.counts.unchanged, "removed": o.counts.removed,
                    "failed": o.failed, "ms": t.elapsed().as_millis() as u64, "info": o.info,
                }));
            }
            Err(Fail::Source(e)) => report.push(json!({"source": src.id, "kind": src.kind.name(), "ok": false, "error": e, "ms": t.elapsed().as_millis() as u64})),
            Err(Fail::Index(e)) => return Err(format!("{}: {e}", src.id)),
        }
    }
    let ok = report.iter().all(|r| r["ok"].as_bool() == Some(true));
    let synced = now_unix();
    set_meta(&conn, "synced_at", &synced.to_string()).map_err(|e| e.to_string())?;
    let _ = conn.execute_batch("INSERT INTO docs_fts(docs_fts) VALUES('optimize');");
    Ok(json!({"schema": SYNC_SCHEMA, "ok": ok, "db": cfg.db.to_string_lossy(), "synced_at": synced, "sources": report}))
}

/// One search hit.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub source: String,
    pub path: String,
    pub url: Option<String>,
    pub file: Option<String>,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

impl Hit {
    pub fn json(&self) -> Value {
        json!({"source": self.source, "path": self.path, "url": self.url, "file": self.file, "title": self.title, "snippet": self.snippet, "score": self.score})
    }
}

/// Query words (letters, digits, `_`), lowercased.
pub fn tokens(query: &str) -> Vec<String> {
    query
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// FTS5 MATCH expression: every word quoted, the last one as a prefix; AND or OR.
pub fn match_expr(words: &[String], any: bool) -> String {
    let parts: Vec<String> = words
        .iter()
        .enumerate()
        .map(|(i, w)| if i + 1 == words.len() { format!("\"{w}\"*") } else { format!("\"{w}\"") })
        .collect();
    parts.join(if any { " OR " } else { " " })
}

/// Search: bm25 (title 10, description 4, body 1), then a title-match boost, one hit per URL
/// (the fork copy wins over the bun.com copy of the same page), `limit` hits. `source` is an id or an id prefix.
pub fn search(conn: &Connection, query: &str, source: Option<&str>, limit: usize) -> rusqlite::Result<Vec<Hit>> {
    let words = tokens(query);
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    for any in [false, true] {
        let mut stmt = conn.prepare_cached(
            "SELECT d.source, d.path, d.url, d.file, d.title,
                    snippet(docs_fts, 2, '[', ']', '...', 14), bm25(docs_fts, 10.0, 4.0, 1.0)
             FROM docs_fts JOIN docs d ON d.id = docs_fts.rowid
             WHERE docs_fts MATCH ?1 AND (?2 IS NULL OR d.source = ?2 OR d.source LIKE ?2 || '/%')
             ORDER BY bm25(docs_fts, 10.0, 4.0, 1.0) LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![match_expr(&words, any), source, (limit * 4).max(20) as i64], |r| {
            Ok(Hit {
                source: r.get(0)?,
                path: r.get(1)?,
                url: r.get(2)?,
                file: r.get(3)?,
                title: r.get(4)?,
                snippet: r.get::<_, String>(5)?.replace('\n', " "),
                score: r.get(6)?,
            })
        })?;
        hits = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        if !hits.is_empty() || words.len() == 1 {
            break;
        }
    }
    let mut hits = merge_by_url(hits);
    rank(&mut hits, &words);
    hits.truncate(limit);
    Ok(hits)
}

/// One hit per URL: the fork's copy (else bun.com's) carries the best score of the group.
fn merge_by_url(hits: Vec<Hit>) -> Vec<Hit> {
    let mut out: Vec<Hit> = Vec::with_capacity(hits.len());
    let mut at: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for h in hits {
        let Some(url) = h.url.clone() else {
            out.push(h);
            continue;
        };
        match at.get(&url) {
            Some(&i) => {
                let best = out[i].score.min(h.score);
                if source_order(&h.source) < source_order(&out[i].source) {
                    out[i] = h;
                }
                out[i].score = best;
            }
            None => {
                at.insert(url, out.len());
                out.push(h);
            }
        }
    }
    out
}

fn source_order(source: &str) -> u64 {
    match source {
        "fork" => 0,
        "upstream" => 1,
        _ => 2,
    }
}

/// Final order: bm25 (lower is better) minus a boost when the title holds every query word, the
/// fork before bun.com before the other sources on ties. One u64 key per hit, sorted by bun's sort_by_number.
pub fn rank(hits: &mut [Hit], words: &[String]) {
    hits.sort_by_u64(|h| {
        let title = h.title.to_lowercase();
        let boost = if words.iter().all(|w| title.contains(w.as_str())) { 8.0 } else { 0.0 };
        let tie = source_order(&h.source);
        let s = (h.score - boost + 1.0e6).max(0.0);
        (((s * 1.0e4) as u64) << 2) | tie
    });
}

/// `ay docs search --json` payload.
pub fn search_json(cfg: &Config, conn: &Connection, query: &str, hits: &[Hit]) -> Value {
    json!({
        "schema": SEARCH_SCHEMA,
        "query": query,
        "db": cfg.db.to_string_lossy(),
        "fork_commit": get_meta(conn, "fork_commit"),
        "synced_at": get_meta(conn, "synced_at").and_then(|v| v.parse::<u64>().ok()),
        "results": hits.iter().map(Hit::json).collect::<Vec<_>>(),
    })
}

fn source_exists(conn: &Connection, selector: &str) -> bool {
    conn.query_row("SELECT 1 FROM docs WHERE source = ?1 OR source LIKE ?1 || '/%' LIMIT 1", [selector], |_| Ok(())).optional().ok().flatten().is_some()
}

/// A page by path (exact, then suffix) or URL: (source, path, url, title, body). `<source>:<path>` limits the source.
pub fn show(conn: &Connection, key: &str) -> rusqlite::Result<Option<(String, String, Option<String>, String, String)>> {
    let (source, key) = match key.split_once(':') {
        Some((s, k)) if !k.starts_with("//") && source_exists(conn, s) => (Some(s), k),
        _ => (None, key),
    };
    conn.query_row(
        "SELECT d.source, d.path, d.url, d.title, f.body FROM docs d JOIN docs_fts f ON f.rowid = d.id
         WHERE (?2 IS NULL OR d.source = ?2 OR d.source LIKE ?2 || '/%')
           AND (d.path = ?1 OR d.url = ?1 OR d.path LIKE '%' || ?1 OR d.path LIKE '%' || ?1 || '.md%')
         ORDER BY d.path = ?1 DESC, d.url = ?1 DESC, CASE d.source WHEN 'fork' THEN 0 WHEN 'upstream' THEN 1 ELSE 2 END, length(d.path)
         LIMIT 1",
        params![key, source],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
    .optional()
}

/// `ay docs stats` payload (schema [`STATS_SCHEMA`]).
pub fn stats(cfg: &Config, conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT source, count(*), sum(bytes) FROM docs GROUP BY source ORDER BY source")?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let total: i64 = rows.iter().map(|r| r.1).sum();
    let sources: Vec<Value> = rows
        .into_iter()
        .map(|(source, documents, bytes)| {
            json!({
                "source": source, "documents": documents, "bytes": bytes,
                "synced_at": get_meta(conn, &format!("synced:{source}")).and_then(|v| v.parse::<u64>().ok()),
                "commit": get_meta(conn, &format!("commit:{source}")),
            })
        })
        .collect();
    Ok(json!({
        "schema": STATS_SCHEMA,
        "db": cfg.db.to_string_lossy(),
        "db_bytes": std::fs::metadata(&cfg.db).map(|m| m.len()).unwrap_or(0),
        "fork_commit": get_meta(conn, "fork_commit"),
        "synced_at": get_meta(conn, "synced_at").and_then(|v| v.parse::<u64>().ok()),
        "documents": total,
        "sources": sources,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOCS_BASE: &str = "https://bun.com/docs/";

    fn doc(path: &str, title: &str, body: &str) -> Doc {
        Doc { path: path.into(), url: Some(format!("{DOCS_BASE}{path}")), file: None, title: title.into(), description: String::new(), body: body.into() }
    }

    fn cfg_in(dir: &Path) -> Config {
        Config { db: dir.join("docs.db"), repo: Some(dir.to_path_buf()), home: None, sources_file: None }
    }

    #[test]
    fn frontmatter_and_mdx() {
        let (front, body) = split_frontmatter("---\ntitle: \"bunfig.toml\"\ndescription: Configure Bun\n---\n\nimport X from 'y';\n# H\ntext");
        assert_eq!(front, [("title".to_string(), "bunfig.toml".to_string()), ("description".to_string(), "Configure Bun".to_string())]);
        assert_eq!(strip_mdx(body), "# H\ntext");
        assert_eq!(split_frontmatter("# no front").0, Vec::<(String, String)>::new());
    }

    #[test]
    fn titles_and_descriptions() {
        let rst = ".. SPDX-License-Identifier: GPL-2.0\n\n=====================\nThe Linux Scheduler\n=====================\n\nThe scheduler picks   the next task.\n\n.. note:: x\n";
        assert_eq!(rst_title(rst).as_deref(), Some("The Linux Scheduler"));
        assert_eq!(first_paragraph(rst).as_deref(), Some("The scheduler picks the next task."));
        assert_eq!(rst_title("no title here\n\nbody"), None);
        assert_eq!(first_paragraph("# Head\n\nProse line."), Some("Prose line.".into()));
    }

    #[test]
    fn llms_full_pages() {
        let text = "# Bytecode Caching\nSource: https://bun.com/docs/bundler/bytecode\n\nSpeed up startup\n\n## Usage\nbun build --bytecode\n# Not a page\n```sh\n# CSS\nSource: not a page either\n```\n# CSS\nSource: https://bun.com/docs/bundler/css\n\nCSS bundler\n";
        let pages = split_llms_full(text);
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].title, "Bytecode Caching");
        assert_eq!(pages[0].path, "docs/bundler/bytecode");
        assert_eq!(pages[0].description, "Speed up startup");
        assert!(pages[0].body.contains("# Not a page"));
        assert_eq!(pages[1].url.as_deref(), Some("https://bun.com/docs/bundler/css"));
        assert_eq!(count_llms_links("# Bun\n- [a](x): y\n- [b](z)\ntext"), 2);
    }

    #[test]
    fn query_expressions() {
        assert_eq!(tokens("Bun.serve() websocket"), ["bun", "serve", "websocket"]);
        assert_eq!(match_expr(&tokens("bun serve"), false), "\"bun\" \"serve\"*");
        assert_eq!(match_expr(&tokens("a b"), true), "\"a\" OR \"b\"*");
        assert!(tokens("\"*()").is_empty());
    }

    #[test]
    fn incremental_apply_search_show_stats() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = cfg_in(dir.path());
        let mut conn = open(&cfg.db).unwrap();
        let a = vec![
            doc("docs/runtime/bunfig", "bunfig.toml", "Configure the package manager registry"),
            doc("docs/api/http", "HTTP server", "Bun.serve starts a server with websocket support"),
        ];
        assert_eq!(apply(&mut conn, "fork", &a).unwrap(), Counts { added: 2, ..Counts::default() });
        assert_eq!(apply(&mut conn, "fork", &a).unwrap(), Counts { unchanged: 2, ..Counts::default() });
        let b = vec![doc("docs/api/http", "HTTP server", "Bun.serve starts a server; routes too")];
        assert_eq!(apply(&mut conn, "fork", &b).unwrap(), Counts { updated: 1, removed: 1, ..Counts::default() });
        apply(&mut conn, "upstream", &[doc("docs/api/http", "HTTP server", "Bun.serve routes upstream copy")]).unwrap();
        apply(&mut conn, "android/source", &[Doc { url: None, ..doc("docs/core/arch", "Architecture overview", "The HAL layer routes calls") }]).unwrap();

        let hits = search(&conn, "serve routes", None, 10).unwrap();
        assert_eq!(hits.len(), 1, "same URL is returned once");
        assert_eq!(hits[0].source, "fork");
        assert!(hits[0].snippet.contains("[routes]"), "{}", hits[0].snippet);
        assert!(search(&conn, "registry", None, 10).unwrap().is_empty(), "removed page is gone");
        assert_eq!(search(&conn, "serv", Some("upstream"), 10).unwrap()[0].source, "upstream");
        assert_eq!(search(&conn, "nothingmatches serve", None, 10).unwrap().len(), 1, "falls back to OR");
        assert_eq!(search(&conn, "routes", Some("android"), 10).unwrap().len(), 1, "an id prefix selects its sources");
        assert_eq!(search(&conn, "routes", Some("android/source"), 10).unwrap()[0].source, "android/source");
        assert!(search(&conn, "routes", Some("andro"), 10).unwrap().is_empty());

        let page = show(&conn, "api/http").unwrap().unwrap();
        assert_eq!((page.0.as_str(), page.3.as_str()), ("fork", "HTTP server"));
        assert_eq!(show(&conn, "upstream:docs/api/http").unwrap().unwrap().0, "upstream");
        assert_eq!(show(&conn, "android:docs/core/arch").unwrap().unwrap().0, "android/source");
        assert!(show(&conn, "fork:docs/core/arch").unwrap().is_none());
        let s = stats(&cfg, &conn).unwrap();
        assert_eq!(s["sources"].as_array().unwrap().len(), 3);
        assert_eq!(s["documents"], 3);
    }

    #[test]
    fn rank_prefers_title_matches() {
        let mut hits = vec![
            Hit { source: "fork".into(), path: "a".into(), url: None, file: None, title: "Other".into(), snippet: String::new(), score: -5.0 },
            Hit { source: "upstream".into(), path: "b".into(), url: None, file: None, title: "Bun Shell".into(), snippet: String::new(), score: -4.0 },
        ];
        rank(&mut hits, &tokens("shell"));
        assert_eq!(hits[0].path, "b");
    }

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn tree_sources_urls_and_globs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("co");
        write(&root.join("Documentation/sched/design.rst"), "=====\nSched\n=====\n\nThe scheduler.\n");
        write(&root.join("Documentation/skip.png"), "x");
        write(&root.join("docs/a.md"), "# Root docs\n\nHello\n");
        write(&root.join("net/docs/b.md"), "# Net docs\n\nWorld\n");
        write(&root.join("net/other/c.md"), "# Not docs\n");
        let src = |toml: &str| sources::parse(toml).unwrap().remove(0);

        let linux = src("[[source]]\nid='linux'\nkind='local'\nroot='co'\npaths=['Documentation']\nexts=['rst','txt']\nurl_base='https://docs.kernel.org/'\nstrip_prefix='Documentation/'\nstrip_ext=true\nurl_suffix='.html'\n");
        let docs = tree_docs(&root, &linux);
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].path, "Documentation/sched/design.rst");
        assert_eq!(docs[0].url.as_deref(), Some("https://docs.kernel.org/sched/design.html"));
        assert_eq!((docs[0].title.as_str(), docs[0].description.as_str()), ("Sched", "The scheduler."));

        let chromium = src("[[source]]\nid='chromium'\nkind='local'\nroot='co'\npaths=['docs','*/docs']\nurl_base='https://c/+/main/'\n");
        let docs = tree_docs(&root, &chromium);
        let paths: Vec<&str> = docs.iter().map(|d| d.path.as_str()).collect();
        assert_eq!(paths, ["docs/a.md", "net/docs/b.md"]);
        assert_eq!(docs[1].url.as_deref(), Some("https://c/+/main/net/docs/b.md"));
    }

    #[test]
    fn sync_local_source_and_removals() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = {
            let mut c = cfg_in(dir.path());
            let list = dir.path().join("sources.toml");
            write(&list, "[[source]]\nid='fork'\nkind='local'\nroot='co'\npaths=['docs']\nurl_base='https://bun.com/'\nstrip_ext=true\n");
            c.sources_file = Some(list);
            c
        };
        write(&dir.path().join("co/docs/a.md"), "# A\n\nalpha text\n");
        write(&dir.path().join("co/docs/b.md"), "# B\n\nbeta text\n");
        let first = sync(&cfg, &SyncOptions::default()).unwrap();
        assert_eq!(first["ok"], true);
        assert_eq!(first["sources"][0]["added"], 2);
        std::fs::remove_file(dir.path().join("co/docs/b.md")).unwrap();
        write(&dir.path().join("co/docs/a.md"), "# A\n\nalpha changed\n");
        let second = sync(&cfg, &SyncOptions { sources: vec!["fork".into()], ..SyncOptions::default() }).unwrap();
        assert_eq!(second["sources"][0]["updated"], 1);
        assert_eq!(second["sources"][0]["removed"], 1);
        let conn = open(&cfg.db).unwrap();
        assert_eq!(search(&conn, "changed", None, 5).unwrap()[0].url.as_deref(), Some("https://bun.com/docs/a"));
        assert!(sync(&cfg, &SyncOptions { sources: vec!["nope".into()], ..SyncOptions::default() }).is_err());
        std::fs::remove_dir_all(dir.path().join("co")).unwrap();
        let gone = sync(&cfg, &SyncOptions::default()).unwrap();
        assert_eq!(gone["ok"], false, "a missing checkout is reported, not purged");
        assert_eq!(count_docs(&conn, "fork").unwrap(), 1);
    }

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    }

    #[test]
    fn git_source_clones_sparse_and_refreshes() {
        let dir = tempfile::tempdir().unwrap();
        let origin = dir.path().join("origin");
        write(&origin.join("Documentation/a.rst"), "A\n=\n\nfirst\n");
        write(&origin.join("src/code.c"), "int x;\n");
        std::fs::create_dir_all(&origin).unwrap();
        git(&origin, &["init", "-q"]);
        git(&origin, &["add", "-A"]);
        git(&origin, &["commit", "-q", "-m", "one"]);
        let cfg = cfg_in(&dir.path().join("work"));
        let url = origin.to_string_lossy().replace('\\', "/");
        let src = sources::parse(&format!("[[source]]\nid='linux'\nkind='git'\nurl='{url}'\npaths=['Documentation']\nexts=['rst']\n")).unwrap().remove(0);

        let (root, head, note) = git_checkout(&cfg, &src, false).unwrap();
        assert_eq!(note, "cloned");
        assert!(head.is_some());
        assert_eq!(tree_docs(&root, &src).len(), 1);
        assert!(!root.join("src").join("code.c").exists(), "outside the sparse paths");

        write(&origin.join("Documentation/b.rst"), "B\n=\n\nsecond\n");
        git(&origin, &["add", "-A"]);
        git(&origin, &["commit", "-q", "-m", "two"]);
        let (root, head2, note) = git_checkout(&cfg, &src, false).unwrap();
        assert_eq!(note, "cached clone");
        assert_ne!(head, head2);
        assert_eq!(tree_docs(&root, &src).len(), 2);
        assert!(git_checkout(&cfg, &src, true).unwrap().1 == head2, "offline keeps the cache");
    }
}
