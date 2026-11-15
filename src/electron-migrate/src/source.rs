//! Input handling: an app directory, an install directory, or an `app.asar`.
//! ASAR parsing is `aphrody_re::asar`; the Electron version and fuses come from `aphrody_re::electron`.
//! Only the application bundle is read (resources + executable bytes for version detection); no profile data.

use crate::manifest::{ElectronInfo, Packaging};
use crate::{Error, Result, io_err};
use aphrody_re::{asar, electron};
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct FileRef {
    /// POSIX path relative to the app root.
    pub path: String,
    pub size: u64,
    pub unpacked: bool,
    offset: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Asar,
    Dir,
}

pub struct Source {
    pub input: PathBuf,
    pub kind: Kind,
    pub asar_path: Option<PathBuf>,
    pub unpacked_dir: Option<PathBuf>,
    /// Plain-directory app root (`Kind::Dir`).
    pub dir_root: Option<PathBuf>,
    /// Directory holding the Electron executable (`resources/` parent), when known.
    pub install_dir: Option<PathBuf>,
    asar: Vec<u8>,
    data_start: usize,
    files: Vec<FileRef>,
}

/// Largest Electron executable read for version/fuse detection.
const MAX_EXE_BYTES: u64 = 640 * 1024 * 1024;
const MIN_EXE_BYTES: u64 = 30 * 1024 * 1024;

impl Source {
    pub fn open(input: &Path) -> Result<Source> {
        let meta = std::fs::metadata(input).map_err(io_err(input))?;
        if meta.is_file() {
            return Self::open_asar(input, input);
        }
        for rel in ["resources/app.asar", "Resources/app.asar", "Contents/Resources/app.asar", "app.asar"] {
            let p = input.join(rel);
            if p.is_file() {
                return Self::open_asar(input, &p);
            }
        }
        for rel in ["resources/app", "Resources/app", "Contents/Resources/app"] {
            let p = input.join(rel);
            if p.join("package.json").is_file() {
                return Self::open_dir(input, &p);
            }
        }
        if input.join("package.json").is_file() {
            return Self::open_dir(input, input);
        }
        // Squirrel.Windows layout: <root>/app-<version>/resources/app.asar. Highest path wins.
        let mut found: Vec<PathBuf> = WalkDir::new(input)
            .max_depth(4)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && e.file_name() == "app.asar")
            .map(|e| e.into_path())
            .collect();
        found.sort();
        match found.pop() {
            Some(p) => Self::open_asar(input, &p),
            None => Err(Error::msg(format!(
                "{}: no app.asar, resources/app or package.json found",
                input.display()
            ))),
        }
    }

    fn open_asar(input: &Path, asar_path: &Path) -> Result<Source> {
        let bytes = std::fs::read(asar_path).map_err(io_err(asar_path))?;
        let entries = asar::list(&bytes).map_err(|e| Error::Asar(format!("{}: {e}", asar_path.display())))?;
        // Data starts after the two outer u32 fields and the pickle payload (see aphrody_re::asar docs).
        let payload = bytes
            .get(4..8)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
            .ok_or_else(|| Error::Asar("truncated header".into()))?;
        let data_start = 8usize.saturating_add(payload);
        let files = entries
            .into_iter()
            .filter(|e| !e.is_dir)
            .map(|e| FileRef { path: e.path, size: e.size, unpacked: e.unpacked, offset: e.offset })
            .collect();
        let unpacked = PathBuf::from(format!("{}.unpacked", asar_path.display()));
        let install_dir = asar_path.parent().and_then(Path::parent).map(Path::to_path_buf);
        Ok(Source {
            input: input.to_path_buf(),
            kind: Kind::Asar,
            asar_path: Some(asar_path.to_path_buf()),
            unpacked_dir: unpacked.is_dir().then_some(unpacked),
            dir_root: None,
            install_dir,
            asar: bytes,
            data_start,
            files,
        })
    }

    fn open_dir(input: &Path, root: &Path) -> Result<Source> {
        let mut files = Vec::new();
        for entry in WalkDir::new(root).into_iter().filter_entry(|e| e.file_name() != ".git").filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(rel) = entry.path().strip_prefix(root) else { continue };
            let path = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            files.push(FileRef { path, size, unpacked: false, offset: 0 });
        }
        files.sort_by(|a, b| a.path.cmp(&b.path));
        let install_dir = if root == input {
            Some(root.to_path_buf())
        } else {
            root.parent().and_then(Path::parent).map(Path::to_path_buf)
        };
        Ok(Source {
            input: input.to_path_buf(),
            kind: Kind::Dir,
            asar_path: None,
            unpacked_dir: None,
            dir_root: Some(root.to_path_buf()),
            install_dir,
            asar: Vec::new(),
            data_start: 0,
            files,
        })
    }

    pub fn files(&self) -> &[FileRef] {
        &self.files
    }

    pub fn find(&self, path: &str) -> Option<&FileRef> {
        self.files.iter().find(|f| f.path == path)
    }

    pub fn read(&self, f: &FileRef) -> Result<Vec<u8>> {
        match self.kind {
            Kind::Dir => {
                let root = self.dir_root.as_ref().ok_or_else(|| Error::msg("no dir root"))?;
                let p = root.join(&f.path);
                std::fs::read(&p).map_err(io_err(&p))
            }
            Kind::Asar if f.unpacked => {
                let dir = self
                    .unpacked_dir
                    .as_ref()
                    .ok_or_else(|| Error::msg(format!("{}: unpacked file but no .unpacked directory", f.path)))?;
                let p = dir.join(&f.path);
                std::fs::read(&p).map_err(io_err(&p))
            }
            Kind::Asar => {
                let start = self.data_start.checked_add(f.offset as usize).ok_or_else(|| Error::Asar(f.path.clone()))?;
                let end = start.checked_add(f.size as usize).ok_or_else(|| Error::Asar(f.path.clone()))?;
                self.asar
                    .get(start..end)
                    .map(<[u8]>::to_vec)
                    .ok_or_else(|| Error::Asar(format!("{}: data out of bounds", f.path)))
            }
        }
    }

    pub fn read_path(&self, path: &str) -> Option<Vec<u8>> {
        self.find(path).and_then(|f| self.read(f).ok())
    }

    pub fn read_text(&self, path: &str) -> Option<String> {
        self.read_path(path).map(|b| String::from_utf8_lossy(&b).into_owned())
    }

    /// Extract the files accepted by `keep` below `dst`. Entry names are validated (no `..`, no absolute paths).
    pub fn extract_to(&self, dst: &Path, keep: impl Fn(&str) -> bool) -> Result<usize> {
        let mut n = 0;
        for f in &self.files {
            if !keep(&f.path) || !safe_rel(&f.path) {
                continue;
            }
            let target = dst.join(&f.path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(io_err(parent))?;
            }
            let bytes = self.read(f)?;
            std::fs::write(&target, bytes).map_err(io_err(&target))?;
            n += 1;
        }
        Ok(n)
    }

    pub fn packaging(&self) -> Packaging {
        let squirrel_layout = self
            .install_dir
            .as_ref()
            .and_then(|d| d.parent())
            .is_some_and(|p| p.join("Update.exe").is_file());
        Packaging {
            kind: if self.kind == Kind::Asar { "asar" } else { "dir" }.into(),
            asar_path: self.asar_path.as_ref().map(|p| p.display().to_string()),
            files: self.files.len(),
            total_bytes: self.files.iter().map(|f| f.size).sum(),
            unpacked_files: self.files.iter().filter(|f| f.unpacked).count(),
            unpacked_dir_found: self.unpacked_dir.is_some(),
            squirrel_layout,
        }
    }

    /// Electron version, Chromium/Node versions and fuse wire. `package_json_range` is the declared
    /// `electron` dependency, used when neither the `version` file nor the executable gives an answer.
    pub fn detect_electron(&self, package_json_range: Option<&str>) -> ElectronInfo {
        let mut info = ElectronInfo { version_source: "none".into(), ..ElectronInfo::default() };
        if let Some(dir) = &self.install_dir {
            if let Ok(text) = std::fs::read_to_string(dir.join("version")) {
                let v = text.trim().trim_start_matches('v');
                if !v.is_empty() && v.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                    info.version = Some(v.to_string());
                    info.version_source = "version-file".into();
                }
            }
            if let Some(exe) = find_electron_exe(dir) {
                if let Ok(bytes) = std::fs::read(&exe) {
                    let r = electron::analyze_electron(&bytes);
                    info.executable = Some(exe.display().to_string());
                    info.fuse_wire_found = r.fuse_wire_found;
                    info.fuses = r.fuses.iter().map(|f| (f.name.clone(), f.state.clone())).collect();
                    info.run_as_node = r.run_as_node;
                    info.asar_integrity = r.asar_integrity;
                    info.only_load_app_from_asar = r.only_load_app_from_asar;
                    info.v8_snapshot = r.v8_snapshot;
                    info.v8_code_cache = r.v8_code_cache;
                    info.chromium = r.chromium_version;
                    info.node = r.node_version;
                    if info.version.is_none() && r.electron_version.is_some() {
                        info.version = r.electron_version;
                        info.version_source = "binary".into();
                    }
                }
            }
        }
        if info.version.is_none() {
            if let Some(range) = package_json_range {
                let v = range.trim_start_matches(['^', '~', '=', 'v', ' ']);
                if v.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                    info.version = Some(v.to_string());
                    info.version_source = "package.json".into();
                }
            }
        }
        info
    }
}

fn safe_rel(p: &str) -> bool {
    Path::new(p).components().all(|c| matches!(c, Component::Normal(_)))
}

/// The largest executable-looking file of the install directory (Windows `.exe`, Linux binary,
/// macOS `Electron Framework`). Update.exe, installers and helpers are far below the size floor.
fn find_electron_exe(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(u64, PathBuf)> = None;
    let mut consider = |p: PathBuf| {
        if let Ok(m) = std::fs::metadata(&p) {
            if m.is_file() && (MIN_EXE_BYTES..=MAX_EXE_BYTES).contains(&m.len()) && best.as_ref().is_none_or(|(s, _)| m.len() > *s) {
                best = Some((m.len(), p));
            }
        }
    };
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let ext = p.extension().and_then(|x| x.to_str()).map(str::to_ascii_lowercase);
            if matches!(ext.as_deref(), Some("exe") | None) {
                consider(p);
            }
        }
    }
    consider(dir.join("Frameworks/Electron Framework.framework/Versions/A/Electron Framework"));
    best.map(|(_, p)| p)
}
