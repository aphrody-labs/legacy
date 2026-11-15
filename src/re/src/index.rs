// SPDX-License-Identifier: Apache-2.0 OR MIT
//! Binary stages of the monorepo index pipeline (`aphrody_core::pipeline`, docs/native/PIPELINE.md),
//! in process: `triage` (PE/ELF/Mach-O headers, entropy, imports/exports), `ghidra` (P-Code CFG and
//! Pseudo-C, heavy: queued to fleet workers) and, with the `magika` feature, a content detector for
//! files that extension and magic bytes cannot place.

use aphrody_core::pipeline::{BinFacts, Engine, Facts, FileInfo, FuncFact, Kind, Stage, Xref};

const MAX_LISTED: usize = 4096;
const MAX_PSEUDO_C: usize = 8 << 10;

fn executable(f: &FileInfo<'_>) -> bool {
    f.det.kind == Kind::Binary && matches!(f.det.label.as_str(), "pe" | "elf" | "macho")
}

/// Headers, sections, entropy and the import/export graph of a native binary.
pub struct TriageStage;

impl Stage for TriageStage {
    fn name(&self) -> &'static str {
        "triage"
    }

    fn version(&self) -> u32 {
        1
    }

    fn accepts(&self, f: &FileInfo<'_>) -> bool {
        f.det.kind == Kind::Binary
    }

    fn run(&self, f: &FileInfo<'_>, bytes: &[u8]) -> Result<Facts, String> {
        let r = crate::triage::triage_bounded(bytes, 0).map_err(|e| e.to_string())?;
        let known = r.format != crate::triage::Format::Unknown;
        let entropy = r.sections.iter().filter_map(|s| s.entropy).fold(0.0f64, f64::max) as f32;
        let bin = BinFacts {
            format: if known { r.format.display_name().to_string() } else { f.det.label.clone() },
            arch: r.arch.clone(),
            entry: r.entry_point,
            sections: r.sections.len() as u32,
            imports: r.imports.len() as u32,
            exports: r.exports.len() as u32,
            entropy,
            libraries: r.libraries.clone(),
        };
        let mut xrefs = Vec::new();
        let edge = |kind: &str, dst: &String| Xref { src: f.path.to_string(), dst: dst.clone(), kind: kind.to_string() };
        xrefs.extend(r.libraries.iter().take(MAX_LISTED).map(|d| edge("needs", d)));
        xrefs.extend(r.imports.iter().take(MAX_LISTED).map(|d| edge("import", d)));
        xrefs.extend(r.exports.iter().take(MAX_LISTED).map(|d| edge("export", d)));
        Ok(Facts { bin: Some(bin), xrefs, ..Facts::default() })
    }
}

/// Ghidra-style lifting (CFG, P-Code, Pseudo-C) of the first functions of a native binary.
pub struct GhidraStage {
    pub max_functions: usize,
}

impl Default for GhidraStage {
    fn default() -> Self {
        Self { max_functions: 64 }
    }
}

impl Stage for GhidraStage {
    fn name(&self) -> &'static str {
        "ghidra"
    }

    fn version(&self) -> u32 {
        1
    }

    fn accepts(&self, f: &FileInfo<'_>) -> bool {
        executable(f)
    }

    fn heavy(&self) -> bool {
        true
    }

    fn run(&self, f: &FileInfo<'_>, bytes: &[u8]) -> Result<Facts, String> {
        let opts = crate::SreAnalyzeOptions { max_functions: self.max_functions, ..crate::SreAnalyzeOptions::default() };
        let rep = crate::analyze_binary_bytes(f.path, bytes, &opts)?;
        let mut funcs = Vec::with_capacity(rep.decompiled_functions.len());
        let mut xrefs = Vec::new();
        for d in rep.decompiled_functions {
            for c in &d.callees {
                xrefs.push(Xref { src: d.name.clone(), dst: c.clone(), kind: "call".into() });
            }
            let mut pc = d.pseudo_c;
            if pc.len() > MAX_PSEUDO_C {
                let mut cut = MAX_PSEUDO_C;
                while !pc.is_char_boundary(cut) {
                    cut -= 1;
                }
                pc.truncate(cut);
            }
            funcs.push(FuncFact {
                name: d.name,
                addr: d.entry_va,
                size: d.size_bytes as u32,
                insns: d.instruction_count as u32,
                blocks: d.basic_blocks.len() as u32,
                kind: "native".into(),
                pseudo_c: Some(pc),
            });
        }
        Ok(Facts { funcs, xrefs, ..Facts::default() })
    }
}

/// The engine with every stage this crate provides: tree-sitter, text, triage, ghidra.
pub fn engine() -> Engine {
    let e = Engine::new().with_stage(TriageStage).with_stage(GhidraStage::default());
    #[cfg(feature = "magika")]
    let e = e.with_detector(MagikaDetector);
    e
}

/// Magika for files of unknown type; one model session per thread.
#[cfg(feature = "magika")]
pub struct MagikaDetector;

#[cfg(feature = "magika")]
impl aphrody_core::pipeline::Detector for MagikaDetector {
    fn name(&self) -> &'static str {
        "magika"
    }

    fn detect(&self, _path: &std::path::Path, bytes: &[u8]) -> Option<aphrody_core::pipeline::Detected> {
        thread_local! {
            static CLASSIFIER: std::cell::RefCell<Option<crate::magika::Classifier>> =
                std::cell::RefCell::new(crate::magika::Classifier::new().ok());
        }
        if bytes.is_empty() {
            return None;
        }
        CLASSIFIER.with(|c| {
            let m = c.borrow_mut().as_mut()?.classify_bytes(bytes).ok()?;
            let kind = if m.group == "executable" {
                Kind::Binary
            } else if m.is_text {
                Kind::Text
            } else {
                Kind::Other
            };
            Some(aphrody_core::pipeline::Detected { kind, label: m.label, mime: Some(m.mime_type), score: Some(m.score) })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aphrody_core::pipeline::{Deep, Options, Store};

    /// Smallest valid PE: DOS header + PE signature + COFF + optional header, no sections.
    fn tiny_pe() -> Vec<u8> {
        let mut b = vec![0u8; 0x200];
        b[0] = b'M';
        b[1] = b'Z';
        b[0x3c] = 0x80;
        b[0x80..0x84].copy_from_slice(b"PE\0\0");
        b[0x84..0x86].copy_from_slice(&0x8664u16.to_le_bytes()); // machine
        b[0x94..0x96].copy_from_slice(&0xF0u16.to_le_bytes()); // size of optional header
        b[0x98..0x9a].copy_from_slice(&0x20bu16.to_le_bytes()); // PE32+
        b
    }

    #[test]
    fn triage_binary_lands_in_the_same_database_as_source() {
        let root = std::env::temp_dir().join(format!("ay-re-index-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("tool.exe"), tiny_pe()).unwrap();
        std::fs::write(root.join("main.rs"), "pub fn entry_point_fn() {}\n").unwrap();
        let mut o = Options::new(&root, root.join("c.db"));
        o.deep = Deep::Inline;
        let rep = engine().index(&o, None).unwrap();
        assert_eq!(rep.totals.files, 2);
        let st = Store::open(&o.db).unwrap();
        assert_eq!(st.lookup("entry_point_fn", 3).unwrap().len(), 1);
        assert_eq!(st.totals().unwrap().binaries, 1);
        let _ = std::fs::remove_dir_all(&root);
    }
}
