//! Data exchanged between the server and the page (serialized by the server functions).
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EtatService {
    Marche,
    Demarrage,
    Panne,
    Arret,
    Absent,
}

impl EtatService {
    /// Label in the current page locale.
    pub fn libelle(self) -> String {
        crate::i18n::t(
            match self {
                Self::Marche => "state.running",
                Self::Demarrage => "state.starting",
                Self::Panne => "state.down",
                Self::Arret => "state.stopped",
                Self::Absent => "state.absent",
            },
            &[],
        )
    }
    pub fn classe(self) -> &'static str {
        match self {
            Self::Marche => "marche",
            Self::Demarrage => "demarrage",
            Self::Panne => "panne",
            Self::Arret => "arret",
            Self::Absent => "absent",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ServiceVu {
    pub id: String,
    pub nom: String,
    pub role: String,
    pub couleur: String,
    pub technique: bool,
    /// "Open" link, computed by the server from the request host (or the box domain).
    pub lien: Option<String>,
    pub etat: EtatService,
    pub statut: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Systeme {
    pub cpus: Option<u64>,
    pub memoire: Option<u64>,
    pub disque_total: Option<u64>,
    pub disque_libre: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EtatBoite {
    pub services: Vec<ServiceVu>,
    pub systeme: Systeme,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Modele {
    pub nom: String,
    pub taille: u64,
    pub details: String,
    pub charge: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Suggestion {
    pub nom: String,
    pub usage: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Progression {
    pub nom: String,
    pub statut: String,
    pub fait: u64,
    pub total: u64,
    pub erreur: Option<String>,
    pub termine: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Modeles {
    pub installes: Vec<Modele>,
    pub suggestions: Vec<Suggestion>,
    pub en_cours: Vec<Progression>,
    pub erreur: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Acces {
    pub service: String,
    pub identifiant: String,
    pub mot_de_passe: String,
}

/// Readable size in the current page locale: 1.5 GB, 300 MB...
pub fn octets(n: u64) -> String {
    octets_in(crate::i18n::current(), n)
}

/// Readable size in `locale`: units and decimal separator come from its catalog.
pub fn octets_in(locale: &str, n: u64) -> String {
    use crate::i18n::translate;
    let units = translate(locale, "size.units", &[]);
    let units: Vec<&str> = units.split(',').collect();
    let mut v = n as f64;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    let texte = if v < 10.0 && i > 0 { format!("{v:.1}") } else { format!("{v:.0}") };
    format!("{} {}", texte.replace('.', &translate(locale, "number.decimal", &[])), units[i])
}

#[cfg(test)]
mod tests {
    use super::octets_in;

    #[test]
    fn readable_sizes() {
        assert_eq!(octets_in("en", 512), "512 B");
        assert_eq!(octets_in("en", 1536), "1.5 KB");
        assert_eq!(octets_in("fr", 512), "512 o");
        assert_eq!(octets_in("fr", 1536), "1,5 Ko");
        assert_eq!(octets_in("fr", 2_684_354_560), "2,5 Go");
        assert_eq!(octets_in("en", 300 * 1024 * 1024), "300 MB");
    }
}
