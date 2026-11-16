// SPDX-License-Identifier: Apache-2.0
//! The versioned character dataset: canon, soul, voice and visual identity of Byron Love
//! (Aphrody), with a registry of sources.
//!
//! The JSON files live in `assets/character/` and are embedded. Every item that states something
//! (a canon fact, a soul item, a voice rule, a sample line, a measured colour, a font, an SVG, an
//! image) carries `sources`, a list of ids of the registry in `sources.json`; [`Character::validate`]
//! refuses an item without a source, an unknown id, or a registry entry without URL or date.

use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// `sources.json`: the registry of sources every other file cites.
pub const SOURCES_JSON: &str = include_str!("../assets/character/sources.json");
/// `canon.json`: names, identity, teams, positions, element, stats, techniques, timeline.
pub const CANON_JSON: &str = include_str!("../assets/character/canon.json");
/// `soul.json`: personality, values, arc.
pub const SOUL_JSON: &str = include_str!("../assets/character/soul.json");
/// `voice.json`: tone, lexicon, do and don't, sample lines.
pub const VOICE_JSON: &str = include_str!("../assets/character/voice.json");
/// `visual.json`: measured palette, theme tokens, fonts, SVGs, image references.
pub const VISUAL_JSON: &str = include_str!("../assets/character/visual.json");
/// `merge.json`: what was merged, deduplicated, in conflict, or unsourced.
pub const MERGE_JSON: &str = include_str!("../assets/character/merge.json");
/// `index.md`: the readable index generated from the JSON files.
pub const INDEX_MD: &str = include_str!("../assets/character/index.md");

/// Header shared by every dataset file.
#[derive(Debug, Clone, Deserialize)]
pub struct Header {
    /// `aphrody.character.<name>`.
    pub schema: String,
    /// Schema version, bumped on a breaking change.
    pub schema_version: u32,
    /// Version of the dataset content (semver).
    pub dataset_version: String,
    /// Character slug.
    pub character: String,
    /// Date the file was generated (ISO 8601).
    pub generated: String,
}

/// One entry of the source registry.
#[derive(Debug, Clone, Deserialize)]
pub struct Source {
    /// Id cited by the other files.
    pub id: String,
    /// `web`, `repo` or `derived`.
    pub kind: String,
    /// Human title.
    pub title: String,
    /// Source URL.
    pub url: String,
    /// Retrieval date (ISO 8601).
    pub retrieved: String,
}

/// The source registry.
#[derive(Debug, Clone, Deserialize)]
pub struct Sources {
    /// File header.
    #[serde(flatten)]
    pub header: Header,
    /// The entries.
    pub sources: Vec<Source>,
}

/// A canon fact.
#[derive(Debug, Clone, Deserialize)]
pub struct Fact {
    /// Unique id, `<category>.<slug>`.
    pub id: String,
    /// Category (name, identity, team, technique, timeline...).
    pub category: String,
    /// English statement.
    pub text: String,
    /// Structured value.
    pub value: Value,
    /// Ids of the cited sources.
    pub sources: Vec<String>,
    /// `official`, `game-data`, `community`, `derived`, `inferred` or `internal`.
    pub confidence: String,
    /// Translations present in the sources.
    #[serde(default)]
    pub i18n: BTreeMap<String, String>,
}

/// `canon.json`.
#[derive(Debug, Clone, Deserialize)]
pub struct Canon {
    /// File header.
    #[serde(flatten)]
    pub header: Header,
    /// Languages present in the sources.
    pub languages: Vec<String>,
    /// The facts.
    pub facts: Vec<Fact>,
}

/// Any other item: a soul item, a voice rule, a lexicon term or a sample line.
#[derive(Debug, Clone, Deserialize)]
pub struct Cited {
    /// Id (lexicon terms use the term).
    #[serde(alias = "term")]
    pub id: String,
    /// Ids of the cited sources.
    pub sources: Vec<String>,
}

/// Whole dataset, parsed.
#[derive(Debug, Clone)]
pub struct Character {
    /// Source registry.
    pub sources: Sources,
    /// Canon facts.
    pub canon: Canon,
    /// Soul items.
    pub soul: Vec<Cited>,
    /// Voice rules, lexicon terms and samples.
    pub voice: Vec<Cited>,
    /// The visual file, as JSON.
    pub visual: Value,
    /// The merge log, as JSON.
    pub merge: Value,
    headers: Vec<Header>,
}

/// Counts reported by a successful [`Character::validate`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    /// Canon facts.
    pub facts: usize,
    /// Measured colours (roles, clusters, element accents, atlas hues).
    pub colours: usize,
    /// Fonts.
    pub fonts: usize,
    /// SVG assets.
    pub svgs: usize,
    /// Image references.
    pub images: usize,
    /// Registry entries.
    pub sources: usize,
}

/// Dataset error.
#[derive(Debug, thiserror::Error)]
pub enum CharacterError {
    /// A file does not parse.
    #[error("{file}: {error}")]
    Parse {
        /// File name.
        file: &'static str,
        /// Parser message.
        error: String,
    },
}

fn parse<T: for<'de> Deserialize<'de>>(file: &'static str, text: &str) -> Result<T, CharacterError> {
    serde_json::from_str(text).map_err(|e| CharacterError::Parse { file, error: e.to_string() })
}

fn cited_in(file: &'static str, text: &str, keys: &[&str]) -> Result<(Header, Vec<Cited>), CharacterError> {
    let v: Value = parse(file, text)?;
    let header: Header = serde_json::from_value(v.clone()).map_err(|e| CharacterError::Parse { file, error: e.to_string() })?;
    let mut out = Vec::new();
    for key in keys {
        let arr = v.get(*key).and_then(Value::as_array).cloned().unwrap_or_default();
        for item in arr {
            out.push(serde_json::from_value(item).map_err(|e| CharacterError::Parse { file, error: format!("{key}: {e}") })?);
        }
    }
    Ok((header, out))
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn is_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

impl Character {
    /// Parse the embedded dataset.
    ///
    /// # Errors
    /// A file is not valid JSON or does not match its schema.
    pub fn bundled() -> Result<Self, CharacterError> {
        let sources: Sources = parse("sources.json", SOURCES_JSON)?;
        let canon: Canon = parse("canon.json", CANON_JSON)?;
        let (h_soul, soul) = cited_in("soul.json", SOUL_JSON, &["items"])?;
        let (h_voice, voice) = cited_in("voice.json", VOICE_JSON, &["rules", "lexicon", "samples"])?;
        let visual: Value = parse("visual.json", VISUAL_JSON)?;
        let merge: Value = parse("merge.json", MERGE_JSON)?;
        let h_visual: Header = serde_json::from_value(visual.clone()).map_err(|e| CharacterError::Parse { file: "visual.json", error: e.to_string() })?;
        let h_merge: Header = serde_json::from_value(merge.clone()).map_err(|e| CharacterError::Parse { file: "merge.json", error: e.to_string() })?;
        let headers = vec![sources.header.clone(), canon.header.clone(), h_soul, h_voice, h_visual, h_merge];
        Ok(Self { sources, canon, soul, voice, visual, merge, headers })
    }

    /// Check the dataset and return its counts, or every problem found.
    ///
    /// # Errors
    /// The list of violated rules: a missing source, an unknown source id, a registry entry
    /// without URL or retrieval date, mismatched versions, an invalid colour.
    pub fn validate(&self) -> Result<Report, Vec<String>> {
        let mut bad = Vec::new();
        let first = &self.headers[0];
        for h in &self.headers {
            if h.schema_version != first.schema_version || h.dataset_version != first.dataset_version || h.character != first.character {
                bad.push(format!("header of {} differs from sources.json", h.schema));
            }
            if !is_date(&h.generated) {
                bad.push(format!("{}: generated is not a date", h.schema));
            }
        }
        let mut ids = BTreeSet::new();
        for s in &self.sources.sources {
            if !ids.insert(s.id.as_str()) {
                bad.push(format!("duplicate source id {}", s.id));
            }
            if !s.url.starts_with("https://") {
                bad.push(format!("source {} has no https URL", s.id));
            }
            if !is_date(&s.retrieved) {
                bad.push(format!("source {} has no retrieval date", s.id));
            }
        }
        let check = |what: &str, id: &str, sources: &[String], bad: &mut Vec<String>| {
            if sources.is_empty() {
                bad.push(format!("{what} {id} has no source"));
            }
            for s in sources {
                if !ids.contains(s.as_str()) {
                    bad.push(format!("{what} {id} cites unknown source {s}"));
                }
            }
        };
        let mut fact_ids = BTreeSet::new();
        for f in &self.canon.facts {
            if !fact_ids.insert(f.id.as_str()) {
                bad.push(format!("duplicate fact id {}", f.id));
            }
            if f.text.trim().is_empty() {
                bad.push(format!("fact {} has no text", f.id));
            }
            check("fact", &f.id, &f.sources, &mut bad);
        }
        for c in &self.soul {
            check("soul item", &c.id, &c.sources, &mut bad);
        }
        for c in &self.voice {
            check("voice item", &c.id, &c.sources, &mut bad);
        }
        let list = |key: &str| self.visual.pointer(key).and_then(Value::as_array).cloned().unwrap_or_default();
        let mut colours = 0;
        for key in ["/palette/roles", "/palette/clusters", "/palette/element_accents", "/palette/atlas_hues"] {
            for c in list(key) {
                colours += 1;
                let id = c["id"].as_str().unwrap_or("?").to_owned();
                if !c["hex"].as_str().is_some_and(is_hex) {
                    bad.push(format!("colour {id} has an invalid hex"));
                }
                if c["how"].as_str().is_none_or(str::is_empty) {
                    bad.push(format!("colour {id} does not say how it was measured"));
                }
                let s: Vec<String> = c["sources"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect()).unwrap_or_default();
                check("colour", &id, &s, &mut bad);
            }
        }
        let mut counts = [0usize; 3];
        for (slot, key) in ["/fonts", "/svgs", "/images"].iter().enumerate() {
            for item in list(key) {
                counts[slot] += 1;
                let id = item["id"].as_str().unwrap_or("?").to_owned();
                let s: Vec<String> = item["sources"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect()).unwrap_or_default();
                check(&key[1..], &id, &s, &mut bad);
                if *key == "/fonts" && item.get("licence").is_none() {
                    bad.push(format!("font {id} has no licence field"));
                }
            }
        }
        for mode in ["light", "dark"] {
            let ok = self.visual.pointer(&format!("/theme/{mode}")).and_then(Value::as_object).is_some_and(|m| !m.is_empty() && m.values().all(|v| v.as_str().is_some_and(is_hex)));
            if !ok {
                bad.push(format!("theme {mode} tokens are missing or not hex"));
            }
        }
        if bad.is_empty() {
            Ok(Report { facts: self.canon.facts.len(), colours, fonts: counts[0], svgs: counts[1], images: counts[2], sources: self.sources.sources.len() })
        } else {
            Err(bad)
        }
    }
}
