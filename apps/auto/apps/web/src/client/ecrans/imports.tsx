// Guided import: file → preview and column mapping proposed by the API → import → per-row summary.
import { FileInput, FileSpreadsheet, Upload } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi, type Apercu, type ResultatImport } from "@auto/client";
import { enBase64, nombre, pluriel } from "@auto/ui/format";
import { Bandeau, Bouton, ChampListe, ChampTexte, ResumeErreurs, useTitrePage, useToast } from "@auto/ui/react";
import { t } from "../i18n";

type Cible = "clients" | "produits";

const CHAMPS: Record<Cible, { cle: string; libelle: string; requis?: boolean }[]> = {
  clients: [
    { cle: "nom", libelle: "imports.field.name", requis: true },
    { cle: "adresse", libelle: "imports.field.address", requis: true },
    { cle: "siret", libelle: "SIRET" },
    { cle: "tvaIntracom", libelle: "imports.field.vat_number" },
    { cle: "email", libelle: "imports.field.email" },
  ],
  produits: [
    { cle: "designation", libelle: "imports.field.designation", requis: true },
    { cle: "prixHt", libelle: "imports.field.price", requis: true },
    { cle: "tva", libelle: "imports.field.vat_rate" },
    { cle: "unite", libelle: "imports.field.unit" },
  ],
};

const MAX_OCTETS = 10 * 1024 * 1024;
/** Field label: a catalog key, except the SIRET acronym which stays as is. */
const fieldLabel = (k: string) => (k.includes(".") ? t(k) : k);

export function Imports() {
  useTitrePage(t("imports.title"));
  const toast = useToast();
  const [cible, setCible] = useState<Cible>("clients");
  const [fichier, setFichier] = useState<{ nom: string; base64: string } | null>(null);
  const [entete, setEntete] = useState("1");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [corr, setCorr] = useState<Record<string, number>>({});
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [errFichier, setErrFichier] = useState<string | null>(null);
  const [errCorr, setErrCorr] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState<"" | "apercu" | "import">("");

  const ligneEntete = Math.max(0, (Number(entete) || 1) - 1);

  async function choisir(f: File | undefined) {
    setApercu(null);
    setResultat(null);
    setErreur(null);
    if (!f) return setFichier(null);
    if (f.size > MAX_OCTETS) {
      setErrFichier(t("imports.too_big"));
      return setFichier(null);
    }
    setErrFichier(null);
    setFichier({ nom: f.name, base64: enBase64(new Uint8Array(await f.arrayBuffer())) });
  }

  async function lireApercu(e: FormEvent) {
    e.preventDefault();
    if (!fichier) return setErrFichier(t("imports.choose_file"));
    setEnvoi("apercu");
    setErreur(null);
    setResultat(null);
    try {
      const a = await api.apercuImport(fichier.base64, ligneEntete);
      setApercu(a);
      setCorr({ ...(a.correspondance[cible] as Record<string, number>) });
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi("");
    }
  }

  async function importer() {
    if (!fichier || !apercu) return;
    const manquants = CHAMPS[cible]
      .filter((c) => c.requis && corr[c.cle] === undefined)
      .map((c) => fieldLabel(c.libelle));
    if (manquants.length) return setErrCorr(t("imports.map_required", { fields: manquants.join(", ") }));
    setErrCorr(null);
    setEnvoi("import");
    setErreur(null);
    try {
      const r = await api.importer(cible, fichier.base64, corr, ligneEntete);
      setResultat(r);
      toast(t(`imports.toast.${cible}`, { count: r.crees }));
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi("");
    }
  }

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("imports.title")}</h1>
      </div>
      <ResumeErreurs erreur={erreur} />

      <form className="carte grille" noValidate onSubmit={lireApercu} aria-labelledby="sec-fichier">
        <h2 id="sec-fichier">{t("imports.step1")}</h2>
        <div className="grille grille-3">
          <ChampListe
            libelle={t("imports.import_what")}
            value={cible}
            onChange={(e) => {
              const c = e.target.value as Cible;
              setCible(c);
              setResultat(null);
              if (apercu) setCorr({ ...(apercu.correspondance[c] as Record<string, number>) });
            }}
          >
            <option value="clients">{t("imports.customers")}</option>
            <option value="produits">{t("imports.products")}</option>
          </ChampListe>
          <div className="champ">
            <label htmlFor="fichier-import">{t("imports.spreadsheet")}</label>
            <input
              id="fichier-import"
              className="controle"
              type="file"
              accept=".xlsx,.xls,.xlsb,.ods,.csv"
              aria-describedby={errFichier ? "fichier-aide fichier-erreur" : "fichier-aide"}
              aria-invalid={errFichier ? true : undefined}
              onChange={(e) => void choisir(e.target.files?.[0])}
            />
            <span id="fichier-aide" className="aide">
              {t("imports.file_help")}
            </span>
            {errFichier && (
              <span id="fichier-erreur" className="erreur-champ">
                {errFichier}
              </span>
            )}
          </div>
          <ChampTexte
            libelle={t("imports.header_row")}
            inputMode="numeric"
            aide={t("imports.header_row_help")}
            value={entete}
            onChange={(e) => setEntete(e.target.value)}
          />
        </div>
        <div>
          <Bouton type="submit" icone={FileSpreadsheet} chargement={envoi === "apercu"}>
            {t("imports.read_preview")}
          </Bouton>
        </div>
      </form>

      {apercu && (
        <section className="carte pile-serree" aria-labelledby="sec-corr">
          <h2 id="sec-corr">{t("imports.step2")}</h2>
          <p className="attenue">
            {t("imports.sheet_info", { sheet: apercu.nomFeuille, format: apercu.format, rows: apercu.lignes })}
          </p>
          {apercu.avertissements.length > 0 && (
            <Bandeau ton="avertissement" titre={t("imports.warnings")}>
              <ul>
                {apercu.avertissements.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Bandeau>
          )}
          <div className="grille grille-3">
            {CHAMPS[cible].map((c) => (
              <ChampListe
                key={c.cle}
                libelle={fieldLabel(c.libelle)}
                requis={c.requis}
                value={corr[c.cle] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const n = { ...corr };
                  if (v === "") delete n[c.cle];
                  else n[c.cle] = Number(v);
                  setCorr(n);
                }}
              >
                <option value="">{t("imports.skip")}</option>
                {apercu.entete.map((h, i) => (
                  <option key={i} value={i}>
                    {String(h ?? t("imports.column", { n: i + 1 }))}
                  </option>
                ))}
              </ChampListe>
            ))}
          </div>
          {errCorr && (
            <p className="erreur-champ" role="alert">
              {errCorr}
            </p>
          )}
          <div className="tableau-conteneur">
            <table className="tableau">
              <caption className="visuellement-cache">{t("imports.preview_caption")}</caption>
              <thead>
                <tr>
                  {apercu.entete.map((h, i) => (
                    <th key={i} scope="col">
                      {String(h ?? t("imports.column", { n: i + 1 }))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apercu.apercu.map((l, i) => (
                  <tr key={i}>
                    {apercu.entete.map((h, j) => (
                      <td key={j} data-libelle={String(h ?? t("imports.column", { n: j + 1 }))}>
                        {String(l[j] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Bouton variante="primaire" icone={Upload} chargement={envoi === "import"} onClick={importer}>
              {t("imports.import_rows", { rows: apercu.lignes })}
            </Bouton>
          </div>
        </section>
      )}

      {resultat && (
        <section className="carte pile-serree" aria-labelledby="sec-bilan" aria-live="polite">
          <h2 id="sec-bilan">{t("imports.step3")}</h2>
          <Bandeau
            ton={resultat.erreurs.length ? "avertissement" : "succes"}
            titre={t("imports.summary", {
              created: t("imports.created", { count: resultat.crees }),
              ignored: t("imports.ignored", { count: resultat.ignores }),
            })}
          >
            {resultat.erreurs.length > 0 && <p>{t("imports.error_rows", { count: resultat.erreurs.length })}</p>}
          </Bandeau>
          {resultat.erreurs.length > 0 && (
            <ul>
              {resultat.erreurs.map((e) => (
                <li key={e.ligne}>{t("imports.row_error", { row: e.ligne, message: e.message })}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!apercu && !resultat && (
        <Bandeau titre={t("imports.how")}>
          <p>
            <FileInput className="icone icone-sm" aria-hidden="true" /> {t("imports.how_text")}
          </p>
        </Bandeau>
      )}
    </div>
  );
}
