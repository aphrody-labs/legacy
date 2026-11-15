import { BadgeEuro, ClockAlert, FilePlus2, Landmark, Percent, ReceiptText } from "@auto/ui/symboles";
import type { Symbole } from "@auto/ui/symboles";
import { api } from "@auto/client";
import { aujourdhui, dateFr, eur, indicateurs, moisFr, nombre } from "@auto/ui/format";
import { useSession } from "../session";
import { EtatChargement, EtatErreur, EtatVide, Lien, useDonnees, useTitrePage } from "@auto/ui/react";
import { TableauDocuments } from "./liste";
import { t } from "../i18n";

function Kpi({
  icone: Icone,
  libelle,
  valeur,
  detail,
}: {
  icone: Symbole;
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <section className="carte kpi" aria-label={libelle}>
      <span className="kpi-libelle">
        <Icone className="icone icone-sm" aria-hidden="true" />
        {libelle}
      </span>
      <span className="kpi-valeur">{valeur}</span>
      {detail && <span className="kpi-detail">{detail}</span>}
    </section>
  );
}

export function TableauDeBord() {
  useTitrePage(t("dashboard.title"));
  const { moi } = useSession();
  const jour = aujourdhui();
  const d = useDonnees(async () => {
    const [docs, relances] = await Promise.all([api.documents(), api.aRelancer(jour)]);
    return { docs, relances };
  });

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.docs.length === 0)
    corps = (
      <EtatVide icone={ReceiptText} titre={t("dashboard.first_quote")}>
        <p>{t("dashboard.first_quote_text")}</p>
        <div className="rangee">
          <Lien className="bouton bouton-primaire" href="/app/documents/nouveau?type=devis">
            {t("dashboard.create_quote")}
          </Lien>
          <Lien className="bouton" href="/app/documents/nouveau?type=facture">
            {t("dashboard.create_invoice")}
          </Lien>
        </div>
      </EtatVide>
    );
  else {
    const { docs, relances } = d.donnees;
    const restes = Object.fromEntries(relances.map((r) => [r.documentId, r.resteCents]));
    const k = indicateurs(
      docs.map((x) => ({ ...x, data: x.data })),
      jour,
      restes,
    );
    const brouillons = docs.filter((x) => x.statut === "brouillon");
    corps = (
      <>
        <div className="kpis">
          <Kpi
            icone={BadgeEuro}
            libelle={t("dashboard.kpi.revenue", { month: moisFr(jour) })}
            valeur={eur(k.caMoisHtCents)}
            detail={t("dashboard.kpi.revenue_detail")}
          />
          <Kpi
            icone={Landmark}
            libelle={t("dashboard.kpi.unpaid")}
            valeur={eur(k.impayesCents)}
            detail={t("dashboard.kpi.unpaid_detail", { count: k.impayes })}
          />
          <Kpi
            icone={ClockAlert}
            libelle={t("dashboard.kpi.late")}
            valeur={eur(k.enRetardCents)}
            detail={t("dashboard.kpi.late_detail", { count: k.enRetard })}
          />
          <Kpi
            icone={Percent}
            libelle={t("dashboard.kpi.vat", { month: moisFr(jour) })}
            valeur={eur(k.tvaMoisCents)}
            detail={moi.entreprise.franchiseTva ? t("dashboard.kpi.vat_franchise") : t("dashboard.kpi.vat_detail")}
          />
        </div>

        <section className="carte pile-serree" aria-labelledby="a-relancer">
          <h2 id="a-relancer">{t("dashboard.reminders")}</h2>
          {relances.length === 0 ? (
            <p className="attenue">{t("dashboard.reminders_none")}</p>
          ) : (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">{t("col.number")}</th>
                    <th scope="col">{t("col.customer")}</th>
                    <th scope="col">{t("col.due")}</th>
                    <th scope="col" className="num">
                      {t("dashboard.col.delay")}
                    </th>
                    <th scope="col" className="num">
                      {t("dashboard.col.balance")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {relances.map((r) => (
                    <tr key={r.documentId}>
                      <td data-libelle={t("col.number")}>
                        <Lien href={`/app/documents/${r.documentId}`}>{r.numero}</Lien>
                      </td>
                      <td data-libelle={t("col.customer")}>{r.client.nom}</td>
                      <td data-libelle={t("col.due")} className="num">
                        {dateFr(r.echeance)}
                      </td>
                      <td data-libelle={t("dashboard.col.delay")} className="num">
                        {t("dashboard.late_days", { days: r.joursRetard, level: r.niveau })}
                      </td>
                      <td data-libelle={t("dashboard.col.balance")} className="num">
                        {eur(r.resteCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {brouillons.length > 0 && (
          <section className="pile-serree" aria-labelledby="brouillons">
            <h2 id="brouillons">{t("dashboard.drafts")}</h2>
            <TableauDocuments docs={brouillons} jour={jour} />
          </section>
        )}
      </>
    );
  }

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("dashboard.title")}</h1>
        <Lien className="bouton bouton-primaire" href="/app/documents/nouveau?type=facture">
          <FilePlus2 className="icone" aria-hidden="true" />
          {t("dashboard.new_invoice")}
        </Lien>
      </div>
      {corps}
    </div>
  );
}
