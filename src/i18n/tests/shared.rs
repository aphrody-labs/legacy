use aphrody_i18n::*;
use std::collections::BTreeSet;

fn fixtures() -> Vec<serde_json::Value> {
    let raw = include_str!("../../../frameworks/i18n-ts/tests/fixtures/format.json");
    serde_json::from_str(raw).unwrap()
}

#[test]
fn shared_fixtures_match_typescript() {
    for f in fixtures() {
        let args: Vec<(&str, Arg)> = f["args"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| {
                let a = match v {
                    serde_json::Value::Number(n) => Arg::Num(n.as_f64().unwrap()),
                    other => Arg::Str(other.as_str().unwrap().to_owned()),
                };
                (k.as_str(), a)
            })
            .collect();
        let got =
            I18n::new(f["locale"].as_str().unwrap()).t_args(f["key"].as_str().unwrap(), &args);
        assert_eq!(got, f["out"].as_str().unwrap(), "{f}");
    }
}

#[test]
fn locales_are_the_catalogs_present() {
    let c = catalogs();
    assert_eq!(c.source_locale(), "en");
    let dir = std::fs::read_dir("../../packages/i18n/locales")
        .unwrap()
        .filter_map(|e| e.ok()?.file_name().into_string().ok()?.strip_suffix(".json").map(str::to_owned))
        .collect::<BTreeSet<_>>();
    assert_eq!(c.locales().into_iter().map(str::to_owned).collect::<BTreeSet<_>>(), dir);
    let from_dir = Catalogs::from_dir(std::path::Path::new("../../packages/i18n/locales")).unwrap();
    assert_eq!(from_dir.locales(), c.locales());
}

#[test]
fn no_locale_has_keys_the_source_lacks() {
    let c = catalogs();
    let en: BTreeSet<_> = c.get(c.source_locale()).unwrap().keys().collect();
    for l in c.locales() {
        let k: BTreeSet<_> = c.get(l).unwrap().keys().collect();
        assert!(k.is_subset(&en), "{l}: {:?}", k.difference(&en).collect::<Vec<_>>());
    }
}

#[test]
fn tv_catalog_plurals_follow_cldr() {
    let n = |lang: &str, v: i64| I18n::new(lang).t_args("tv.streams-count", &[("count", v.into())]);
    assert_eq!(n("en-US", 1), "1 stream");
    assert_eq!(n("en-US", 3), "3 streams");
    assert_eq!(n("fr-FR", 1), "1 flux");
    assert_eq!(n("ru-RU", 2), "2 потока");
    assert_eq!(n("ru-RU", 5), "5 потоков");
    assert_eq!(n("pl-PL", 22), "22 strumienie");
    assert_eq!(n("ar", 2), "دفقان");
}

#[test]
fn direction_and_system_language() {
    assert_eq!(I18n::new("ar-MA").direction(), Direction::Rtl);
    assert_eq!(I18n::new("fr").direction(), Direction::Ltr);
    assert_eq!(I18n::new("xx").locale(), "en");
    assert_eq!(I18n::new("fr_CA.UTF-8").locale(), "fr");
    assert_eq!(I18n::new("pt-PT").locale(), "pt");
}

#[test]
fn every_tv_key_resolves_in_every_locale() {
    let c = catalogs();
    for l in c.locales() {
        let i = I18n::new(l);
        for k in c.get("en").unwrap().keys().filter(|k| k.starts_with("tv.")) {
            let v = i.t_args(k, &[("count", 2.into())]);
            assert!(!v.is_empty() && v != *k, "{l}/{k}");
        }
    }
}

#[test]
fn every_message_parses_and_matches_en_placeholders() {
    let c = catalogs();
    for l in c.locales() {
        for (k, v) in c.get(l).unwrap() {
            let got = arg_names(v).unwrap_or_else(|e| panic!("{l}/{k}: {e}"));
            let want = arg_names(&c.get("en").unwrap()[k]).unwrap();
            assert_eq!(got, want, "{l}/{k}");
            format_message(v, l, &[]).unwrap_or_else(|e| panic!("{l}/{k}: {e}"));
        }
    }
}

#[test]
fn negotiation() {
    assert_eq!(negotiate(Some("fr-CH, fr;q=0.9, en;q=0.8")), "fr");
    assert_eq!(negotiate(Some("zh-Hans-CN,zh;q=0.9")), "zh-CN");
    assert_eq!(negotiate(Some("zh-TW")), "zh-CN");
    assert_eq!(negotiate(Some("sw, es;q=0.5")), "es");
    assert_eq!(negotiate(Some("sw")), "en");
    assert_eq!(negotiate(Some("*")), "en");
    assert_eq!(negotiate(None), "en");
    assert_eq!(negotiate(Some("es_MX.UTF-8")), "es");
    assert_eq!(
        parse_accept_language("fr;q=0.5, ja, en;q=0.1, de;q=0"),
        ["ja", "fr", "en"]
    );
    let set = ["en", "fr", "pt-BR"];
    assert_eq!(match_locale("pt-PT", &set), Some("pt-BR"));
    assert_eq!(match_locale("xx", &set), None);
}

const PLURAL: &str = ".input {$n :number}\n.match $n\n0 {{none}}\none {{{$n} item}}\n* {{{$n} items}}";

#[test]
fn mf2_matches_the_typescript_cases() {
    let n = |v: i64| [("n", Arg::from(v))];
    assert_eq!(format_message(PLURAL, "en", &n(0)).unwrap(), "none");
    assert_eq!(format_message(PLURAL, "en", &n(1)).unwrap(), "1 item");
    assert_eq!(format_message(PLURAL, "en", &n(1234)).unwrap(), "1,234 items");
    let fr = ".input {$n :number}\n.match $n\none {{{$n} fichier}}\n* {{{$n} fichiers}}";
    assert_eq!(format_message(fr, "fr", &n(0)).unwrap(), "0 fichier");
    assert_eq!(format_message(fr, "fr", &n(2)).unwrap(), "2 fichiers");
    let sel = ".input {$g :string}\n.match $g\nf {{elle}}\n* {{iel}}";
    assert_eq!(format_message(sel, "en", &[("g", "f".into())]).unwrap(), "elle");
    assert_eq!(format_message(sel, "en", &[("g", "q".into())]).unwrap(), "iel");
    assert_eq!(format_message("Hi {$name}", "en", &[]).unwrap(), "Hi {$name}");
    assert_eq!(format_message("it's \\{x\\}", "en", &[]).unwrap(), "it's {x}");
    assert_eq!(
        format_message(".local $x = {$a}\n{{{$x} {$b}}}", "en", &[("a", "1".into()), ("b", "2".into())]).unwrap(),
        "1 2"
    );
}

#[test]
fn plural_categories_come_from_cldr() {
    assert_eq!(plural_category(1.0, "en"), "one");
    assert_eq!(plural_category(0.0, "fr"), "one");
    assert_eq!(plural_category(5.0, "ja"), "other");
    assert_eq!(plural_category(3.0, "ar"), "few");
    assert_eq!(plural_category(2.0, "ar"), "two");
}

#[test]
fn syntax_errors_and_unsupported_features_are_rejected() {
    for bad in [
        "{$n",
        "{$n :number",
        "a } b",
        ".match $n\n* {{x}}",
        ".input {$n}\n.match $n\none {{x}}",
        "{$d :date}",
        "{$n :number minimumFractionDigits=2}",
        "{#b}x{/b}",
    ] {
        let r = format_message(bad, "en", &[("n", Arg::Num(1.0))]);
        assert!(r.is_err(), "{bad}: {r:?}");
    }
}
