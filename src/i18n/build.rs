//! Discovers the catalogs shipped in `packages/i18n/locales` at build time (no locale list in the source):
//! every `<bcp47>.json` file is embedded, plus `packages/i18n/i18n.config.json`.
use std::{env, fs, path::PathBuf};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let pkg = manifest.join("../../packages/i18n").canonicalize().expect("packages/i18n exists");
    let locales = pkg.join("locales");
    println!("cargo:rerun-if-changed={}", locales.display());
    println!("cargo:rerun-if-changed={}", pkg.join("i18n.config.json").display());

    let mut names: Vec<String> = fs::read_dir(&locales)
        .expect("packages/i18n/locales exists")
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let n = e.file_name().into_string().ok()?;
            let stem = n.strip_suffix(".json")?;
            let ok = !stem.is_empty() && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
            ok.then(|| stem.to_owned())
        })
        .collect();
    names.sort();

    let esc = |p: PathBuf| p.display().to_string().replace('\\', "/");
    let mut out = String::from("pub const EMBEDDED: &[(&str, &str)] = &[\n");
    for n in &names {
        out += &format!("    ({n:?}, include_str!({:?})),\n", esc(locales.join(format!("{n}.json"))));
    }
    out += "];\n";
    out += &format!(
        "pub const CONFIG: &str = include_str!({:?});\n",
        esc(pkg.join("i18n.config.json"))
    );
    fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("embedded.rs"), out).unwrap();
}
