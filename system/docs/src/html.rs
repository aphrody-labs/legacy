//! Web pages to documents: sitemap.xml parsing and HTML to text (no DOM: one pass over the tags).

use crate::Doc;

/// `<loc>` and `<lastmod>` of every `<tag>` block (`url` in a urlset, `sitemap` in a sitemap index).
pub fn sitemap_blocks(xml: &str, tag: &str) -> Vec<(String, String)> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find(&open) {
        let after = &rest[i + open.len()..];
        let Some(j) = after.find(&close) else { break };
        let block = &after[..j];
        if let Some(loc) = inner(block, "loc") {
            let lastmod = inner(block, "lastmod").map(|s| s.trim().to_string()).unwrap_or_default();
            out.push((decode_entities(loc.trim()), lastmod));
        }
        rest = &after[j + close.len()..];
    }
    out
}

fn inner<'a>(s: &'a str, tag: &str) -> Option<&'a str> {
    let a = s.find(&format!("<{tag}>"))? + tag.len() + 2;
    let b = s[a..].find(&format!("</{tag}>"))?;
    Some(&s[a..a + b])
}

pub fn is_sitemap_index(xml: &str) -> bool {
    xml.contains("<sitemapindex")
}

/// Text of the entities that occur in documentation pages.
pub fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let decoded = rest.find(';').filter(|&e| e <= 10).and_then(|e| {
            let name = &rest[1..e];
            let ch = match name {
                "amp" => '&',
                "lt" => '<',
                "gt" => '>',
                "quot" => '"',
                "apos" => '\'',
                "nbsp" => ' ',
                "mdash" => '\u{2014}',
                "ndash" => '\u{2013}',
                "hellip" => '\u{2026}',
                "rarr" => '\u{2192}',
                "larr" => '\u{2190}',
                "copy" => '\u{a9}',
                "laquo" => '\u{ab}',
                "raquo" => '\u{bb}',
                _ => {
                    let num = name.strip_prefix('#')?;
                    let code = match num.strip_prefix(['x', 'X']) {
                        Some(h) => u32::from_str_radix(h, 16).ok()?,
                        None => num.parse().ok()?,
                    };
                    let c = char::from_u32(code)?;
                    if c == '\u{a0}' { ' ' } else { c }
                }
            };
            Some((ch, e + 1))
        });
        match decoded {
            Some((ch, used)) => {
                out.push(ch);
                rest = &rest[used..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Value of attribute `name` in the text of a tag.
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(p) = lower[from..].find(name) {
        let at = from + p;
        from = at + name.len();
        let before_ok = at == 0 || lower.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = lower[at + name.len()..].trim_start();
        if !before_ok || !rest.starts_with('=') {
            continue;
        }
        let val_at = tag.len() - rest.len() + 1;
        let val = tag[val_at..].trim_start();
        let (quote, body) = match val.chars().next()? {
            q @ ('"' | '\'') => (Some(q), &val[1..]),
            _ => (None, val),
        };
        let end = match quote {
            Some(q) => body.find(q)?,
            None => body.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(body.len()),
        };
        return Some(decode_entities(&body[..end]));
    }
    None
}

/// End (index of `>`) of the tag starting at `lt`, quotes respected.
fn tag_end(b: &[u8], lt: usize) -> Option<usize> {
    let mut quote = 0u8;
    for (k, &c) in b.iter().enumerate().skip(lt + 1) {
        match (quote, c) {
            (0, b'"' | b'\'') => quote = c,
            (q, c) if q != 0 && q == c => quote = 0,
            (0, b'>') => return Some(k),
            (0, b'<') => return None,
            _ => {}
        }
    }
    None
}

fn is_void(name: &str) -> bool {
    matches!(name, "br" | "hr" | "img" | "input" | "meta" | "link" | "area" | "base" | "col" | "embed" | "source" | "track" | "wbr")
}

/// Elements whose content is chrome, not text.
fn skipped(name: &str, tag: &str) -> bool {
    matches!(
        name,
        "script" | "style" | "noscript" | "svg" | "template" | "nav" | "button" | "select" | "iframe" | "head" | "form" | "footer"
            | "devsite-actions" | "devsite-thumb-rating" | "devsite-feedback" | "devsite-hats-survey" | "devsite-snackbar"
            | "devsite-toc" | "devsite-book-nav" | "devsite-recommendations" | "devsite-recommendations-sidebar"
    ) || attr(tag, "class").is_some_and(|c| c.split_whitespace().any(|w| w == "nocontent"))
}

/// `<article>`, else `<main>`, else `<body>`, else everything.
fn region<'a>(html: &'a str, lower: &str) -> &'a str {
    for tag in ["article", "main", "body"] {
        let open = format!("<{tag}");
        let mut from = 0;
        while let Some(p) = lower[from..].find(&open) {
            let i = from + p;
            from = i + open.len();
            if lower.as_bytes().get(from).is_some_and(|&c| c == b'>' || c.is_ascii_whitespace()) {
                let end = lower[from..].find(&format!("</{tag}")).map_or(html.len(), |e| from + e);
                return &html[i..end];
            }
        }
    }
    html
}

/// Text of an HTML fragment: headings as `#` lines, list items as `- `, code blocks keep their layout.
pub fn html_to_text(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let part = region(html, &lower);
    let lower = part.to_ascii_lowercase();
    let b = part.as_bytes();
    let mut out = String::with_capacity(part.len() / 4);
    let mut skip: Option<(String, usize)> = None;
    let mut pre = 0usize;
    let mut i = 0;
    let push_text = |out: &mut String, seg: &str, pre: usize| {
        let s = decode_entities(seg);
        if pre > 0 {
            out.push_str(&s);
            return;
        }
        for ch in s.chars() {
            if ch.is_whitespace() {
                if !(out.is_empty() || out.ends_with(['\n', ' '])) {
                    out.push(' ');
                }
            } else {
                out.push(ch);
            }
        }
    };
    while i < part.len() {
        let Some(rel) = part[i..].find('<') else {
            if skip.is_none() {
                push_text(&mut out, &part[i..], pre);
            }
            break;
        };
        let lt = i + rel;
        if skip.is_none() {
            push_text(&mut out, &part[i..lt], pre);
        }
        if part[lt..].starts_with("<!--") {
            i = part[lt + 4..].find("-->").map_or(part.len(), |e| lt + 4 + e + 3);
            continue;
        }
        let Some(gt) = tag_end(b, lt) else {
            if skip.is_none() {
                out.push('<');
            }
            i = lt + 1;
            continue;
        };
        i = gt + 1;
        let raw = &part[lt + 1..gt];
        let closing = raw.starts_with('/');
        let body = raw.trim_start_matches('/');
        let name_len = body.find(|c: char| c.is_whitespace() || c == '/').unwrap_or(body.len());
        let name = body[..name_len].to_ascii_lowercase();
        if name.is_empty() || name.starts_with('!') || name.starts_with('?') {
            continue;
        }
        let single = raw.ends_with('/') || is_void(&name);
        if let Some((open, depth)) = skip.as_mut() {
            if *open == name && !single {
                if closing {
                    *depth -= 1;
                    if *depth == 0 {
                        skip = None;
                    }
                } else {
                    *depth += 1;
                }
            }
            continue;
        }
        if !closing && !single && skipped(&name, raw) {
            if name == "script" || name == "style" {
                let close = format!("</{name}");
                i = lower[i..].find(&close).map_or(part.len(), |p| lower[i + p..].find('>').map_or(part.len(), |g| i + p + g + 1));
            } else {
                skip = Some((name, 1));
            }
            continue;
        }
        match name.as_str() {
            "br" => out.push('\n'),
            "pre" => {
                pre = if closing { pre.saturating_sub(1) } else { pre + 1 };
                out.push('\n');
            }
            "li" => {
                if !closing {
                    out.push_str("\n- ");
                }
            }
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                out.push_str("\n\n");
                if !closing {
                    out.push_str(&"#".repeat(usize::from(name.as_bytes()[1] - b'0')));
                    out.push(' ');
                }
            }
            "p" | "div" | "ul" | "ol" | "table" | "tr" | "section" | "article" | "header" | "blockquote" | "dl" | "dt" | "dd" | "hr"
            | "figure" | "figcaption" | "details" | "summary" | "main" | "aside" | "caption" => out.push('\n'),
            "td" | "th" if !closing && !out.ends_with(['\n', ' ']) => out.push(' '),
            _ => {}
        }
    }
    let mut text = String::with_capacity(out.len());
    let mut blank = 0;
    for line in out.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank += 1;
            if blank > 1 || text.is_empty() {
                continue;
            }
        } else {
            blank = 0;
        }
        text.push_str(line);
        text.push('\n');
    }
    text.trim().to_string()
}

fn between<'a>(html: &'a str, lower: &str, open: &str, close: &str) -> Option<&'a str> {
    let i = lower.find(open)?;
    let start = i + lower[i..].find('>')? + 1;
    let end = start + lower[start..].find(close)?;
    Some(&html[start..end])
}

fn collapse(s: &str) -> String {
    decode_entities(s).split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A page as a document: title (before the first ` | `), meta description, text of the main region.
/// `None` when the page holds no text (a robots.txt, a redirect stub).
pub fn page_doc(path: &str, url: &str, html: &str) -> Option<Doc> {
    let lower = html.to_ascii_lowercase();
    let mut title = between(html, &lower, "<title", "</title").map(collapse).unwrap_or_default();
    if let Some((first, _)) = title.split_once(" | ") {
        title = first.to_string();
    }
    let mut description = String::new();
    let mut from = 0;
    while let Some(p) = lower[from..].find("<meta") {
        let at = from + p;
        let Some(end) = lower[at..].find('>') else { break };
        let tag = &html[at + 5..at + end];
        from = at + end;
        if attr(tag, "name").is_some_and(|n| n.eq_ignore_ascii_case("description")) {
            description = attr(tag, "content").map(|c| collapse(&c)).unwrap_or_default();
            break;
        }
    }
    let body = html_to_text(html);
    if body.is_empty() {
        return None;
    }
    if title.is_empty() {
        title = body.lines().find_map(|l| l.strip_prefix("# ")).unwrap_or(path).to_string();
    }
    Some(Doc { path: path.to_string(), url: Some(url.to_string()), file: None, title, description, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = "<!doctype html><html><head><title>Intro to activities &nbsp;|&nbsp; App architecture &nbsp;|&nbsp; Android Developers</title>\
        <meta name=\"viewport\" content=\"x\"><meta name=\"description\" content=\"How &amp; why of activities\"><script>var a = '<p>no</p>';</script></head>\
        <body><nav><a href=x>Menu</a></nav><main><div class=\"sidebar\"><nav>skip</nav></div>\
        <article class=\"devsite-article\"><div class=\"devsite-article-meta nocontent\"><ul><li>Docs</li></ul></div>\
        <h1>Activities</h1><p>An <code>Activity</code> is a &lt;screen&gt;<br>that  users&#39; see.</p><ul><li>one</li><li>two</li></ul>\
        <pre>fun main() {\n    run()\n}</pre><button>Copy</button><!-- hidden --><p>end</p></article></main><footer>skip</footer></body></html>";

    #[test]
    fn extracts_article_text() {
        let d = page_doc("guide/activities", "https://x/guide/activities", PAGE).unwrap();
        assert_eq!(d.title, "Intro to activities");
        assert_eq!(d.description, "How & why of activities");
        assert!(d.body.starts_with("# Activities"), "{}", d.body);
        assert!(d.body.contains("An Activity is a <screen>"), "{}", d.body);
        assert!(d.body.contains("users' see."), "{}", d.body);
        assert!(d.body.contains("- one\n- two"), "{}", d.body);
        assert!(d.body.contains("fun main() {\n    run()\n}"), "{}", d.body);
        for gone in ["Menu", "skip", "Docs", "Copy", "hidden", "no</p>"] {
            assert!(!d.body.contains(gone), "{gone} leaked into {}", d.body);
        }
        assert!(d.body.ends_with("end"));
    }

    #[test]
    fn falls_back_to_main_and_body() {
        let d = page_doc("p", "u", "<html><body><main><h1>Guides</h1><p>Hi</p></main></body></html>").unwrap();
        assert_eq!((d.title.as_str(), d.body.as_str()), ("Guides", "# Guides\n\nHi"));
        assert!(page_doc("p", "u", "User-agent: *\nDisallow: /x").is_some(), "plain text passes through as a body");
        assert!(page_doc("p", "u", "<html><head><title>t</title></head><body></body></html>").is_none());
    }

    #[test]
    fn entities() {
        assert_eq!(decode_entities("a &amp; b &#x41;&#66; &unknown; &"), "a & b AB &unknown; &");
    }

    #[test]
    fn sitemaps() {
        let idx = "<sitemapindex><sitemap><loc>https://x/s1.xml</loc><lastmod>2026-11-14T17:28:41+00:00</lastmod></sitemap><sitemap><loc>https://x/s2.xml</loc></sitemap></sitemapindex>";
        assert!(is_sitemap_index(idx));
        assert_eq!(
            sitemap_blocks(idx, "sitemap"),
            [("https://x/s1.xml".to_string(), "2026-11-14T17:28:41+00:00".to_string()), ("https://x/s2.xml".to_string(), String::new())]
        );
        let set = "<urlset><url>\n<loc>\n https://x/a?b=1&amp;c=2\n</loc><lastmod>d</lastmod><xhtml:link href=\"https://x/other\"/></url></urlset>";
        assert!(!is_sitemap_index(set));
        assert_eq!(sitemap_blocks(set, "url"), [("https://x/a?b=1&c=2".to_string(), "d".to_string())]);
    }
}
