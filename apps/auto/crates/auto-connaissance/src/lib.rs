//! Knowledge base of the automations (RAG), through `aphrody-rag-core`:
//!
//! - splitting a document into chunks addressed by position: `MarkdownChunker` (sections by headings, heading
//!   trail at the top of each chunk) for a `.md` source, else `ProseChunker` (sentences grouped up to the wanted
//!   size, 15% overlap);
//! - exact search of the `k` vectors closest to a question by cosine similarity
//!   (`fusion::top_k_exact`), with optional diversification by MMR (`fusion::mmr`).
//!
//! The vectors (embeddings) are computed outside this crate, by an OpenAI-compatible API.

use aphrody_rag_core::{ChunkOptions, Chunker, Language, MarkdownChunker, ProseChunker, detect_language, fusion};
use serde::Serialize;

/// Default chunk size, in UTF-16 units (that of `aphrody-rag-core`).
pub const TAILLE_DEFAUT: usize = 1400;
/// Text accepted per splitting call.
pub const TEXTE_MAX: usize = 5_000_000;
/// Results of a search, at most.
pub const K_MAX: usize = 100;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum Erreur {
    #[error("chunk size: 200 to 8000")]
    Taille,
    #[error("texte trop volumineux (5 Mo au plus)")]
    Texte,
    #[error("dimension nulle")]
    Dimension,
    #[error("the question has {0} components, the base {1}")]
    Question(usize, usize),
    #[error("matrix of {0} numbers: not a multiple of dimension {1}")]
    Matrice(usize, usize),
    #[error("k: 1 to 100")]
    K,
    #[error("diversity: between 0 and 1")]
    Diversite,
}

/// Chunk of a document: position (from 0), text, heading trail (Markdown), lines covered.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Morceau {
    pub position: u32,
    pub texte: String,
    pub titre: Option<String>,
    pub ligne_debut: u32,
    pub ligne_fin: u32,
}

/// Splits `texte` (read from `source`, whose extension picks the splitter) into non-empty chunks.
pub fn decouper(source: &str, texte: &str, taille: Option<usize>) -> Result<Vec<Morceau>, Erreur> {
    let taille = taille.unwrap_or(TAILLE_DEFAUT);
    if !(200..=8000).contains(&taille) {
        return Err(Erreur::Taille);
    }
    if texte.len() > TEXTE_MAX {
        return Err(Erreur::Texte);
    }
    let opts = ChunkOptions { max_chars: taille, min_chars: (taille / 20).max(32), ..ChunkOptions::default() };
    let morceaux = match detect_language(source) {
        Language::Markdown => MarkdownChunker.chunk(source, texte, &opts),
        _ => ProseChunker.chunk(source, texte, &opts),
    };
    Ok(morceaux
        .into_iter()
        .filter(|c| !c.text.trim().is_empty())
        .enumerate()
        .map(|(i, c)| Morceau {
            position: u32::try_from(i).unwrap_or(u32::MAX),
            texte: c.text,
            titre: c.symbol,
            ligne_debut: c.start_line,
            ligne_fin: c.end_line,
        })
        .collect())
}

/// Result of a search: matrix row and cosine similarity with the question.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Proche {
    pub indice: u32,
    pub score: f32,
}

/// The `k` rows of `matrice` (row by row, `dimension` numbers each) closest to `question`, by decreasing
/// score. With `diversite` (MMR lambda, 1 = relevance only), the `4k` best candidates are reordered to drop
/// near-duplicates; the scores remain the cosines.
pub fn plus_proches(
    question: &[f32],
    matrice: &[f32],
    dimension: usize,
    k: usize,
    diversite: Option<f64>,
) -> Result<Vec<Proche>, Erreur> {
    if dimension == 0 {
        return Err(Erreur::Dimension);
    }
    if question.len() != dimension {
        return Err(Erreur::Question(question.len(), dimension));
    }
    if !matrice.len().is_multiple_of(dimension) {
        return Err(Erreur::Matrice(matrice.len(), dimension));
    }
    if !(1..=K_MAX).contains(&k) {
        return Err(Erreur::K);
    }
    let proche = |(i, s): (usize, f32)| Proche { indice: u32::try_from(i).unwrap_or(u32::MAX), score: s };
    let Some(lambda) = diversite else {
        return Ok(fusion::top_k_exact(question, matrice, dimension, k).into_iter().map(proche).collect());
    };
    if !(0.0..=1.0).contains(&lambda) {
        return Err(Erreur::Diversite);
    }
    let candidats: Vec<(usize, Vec<f32>, f64)> = fusion::top_k_exact(question, matrice, dimension, k * 4)
        .into_iter()
        .map(|(i, s)| (i, matrice[i * dimension..(i + 1) * dimension].to_vec(), f64::from(s)))
        .collect();
    let scores: std::collections::HashMap<usize, f32> = candidats.iter().map(|(i, _, s)| (*i, *s as f32)).collect();
    Ok(fusion::mmr(&candidats, lambda, k).into_iter().map(|i| proche((i, scores[&i]))).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prose_decoupee_par_phrases() {
        let phrase = "Le contrat de maintenance couvre les pièces et la main-d'œuvre pendant deux ans. ";
        let texte = phrase.repeat(60);
        let m = decouper("contrat.pdf", &texte, Some(500)).unwrap();
        assert!(m.len() > 5, "{}", m.len());
        assert!(m.iter().enumerate().all(|(i, x)| x.position as usize == i));
        assert!(m.iter().all(|x| x.texte.encode_utf16().count() <= 600 && x.titre.is_none()));
        assert_eq!(m[0].ligne_debut, 1);
        assert!(decouper("vide.txt", "  \n ", None).unwrap().is_empty());
        assert_eq!(decouper("a.txt", "x", Some(10)), Err(Erreur::Taille));
    }

    #[test]
    fn markdown_par_sections() {
        let md = "# Guide\n\nIntroduction du guide.\n\n## Garantie\n\nLa garantie dure deux ans.\n\n## Retours\n\nLes retours sont acceptés sous trente jours.\n";
        let m = decouper("guide.md", md, None).unwrap();
        let garantie = m.iter().find(|x| x.texte.contains("deux ans")).unwrap();
        assert_eq!(garantie.titre.as_deref(), Some("Guide > Garantie"));
        assert!(garantie.texte.starts_with("[Guide > Garantie]"), "{}", garantie.texte);
        assert!(!garantie.texte.contains("trente jours"));
    }

    #[test]
    fn plus_proches_cosinus_et_mmr() {
        // Lignes : [1,0], [0.9,0.1] (quasi-doublon de 0), [0,1], [0.7,0.7].
        let matrice = [1.0, 0.0, 0.9, 0.1, 0.0, 1.0, 0.7, 0.7];
        let r = plus_proches(&[1.0, 0.0], &matrice, 2, 2, None).unwrap();
        assert_eq!(r.iter().map(|p| p.indice).collect::<Vec<_>>(), [0, 1]);
        assert!((r[0].score - 1.0).abs() < 1e-6 && r[0].score > r[1].score);
        // Strong diversity: the near-duplicate gives way to another direction.
        let d = plus_proches(&[1.0, 0.0], &matrice, 2, 2, Some(0.3)).unwrap();
        assert_eq!(d[0].indice, 0);
        assert_ne!(d[1].indice, 1);
        assert_eq!(plus_proches(&[1.0], &matrice, 2, 2, None), Err(Erreur::Question(1, 2)));
        assert_eq!(plus_proches(&[1.0, 0.0], &matrice[..3], 2, 2, None), Err(Erreur::Matrice(3, 2)));
        assert_eq!(plus_proches(&[1.0, 0.0], &matrice, 2, 0, None), Err(Erreur::K));
        assert!(plus_proches(&[1.0, 0.0], &[], 2, 3, None).unwrap().is_empty());
    }
}
