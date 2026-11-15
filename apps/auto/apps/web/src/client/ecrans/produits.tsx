import type { Tva } from "@auto/domain";
import { Package, PackagePlus } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi } from "@auto/client";
import { eur, TAUX_TVA, tauxTva, versCentimes } from "@auto/ui/format";
import { peut, useSession } from "../session";
import {
  Bouton,
  ChampListe,
  ChampTexte,
  EtatChargement,
  EtatErreur,
  EtatVide,
  Modale,
  ResumeErreurs,
  useDonnees,
  useTitrePage,
  useToast,
} from "@auto/ui/react";
import { t } from "../i18n";

function FormulaireProduit({ onFin }: { onFin: (ok: boolean) => void }) {
  const { moi } = useSession();
  const toast = useToast();
  const [designation, setDesignation] = useState("");
  const [prix, setPrix] = useState("");
  const [tva, setTva] = useState<Tva>(moi.entreprise.franchiseTva ? 0 : 200);
  const [unite, setUnite] = useState("");
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const c = versCentimes(prix);
    const x = {
      designation: designation.trim() ? undefined : t("common.designation_required"),
      prix: c === null ? t("common.amount_example") : undefined,
    };
    setErr(x);
    if (x.designation || x.prix) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.creerProduit({
        designation: designation.trim(),
        prixUnitaireHtCents: c!,
        tva,
        ...(unite.trim() ? { unite: unite.trim() } : {}),
      });
      toast(t("products.added"));
      onFin(true);
    } catch (y) {
      setErreur(y as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="grille" noValidate onSubmit={soumettre}>
      <ResumeErreurs erreur={erreur} />
      <ChampTexte
        libelle={t("common.designation")}
        requis
        value={designation}
        erreur={err.designation}
        onChange={(e) => setDesignation(e.target.value)}
      />
      <div className="grille grille-3">
        <ChampTexte
          libelle={t("products.unit_price")}
          inputMode="decimal"
          requis
          value={prix}
          erreur={err.prix}
          onChange={(e) => setPrix(e.target.value)}
        />
        <ChampListe
          libelle={t("common.vat")}
          value={tva}
          disabled={moi.entreprise.franchiseTva}
          onChange={(e) => setTva(Number(e.target.value) as Tva)}
        >
          {TAUX_TVA.map((t) => (
            <option key={t} value={t}>
              {tauxTva(t)}
            </option>
          ))}
        </ChampListe>
        <ChampTexte
          libelle={t("common.unit")}
          placeholder={t("products.unit_placeholder")}
          value={unite}
          onChange={(e) => setUnite(e.target.value)}
        />
      </div>
      <div className="rangee">
        <span className="espace" />
        <Bouton onClick={() => onFin(false)}>{t("common.cancel")}</Bouton>
        <Bouton type="submit" variante="primaire" chargement={envoi}>
          {t("common.save")}
        </Bouton>
      </div>
    </form>
  );
}

export function Produits() {
  useTitrePage(t("products.title"));
  const { moi } = useSession();
  const ecrire = peut(moi.role, "ecrire");
  const [ouvert, setOuvert] = useState(false);
  const d = useDonnees(() => api.produits());

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.length === 0)
    corps = (
      <EtatVide icone={Package} titre={t("products.empty")}>
        <p>{t("products.empty_text")}</p>
      </EtatVide>
    );
  else
    corps = (
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">{t("common.designation")}</th>
              <th scope="col">{t("common.unit")}</th>
              <th scope="col" className="num">
                {t("products.col.price")}
              </th>
              <th scope="col" className="num">
                {t("common.vat")}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.donnees.map((p) => (
              <tr key={p.id}>
                <td data-libelle={t("common.designation")}>{p.designation}</td>
                <td data-libelle={t("common.unit")}>{p.unite ?? "—"}</td>
                <td data-libelle={t("products.col.price")} className="num">
                  {eur(p.prixUnitaireHtCents)}
                </td>
                <td data-libelle={t("common.vat")} className="num">
                  {tauxTva(p.tva)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("products.heading")}</h1>
        {ecrire && (
          <Bouton variante="primaire" icone={PackagePlus} onClick={() => setOuvert(true)}>
            {t("products.add")}
          </Bouton>
        )}
      </div>
      {corps}
      <Modale ouverte={ouvert} titre={t("products.add")} onFermer={() => setOuvert(false)}>
        <FormulaireProduit
          onFin={(ok) => {
            setOuvert(false);
            if (ok) d.recharger();
          }}
        />
      </Modale>
    </div>
  );
}
