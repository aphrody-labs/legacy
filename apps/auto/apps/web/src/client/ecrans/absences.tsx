import { CalendarDays } from "@auto/ui/symboles";
import { useState } from "react";
import { api, ErreurApi, type Absence } from "@auto/client";
import { peut, useSession } from "../session";
import {
  Bandeau,
  EtatChargement,
  EtatErreur,
  EtatVide,
  ResumeErreurs,
  useDonnees,
  useTitrePage,
  useToast,
} from "@auto/ui/react";
import { TableauAbsences } from "./employes";
import { t } from "../i18n";

type Filtre = Absence["statut"] | "toutes";
const FILTRES: Filtre[] = ["demandee", "validee", "refusee", "annulee", "toutes"];

export function Absences() {
  useTitrePage(t("absences.title"));
  const { moi } = useSession();
  const toast = useToast();
  const [filtre, setFiltre] = useState<Filtre>("demandee");
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const rh = peut(moi.role, "rh");
  const d = useDonnees(async () => {
    if (!rh) return { absences: [], noms: {} };
    const [absences, employes] = await Promise.all([
      api.absences(filtre === "toutes" ? undefined : filtre),
      api.employes(true),
    ]);
    return { absences, noms: Object.fromEntries(employes.map((e) => [e.id, `${e.prenom} ${e.nom}`])) };
  }, [filtre]);

  if (!rh)
    return (
      <div className="page">
        <h1>{t("absences.title")}</h1>
        <Bandeau ton="avertissement" titre={t("absences.restricted")}>
          <p>{t("absences.restricted_text")}</p>
        </Bandeau>
      </div>
    );

  async function decider(id: string, statut: "validee" | "refusee" | "annulee") {
    setErreur(null);
    try {
      await api.deciderAbsence(id, statut);
      toast(t(`absences.toast.${statut}`));
      d.recharger();
    } catch (x) {
      setErreur(x as ErreurApi);
    }
  }

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.absences.length === 0)
    corps = (
      <EtatVide icone={CalendarDays} titre={filtre === "demandee" ? t("absences.empty_pending") : t("absences.empty")}>
        <p>{t("absences.empty_text")}</p>
      </EtatVide>
    );
  else corps = <TableauAbsences absences={d.donnees.absences} noms={d.donnees.noms} decider={decider} />;

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("absences.title")}</h1>
      </div>
      <ResumeErreurs erreur={erreur} />
      <div className="onglets" role="group" aria-label={t("absences.filter_label")}>
        {FILTRES.map((f) => (
          <button key={f} type="button" className="onglet" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
            {t(`absences.filter.${f}`)}
          </button>
        ))}
      </div>
      {corps}
    </div>
  );
}
