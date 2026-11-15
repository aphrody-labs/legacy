// SPDX-License-Identifier: Apache-2.0
//! `ay brand check`: verifies `packages/design/brand/gen` after `ay brand build`, on the host that built it.
//!
//! - `manifest.json` has the sha256 of `manifest.json.sha256`, and its version and inputs are those of
//!   `brand.toml` and `inputs.lock.json`;
//! - every file of the manifest exists with its size and sha256, and no output directory holds anything else;
//! - every `url(...)` of `fonts/fonts.css` and `symbols/symbols.css` and every `img/srcset.json` entry is a
//!   file of the manifest;
//! - every symbol of `brand.toml` is in `symbols/sprite.svg` (outline and fill);
//! - every glTF validates (`gltf-transform validate`, Khronos validator).
//!
//! Reproducibility is `just brand`: two builds from the same inputs, same manifest sha256.

use super::{Error, Manifest, OUTPUT_DIRS, Result, inputs, read, web::sha256_hex};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

/// What a passing check covered.
#[derive(Debug)]
pub struct Checked {
    pub files: usize,
    pub manifest_sha256: String,
}

/// Relative paths (with `/`) of every file under `dir`.
fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p: PathBuf = e.path();
        if p.is_dir() {
            walk(&p, base, out);
        } else if let Ok(rel) = p.strip_prefix(base) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// Targets of the `url(...)` tokens of a stylesheet.
fn css_urls(css: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = css;
    while let Some(i) = rest.find("url(") {
        let after = &rest[i + 4..];
        let Some(j) = after.find(')') else { break };
        out.push(after[..j].trim().trim_matches(|c| c == '"' || c == '\''));
        rest = &after[j + 1..];
    }
    out
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            for n in chars.by_ref() {
                if n.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// glTF validation: report sections ERROR / WARNING / INFO / HINT, only errors fail (the Khronos validator
/// has no decoder for EXT_meshopt_compression and KHR_texture_basisu and says so as warnings).
fn gltf_problem(path: &Path) -> Option<String> {
    let out = match Command::new("gltf-transform").arg("validate").arg(path).output() {
        Ok(o) => o,
        Err(e) => return Some(format!("gltf-transform: {e} (installed by infra/fleet/bootstrap/fr1.sh, see `ay doctor`)")),
    };
    let text = strip_ansi(&(String::from_utf8_lossy(&out.stdout).into_owned() + &String::from_utf8_lossy(&out.stderr)));
    let clean = text.find("ERROR").is_some_and(|i| text[i..].contains("No errors found"));
    (!out.status.success() || !clean).then(|| format!("{}: gltf-transform validate\n{text}", path.display()))
}

/// Checks `root/packages/design/brand/gen`; the error lists every problem.
pub fn check(root: &Path) -> Result<Checked> {
    let brand_dir = root.join("packages").join("design").join("brand");
    let gen_dir = brand_dir.join("gen");
    let mut bad: Vec<String> = Vec::new();

    let text = read(&gen_dir.join("manifest.json"))?;
    let pinned = read(&gen_dir.join("manifest.json.sha256"))?;
    let pinned = pinned.split_whitespace().next().unwrap_or_default();
    let sha = sha256_hex(text.as_bytes());
    if sha != pinned {
        bad.push(format!("manifest.json sha256 {sha} != manifest.json.sha256 {pinned}"));
    }
    let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| Error::Manifest(format!("gen/manifest.json: {e}")))?;
    let files = manifest.get("files").and_then(|f| f.as_object()).ok_or_else(|| Error::Manifest("gen/manifest.json: files".into()))?;
    let brand = Manifest::load(&brand_dir.join("brand.toml"))?;

    if manifest.get("version").and_then(|v| v.as_u64()) != Some(u64::from(brand.brand.version)) {
        bad.push(format!("manifest version != brand.toml version {}", brand.brand.version));
    }
    let lock = serde_json::to_value(inputs(&brand_dir)?).unwrap_or_default();
    if manifest.get("inputs") != Some(&lock) {
        bad.push("manifest inputs != inputs.lock.json (built from other sources: run `ay assets brand-inputs` and rebuild)".into());
    }

    for (rel, v) in files {
        let path = gen_dir.join(rel);
        match fs::read(&path) {
            Err(_) => bad.push(format!("{rel}: missing")),
            Ok(b) => {
                let size = v.get("size").and_then(|s| s.as_u64());
                let want = v.get("sha256").and_then(|s| s.as_str());
                if size != Some(b.len() as u64) || want != Some(sha256_hex(&b).as_str()) {
                    bad.push(format!("{rel}: size or sha256 differs"));
                }
            }
        }
    }
    let mut present = Vec::new();
    for d in OUTPUT_DIRS.iter().filter(|d| **d != "preview") {
        walk(&gen_dir.join(d), &gen_dir, &mut present);
    }
    present.sort();
    for rel in present.iter().filter(|r| !files.contains_key(r.as_str())) {
        bad.push(format!("{rel}: not in manifest.json"));
    }

    for css in ["fonts/fonts.css", "symbols/symbols.css"] {
        let dir = css.split('/').next().unwrap_or_default();
        match fs::read_to_string(gen_dir.join(css)) {
            Err(_) => bad.push(format!("{css}: missing")),
            Ok(text) => {
                for url in css_urls(&text) {
                    if !files.contains_key(&format!("{dir}/{url}")) {
                        bad.push(format!("{css}: {url} not generated"));
                    }
                }
            }
        }
    }
    if let Ok(text) = fs::read_to_string(gen_dir.join("img/srcset.json")) {
        let srcset: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
        for (key, s) in srcset.as_object().into_iter().flatten() {
            for kind in ["avif", "webp"] {
                for part in s.get(kind).and_then(|v| v.as_str()).unwrap_or_default().split(", ") {
                    let file = part.split(' ').next().unwrap_or_default();
                    if !files.contains_key(file) {
                        bad.push(format!("srcset {key}: {part}"));
                    }
                }
            }
        }
    } else {
        bad.push("img/srcset.json: missing".into());
    }

    let sprite = fs::read_to_string(gen_dir.join("symbols/sprite.svg")).unwrap_or_default();
    for n in brand.symbols.iter().flat_map(|s| &s.names) {
        for id in [n.clone(), format!("{n}-fill")] {
            if !sprite.contains(&format!("<symbol id=\"{id}\"")) {
                bad.push(format!("sprite: {id} missing"));
            }
        }
    }

    for rel in files.keys().filter(|f| f.ends_with(".glb")) {
        bad.extend(gltf_problem(&gen_dir.join(rel)));
    }

    bad.extend(docs_problems(root, &brand));

    if bad.is_empty() { Ok(Checked { files: files.len(), manifest_sha256: sha }) } else { Err(Error::Check(bad)) }
}

/// The published SVGs of `docs/logo` and `docs/icons`: the Bun layout files exist, every SVG has a `viewBox`
/// and an accessible title, and no text is left that would need a font.
fn docs_problems(root: &Path, brand: &Manifest) -> Vec<String> {
    let mut bad = Vec::new();
    let docs = root.join("docs");
    for f in ["logo/logo.svg", "logo/logo.png", "logo/logo-with-wordmark-dark.svg", "logo/logo-with-wordmark-light.svg"] {
        if !docs.join(f).is_file() {
            bad.push(format!("docs/{f}: missing"));
        }
    }
    for p in &brand.product {
        if !docs.join(format!("icons/ecosystem/{}.svg", p.id)).is_file() {
            bad.push(format!("docs/icons/ecosystem/{}.svg: missing", p.id));
        }
    }
    for t in &brand.kinds {
        for f in [format!("icons/{}.svg", t.id), format!("icons/glyphs/{}.svg", t.id)] {
            if !docs.join(&f).is_file() {
                bad.push(format!("docs/{f}: missing"));
            }
        }
    }
    let mut present = Vec::new();
    for d in ["logo", "icons"] {
        walk(&docs.join(d), &docs, &mut present);
    }
    for rel in present.iter().filter(|r| r.ends_with(".svg")) {
        let text = fs::read_to_string(docs.join(rel)).unwrap_or_default();
        if !text.contains("viewBox=") {
            bad.push(format!("docs/{rel}: no viewBox"));
        }
        if !text.contains("<title") {
            bad.push(format!("docs/{rel}: no accessible title"));
        }
        if text.contains("<text") || text.contains("font-family") {
            bad.push(format!("docs/{rel}: text not outlined"));
        }
    }
    bad
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_urls_unquote_and_skip_nothing() {
        let css = "@font-face{src:url(a.woff2) format(\"woff2\")}b{background:url('b.png')}c{d:url( \"c.svg\" )}";
        assert_eq!(css_urls(css), vec!["a.woff2", "b.png", "c.svg"]);
    }

    #[test]
    fn ansi_is_removed() {
        assert_eq!(strip_ansi("\x1b[31mERROR\x1b[0m ok"), "ERROR ok");
    }
}
