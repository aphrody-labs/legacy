//! Catalogs of the console: one flat JSON file per locale in `locales/<tag>.json`, English source, `{name}`
//! placeholders. Locales are whatever catalogs are listed in `CATALOGS`; the page locale is negotiated against them
//! (Accept-Language on the server, the `lang` of the document on the client), with the source locale as fallback.
//! Rust has no `Intl`: sizes and decimal separators come from the catalog (`size.units`, `number.decimal`).
use leptos::prelude::use_context;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const SOURCE: &str = "en";
const CATALOGS: &[(&str, &str)] =
    &[("en", include_str!("../locales/en.json")), ("fr", include_str!("../locales/fr.json"))];

type Catalog = HashMap<String, String>;

fn catalogs() -> &'static HashMap<&'static str, Catalog> {
    static PARSED: OnceLock<HashMap<&'static str, Catalog>> = OnceLock::new();
    PARSED.get_or_init(|| {
        CATALOGS
            .iter()
            .map(|(tag, json)| (*tag, serde_json::from_str(json).expect("catalog is valid JSON")))
            .collect()
    })
}

/// Shipped locale for one BCP 47 tag: exact tag, then language only.
fn shipped(tag: &str) -> Option<&'static str> {
    let tag = tag.trim().to_ascii_lowercase().replace('_', "-");
    let language = tag.split('-').next().unwrap_or("");
    let all = || CATALOGS.iter().map(|(t, _)| *t);
    all().find(|t| *t == tag).or_else(|| all().find(|t| *t == language))
}

/// Best shipped locale for a BCP 47 tag; the source locale when none matches.
pub fn negotiate(tag: &str) -> &'static str {
    shipped(tag).unwrap_or(SOURCE)
}

/// Best shipped locale for an Accept-Language header (quality order); the source locale when none matches.
pub fn negotiate_accept(header: &str) -> &'static str {
    let mut ranked: Vec<(f32, &str)> = header
        .split(',')
        .filter_map(|part| {
            let mut it = part.split(';');
            let tag = it.next()?.trim();
            let q = it.find_map(|p| p.trim().strip_prefix("q=")).and_then(|q| q.parse().ok()).unwrap_or(1.0);
            (!tag.is_empty() && q > 0.0).then_some((q, tag))
        })
        .collect();
    ranked.sort_by(|a, b| b.0.total_cmp(&a.0));
    ranked.into_iter().find_map(|(_, tag)| shipped(tag)).unwrap_or(SOURCE)
}

/// True if `locale` or the source locale has `key`.
pub fn has(locale: &str, key: &str) -> bool {
    let all = catalogs();
    all.get(locale).is_some_and(|c| c.contains_key(key)) || all[SOURCE].contains_key(key)
}

/// Message for `key` in `locale`, falling back to the source locale then to the key; `{name}` placeholders from `args`.
pub fn translate(locale: &str, key: &str, args: &[(&str, &str)]) -> String {
    let all = catalogs();
    let mut text = all
        .get(locale)
        .and_then(|c| c.get(key))
        .or_else(|| all[SOURCE].get(key))
        .cloned()
        .unwrap_or_else(|| key.to_owned());
    for (name, value) in args {
        text = text.replace(&format!("{{{name}}}"), value);
    }
    text
}

/// Locale of the current page, provided as context by `App`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Locale(pub &'static str);

/// Locale of the page being rendered: the request on the server, the `lang` of the document on the client.
pub fn page_locale() -> &'static str {
    #[cfg(feature = "ssr")]
    {
        use axum::http::{header::ACCEPT_LANGUAGE, request::Parts};
        return use_context::<Parts>()
            .and_then(|p| p.headers.get(ACCEPT_LANGUAGE).and_then(|v| v.to_str().ok()).map(negotiate_accept))
            .unwrap_or(SOURCE);
    }
    #[cfg(all(feature = "hydrate", not(feature = "ssr")))]
    {
        return leptos::prelude::document()
            .document_element()
            .and_then(|e| e.get_attribute("lang"))
            .map(|l| negotiate(&l))
            .unwrap_or(SOURCE);
    }
    #[cfg(not(any(feature = "ssr", feature = "hydrate")))]
    SOURCE
}

/// Locale of the current page (context set by `App`), else the source locale.
pub fn current() -> &'static str {
    use_context::<Locale>().map(|l| l.0).unwrap_or(SOURCE)
}

/// Message in the current page locale.
pub fn t(key: &str, args: &[(&str, &str)]) -> String {
    translate(current(), key, args)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholders(s: &str) -> Vec<String> {
        let mut v: Vec<String> =
            s.split('{').skip(1).filter_map(|p| p.split_once('}').map(|(n, _)| n.to_owned())).collect();
        v.sort();
        v
    }

    #[test]
    fn every_catalog_has_the_keys_and_placeholders_of_the_source() {
        let all = catalogs();
        let source = &all[SOURCE];
        for (tag, cat) in all {
            let mut a: Vec<_> = cat.keys().collect();
            let mut b: Vec<_> = source.keys().collect();
            a.sort();
            b.sort();
            assert_eq!(a, b, "{tag}");
            for (k, v) in cat {
                assert_eq!(placeholders(v), placeholders(&source[k]), "{tag}:{k}");
            }
        }
    }

    #[test]
    fn negotiation_follows_the_shipped_catalogs() {
        assert_eq!(negotiate("fr-FR"), "fr");
        assert_eq!(negotiate("zz"), SOURCE);
        assert_eq!(negotiate_accept("de;q=0.9, fr-CA;q=0.8, en;q=0.4"), "fr");
        assert_eq!(negotiate_accept("en;q=0.2, fr;q=0.9"), "fr");
        assert_eq!(negotiate_accept("zz, *;q=0.1"), SOURCE);
        assert_eq!(negotiate_accept(""), SOURCE);
    }

    #[test]
    fn placeholders_are_filled_and_missing_locales_fall_back() {
        assert_eq!(translate("en", "summary.down", &[("name", "n8n")]), "n8n is down.");
        assert_eq!(translate("fr", "summary.down", &[("name", "n8n")]), "n8n est en panne.");
        assert_eq!(translate("zz", "logout", &[]), "Sign out");
        assert_eq!(translate("en", "nope", &[]), "nope");
        assert!(has("fr", "state.running") && !has("fr", "nope"));
    }
}
