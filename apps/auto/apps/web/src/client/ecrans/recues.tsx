import type { StatutVisuel } from "@auto/ui";
import { Inbox } from "@auto/ui/symboles";
import { useState } from "react";
import { api, ErreurApi, type Recue } from "@auto/client";
import { dateFr, eur } from "@auto/ui/format";
import { peut, useSession } from "../session";
import { ClasserAchat } from "./affectations";
import {
  BadgeStatut,
  Bouton,
  EtatChargement,
  EtatErreur,
  EtatVide,
  ResumeErreurs,
  useDonnees,
  useTitrePage,
  useToast,
} from "@auto/ui/react";
import { t } from "../i18n";

type Filtre = Recue["statut"] | "toutes";
const FILTRES: Filtre[] = ["a_verifier", "validee", "rejetee", "toutes"];
const STATUT: Record<Recue["statut"], StatutVisuel> = {
  a_verifier: "envoye",
  validee: "accepte",
  rejetee: "refuse",
};

/** Received supplier invoices (Chrome extension, email, platform): check, then approve or reject. */
export function FacturesRecues() {
  useTitrePage(t("received.title"));
  const { moi } = useSession();
  const toast = useToast();
  const [filtre, setFiltre] = useState<Filtre>("a_verifier");
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [classement, setClassement] = useState<string | null>(null);
  const ecrire = peut(moi.role, "ecrire");
  const d = useDonnees(() => api.recues(filtre === "toutes" ? undefined : filtre), [filtre]);

  async function decider(r: Recue, statut: "validee" | "rejetee") {
    setErreur(null);
    try {
      await api.deciderRecue(r.id, statut);
      toast(r.numero ? t(`received.toast.${statut}`, { number: r.numero }) : t(`received.toast.${statut}_anon`));
      d.recharger();
    } catch (x) {
      setErreur(x as ErreurApi);
    }
  }

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.length === 0)
    corps = (
      <EtatVide icone={Inbox} titre={filtre === "a_verifier" ? t("received.empty_check") : t("received.empty")}>
        <p>{t("received.empty_text")}</p>
      </EtatVide>
    );
  else
    corps = (
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">{t("received.col.supplier")}</th>
              <th scope="col">{t("col.number")}</th>
              <th scope="col">{t("col.date")}</th>
              <th scope="col">{t("col.due")}</th>
              <th scope="col" className="num">
                {t("col.ttc")}
              </th>
              <th scope="col">{t("received.col.received_by")}</th>
              <th scope="col">{t("col.status")}</th>
              <th scope="col">
                <span className="visuellement-cache">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.donnees.map((r) => (
              <tr key={r.id}>
                <td data-libelle={t("received.col.supplier")} className="col-texte">
                  {r.fournisseur ?? t("received.supplier_unread")}
                  {r.anomalies.length > 0 && (
                    <span className="aide">
                      <br />
                      {t("received.anomalies", { count: r.anomalies.length })} : {r.anomalies.join(", ")}
                    </span>
                  )}
                </td>
                <td data-libelle={t("col.number")} className="chiffres">
                  <a href={api.urlFichierRecu(r.id)} target="_blank" rel="noopener">
                    {r.numero ?? t("received.open_file")}
                  </a>
                </td>
                <td data-libelle={t("col.date")} className="num">
                  {dateFr(r.date) || "—"}
                </td>
                <td data-libelle={t("col.due")} className="num">
                  {dateFr(r.echeance) || "—"}
                </td>
                <td data-libelle={t("col.ttc")} className="num">
                  {r.ttcCents === null ? "—" : eur(r.ttcCents)}
                </td>
                <td data-libelle={t("received.col.received_by")}>{t(`received.channel.${r.canal}`)}</td>
                <td data-libelle={t("col.status")}>
                  <BadgeStatut statut={STATUT[r.statut]} libelle={t(`received.status.${r.statut}`)} />
                </td>
                <td data-libelle={t("common.actions")}>
                  {ecrire && <Bouton onClick={() => setClassement(r.id)}>{t("received.classify")}</Bouton>}
                  {ecrire && r.statut === "a_verifier" && (
                    <div className="rangee actions-ligne">
                      <Bouton variante="primaire" onClick={() => decider(r, "validee")}>
                        {t("received.approve")}
                      </Bouton>
                      <Bouton onClick={() => decider(r, "rejetee")}>{t("received.reject")}</Bouton>
                    </div>
                  )}
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
        <h1>{t("received.title")}</h1>
      </div>
      <ResumeErreurs erreur={erreur} />
      <div className="onglets" role="group" aria-label={t("list.filter_label")}>
        {FILTRES.map((f) => (
          <button key={f} type="button" className="onglet" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
            {t(`received.filter.${f}`)}
          </button>
        ))}
      </div>
      {corps}
      {classement && (
        <ClasserAchat
          id={classement}
          onFin={() => {
            setClassement(null);
            d.recharger();
          }}
        />
      )}
    </div>
  );
}
