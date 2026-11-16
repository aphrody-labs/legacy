//! Catalogs of the native shell (menu and dialogs): one flat JSON file per locale in `locales/<tag>.json`,
//! English source, `{name}` placeholders. Locales are whatever catalogs are listed in `CATALOGS`; the system
//! locale is negotiated against them, with the source locale as the fallback.
use std::collections::HashMap;
use std::sync::OnceLock;

const SOURCE: &str = "en";
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

/// Best shipped locale for a BCP 47 tag (`fr-FR`, `pt_BR`): exact tag, then language only, then the source locale.
pub fn negotiate(tag: &str) -> &'static str {
    let tag = tag.to_ascii_lowercase().replace('_', "-");
    let language = tag.split('-').next().unwrap_or("");
    let shipped = || CATALOGS.iter().map(|(t, _)| *t);
    shipped().find(|t| *t == tag).or_else(|| shipped().find(|t| *t == language)).unwrap_or(SOURCE)
}

/// Shipped locale closest to the operating system language.
pub fn system_locale() -> &'static str {
    negotiate(&sys_locale::get_locale().unwrap_or_default())
}

/// Message for `key` in `locale`, falling back to the source locale then to the key; `{name}` placeholders from `args`.
pub fn translate(locale: &str, key: &str, args: &[(&str, &str)]) -> String {
    let all = catalogs();
    let mut text = all
        .get(locale)
        .and_then(|c| c.get(key))
        .or_else(|| all.get(SOURCE).and_then(|c| c.get(key)))
        .cloned()
        .unwrap_or_else(|| key.to_owned());
    for (name, value) in args {
        text = text.replace(&format!("{{{name}}}"), value);
    }
    text
}

/// Message in the system language.
pub fn t(key: &str, args: &[(&str, &str)]) -> String {
    translate(system_locale(), key, args)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholders(s: &str) -> Vec<String> {
        let mut v: Vec<String> = s
            .split('{')
            .skip(1)
            .filter_map(|p| p.split_once('}').map(|(n, _)| n.to_owned()))
            .collect();
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
        assert_eq!(negotiate("fr_CA"), "fr");
        assert_eq!(negotiate("en-GB"), "en");
        assert_eq!(negotiate("zz"), SOURCE);
        assert_eq!(negotiate(""), SOURCE);
    }

    #[test]
    fn placeholders_are_filled_and_missing_locales_fall_back() {
        assert!(translate("en", "update.available", &[("version", "1.2.3")]).starts_with("Auto 1.2.3 is available."));
        assert!(translate("fr", "update.available", &[("version", "1.2.3")]).starts_with("Auto 1.2.3 est disponible."));
        assert_eq!(translate("zz", "update.later", &[]), "Later");
        assert_eq!(translate("en", "unknown.key", &[]), "unknown.key");
    }
}
