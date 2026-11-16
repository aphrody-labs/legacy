//! Permanent redaction (`pdfcraft-redact`): the occurrences found in the text layer (`pdfcraft-render`) become
//! Redact annotations (`pdfcraft-annot`), then `apply` removes the covered content (glyphs, images, paths,
//! fields) and places a black box; a verification pass re-reads the pages and fails if a glyph remains under an
//! area.

use crate::{Erreur, R, enregistrer, ouvrir};
use pdfcraft_annot::{Meta, NewAnnotation, Shape, Style, add_annotation};
use pdfcraft_redact::patterns::{self, Pattern};
use pdfcraft_render::{PageRenderer, PageText, RenderConfig, RenderRequest, RequestKind};
use serde::{Deserialize, Serialize};
use std::ops::Range;
use std::sync::Arc;

/// Recognized patterns: those of pdfcraft (phone, e-mail, bank card, date) and the IBAN.
pub const MOTIFS: [&str; 5] = ["iban", "email", "telephone", "carte", "date"];

/// Texts to search for, at most.
pub const TEXTES_MAX: usize = patterns::MAX_WORDS;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Caviardage {
    /// Texts or expressions to redact (case-insensitive by default).
    pub textes: Vec<String>,
    /// Motifs parmi [`MOTIFS`].
    pub motifs: Vec<String>,
    pub casse: bool,
    pub mots_entiers: bool,
    /// Text written on each box (Helvetica font).
    pub texte_superpose: String,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct Recherche {
    pub recherche: String,
    pub occurrences: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct Rapport {
    /// Occurrences redacted (one area per occurrence, on one or several lines).
    pub occurrences: usize,
    /// Pages touched, numbered from 1.
    pub pages: Vec<usize>,
    pub par_recherche: Vec<Recherche>,
    pub glyphes: usize,
    pub images: usize,
    pub traces: usize,
    pub annotations: usize,
    pub champs: usize,
}

fn motif(id: &str) -> R<Option<Pattern>> {
    Ok(match id {
        "iban" => None,
        "email" => Some(Pattern::Email),
        "telephone" => Some(Pattern::Phone),
        "carte" => Some(Pattern::CreditCard),
        "date" => Some(Pattern::Date),
        _ => return Err(Erreur::Donnees(format!("motif inconnu : {id} ({})", MOTIFS.join(", ")))),
    })
}

/// IBAN (ISO 13616): two letters, two check digits, 11 to 30 characters, groups separated
/// by at most one space; kept only if the modulo 97 key is right.
pub fn ibans(s: &[char]) -> Vec<Range<usize>> {
    let alnum = |c: Option<&char>| c.is_some_and(|c| c.is_alphanumeric());
    let mut out = Vec::new();
    let mut i = 0;
    while i + 15 <= s.len() {
        let debut_ok = !alnum(i.checked_sub(1).and_then(|p| s.get(p)))
            && s[i].is_ascii_uppercase()
            && s[i + 1].is_ascii_uppercase()
            && s[i + 2].is_ascii_digit()
            && s[i + 3].is_ascii_digit();
        if !debut_ok {
            i += 1;
            continue;
        }
        // Characters kept and possible group ends (before a space or a non-letter).
        let (mut compact, mut fins) = (Vec::new(), Vec::new());
        let mut j = i;
        while j < s.len() && compact.len() < 34 {
            let c = s[j];
            if c.is_ascii_uppercase() || c.is_ascii_digit() {
                compact.push(c);
                j += 1;
                if !alnum(s.get(j)) {
                    fins.push((compact.len(), j));
                }
            } else if c == ' ' && compact.len() >= 4 && s.get(j + 1).is_some_and(char::is_ascii_alphanumeric) {
                j += 1;
            } else {
                break;
            }
        }
        let trouve = fins.iter().rev().find(|(n, _)| (15..=34).contains(n) && cle_iban(&compact[..*n]));
        match trouve {
            Some(&(_, fin)) => {
                out.push(i..fin);
                i = fin;
            }
            None => i += 1,
        }
    }
    out
}

fn cle_iban(c: &[char]) -> bool {
    let mut reste = 0u32;
    for ch in c[4..].iter().chain(&c[..4]) {
        let v = ch.to_digit(36).unwrap_or(0);
        reste = if v >= 10 { (reste * 100 + v) % 97 } else { (reste * 10 + v) % 97 };
    }
    reste == 1
}

fn textes_pages(pdf: &[u8], n: usize) -> Vec<Option<Arc<PageText>>> {
    let mut r = PageRenderer::new(Arc::new(pdf.to_vec()), RenderConfig::default());
    (0..n)
        .map(|page| r.render(RenderRequest { page, kind: RequestKind::Text, scale: 1.0, ..Default::default() }).text)
        .collect()
}

/// Redacts the PDF; without an occurrence, the PDF is returned as is.
pub fn caviarder(pdf: &[u8], c: &Caviardage) -> R<(Vec<u8>, Rapport)> {
    let textes: Vec<String> = patterns::word_list(&c.textes.join("\n"));
    if c.textes.len() > TEXTES_MAX {
        return Err(Erreur::Donnees(format!("{TEXTES_MAX} textes au plus")));
    }
    let motifs = c.motifs.iter().map(|m| Ok((m.clone(), motif(m)?))).collect::<R<Vec<_>>>()?;
    if textes.is_empty() && motifs.is_empty() {
        return Err(Erreur::Donnees("texts or patterns required".into()));
    }
    let info = pdfcraft_render::inspect(Arc::new(pdf.to_vec()), None).map_err(|e| Erreur::Donnees(e.to_string()))?;
    let mut doc = ouvrir(pdf)?;
    let mut rapport = Rapport {
        par_recherche: textes
            .iter()
            .chain(motifs.iter().map(|(m, _)| m))
            .map(|r| Recherche { recherche: r.clone(), occurrences: 0 })
            .collect(),
        ..Default::default()
    };
    let shape = |quads| Shape::Redact { quads, overlay: c.texte_superpose.clone(), look: Default::default() };
    let style = Style::default_for(&shape(Vec::new()));
    for (page, texte) in textes_pages(pdf, info.pages.len()).into_iter().enumerate() {
        let Some(texte) = texte else { continue };
        // IBAN first, then the other patterns, then the texts: an area that overlaps one already
        // kept (the digits of an IBAN taken for a phone number) is dropped.
        let mut zones: Vec<(usize, Range<usize>)> = Vec::new();
        let mut ordre: Vec<(usize, &Option<Pattern>)> =
            motifs.iter().enumerate().map(|(k, (_, m))| (textes.len() + k, m)).collect();
        ordre.sort_by_key(|(_, m)| m.is_some());
        for (k, m) in ordre {
            let trouves = match m {
                Some(p) => texte.find_with(|ch| patterns::find(*p, ch)),
                None => texte.find_with(ibans),
            };
            zones.extend(trouves.into_iter().map(|r| (k, r)));
        }
        for (k, t) in textes.iter().enumerate() {
            zones.extend(texte.find_opts(t, c.casse, c.mots_entiers).into_iter().map(|r| (k, r)));
        }
        let mut retenues: Vec<Range<usize>> = Vec::new();
        for (k, r) in zones {
            if retenues.iter().any(|x| x.start < r.end && r.start < x.end) {
                continue;
            }
            retenues.push(r.clone());
            let quads: Vec<[f64; 8]> =
                texte.line_rects(r).into_iter().map(|q| info.pages[page].view_rect_to_quad(q)).collect();
            if quads.is_empty() {
                continue;
            }
            let new = NewAnnotation {
                page,
                shape: shape(quads),
                style: style.clone(),
                contents: String::new(),
                author: "auto".into(),
            };
            add_annotation(&mut doc, &new, &Meta::default()).map_err(|e| Erreur::Donnees(e.to_string()))?;
            rapport.occurrences += 1;
            rapport.par_recherche[k].occurrences += 1;
            if rapport.pages.last() != Some(&(page + 1)) {
                rapport.pages.push(page + 1);
            }
        }
    }
    if rapport.occurrences == 0 {
        return Ok((pdf.to_vec(), rapport));
    }
    let r = pdfcraft_redact::apply(&mut doc, None)?;
    rapport.glyphes = r.glyphs;
    rapport.images = r.images_removed + r.images_cleared;
    rapport.traces = r.paths_removed + r.paths_clipped;
    rapport.annotations = r.annotations;
    rapport.champs = r.fields;
    Ok((enregistrer(&doc)?, rapport))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trouve(s: &str) -> Vec<String> {
        let c: Vec<char> = s.chars().collect();
        ibans(&c).into_iter().map(|r| c[r].iter().collect()).collect()
    }

    #[test]
    fn iban() {
        assert_eq!(
            trouve("IBAN : FR76 3000 6000 0112 3456 7890 189 BIC AGRIFRPP"),
            ["FR76 3000 6000 0112 3456 7890 189"]
        );
        assert_eq!(trouve("FR7630006000011234567890189."), ["FR7630006000011234567890189"]);
        assert_eq!(
            trouve("DE89 3704 0044 0532 0130 00 et GB82WEST12345698765432"),
            ["DE89 3704 0044 0532 0130 00", "GB82WEST12345698765432"]
        );
        // Wrong key, or stuck to a word.
        assert!(trouve("FR76 3000 6000 0112 3456 7890 188").is_empty());
        assert!(trouve("xFR7630006000011234567890189").is_empty());
    }

    fn pdf(lignes: &[&str]) -> Vec<u8> {
        let paragraphes = lignes.iter().map(|t| crate::Para { texte: (*t).into(), style: None, gras: false }).collect();
        crate::docx_en_pdf(&crate::creer_docx(&crate::Nouveau { titre: "Relevé".into(), paragraphes }).unwrap())
            .unwrap()
    }

    #[test]
    fn caviarde_textes_et_motifs() {
        let original = pdf(&[
            "Client : Zoé Martin, zoe.martin@exemple.fr",
            "Téléphone 06 12 34 56 78",
            "IBAN FR76 3000 6000 0112 3456 7890 189",
            "Montant dû : 120 euros, Zoé MARTIN",
        ]);
        let c = Caviardage {
            textes: vec!["zoé martin".into()],
            motifs: vec!["email".into(), "telephone".into(), "iban".into()],
            ..Default::default()
        };
        let (caviarde, r) = caviarder(&original, &c).unwrap();
        assert_eq!(r.occurrences, 5, "{r:?}");
        assert_eq!(r.pages, [1]);
        assert_eq!(
            r.par_recherche.iter().map(|x| (x.recherche.as_str(), x.occurrences)).collect::<Vec<_>>(),
            [("zoé martin", 2), ("email", 1), ("telephone", 1), ("iban", 1)]
        );
        assert!(r.glyphes > 50, "{r:?}");
        let t = crate::texte_pdf(&caviarde).unwrap().join("\n");
        for absent in ["Zoé", "MARTIN", "zoe.martin", "06 12", "FR76", "7890 189"] {
            assert!(!t.contains(absent), "{absent} : {t}");
        }
        for present in ["Relevé", "Client", "Téléphone", "IBAN", "Montant dû : 120 euros"] {
            assert!(t.contains(present), "{present} : {t}");
        }
        // The content is gone from the streams, not only from the display: nothing is left to redact.
        let (_, encore) = caviarder(&caviarde, &c).unwrap();
        assert_eq!(encore.occurrences, 0);
        // Without an occurrence, the PDF is returned as is.
        let (meme, rien) =
            caviarder(&original, &Caviardage { textes: vec!["absent".into()], ..Default::default() }).unwrap();
        assert_eq!((meme, rien.occurrences), (original, 0));
    }

    #[test]
    fn motif_inconnu() {
        let c = Caviardage { motifs: vec!["ssn".into()], ..Default::default() };
        assert!(caviarder(b"%PDF-1.7", &c).is_err());
        assert!(caviarder(b"%PDF-1.7", &Caviardage::default()).is_err());
    }
}
