//! PyO3 module `py2bun._py2bun` (abi3): `transpile(source) -> str`.
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

fn parse_mode(m: &str) -> PyResult<crate::AsyncMode> {
    match m {
        "auto" => Ok(crate::AsyncMode::Auto),
        "async" => Ok(crate::AsyncMode::On),
        "sync" => Ok(crate::AsyncMode::Off),
        _ => Err(PyValueError::new_err("mode must be 'auto', 'async' or 'sync'")),
    }
}

/// Transpile Python 3 source to Bun TypeScript. Raises ValueError on a syntax error;
/// other diagnostics are embedded as `// py2bun ...` header comments (see
/// `transpile_with_diagnostics`). `mode`: "auto" (async when the script uses Ghidra), "async", "sync".
#[pyfunction]
#[pyo3(signature = (source, mode="auto"))]
fn transpile(source: &str, mode: &str) -> PyResult<String> {
    let o = crate::transpile_with(source, parse_mode(mode)?);
    if o.ts.is_empty() {
        let m = o.diagnostics.first().map(|d| d.to_string()).unwrap_or_default();
        return Err(PyValueError::new_err(m));
    }
    Ok(o.ts)
}

/// Returns (ts, [(line, col, severity, message)]); `ts` is "" on a syntax error.
#[pyfunction]
#[pyo3(signature = (source, mode="auto"))]
fn transpile_with_diagnostics(source: &str, mode: &str) -> PyResult<(String, Vec<(usize, usize, String, String)>)> {
    let o = crate::transpile_with(source, parse_mode(mode)?);
    let d = o
        .diagnostics
        .into_iter()
        .map(|d| {
            let s = if d.severity == crate::Severity::Error { "error" } else { "warning" };
            (d.line, d.col, s.to_string(), d.message)
        })
        .collect();
    Ok((o.ts, d))
}

#[pymodule]
#[pyo3(name = "_py2bun")]
fn py2bun_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(transpile, m)?)?;
    m.add_function(wrap_pyfunction!(transpile_with_diagnostics, m)?)?;
    Ok(())
}
