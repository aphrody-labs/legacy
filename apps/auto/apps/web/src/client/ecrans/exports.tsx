import { FileDown, FileSpreadsheet, Landmark } from "@auto/ui/symboles";
import { useState } from "react";
import { api } from "@auto/client";
import { aujourdhui } from "@auto/ui/format";
import { Bandeau, ChampTexte, useTitrePage } from "@auto/ui/react";
import { useSession } from "../session";
import { accesSegment } from "@auto/tenancy/segments";
import { t } from "../i18n";

export function Exports() {
  const { moi } = useSession();
  useTitrePage(t("exports.title"));
  const jour = aujourdhui();
  const [du, setDu] = useState(`${jour.slice(0, 4)}-01-01`);
  const [au, setAu] = useState(`${jour.slice(0, 4)}-12-31`);
  const [arrete, setArrete] = useState(jour);
  const invalide = !du || !au || au < du;

  const lien = (href: string, Icone: typeof FileDown, texte: string, desactive = false) =>
    desactive ? (
      <span className="bouton" aria-disabled="true">
        <Icone className="icone" aria-hidden="true" />
        {texte}
      </span>
    ) : (
      <a className="bouton" href={href} download>
        <Icone className="icone" aria-hidden="true" />
        {texte}
      </a>
    );

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("exports.heading")}</h1>
      </div>

      {accesSegment(moi, "clients") && (
        <>
          <section className="carte grille" aria-labelledby="sec-periode">
            <h2 id="sec-periode">{t("exports.sales.title")}</h2>
            <div className="grille grille-2">
              <ChampTexte libelle={t("exports.from")} type="date" value={du} onChange={(e) => setDu(e.target.value)} />
              <ChampTexte
                libelle={t("exports.to")}
                type="date"
                value={au}
                erreur={invalide ? t("exports.period_error") : null}
                onChange={(e) => setAu(e.target.value)}
              />
            </div>
            <div className="rangee">
              {lien(api.urlExport("ventes.xlsx", { du, au }), FileSpreadsheet, t("exports.sales_xlsx"), invalide)}
              {lien(api.urlExport("fec", { du, au }), Landmark, t("exports.fec"), invalide)}
            </div>
            <p className="attenue petit">{t("exports.fec_note")}</p>
          </section>

          <section className="carte grille" aria-labelledby="sec-creances">
            <h2 id="sec-creances">{t("exports.receivables.title")}</h2>
            <ChampTexte
              libelle={t("exports.as_of")}
              type="date"
              value={arrete}
              onChange={(e) => setArrete(e.target.value)}
            />
            <div>{lien(api.urlExport("creances.xlsx", { au: arrete }), FileDown, t("exports.receivables_xlsx"))}</div>
          </section>
        </>
      )}
      <section className="carte grille" aria-labelledby="sec-gestion">
        <h2 id="sec-gestion">{t("exports.spaces.title")}</h2>
        <p>{t("exports.spaces.text")}</p>
        <div className="rangee">
          {lien(api.url("/v1/exports/gestion.xlsx"), FileSpreadsheet, t("exports.workbook"))}
          {lien(api.url("/v1/exports/gestion.pdf"), FileDown, t("exports.report"))}
        </div>
        <p className="attenue petit">{t("exports.spaces.note")}</p>
      </section>

      <Bandeau>
        <p>{t("exports.banner")}</p>
      </Bandeau>
    </div>
  );
}
