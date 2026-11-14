//! Native Bun plugin for `@aphrody/ghidra`.
//!
//! * `ghidra_on_before_parse` (C ABI, `Bun.build` `onBeforeParse` with `napiModule`/`symbol`): for a stub
//!   file `<name>.ghidra.js` it analyses the binary named by the stub text (or `<name>` itself when the
//!   stub is empty) with `aphrody-re` and emits an ES module with the analysis report.
//! * NAPI functions `analyze(path, maxFunctions)` and `version()` for direct fast-path use from Bun.
#![allow(clippy::missing_safety_doc)]

use aphrody_re::ghidra::{SreAnalyzeOptions, analyze_binary_file};
use bun_native_plugin::{BunLoader, OnBeforeParse, define_bun_plugin};
use napi_derive::napi;
use std::path::{Path, PathBuf};

define_bun_plugin!("aphrody-ghidra");

fn max_functions() -> usize {
    std::env::var("GHIDRA_BUN_MAX_FUNCTIONS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64)
}

/// Analyse `path` and return the report as JSON (plus full-decompiler C when feature `decompile`).
pub fn analyze_json(path: &Path, max_fns: usize) -> Result<String, String> {
    let opts = SreAnalyzeOptions { max_functions: max_fns.max(1), ..SreAnalyzeOptions::default() };
    let rep = analyze_binary_file(path, &opts)?;
    let mut v = serde_json::to_value(&rep).map_err(|e| e.to_string())?;
    #[cfg(feature = "decompile")]
    {
        let mut native = serde_json::Map::new();
        for f in &rep.decompiled_functions {
            if let Ok(c) = aphrody_re::decompile::decompile(path, f.entry_va) {
                native.insert(f.name.clone(), serde_json::Value::String(c));
            }
        }
        v["ghidra_decompiler_c"] = serde_json::Value::Object(native);
    }
    serde_json::to_string(&v).map_err(|e| e.to_string())
}

fn target_for(stub: &Path, text: &str) -> PathBuf {
    let t = text.trim();
    if !t.is_empty() {
        let p = Path::new(t);
        return if p.is_absolute() { p.to_path_buf() } else { stub.parent().unwrap_or(Path::new(".")).join(p) };
    }
    let s = stub.to_string_lossy();
    PathBuf::from(s.strip_suffix(".ghidra.js").or_else(|| s.strip_suffix(".ghidra")).unwrap_or(&s).to_string())
}

fn render_module(report_json: &str) -> String {
    format!(
        "const report = {report_json};\nexport default report;\n\
         export const functions = report.decompiled_functions;\n\
         export const sections = report.sections;\nexport const imports = report.imports;\n\
         export const exports_ = report.exports;\nexport const strings = report.strings_sample;\n\
         export const entry = report.entry_point_va;\n"
    )
}

#[no_mangle]
pub extern "C" fn ghidra_on_before_parse(
    args: *const bun_native_plugin::sys::OnBeforeParseArguments,
    result: *mut bun_native_plugin::sys::OnBeforeParseResult,
) {
    // SAFETY: Bun passes valid pointers for the duration of the call.
    let (args, result) = unsafe { (&*args, &mut *result) };
    let Ok(mut handle) = OnBeforeParse::from_raw(args, result) else { return };
    let Ok(path) = handle.path().map(|p| p.into_owned()) else {
        handle.log_error("ghidra: cannot read path");
        return;
    };
    let text = match handle.input_source_code() {
        Ok(s) => s.into_owned(),
        Err(_) => String::new(),
    };
    let target = target_for(Path::new(&path), &text);
    match analyze_json(&target, max_functions()) {
        Ok(json) => handle.set_output_source_code(render_module(&json), BunLoader::BUN_LOADER_JS),
        Err(e) => handle.log_error(&format!("ghidra: {} : {e}", target.display())),
    }
}

#[napi]
pub fn analyze(path: String, max_functions: Option<u32>) -> napi::Result<String> {
    analyze_json(Path::new(&path), max_functions.unwrap_or(64) as usize).map_err(napi::Error::from_reason)
}

#[napi]
pub fn version() -> String {
    format!("aphrody-ghidra-bun {} decompile={}", env!("CARGO_PKG_VERSION"), cfg!(feature = "decompile"))
}
