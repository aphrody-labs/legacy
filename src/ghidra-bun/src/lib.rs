//! Native Bun plugin for `@aphrody/ghidra`.
//!
//! * `ghidra_on_before_parse` (C ABI, `Bun.build` `onBeforeParse` with `napiModule`/`symbol`): for a stub
//!   file `<name>.ghidra.js` it analyses the binary named by the stub text (or `<name>` itself when the
//!   stub is empty) with `aphrody-re` and emits an ES module with the analysis report.
//! * The `onBeforeParse` stub module exports `default functions sections imports exports_ strings entry`;
//!   the `?ghidra` Bun plugin (`frameworks/re-ts/ghidra/src/plugin.ts`) exports a different, JVM-backed set.
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
    let opts = SreAnalyzeOptions { max_functions: max_fns, ..SreAnalyzeOptions::default() };
    let rep = analyze_binary_file(path, &opts)?;
    #[allow(unused_mut)]
    let mut v = serde_json::to_value(&rep).map_err(|e| e.to_string())?;
    #[cfg(feature = "decompile")]
    {
        // keyed by `name@address` (same-name overloads must not collapse); failures are reported, not dropped
        let mut native = serde_json::Map::new();
        let mut errors = serde_json::Map::new();
        let addrs: Vec<u64> = rep.decompiled_functions.iter().map(|f| f.entry_va).collect();
        let results = aphrody_re::decompile::decompile_many(path, &addrs);
        for (f, (_, r)) in rep.decompiled_functions.iter().zip(results) {
            let key = format!("{}@{:#x}", f.name, f.entry_va);
            match r {
                Ok(c) => {
                    native.insert(key, serde_json::Value::String(c));
                }
                Err(e) => {
                    errors.insert(key, serde_json::Value::String(e.to_string()));
                }
            }
        }
        v["ghidra_decompiler_c"] = serde_json::Value::Object(native);
        v["ghidra_decompiler_errors"] = serde_json::Value::Object(errors);
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
    args: *mut bun_native_plugin::sys::OnBeforeParseArguments,
    result: *mut bun_native_plugin::sys::OnBeforeParseResult,
) {
    // a panic must not unwind across the C boundary
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| on_before_parse(args, result)));
}

fn on_before_parse(
    args: *mut bun_native_plugin::sys::OnBeforeParseArguments,
    result: *mut bun_native_plugin::sys::OnBeforeParseResult,
) {
    let Ok(mut handle) = OnBeforeParse::from_raw(args, result) else { return };
    let Ok(path) = handle.path().map(|p| p.into_owned()) else {
        handle.log_error("ghidra: cannot read path");
        return;
    };
    let text = match handle.input_source_code() {
        Ok(s) => s.into_owned(),
        Err(e) => {
            handle.log_error(&format!("ghidra: cannot read stub source: {e}"));
            return;
        }
    };
    let target = target_for(Path::new(&path), &text);
    match analyze_json(&target, max_functions()) {
        Ok(json) => handle.set_output_source_code(render_module(&json), BunLoader::BUN_LOADER_JS),
        Err(e) => handle.log_error(&format!("ghidra: {} : {e}", target.display())),
    }
}

#[napi]
pub fn analyze(path: String, max_functions: Option<u32>) -> napi::Result<String> {
    let n = max_functions.map(|n| n as usize).unwrap_or_else(self::max_functions);
    std::panic::catch_unwind(|| analyze_json(Path::new(&path), n))
        .map_err(|_| napi::Error::from_reason("ghidra: analysis panicked".to_string()))?
        .map_err(napi::Error::from_reason)
}

#[napi]
pub fn version() -> String {
    format!("{} {} decompile={}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"), cfg!(feature = "decompile"))
}
