//! PAdES B-B signature (`pdfcraft-sign`: `ETSI.CAdES.detached`, SHA-256/384, incremental update) with a
//! PKCS #12 identity, and verification of the signatures of a PDF.
//! No external service: no timestamp (B-T), no revocation lookup.

use crate::{Erreur, R, ouvrir};
use pdfcraft_sign::{Modification, SignOptions, Status, TrustStore, pkcs12, x509};
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Signature {
    pub mot_de_passe: String,
    /// PDF date (`D:YYYYMMDDHHmmSSZ`), from the caller's clock.
    pub date: String,
    pub raison: Option<String>,
    pub lieu: Option<String>,
    pub contact: Option<String>,
    /// Existing signature field to sign; otherwise a new field.
    pub champ: Option<String>,
    /// Page of the new field (from 0) and visible rectangle `[x0, y0, x1, y1]` in points
    /// (origin at the bottom left); without a rectangle, invisible signature.
    pub page: usize,
    pub rectangle: Option<[f64; 4]>,
    /// DocMDP certification: 1 no change, 2 forms and signatures, 3 comments too.
    pub certifier: Option<u8>,
}

/// Signs the PDF with the PKCS #12 identity (`.p12`, `.pfx`).
pub fn signer_pdf(pdf: &[u8], p12: &[u8], s: &Signature) -> R<Vec<u8>> {
    if s.date.is_empty() {
        return Err(Erreur::Donnees("date de signature requise".into()));
    }
    if s.certifier.is_some_and(|c| !(1..=3).contains(&c)) {
        return Err(Erreur::Donnees("certification: 1, 2 or 3".into()));
    }
    let id = pkcs12::open(p12, &s.mot_de_passe)?;
    let options = SignOptions {
        field: s.champ.clone(),
        page: s.page,
        rect: s.rectangle,
        reason: s.raison.clone(),
        location: s.lieu.clone(),
        contact: s.contact.clone(),
        date: s.date.clone(),
        certify: s.certifier,
        ..Default::default()
    };
    Ok(pdfcraft_sign::sign(&ouvrir(pdf)?, &id, &options)?)
}

#[derive(Debug, Serialize)]
pub struct Verification {
    pub champ: String,
    pub signee: bool,
    /// `valide` (intact, trusted identity), `inconnue` (intact, unrecognized identity),
    /// `invalide` (signed bytes modified, forged signature or forbidden changes).
    pub statut: &'static str,
    pub signataire: Option<String>,
    pub date: Option<String>,
    pub raison: Option<String>,
    pub lieu: Option<String>,
    pub format: Option<String>,
    pub algorithme: Option<String>,
    pub certification: Option<u8>,
    pub horodatage: bool,
    /// `aucune` (the signature covers the whole file), `permises` or `interdites` (changes allowed or forbidden).
    pub modifications: &'static str,
    pub changements: Vec<&'static str>,
    pub empreinte: Option<String>,
    pub details: Vec<String>,
}

/// Signatures of the PDF, verified; `confiance`: trusted certificates (PEM or DER), empty otherwise.
pub fn verifier_signatures(pdf: &[u8], confiance: &[u8]) -> R<Vec<Verification>> {
    let doc = ouvrir(pdf)?;
    let trust = TrustStore {
        certs: if confiance.iter().all(u8::is_ascii_whitespace) {
            Vec::new()
        } else {
            x509::load_certificates(confiance)?
        },
    };
    Ok(pdfcraft_sign::signatures(&doc, pdf, &trust)
        .into_iter()
        .map(|s| {
            let (modifications, changements) = match s.modification {
                Modification::None => ("aucune", Vec::new()),
                Modification::Allowed(v) => ("permises", v),
                Modification::Disallowed(v) => ("interdites", v),
            };
            Verification {
                statut: match (s.signed, s.status) {
                    (false, _) => "non_signee",
                    (_, Status::Valid) => "valide",
                    (_, Status::Unknown) => "inconnue",
                    (_, Status::Invalid) => "invalide",
                },
                champ: s.field,
                signee: s.signed,
                signataire: s.signer,
                date: s.date,
                raison: s.reason,
                lieu: s.location,
                format: s.sub_filter,
                algorithme: s.algorithm,
                certification: s.certify,
                horodatage: s.timestamp,
                modifications,
                changements,
                empreinte: s.certificate.map(|c| c.fingerprint()),
                details: s.details.into_iter().map(|d| d.message).collect(),
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const P12: &[u8] = include_bytes!("../../../vendor/suite/crates/pdfcraft-sign/tests/data/rsa-aes.p12");
    const EC: &[u8] = include_bytes!("../../../vendor/suite/crates/pdfcraft-sign/tests/data/ec-p256.p12");
    const CERT: &[u8] = include_bytes!("../../../vendor/suite/crates/pdfcraft-sign/tests/data/rsa.crt.pem");

    fn pdf() -> Vec<u8> {
        let d = crate::creer_docx(&crate::Nouveau { titre: "Contrat".into(), paragraphes: vec![] }).unwrap();
        crate::docx_en_pdf(&d).unwrap()
    }

    fn options() -> Signature {
        Signature {
            mot_de_passe: "test".into(),
            date: "D:20261023120000Z".into(),
            raison: Some("Accord".into()),
            lieu: Some("Lyon".into()),
            ..Default::default()
        }
    }

    #[test]
    fn signe_et_verifie() {
        let original = pdf();
        assert!(verifier_signatures(&original, b"").unwrap().is_empty());
        let signe = signer_pdf(&original, P12, &options()).unwrap();
        assert!(signe.starts_with(&original), "incremental update");
        let v = verifier_signatures(&signe, b"").unwrap();
        assert_eq!(v.len(), 1);
        let s = &v[0];
        assert_eq!((s.statut, s.modifications), ("inconnue", "aucune"), "{:?}", s.details);
        assert_eq!(s.signataire.as_deref(), Some("Test Signer RSA"));
        assert_eq!(s.format.as_deref(), Some("ETSI.CAdES.detached"));
        assert_eq!((s.raison.as_deref(), s.lieu.as_deref()), (Some("Accord"), Some("Lyon")));
        // Certificat de confiance : valide.
        assert_eq!(verifier_signatures(&signe, CERT).unwrap()[0].statut, "valide");
        // Signed bytes modified: invalid.
        let mut altere = signe.clone();
        // In the middle of the signed revision: in the data of a stream (embedded fonts).
        altere[original.len() / 2] ^= 1;
        assert_eq!(verifier_signatures(&altere, CERT).unwrap()[0].statut, "invalide");
    }

    #[test]
    fn visible_ec_et_seconde_signature() {
        let o = Signature { rectangle: Some([40.0, 40.0, 240.0, 100.0]), ..options() };
        let une = signer_pdf(&pdf(), EC, &o).unwrap();
        let deux = signer_pdf(&une, P12, &options()).unwrap();
        let v = verifier_signatures(&deux, b"").unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].signataire.as_deref(), Some("Test Signer EC"));
        assert_eq!(v[0].modifications, "permises");
        assert!(v.iter().all(|s| s.statut == "inconnue"), "{v:?}");
    }

    #[test]
    fn erreurs() {
        assert!(signer_pdf(&pdf(), P12, &Signature { mot_de_passe: "faux".into(), ..options() }).is_err());
        assert!(signer_pdf(&pdf(), b"pas un p12", &options()).is_err());
        assert!(signer_pdf(&pdf(), P12, &Signature { date: String::new(), ..options() }).is_err());
        assert!(verifier_signatures(&pdf(), b"pas un certificat").is_err());
    }
}
