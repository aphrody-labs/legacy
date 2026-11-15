//! Electron to Tauri/GPUI migration toolkit behind `ay electron <analyze|migrate|optimize|bench>`.
//!
//! - [`source`]: open an app directory, `app.asar` (+ `app.asar.unpacked`) through `aphrody_re::asar`,
//!   detect the Electron version and fuses through `aphrody_re::electron`.
//! - [`scan`] + [`analyze`]: tree-sitter scan of the JavaScript into a [`manifest::Manifest`].
//! - [`map`], [`tauri`], [`gpui`]: construct mapping (1:1 / stubbed / unsupported) and project generators.
//! - [`optimize`], [`bench`]: release profiles + Bun compile flags; hyperfine and CDP measurements.

pub mod analyze;
pub mod bench;
pub mod gpui;
pub mod manifest;
pub mod map;
pub mod migrate;
pub mod optimize;
pub mod scan;
pub mod source;
pub mod tauri;

#[cfg(test)]
mod testutil;
#[cfg(test)]
mod tests;

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Msg(String),
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("asar: {0}")]
    Asar(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn msg(m: impl Into<String>) -> Self {
        Error::Msg(m.into())
    }
}

pub(crate) fn io_err(path: &std::path::Path) -> impl FnOnce(std::io::Error) -> Error + '_ {
    move |source| Error::Io { path: path.to_path_buf(), source }
}

/// Write `contents` at `root/rel`, creating parent directories.
pub(crate) fn write_file(root: &std::path::Path, rel: &str, contents: impl AsRef<[u8]>) -> Result<()> {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(io_err(parent))?;
    }
    std::fs::write(&path, contents).map_err(io_err(&path))
}
