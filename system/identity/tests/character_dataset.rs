// SPDX-License-Identifier: Apache-2.0
//! The character dataset parses, every fact has a source that resolves to a URL and a retrieval
//! date, and the files it points at (SVGs, theme tokens, measurements, index) agree with it.

use aphrody_identity::character::{Character, INDEX_MD, Report};
use serde_json::Value;
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn report() -> (Character, Report) {
    let c = Character::bundled().expect("the dataset parses");
    let r = c.validate().unwrap_or_else(|bad| panic!("dataset rules violated:\n{}", bad.join("\n")));
    (c, r)
}

#[test]
fn the_dataset_parses_and_every_item_has_a_resolving_source() {
    let (c, r) = report();
    println!("facts={} colours={} fonts={} svgs={} images={} sources={}", r.facts, r.colours, r.fonts, r.svgs, r.images, r.sources);
    assert!(r.facts >= 100, "facts: {}", r.facts);
    assert!(r.colours >= 20, "colours: {}", r.colours);
    assert!(r.fonts >= 2 && r.svgs >= 3 && r.images >= 10);
    assert!(c.canon.facts.iter().all(|f| !f.sources.is_empty()));
}

#[test]
fn every_fact_cites_a_source_with_a_url_and_a_date() {
    let c = Character::bundled().unwrap();
    for f in &c.canon.facts {
        for id in &f.sources {
            let s = c.sources.sources.iter().find(|s| &s.id == id).unwrap_or_else(|| panic!("{}: unknown source {id}", f.id));
            assert!(s.url.starts_with("https://"), "{}: {id} has no URL", f.id);
            assert_eq!(s.retrieved.len(), 10, "{}: {id} has no retrieval date", f.id);
        }
    }
}

#[test]
fn canon_covers_ja_en_fr_names_teams_and_techniques() {
    let c = Character::bundled().unwrap();
    for lang in ["ja", "en", "fr"] {
        assert!(c.canon.languages.iter().any(|l| l == lang), "language {lang}");
        assert!(c.canon.facts.iter().any(|f| f.category == "name" && f.id.contains(&format!(".{lang}."))), "name fact for {lang}");
    }
    for cat in ["team", "position", "element", "technique", "timeline", "appearance", "stat"] {
        assert!(c.canon.facts.iter().any(|f| f.category == cat), "category {cat}");
    }
    assert!(c.canon.facts.iter().filter(|f| f.category == "technique").count() >= 10);
}

#[test]
fn every_rule_has_a_source_but_a_dangling_one_is_refused() {
    let mut c = Character::bundled().unwrap();
    c.canon.facts[0].sources.clear();
    c.canon.facts[1].sources = vec!["no-such-source".to_owned()];
    let bad = c.validate().expect_err("sourceless and dangling facts are refused");
    assert!(bad.iter().any(|m| m.contains("has no source")));
    assert!(bad.iter().any(|m| m.contains("unknown source no-such-source")));
}

#[test]
fn the_svgs_exist_and_match_their_recorded_hash_and_size() {
    let (c, _) = report();
    for svg in c.visual["svgs"].as_array().unwrap() {
        let path = root().join(svg["path"].as_str().unwrap());
        let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        assert_eq!(bytes.len() as u64, svg["bytes"].as_u64().unwrap(), "{}", path.display());
        assert_eq!(aphrody_identity::sha256_hex(&bytes), svg["sha256"].as_str().unwrap(), "{}", path.display());
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("<svg") && text.contains(svg["viewBox"].as_str().unwrap()));
    }
}

#[test]
fn the_theme_tokens_equal_the_brand_token_file() {
    let (c, _) = report();
    let tokens: Value = serde_json::from_str(&std::fs::read_to_string(root().join("assets/brand/m3-tokens.json")).unwrap()).unwrap();
    for mode in ["light", "dark"] {
        for (k, v) in c.visual["theme"][mode].as_object().unwrap() {
            assert_eq!(&tokens[mode][k], v, "{mode}.{k}");
        }
    }
    assert_eq!(c.visual["theme"]["seed"], tokens["seed"]);
}

#[test]
fn the_measured_colours_match_the_measurement_files() {
    let (c, _) = report();
    let m: Value = serde_json::from_str(&std::fs::read_to_string(root().join("assets/character/measurements/portraits-k12.json")).unwrap()).unwrap();
    let palette = &c.visual["palette"];
    let hexes: Vec<&str> = m["clusters"].as_array().unwrap().iter().map(|x| x["hex"].as_str().unwrap()).collect();
    let got: Vec<&str> = palette["clusters"].as_array().unwrap().iter().map(|x| x["hex"].as_str().unwrap()).collect();
    assert_eq!(hexes, got);
    for (role, v) in m["roles"].as_object().unwrap() {
        let r = palette["roles"].as_array().unwrap().iter().find(|r| r["id"] == format!("role.{role}")).expect("role present");
        assert_eq!(r["hex"], v["hex"], "role {role}");
    }
    assert_eq!(palette["element_accents"].as_array().unwrap().len(), 3);
}

#[test]
fn every_font_has_a_licence_field_and_the_known_ones_are_verified() {
    let (c, _) = report();
    for f in c.visual["fonts"].as_array().unwrap() {
        assert!(f.get("licence").is_some(), "{}", f["name"]);
        assert!(f["licence_status"].as_str().is_some_and(|s| !s.is_empty()), "{}", f["name"]);
    }
    let gsf = c.visual["fonts"].as_array().unwrap().iter().find(|f| f["name"] == "Google Sans Flex").unwrap();
    assert_eq!(gsf["licence"], "SIL OFL 1.1");
}

#[test]
fn the_index_is_current() {
    let (_, r) = report();
    for needle in [
        format!("Facts: {}", r.facts),
        format!("Colours: {}", r.colours),
        format!("Fonts: {}", r.fonts),
        format!("SVGs: {}", r.svgs),
        format!("Sources: {}", r.sources),
    ] {
        assert!(INDEX_MD.contains(&needle), "index.md is stale: missing '{needle}' (run tools/render_character_index.py)");
    }
}

#[test]
fn the_voice_samples_in_other_languages_come_from_sources() {
    let c = Character::bundled().unwrap();
    let voice: Value = serde_json::from_str(aphrody_identity::character::VOICE_JSON).unwrap();
    assert_eq!(voice["source_language"], "en");
    for s in voice["samples"].as_array().unwrap() {
        assert!(s["text"]["en"].as_str().is_some_and(|t| !t.is_empty()), "{}", s["id"]);
        if s["origin"] == "authored" {
            assert!(s["text"].get("ja").is_none() && s["text"].get("fr").is_none(), "authored copy must not carry invented translations: {}", s["id"]);
            assert!(s["derived_from"].as_array().is_some_and(|d| !d.is_empty()));
        }
    }
    assert!(!c.voice.is_empty());
}
