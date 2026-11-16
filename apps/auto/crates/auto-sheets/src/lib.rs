//! Spreadsheets through gridcraft: reading of any common workbook (xlsx, xlsm, xls, xlsb, ods, csv) as rows of
//! JSON values, and writing of a typed xlsx (text, number, euros, date, percentage) with a frozen bold header and
//! column widths.

use gridcraft_core::{CellRef, DateSystem, Value, date::serial_from_ymd};
use gridcraft_model::{Color, Fill, LineInfo, NumFmt, Sheet, Style, Workbook};
use gridcraft_xlsx::{CsvOptions, Format, read_csv, read_ods, read_xls, read_xlsb, read_xlsx, sniff, write_xlsx};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, thiserror::Error)]
pub enum Erreur {
    #[error("spreadsheet: {0}")]
    Io(#[from] gridcraft_xlsx::IoError),
    #[error("unsupported format: {0}")]
    Format(String),
    #[error("invalid data: {0}")]
    Donnees(String),
}

// Lecture ---------------------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct Feuille {
    pub nom: String,
    /// Rows of the used range; empty cell = `null`.
    pub lignes: Vec<Vec<serde_json::Value>>,
}

#[derive(Debug, Serialize)]
pub struct Lecture {
    pub format: &'static str,
    pub feuilles: Vec<Feuille>,
    pub avertissements: Vec<String>,
}

fn valeur(v: &Value) -> serde_json::Value {
    match v {
        Value::Empty => serde_json::Value::Null,
        Value::Number(n) => serde_json::Number::from_f64(*n).map_or(serde_json::Value::Null, serde_json::Value::Number),
        Value::Text(t) => serde_json::Value::String(t.to_string()),
        Value::Bool(b) => serde_json::Value::Bool(*b),
        other => serde_json::Value::String(other.display()),
    }
}

/// Cap on rows read per sheet (an import needs no more).
pub const MAX_LIGNES: u32 = 100_000;

pub fn lire(octets: &[u8]) -> Result<Lecture, Erreur> {
    let (format, (wb, rapport)) = match sniff(octets) {
        Format::Xlsx => ("xlsx", read_xlsx(octets)?),
        Format::Xls => ("xls", read_xls(octets)?),
        Format::Xlsb => ("xlsb", read_xlsb(octets)?),
        Format::Ods => ("ods", read_ods(octets)?),
        Format::Csv => {
            let opts = CsvOptions { delimiter: 0, parse_values: true, ..CsvOptions::default() };
            ("csv", (read_csv(octets, &opts)?, Default::default()))
        }
        Format::Encrypted => return Err(Erreur::Format("workbook protected by a password".into())),
        autre => return Err(Erreur::Format(format!("{autre:?}"))),
    };
    let mut feuilles = Vec::new();
    for s in &wb.sheets {
        let mut lignes = Vec::new();
        if let Some(r) = s.used_range() {
            let fin = r.end.row.min(r.start.row + MAX_LIGNES - 1);
            for row in r.start.row..=fin {
                lignes.push((r.start.col..=r.end.col).map(|col| valeur(&s.value(CellRef::new(row, col)))).collect());
            }
        }
        feuilles.push(Feuille { nom: s.name.clone(), lignes });
    }
    Ok(Lecture { format, feuilles, avertissements: rapport.warnings })
}

// Écriture --------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TypeColonne {
    #[default]
    Texte,
    Nombre,
    /// Value in cents (integer), shown in euros.
    Euros,
    /// "YYYY-MM-DD", written as an Excel date.
    Date,
    /// Valeur en points de base (1000 = 10 %).
    Pourcent,
}

#[derive(Debug, Deserialize)]
pub struct Colonne {
    pub titre: String,
    #[serde(default, rename = "type")]
    pub type_: TypeColonne,
    /// Width in characters.
    pub largeur: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct FeuilleSpec {
    pub nom: String,
    pub colonnes: Vec<Colonne>,
    pub lignes: Vec<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct Classeur {
    pub feuilles: Vec<FeuilleSpec>,
}

const FMT: [(TypeColonne, &str); 4] = [
    (TypeColonne::Nombre, "#,##0.##"),
    (TypeColonne::Euros, "#,##0.00\\ \"€\""),
    (TypeColonne::Date, "dd/mm/yyyy"),
    (TypeColonne::Pourcent, "0.00%"),
];

fn cellule(t: TypeColonne, v: &serde_json::Value) -> Result<Value, Erreur> {
    use serde_json::Value as J;
    Ok(match (t, v) {
        (_, J::Null) => Value::Empty,
        (TypeColonne::Euros, J::Number(n)) => Value::number(n.as_f64().unwrap_or(0.0) / 100.0),
        (TypeColonne::Pourcent, J::Number(n)) => Value::number(n.as_f64().unwrap_or(0.0) / 10_000.0),
        (TypeColonne::Date, J::String(s)) => {
            let p: Vec<i64> = s.get(..10).unwrap_or(s).split('-').filter_map(|x| x.parse().ok()).collect();
            match p.as_slice() {
                [a, m, j] => Value::number(
                    serial_from_ymd(DateSystem::D1900, *a, *m, *j)
                        .ok_or_else(|| Erreur::Donnees(format!("date {s}")))?,
                ),
                _ => return Err(Erreur::Donnees(format!("date {s} (AAAA-MM-JJ attendu)"))),
            }
        }
        (_, J::Number(n)) => Value::number(n.as_f64().unwrap_or(0.0)),
        (_, J::String(s)) => Value::text(s.as_str()),
        (_, J::Bool(b)) => Value::Bool(*b),
        (_, autre) => Value::text(autre.to_string()),
    })
}

fn feuille(wb: &mut Workbook, spec: &FeuilleSpec) -> Result<Sheet, Erreur> {
    let mut s = Sheet::new(spec.nom.clone());
    let mut entete = Style::default();
    entete.font.bold = true;
    entete.fill = Fill::solid(Color::Rgb(0xEE_F2_F1));
    let entete = wb.styles.intern(entete);
    let formats: Vec<_> = spec
        .colonnes
        .iter()
        .map(|c| {
            FMT.iter()
                .find(|(t, _)| *t == c.type_)
                .map(|(_, f)| wb.styles.intern(Style { num_fmt: NumFmt(Arc::from(*f)), ..Style::default() }))
        })
        .collect();
    for (col, c) in spec.colonnes.iter().enumerate() {
        let r = CellRef::new(0, col as u32);
        s.set_value(r, Value::text(c.titre.as_str()));
        s.set_style(r, entete);
        let largeur = c.largeur.unwrap_or_else(|| (c.titre.chars().count() as f32 + 4.0).max(12.0));
        // Size in pixels for gridcraft (characters = (px − 5) / 7).
        s.cols.insert(col as u32, LineInfo { size: Some(largeur * 7.0 + 5.0), ..LineInfo::default() });
    }
    for (i, ligne) in spec.lignes.iter().enumerate() {
        if ligne.len() > spec.colonnes.len() {
            return Err(Erreur::Donnees(format!("{} : ligne {} trop longue", spec.nom, i + 1)));
        }
        for (col, v) in ligne.iter().enumerate() {
            let r = CellRef::new(i as u32 + 1, col as u32);
            let c = cellule(spec.colonnes[col].type_, v)?;
            if matches!(c, Value::Empty) {
                continue;
            }
            s.set_value(r, c);
            if let Some(f) = formats[col] {
                s.set_style(r, f);
            }
        }
    }
    s.freeze = Some((1, 0));
    Ok(s)
}

pub fn ecrire(c: &Classeur) -> Result<Vec<u8>, Erreur> {
    if c.feuilles.is_empty() {
        return Err(Erreur::Donnees("aucune feuille".into()));
    }
    let mut wb = Workbook::new();
    wb.sheets.clear();
    for spec in &c.feuilles {
        wb.check_sheet_name(&spec.nom, None).map_err(Erreur::Donnees)?;
        let s = feuille(&mut wb, spec)?;
        wb.sheets.push(Arc::new(s));
    }
    Ok(write_xlsx(&wb)?)
}

/// Targeted edit: Excel coordinates from 1; formatting and other sheets kept.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditionCellule {
    pub feuille: String,
    pub ligne: u32,
    pub colonne: u32,
    #[serde(default)]
    pub valeur: serde_json::Value,
    pub formule: Option<String>,
}

pub fn modifier(octets: &[u8], editions: &[EditionCellule]) -> Result<Vec<u8>, Erreur> {
    use gridcraft_model::{Cell, Formula};
    if editions.is_empty() || editions.len() > 10_000 {
        return Err(Erreur::Donnees("between 1 and 10,000 cells expected".into()));
    }
    let (mut wb, _) = read_xlsx(octets)?;
    let cellules: usize = wb.sheets.iter().map(|s| s.cells.iter().count()).sum();
    if cellules > 500_000 {
        return Err(Erreur::Donnees("more than 500,000 cells: server-side editing is limited".into()));
    }
    for e in editions {
        if !(1..=1_048_576).contains(&e.ligne) || !(1..=16_384).contains(&e.colonne) {
        return Err(Erreur::Donnees("coordinates outside the Excel workbook".into()));
        }
        let index = wb.sheet_index(&e.feuille).ok_or_else(|| Erreur::Donnees("feuille introuvable".into()))?;
        let s = wb.sheet_mut(index).ok_or_else(|| Erreur::Donnees("feuille introuvable".into()))?;
        let r = CellRef::new(e.ligne - 1, e.colonne - 1);
        if let Some(f) = &e.formule {
            if !e.valeur.is_null() || f.len() > 8192 {
                return Err(Erreur::Donnees("formule invalide".into()));
            }
            let f = Formula::new(f);
            if f.expr.is_none() {
                return Err(Erreur::Donnees("syntaxe de formule invalide".into()));
            }
            let mut cell = Cell::formula(f);
            cell.style = s.style_id(r);
            s.set_cell(r, cell);
        } else {
            if e.valeur.is_array() || e.valeur.is_object() || e.valeur.as_str().is_some_and(|v| v.len() > 100_000) {
                return Err(Erreur::Donnees("valeur de cellule invalide".into()));
            }
            s.set_value(r, cellule(TypeColonne::Texte, &e.valeur)?);
        }
    }
    gridcraft_calc::Calc::new().recalc_all(&mut wb);
    Ok(write_xlsx(&wb)?)
}
