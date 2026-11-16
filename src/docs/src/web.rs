//! Sitemap sources: sitemap.xml (index or urlset) -> HTML pages -> documents.
//!
//! Incremental by `<lastmod>`: a shard of a sitemap index whose lastmod (and filters) are unchanged is not even
//! downloaded; inside a changed shard only pages whose lastmod changed are fetched. Every page has a row in
//! `stamps` (`~` until fetched), batches are committed as they arrive, and the shard is marked done only when
//! all its pages were fetched: an interrupted or partly failed sync resumes with exactly the missing pages.

use crate::{Counts, Doc, Fail, HttpError, Outcome, Source, SyncOptions, agent, delete_doc, get, get_meta, html, set_meta, upsert};
use bun_wyhash::Wyhash;
use rusqlite::{Connection, Transaction, params};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const SITEMAP_LIMIT: u64 = 256 * 1024 * 1024;
const PAGE_LIMIT: u64 = 32 * 1024 * 1024;
const BATCH: usize = 64;

struct Todo {
    path: String,
    url: String,
    lastmod: String,
}

#[derive(Default)]
struct Tally {
    counts: Counts,
    failed: usize,
    fetched: usize,
    samples: Vec<String>,
}

/// Page key inside its source: the URL without scheme and host.
fn page_path(url: &str) -> String {
    let p = url.split_once("://").and_then(|(_, r)| r.split_once('/')).map_or("", |(_, p)| p).trim_end_matches('/');
    if p.is_empty() { "index".to_string() } else { p.to_string() }
}

/// English pages of the source's scope: no `hl=` language variants, no assets.
fn keep(url: &str, src: &Source) -> bool {
    if url.contains("?hl=") || url.contains("&hl=") || url.contains('#') {
        return false;
    }
    let last = url.rsplit('/').next().unwrap_or("");
    if last.rsplit_once('.').is_some_and(|(_, ext)| matches!(ext, "txt" | "xml" | "json" | "png" | "jpg" | "svg" | "pdf" | "zip" | "js" | "css" | "ico")) {
        return false;
    }
    (src.include.is_empty() || src.include.iter().any(|p| url.starts_with(p.as_str()))) && !src.exclude.iter().any(|p| url.starts_with(p.as_str()))
}

fn filters_sig(src: &Source) -> String {
    let text = format!("{:?}|{:?}", src.include, src.exclude);
    format!("{:x}", Wyhash::hash(0, text.as_bytes()))
}

/// Record the shard's pages (pending until fetched), drop the ones that left it, and return those to fetch.
fn register(conn: &mut Connection, source: &str, shard: &str, entries: Vec<Todo>, tally: &mut Tally) -> Result<Vec<Todo>, Fail> {
    let tx = conn.transaction()?;
    let existing: HashMap<String, String> = {
        let mut stmt = tx.prepare("SELECT path, stamp FROM stamps WHERE source = ?1 AND shard = ?2")?;
        let rows = stmt.query_map(params![source, shard], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    let current: HashSet<String> = entries.iter().map(|e| e.path.clone()).collect();
    let mut todo = Vec::new();
    {
        let mut ins = tx.prepare(
            "INSERT INTO stamps(source, path, shard, stamp) VALUES(?1, ?2, ?3, '~') ON CONFLICT(source, path) DO UPDATE SET shard = excluded.shard",
        )?;
        for e in entries {
            match existing.get(&e.path) {
                Some(stamp) if !e.lastmod.is_empty() && *stamp == e.lastmod => tally.counts.unchanged += 1,
                Some(_) => todo.push(e),
                None => {
                    ins.execute(params![source, e.path, shard])?;
                    todo.push(e);
                }
            }
        }
    }
    for path in existing.keys().filter(|p| !current.contains(p.as_str())) {
        if delete_doc(&tx, source, path)? {
            tally.counts.removed += 1;
        }
        tx.execute("DELETE FROM stamps WHERE source = ?1 AND path = ?2", params![source, path])?;
    }
    tx.commit()?;
    Ok(todo)
}

fn stamp(tx: &Transaction<'_>, source: &str, t: &Todo) -> rusqlite::Result<()> {
    let stamp = if t.lastmod.is_empty() { "~" } else { t.lastmod.as_str() };
    tx.execute("UPDATE stamps SET stamp = ?3 WHERE source = ?1 AND path = ?2", params![source, t.path, stamp])?;
    Ok(())
}

type Fetched = (usize, Result<Option<Doc>, HttpError>);

fn write_batch(conn: &mut Connection, source: &str, todo: &[Todo], batch: &[Fetched], tally: &mut Tally) -> Result<(), Fail> {
    let tx = conn.transaction()?;
    for (i, result) in batch {
        let t = &todo[*i];
        match result {
            Ok(Some(doc)) => {
                upsert(&tx, source, doc, &mut tally.counts)?;
                stamp(&tx, source, t)?;
                tally.fetched += 1;
            }
            Ok(None) => {
                tally.counts.removed += usize::from(delete_doc(&tx, source, &t.path)?);
                stamp(&tx, source, t)?;
            }
            Err(e) if matches!(e.status, Some(404 | 410)) => {
                tally.counts.removed += usize::from(delete_doc(&tx, source, &t.path)?);
                stamp(&tx, source, t)?;
            }
            Err(e) => {
                tally.failed += 1;
                if tally.samples.len() < 5 {
                    tally.samples.push(format!("{}: {}", t.url, e.msg));
                }
            }
        }
    }
    tx.commit()?;
    Ok(())
}

/// Fetch `todo` with `workers` threads; the calling thread writes the batches as they arrive.
fn fetch_pages(conn: &mut Connection, agent: &ureq::Agent, source: &str, todo: &[Todo], workers: usize, label: Option<&str>, tally: &mut Tally) -> Result<(), Fail> {
    if todo.is_empty() {
        return Ok(());
    }
    let next = AtomicUsize::new(0);
    let (tx, rx) = mpsc::sync_channel::<Fetched>(workers * 4);
    let mut outcome: Result<(), Fail> = Ok(());
    std::thread::scope(|s| {
        for _ in 0..workers.min(todo.len()) {
            let tx = tx.clone();
            let next = &next;
            s.spawn(move || {
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    let Some(t) = todo.get(i) else { break };
                    let result = get(agent, &t.url, PAGE_LIMIT).map(|h| html::page_doc(&t.path, &t.url, &h));
                    if tx.send((i, result)).is_err() {
                        break;
                    }
                }
            });
        }
        drop(tx);
        let mut batch: Vec<Fetched> = Vec::new();
        let mut done = 0usize;
        let mut flushed = Instant::now();
        for item in rx {
            batch.push(item);
            if batch.len() >= BATCH || flushed.elapsed() > Duration::from_secs(3) {
                done += batch.len();
                if let Err(e) = write_batch(conn, source, todo, &batch, tally) {
                    outcome = Err(e);
                    return;
                }
                batch.clear();
                flushed = Instant::now();
                if let Some(label) = label {
                    eprintln!("{label}: {done}/{} pages", todo.len());
                }
            }
        }
        if !batch.is_empty() {
            outcome = write_batch(conn, source, todo, &batch, tally);
        }
    });
    outcome
}

/// Sync one sitemap source.
pub(crate) fn sync_sitemap(conn: &mut Connection, src: &Source, opts: &SyncOptions) -> Result<Outcome, Fail> {
    let url = src.url.as_deref().unwrap_or_default();
    let agent = agent();
    let top = get(&agent, url, SITEMAP_LIMIT).map_err(|e| Fail::Source(format!("{url}: {}", e.msg)))?;
    let shards: Vec<(String, String, Option<String>)> = if html::is_sitemap_index(&top) {
        html::sitemap_blocks(&top, "sitemap").into_iter().map(|(u, l)| (u, l, None)).collect()
    } else {
        vec![(url.to_string(), String::new(), Some(top))]
    };
    if shards.is_empty() {
        return Err(Fail::Source(format!("{url}: no sitemap entries")));
    }
    let workers = src.workers.unwrap_or(8).clamp(1, 32);
    let sig = filters_sig(src);
    let total_shards = shards.len();
    let (mut skipped, mut listed) = (0usize, 0usize);
    let mut tally = Tally::default();
    for (n, (shard_url, shard_mod, body)) in shards.into_iter().enumerate() {
        let key = format!("shard:{}:{shard_url}", src.id);
        let mark = format!("{shard_mod}|{sig}");
        if !shard_mod.is_empty() && get_meta(conn, &key).as_deref() == Some(mark.as_str()) {
            skipped += 1;
            continue;
        }
        let xml = match body {
            Some(b) => b,
            None => match get(&agent, &shard_url, SITEMAP_LIMIT) {
                Ok(x) => x,
                Err(e) => {
                    tally.failed += 1;
                    tally.samples.push(format!("{shard_url}: {}", e.msg));
                    continue;
                }
            },
        };
        let mut seen = HashSet::new();
        let entries: Vec<Todo> = html::sitemap_blocks(&xml, "url")
            .into_iter()
            .filter(|(u, _)| keep(u, src))
            .map(|(u, l)| Todo { path: page_path(&u), url: u, lastmod: l })
            .filter(|t| seen.insert(t.path.clone()))
            .collect();
        drop(xml);
        listed += entries.len();
        let todo = register(conn, &src.id, &shard_url, entries, &mut tally)?;
        let failed_before = tally.failed;
        let label = opts.progress.then(|| format!("{} shard {}/{total_shards}", src.id, n + 1));
        fetch_pages(conn, &agent, &src.id, &todo, workers, label.as_deref(), &mut tally)?;
        if tally.failed == failed_before && !shard_mod.is_empty() {
            set_meta(conn, &key, &mark)?;
        }
    }
    let info = json!({
        "sitemap": url, "shards": total_shards, "shards_unchanged": skipped, "pages_listed": listed,
        "pages_fetched": tally.fetched, "errors": tally.samples,
    });
    Ok(Outcome { counts: tally.counts, failed: tally.failed, info })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    type Routes = Arc<Mutex<HashMap<String, (u16, String)>>>;

    /// A tiny HTTP server on localhost: routes by path, records every request path.
    fn serve(routes: Routes, hits: Arc<Mutex<Vec<String>>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let (routes, hits) = (routes.clone(), hits.clone());
                std::thread::spawn(move || {
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let mut first = String::new();
                    reader.read_line(&mut first).unwrap();
                    loop {
                        let mut line = String::new();
                        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                            break;
                        }
                    }
                    let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
                    hits.lock().unwrap().push(path.clone());
                    let (status, body) = routes.lock().unwrap().get(&path).cloned().unwrap_or((404, "missing".into()));
                    let mut out = stream;
                    let _ = write!(out, "HTTP/1.1 {status} X\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                });
            }
        });
        base
    }

    fn page(title: &str, text: &str) -> String {
        format!("<html><head><title>{title} | Site</title></head><body><nav>menu</nav><article><h1>{title}</h1><p>{text}</p></article></body></html>")
    }

    fn urlset(base: &str, lastmod: &str, paths: &[&str]) -> String {
        let urls: String = paths.iter().map(|p| format!("<url><loc>{base}{p}</loc><lastmod>{lastmod}</lastmod></url>")).collect();
        format!("<urlset>{urls}</urlset>")
    }

    #[test]
    fn filters() {
        let src = crate::sources::parse("[[source]]\nid='a'\nkind='sitemap'\nurl='u'\ninclude=['https://h/docs/']\nexclude=['https://h/docs/ref/']\n").unwrap().remove(0);
        assert!(keep("https://h/docs/a", &src));
        assert!(!keep("https://h/docs/ref/a", &src));
        assert!(!keep("https://h/blog/a", &src));
        assert!(!keep("https://h/docs/a?hl=fr", &src));
        assert!(!keep("https://h/docs/robots.txt", &src));
        assert_eq!(page_path("https://h/docs/a/"), "docs/a");
        assert_eq!(page_path("https://h/"), "index");
    }

    #[test]
    fn incremental_resumable_sitemap_sync() {
        let routes: Routes = Arc::default();
        let hits: Arc<Mutex<Vec<String>>> = Arc::default();
        let base = serve(routes.clone(), hits.clone());
        let count = |p: &str| hits.lock().unwrap().iter().filter(|h| *h == p).count();
        let set = |p: &str, status: u16, body: String| {
            routes.lock().unwrap().insert(p.to_string(), (status, body));
        };
        let index = |lastmod: &str| format!("<sitemapindex><sitemap><loc>{base}/s1.xml</loc><lastmod>{lastmod}</lastmod></sitemap></sitemapindex>");
        set("/sitemap.xml", 200, index("L1"));
        set("/s1.xml", 200, urlset(&base, "P1", &["/docs/a", "/docs/b", "/docs/gone", "/docs/x?hl=fr", "/skip/c"]));
        set("/docs/a", 200, page("Alpha", "alpha text"));
        set("/docs/b", 200, page("Beta", "beta text"));
        set("/docs/gone", 404, String::new());

        let dir = tempfile::tempdir().unwrap();
        let mut conn = crate::open(&dir.path().join("docs.db")).unwrap();
        let src = crate::sources::parse(&format!("[[source]]\nid='site/docs'\nkind='sitemap'\nurl='{base}/sitemap.xml'\nexclude=['{base}/skip/']\nworkers=2\n")).unwrap().remove(0);
        let opts = SyncOptions::default();

        let first = sync_sitemap(&mut conn, &src, &opts).ok().unwrap();
        assert_eq!((first.counts.added, first.failed), (2, 0));
        assert_eq!(first.info["pages_listed"], 3, "language variants and excluded prefixes are not listed");
        assert_eq!(count("/docs/gone"), 1);
        assert_eq!(count("/skip/c") + count("/docs/x?hl=fr"), 0);
        let hit = crate::search(&conn, "alpha", Some("site"), 5).unwrap();
        assert_eq!((hit[0].title.as_str(), hit[0].path.as_str()), ("Alpha", "docs/a"));
        assert!(!hit[0].snippet.contains("menu"));

        // Nothing moved: the shard is skipped, no page is requested.
        let before = hits.lock().unwrap().len();
        let second = sync_sitemap(&mut conn, &src, &opts).ok().unwrap();
        assert_eq!(second.info["shards_unchanged"], 1);
        assert_eq!(hits.lock().unwrap().len(), before + 1, "only the sitemap index was requested");

        // The shard changed: only the page whose lastmod moved is fetched again; /docs/b leaves.
        set("/sitemap.xml", 200, index("L2"));
        set("/s1.xml", 200, urlset(&base, "P2", &["/docs/a"]));
        set("/docs/a", 200, page("Alpha", "alpha changed"));
        let third = sync_sitemap(&mut conn, &src, &opts).ok().unwrap();
        assert_eq!((third.counts.updated, third.counts.removed), (1, 1));
        assert_eq!(count("/docs/b"), 1);
        assert!(crate::search(&conn, "beta", None, 5).unwrap().is_empty());

        // A failing page keeps its shard open: the next sync retries only that page.
        set("/sitemap.xml", 200, index("L3"));
        set("/s1.xml", 200, urlset(&base, "P3", &["/docs/a", "/docs/c"]));
        set("/docs/a", 200, page("Alpha", "alpha changed"));
        set("/docs/c", 500, "boom".into());
        let fourth = sync_sitemap(&mut conn, &src, &opts).ok().unwrap();
        assert_eq!(fourth.failed, 1);
        set("/docs/c", 200, page("Gamma", "gamma text"));
        let a_before = count("/docs/a");
        let fifth = sync_sitemap(&mut conn, &src, &opts).ok().unwrap();
        assert_eq!((fifth.failed, fifth.counts.added), (0, 1));
        assert_eq!(count("/docs/a"), a_before, "a keeps its stamp, only the pending page is fetched");
    }
}
