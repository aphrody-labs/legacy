//! Ollama models: list, loaded models, background download (NDJSON progress tracked in
//! memory and re-read by the page) and deletion.
use futures_util::StreamExt;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::types::{Modele, Progression, Suggestion};

/// Models offered at installation, from the lightest to the most capable; the usage text is in `locale`.
pub fn suggestions(locale: &str) -> Vec<Suggestion> {
    ["qwen3:4b", "llama3.2:3b", "qwen2.5vl:7b", "mistral-small3.2", "gpt-oss:20b", "nomic-embed-text"]
        .into_iter()
        .enumerate()
        .map(|(i, nom)| Suggestion {
            nom: nom.into(),
            usage: crate::i18n::translate(locale, &format!("suggestion.{}", i + 1), &[]),
        })
        .collect()
}

/// Ollama model name: "family[:tag]", optional namespace; nothing else passes.
pub fn nom_valide(nom: &str) -> bool {
    let (base, etiquette) = nom.split_once(':').unwrap_or((nom, "latest"));
    let segment = |s: &str| {
        !s.is_empty()
            && s.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
            && s.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    };
    let parties: Vec<&str> = base.split('/').collect();
    nom.len() <= 120 && parties.len() <= 2 && parties.iter().all(|p| segment(p)) && segment(etiquette)
}

#[derive(Deserialize)]
struct Liste {
    #[serde(default)]
    models: Vec<ModeleBrut>,
}

#[derive(Deserialize)]
struct ModeleBrut {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    details: Details,
}

#[derive(Deserialize, Default)]
struct Details {
    family: Option<String>,
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

#[derive(Deserialize)]
struct Etape {
    status: Option<String>,
    total: Option<u64>,
    completed: Option<u64>,
    error: Option<String>,
}

pub struct Ollama {
    base: String,
    client: reqwest::Client,
}

impl Ollama {
    pub fn new(base: impl Into<String>) -> Self {
        Self { base: base.into().trim_end_matches('/').to_string(), client: reqwest::Client::new() }
    }

    async fn liste(&self, chemin: &str) -> Result<Liste, String> {
        let r = self
            .client
            .get(format!("{}{chemin}", self.base))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|_| "ollama_unreachable".to_string())?;
        if !r.status().is_success() {
            return Err(format!("Ollama {}", r.status()));
        }
        r.json().await.map_err(|e| e.to_string())
    }

    pub async fn modeles(&self) -> Result<Vec<Modele>, String> {
        let (tags, ps) = tokio::try_join!(self.liste("/api/tags"), self.liste("/api/ps"))?;
        let charges: Vec<String> = ps.models.into_iter().map(|m| m.name).collect();
        let mut v: Vec<Modele> = tags
            .models
            .into_iter()
            .map(|m| Modele {
                charge: charges.contains(&m.name),
                details: [m.details.family, m.details.parameter_size, m.details.quantization_level]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(", "),
                nom: m.name,
                taille: m.size,
            })
            .collect();
        v.sort_by(|a, b| a.nom.cmp(&b.nom));
        Ok(v)
    }

    pub async fn supprimer(&self, nom: &str) -> Result<(), String> {
        let r = self
            .client
            .delete(format!("{}/api/delete", self.base))
            .json(&serde_json::json!({ "model": nom }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(format!("Ollama {} : {}", r.status(), r.text().await.unwrap_or_default()));
        }
        Ok(())
    }

    /// Download tracked in `suivi`; returns immediately.
    pub fn telecharger(&'static self, nom: String, suivi: Arc<Mutex<HashMap<String, Progression>>>) {
        let maj = {
            let suivi = suivi.clone();
            let nom = nom.clone();
            move |f: &dyn Fn(&mut Progression)| {
                if let Some(p) = suivi.lock().unwrap().get_mut(&nom) {
                    f(p);
                }
            }
        };
        suivi.lock().unwrap().insert(
            nom.clone(),
            Progression { nom: nom.clone(), statut: "démarrage".into(), fait: 0, total: 0, erreur: None, termine: false },
        );
        tokio::spawn(async move {
            let resultat: Result<(), String> = async {
                let r = self
                    .client
                    .post(format!("{}/api/pull", self.base))
                    .json(&serde_json::json!({ "model": nom, "stream": true }))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !r.status().is_success() {
                    return Err(format!("Ollama {} : {}", r.status(), r.text().await.unwrap_or_default()));
                }
                let mut flux = r.bytes_stream();
                let mut reste = Vec::new();
                while let Some(morceau) = flux.next().await {
                    reste.extend_from_slice(&morceau.map_err(|e| e.to_string())?);
                    while let Some(i) = reste.iter().position(|&b| b == b'\n') {
                        let ligne: Vec<u8> = reste.drain(..=i).collect();
                        let Ok(e) = serde_json::from_slice::<Etape>(&ligne) else { continue };
                        if let Some(err) = e.error {
                            return Err(err);
                        }
                        maj(&|p| {
                            if let Some(s) = &e.status {
                                p.statut = s.clone();
                            }
                            if let (Some(t), Some(c)) = (e.total, e.completed) {
                                p.total = t;
                                p.fait = c;
                            }
                        });
                    }
                }
                Ok(())
            }
            .await;
            maj(&|p| {
                p.termine = true;
                match &resultat {
                    Ok(()) => p.statut = "installé".into(),
                    Err(e) => p.erreur = Some(e.clone()),
                }
            });
        });
    }
}

#[cfg(test)]
mod tests {
    use super::nom_valide;

    #[test]
    fn noms_de_modeles() {
        for ok in ["qwen3:4b", "nomic-embed-text", "library/llama3.2:3b", "mistral-small3.2"] {
            assert!(nom_valide(ok), "{ok}");
        }
        for ko in ["", ":4b", "a b", "../x", "a/b/c", "x;rm", "-x"] {
            assert!(!nom_valide(ko), "{ko}");
        }
    }
}
