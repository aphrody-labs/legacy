//! Reads the catalogs shared with `@aphrody/i18n` (`frameworks/i18n-ts/locales/*.json`) and formats their Unicode
//! MessageFormat 2 messages. Locales are the catalogs that exist (discovered at build time for the embedded set,
//! at run time with [`Catalogs::from_dir`]); the source locale comes from `frameworks/i18n-ts/i18n.config.json`.
//! Locale negotiation uses ICU4X likely subtags, plural rules and number formatting come from ICU4X.

mod mf2;

use icu_locale::{Locale, LocaleDirectionality, LocaleExpander};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::OnceLock;

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}

pub type Catalog = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq)]
pub enum Arg {
    Str(String),
    Num(f64),
}

impl From<&str> for Arg {
    fn from(v: &str) -> Self {
        Arg::Str(v.to_owned())
    }
}
impl From<i64> for Arg {
    fn from(v: i64) -> Self {
        Arg::Num(v as f64)
    }
}
impl From<f64> for Arg {
    fn from(v: f64) -> Self {
        Arg::Num(v)
    }
}

pub type Args<'a> = &'a [(&'a str, Arg)];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxError(pub String);

impl std::fmt::Display for SyntaxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "message syntax: {}", self.0)
    }
}
impl std::error::Error for SyntaxError {}

/// Canonical BCP 47 form of a tag (`zh_cn.UTF-8` -> `zh-CN`), or None when it is not a valid tag.
pub fn canonical_tag(tag: &str) -> Option<String> {
    let t = tag.replace('_', "-");
    let t = t.split(['.', '@']).next().unwrap_or_default();
    Locale::try_from_str(t).ok().map(|l| l.to_string())
}

/// Format one MF2 message for `locale`. Unresolved variables render as `{$name}` like the TypeScript side.
pub fn format_message(src: &str, locale: &str, args: Args<'_>) -> Result<String, SyntaxError> {
    let m = mf2::parse(src)?;
    let loc = canonical_tag(locale)
        .and_then(|t| Locale::try_from_str(&t).ok())
        .unwrap_or(Locale::UNKNOWN);
    mf2::format(&m, &loc, args)
}

/// Names of the variables a message reads.
pub fn arg_names(src: &str) -> Result<Vec<String>, SyntaxError> {
    Ok(mf2::arg_names(&mf2::parse(src)?))
}

/// CLDR plural category of `n` in `locale` (ICU4X).
pub fn plural_category(n: f64, locale: &str) -> &'static str {
    let src = ".input {$n :number}\n.match $n\nzero {{zero}}\none {{one}}\ntwo {{two}}\nfew {{few}}\nmany {{many}}\n* {{other}}";
    let out = format_message(src, locale, &[("n", Arg::Num(n))]).unwrap_or_default();
    match out.as_str() {
        "zero" => "zero",
        "one" => "one",
        "two" => "two",
        "few" => "few",
        "many" => "many",
        _ => "other",
    }
}

/// Closest supported locale for one tag: exact, same language+script+region, same language+script, same language
/// (likely subtags from ICU4X, so `zh-Hans-CN` matches `zh-CN`; `zh-TW` falls back to the `zh` catalog).
pub fn match_locale<'a>(tag: &str, supported: &[&'a str]) -> Option<&'a str> {
    let want = Locale::try_from_str(&canonical_tag(tag)?).ok()?;
    let exp = LocaleExpander::new_common();
    let max = |l: &Locale| {
        let mut id = l.id.clone();
        exp.maximize(&mut id);
        id
    };
    let want_max = max(&want);
    let cands: Vec<_> = supported
        .iter()
        .filter_map(|s| Some((*s, Locale::try_from_str(&canonical_tag(s)?).ok()?)))
        .collect();
    if let Some((s, _)) = cands.iter().find(|(_, l)| *l == want) {
        return Some(s);
    }
    let same_lang: Vec<_> = cands.iter().filter(|(_, l)| l.id.language == want.id.language).collect();
    let pick = |f: &dyn Fn(&icu_locale::LanguageIdentifier, &Locale) -> bool| {
        same_lang.iter().find(|(_, l)| f(&max(l), l)).map(|(s, _)| *s)
    };
    pick(&|m, _| m.script == want_max.script && m.region == want_max.region)
        .or_else(|| pick(&|m, _| m.script == want_max.script))
        .or_else(|| pick(&|_, l| l.id.script.is_none() && l.id.region.is_none()))
        .or_else(|| same_lang.first().map(|(s, _)| *s))
}

/// Tags of an Accept-Language header ordered by q (stable on ties); q=0 dropped.
pub fn parse_accept_language(header: &str) -> Vec<String> {
    let mut v: Vec<(f64, usize, String)> = header
        .split(',')
        .enumerate()
        .filter_map(|(i, part)| {
            let mut it = part.trim().split(';');
            let tag = it.next()?.trim();
            let q = it
                .filter_map(|p| {
                    p.trim()
                        .strip_prefix("q=")
                        .or_else(|| p.trim().strip_prefix("Q="))
                })
                .find_map(|x| x.trim().parse::<f64>().ok())
                .unwrap_or(1.0);
            (!tag.is_empty() && q > 0.0).then(|| (q, i, tag.to_owned()))
        })
        .collect();
    v.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
    v.into_iter().map(|e| e.2).collect()
}

/// A set of catalogs plus the locale every other one is translated from.
#[derive(Debug, Clone)]
pub struct Catalogs {
    source: String,
    map: BTreeMap<String, Catalog>,
}

fn source_from_config(raw: &str) -> String {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|v| v.get("sourceLocale")?.as_str().map(str::to_owned))
        .and_then(|t| canonical_tag(&t))
        .unwrap_or_else(|| "en".to_owned())
}

impl Catalogs {
    /// Catalogs embedded at build time from `frameworks/i18n-ts/locales`.
    pub fn embedded() -> &'static Catalogs {
        static C: OnceLock<Catalogs> = OnceLock::new();
        C.get_or_init(|| {
            let mut map = BTreeMap::new();
            for (name, raw) in embedded::EMBEDDED {
                if let Some(l) = canonical_tag(name).filter(|l| l == name) {
                    map.insert(l, serde_json::from_str(raw).expect("embedded catalog is valid JSON"));
                }
            }
            let source = std::env::var("APHRODY_I18N_SOURCE")
                .ok()
                .and_then(|t| canonical_tag(&t))
                .unwrap_or_else(|| source_from_config(embedded::CONFIG));
            Catalogs { source, map }
        })
    }

    /// Catalogs of a directory: every `<bcp47>.json` file; `i18n.config.json` is read from its parent when present.
    pub fn from_dir(dir: &Path) -> std::io::Result<Catalogs> {
        let mut map = BTreeMap::new();
        for e in std::fs::read_dir(dir)? {
            let p = e?.path();
            let Some(stem) = p.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_suffix(".json")) else {
                continue;
            };
            if canonical_tag(stem).as_deref() != Some(stem) {
                continue;
            }
            let cat = serde_json::from_slice(&std::fs::read(&p)?)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{}: {e}", p.display())))?;
            map.insert(stem.to_owned(), cat);
        }
        let source = dir
            .parent()
            .and_then(|d| std::fs::read_to_string(d.join("i18n.config.json")).ok())
            .map(|raw| source_from_config(&raw))
            .unwrap_or_else(|| "en".to_owned());
        Ok(Catalogs { source, map })
    }

    pub fn source_locale(&self) -> &str {
        &self.source
    }

    pub fn locales(&self) -> Vec<&str> {
        self.map.keys().map(String::as_str).collect()
    }

    pub fn get(&self, locale: &str) -> Option<&Catalog> {
        self.map.get(locale)
    }

    pub fn match_locale(&self, tag: &str) -> Option<&str> {
        match_locale(tag, &self.locales())
    }

    /// Pick a locale from an Accept-Language header; falls back to the source locale.
    pub fn negotiate(&self, accept_language: Option<&str>) -> &str {
        let Some(h) = accept_language else { return &self.source };
        for tag in parse_accept_language(h) {
            if tag == "*" {
                return &self.source;
            }
            if let Some(m) = self.match_locale(&tag) {
                return m;
            }
        }
        &self.source
    }
}

/// The embedded catalogs.
pub fn catalogs() -> &'static Catalogs {
    Catalogs::embedded()
}

/// Pick an embedded locale from an Accept-Language header.
pub fn negotiate(accept_language: Option<&str>) -> &'static str {
    catalogs().negotiate(accept_language)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Ltr,
    Rtl,
}

/// Translator bound to a locale, with fallback to the base language, then the source locale, then the key.
#[derive(Debug, Clone)]
pub struct I18n {
    cats: &'static Catalogs,
    locale: String,
}

impl I18n {
    pub fn new(requested: &str) -> Self {
        Self::with(catalogs(), requested)
    }

    pub fn with(cats: &'static Catalogs, requested: &str) -> Self {
        let locale = cats.match_locale(requested).unwrap_or(cats.source_locale()).to_owned();
        Self { cats, locale }
    }

    pub fn from_accept_language(header: Option<&str>) -> Self {
        let cats = catalogs();
        Self { cats, locale: cats.negotiate(header).to_owned() }
    }

    /// Translator for the system language: `env_var` (for example `TV_LANG`) when set, else the OS locale.
    pub fn from_system(env_var: Option<&str>) -> Self {
        let requested = env_var
            .and_then(|v| std::env::var(v).ok())
            .filter(|v| !v.is_empty())
            .or_else(sys_locale::get_locale)
            .unwrap_or_default();
        Self::new(&requested)
    }

    pub fn locale(&self) -> &str {
        &self.locale
    }

    /// Writing direction of the locale (ICU4X script directionality).
    pub fn direction(&self) -> Direction {
        let rtl = Locale::try_from_str(&self.locale)
            .is_ok_and(|l| LocaleDirectionality::new_common().is_right_to_left(&l.id));
        if rtl { Direction::Rtl } else { Direction::Ltr }
    }

    pub fn t(&self, key: &str) -> String {
        self.t_args(key, &[])
    }

    pub fn t_args(&self, key: &str, args: Args<'_>) -> String {
        let base = self.locale.split('-').next().unwrap_or_default();
        for l in [self.locale.as_str(), base, self.cats.source_locale()] {
            if let Some(text) = self.cats.get(l).and_then(|c| c.get(key)) {
                return format_message(text, l, args).unwrap_or_else(|_| key.to_owned());
            }
        }
        key.to_owned()
    }
}
