//! py2bun: Python 3 -> Bun TypeScript transpiler (parser: ruff_python_parser).
mod emit;
pub mod names;
#[cfg(feature = "python")]
mod pymod;

pub use emit::{transpile, Diagnostic, Output, Severity};
