//! py2bun: Python 3 -> Bun TypeScript transpiler (parser: ruff_python_parser).
mod emit;
pub mod names;
mod py2;
#[cfg(feature = "python")]
mod pymod;

pub use emit::{transpile, transpile_with, AsyncMode, Diagnostic, Output, Severity};
