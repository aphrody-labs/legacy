import { CONTRATS, TYPES_ABSENCE, type Contrat, type Employe, type TypeAbsence } from "@auto/domain";
import { CalendarPlus, UserPlus, UserRound } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi, type FicheEmploye } from "@auto/client";
import {
  aujourdhui,
  dateFr,
  emailValide,
  eur,
  jours,
  LIBELLE_ABSENCE,
  LIBELLE_CONTRAT,
  LIBELLE_STATUT_ABSENCE,
  nombre,
  versCentimes,
} from "@auto/ui/format";
import { peut, useSession } from "../session";
import {
  Bandeau,
  Bouton,
  ChampListe,
  ChampTexte,
  ChampZone,
  EtatChargement,
  EtatErreur,
  EtatVide,
  Lien,
  Modale,
  ResumeErreurs,
  useDonnees,
  useTitrePage,
  useToast,
} from "@auto/ui/react";
import { t } from "../i18n";

function FormulaireEmploye({ onFin }: { onFin: (ok: boolean) => void }) {
  const toast = useToast();
  const [e, setE] = useState({
    prenom: "",
    nom: "",
    email: "",
    poste: "",
    contrat: "cdi" as Contrat,
    dateEntree: aujourdhui(),
    tempsTravail: "100",
    salaire: "",
  });
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    const salaire = versCentimes(e.salaire);
    const temps = Number(e.tempsTravail);
    const x = {
      prenom: e.prenom.trim() ? undefined : t("emp.err.first_name"),
      nom: e.nom.trim() ? undefined : t("emp.err.last_name"),
      poste: e.poste.trim() ? undefined : t("emp.err.position"),
      email: !e.email || emailValide(e.email) ? undefined : t("customers.err.email"),
      tempsTravail: temps > 0 && temps <= 100 ? undefined : t("emp.err.time"),
      salaire: salaire === null ? t("emp.err.salary") : undefined,
    };
    setErr(x);
    if (Object.values(x).some(Boolean)) return;
    setEnvoi(true);
    setErreur(null);
    const corps: Employe = {
      prenom: e.prenom.trim(),
      nom: e.nom.trim(),
      poste: e.poste.trim(),
      contrat: e.contrat,
      dateEntree: e.dateEntree,
      tempsTravail: temps,
      salaireBrutMensuelCents: salaire!,
      ...(e.email.trim() ? { email: e.email.trim() } : {}),
    };
    try {
      await api.creerEmploye(corps);
      toast(t("emp.added"));
      onFin(true);
    } catch (y) {
      setErreur(y as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  const champ = (k: keyof typeof e) => ({
    value: e[k],
    erreur: err[k],
    onChange: (x: { target: { value: string } }) => setE({ ...e, [k]: x.target.value }),
  });

  return (
    <form className="grille" noValidate onSubmit={soumettre}>
      <ResumeErreurs erreur={erreur} />
      <div className="grille grille-2">
        <ChampTexte libelle={t("emp.first_name")} requis autoComplete="off" {...champ("prenom")} />
        <ChampTexte libelle={t("emp.last_name")} requis autoComplete="off" {...champ("nom")} />
        <ChampTexte libelle={t("emp.position")} requis {...champ("poste")} />
        <ChampTexte libelle={t("common.email")} type="email" {...champ("email")} />
        <ChampListe
          libelle={t("emp.contract")}
          value={e.contrat}
          onChange={(x) => setE({ ...e, contrat: x.target.value as Contrat })}
        >
          {CONTRATS.map((c) => (
            <option key={c} value={c}>
              {LIBELLE_CONTRAT[c]}
            </option>
          ))}
        </ChampListe>
        <ChampTexte libelle={t("emp.start_date")} type="date" requis {...champ("dateEntree")} />
        <ChampTexte libelle={t("emp.working_time")} inputMode="numeric" {...champ("tempsTravail")} />
        <ChampTexte libelle={t("emp.salary_input")} inputMode="decimal" requis {...champ("salaire")} />
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

function ListeEmployes() {
  useTitrePage(t("emp.title"));
  const [tous, setTous] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const d = useDonnees(() => api.employes(tous), [tous]);

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.length === 0)
    corps = (
      <EtatVide icone={UserRound} titre={t("emp.none")}>
        <p>{t("emp.none_text")}</p>
      </EtatVide>
    );
  else
    corps = (
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">{t("common.name")}</th>
              <th scope="col">{t("emp.position")}</th>
              <th scope="col">{t("emp.contract")}</th>
              <th scope="col">{t("emp.col.start")}</th>
              <th scope="col" className="num">
                {t("emp.col.time")}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.donnees.map((e) => (
              <tr key={e.id}>
                <td data-libelle={t("common.name")}>
                  <Lien href={`/app/employes/${e.id}`}>
                    {e.prenom} {e.nom}
                  </Lien>
                </td>
                <td data-libelle={t("emp.position")}>{e.poste}</td>
                <td data-libelle={t("emp.contract")}>{LIBELLE_CONTRAT[e.contrat]}</td>
                <td data-libelle={t("emp.col.start")} className="num">
                  {dateFr(e.dateEntree)}
                </td>
                <td data-libelle={t("emp.col.time")} className="num">
                  {nombre(e.tempsTravail)} %
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
        <h1>{t("emp.title")}</h1>
        <Bouton variante="primaire" icone={UserPlus} onClick={() => setOuvert(true)}>
          {t("emp.add")}
        </Bouton>
      </div>
      <label className="case">
        <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
        {t("emp.include_left")}
      </label>
      {corps}
      <Modale ouverte={ouvert} titre={t("emp.add")} onFermer={() => setOuvert(false)}>
        <FormulaireEmploye
          onFin={(ok) => {
            setOuvert(false);
            if (ok) d.recharger();
          }}
        />
      </Modale>
    </div>
  );
}

function DemandeAbsence({ employe, onFin }: { employe: FicheEmploye; onFin: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<TypeAbsence>("conges_payes");
  const [debut, setDebut] = useState(aujourdhui());
  const [fin, setFin] = useState(aujourdhui());
  const [motif, setMotif] = useState("");
  const [errFin, setErrFin] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (fin < debut) {
      setErrFin(t("emp.err.end"));
      return;
    }
    setErrFin(null);
    setEnvoi(true);
    setErreur(null);
    try {
      const a = await api.demanderAbsence(employe.id, {
        type,
        debut,
        fin,
        ...(motif.trim() ? { motif: motif.trim() } : {}),
      });
      toast(t("emp.absence_requested", { n: a.joursOuvrables }));
      onFin();
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="carte grille" noValidate onSubmit={soumettre} aria-labelledby="sec-demande">
      <h2 id="sec-demande">{t("emp.request_absence")}</h2>
      <ResumeErreurs erreur={erreur} />
      <div className="grille grille-3">
        <ChampListe libelle={t("col.type")} value={type} onChange={(e) => setType(e.target.value as TypeAbsence)}>
          {TYPES_ABSENCE.map((k) => (
            <option key={k} value={k}>
              {LIBELLE_ABSENCE[k]}
            </option>
          ))}
        </ChampListe>
        <ChampTexte libelle={t("emp.from")} type="date" requis value={debut} onChange={(e) => setDebut(e.target.value)} />
        <ChampTexte
          libelle={t("emp.to_inclusive")}
          type="date"
          requis
          value={fin}
          erreur={errFin}
          onChange={(e) => setFin(e.target.value)}
        />
      </div>
      <ChampZone libelle={t("emp.reason")} rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
      <div>
        <Bouton type="submit" icone={CalendarPlus} chargement={envoi}>
          {t("emp.send_request")}
        </Bouton>
      </div>
    </form>
  );
}

function FicheEmployeEcran({ id }: { id: string }) {
  const d = useDonnees(async () => {
    const [e, solde, absences] = await Promise.all([api.employe(id), api.conges(id), api.absencesEmploye(id)]);
    return { e, solde, absences };
  }, [id]);
  useTitrePage(d.etat === "ok" ? `${d.donnees.e.prenom} ${d.donnees.e.nom}` : t("emp.one"));
  if (d.etat === "chargement")
    return (
      <div className="page">
        <EtatChargement />
      </div>
    );
  if (d.etat === "erreur")
    return (
      <div className="page">
        <h1>{t("emp.one")}</h1>
        <EtatErreur message={d.erreur} onReessayer={d.recharger} />
      </div>
    );
  const { e, solde, absences } = d.donnees;
  return (
    <div className="page">
      <p className="fil">
        <Lien href="/app/employes">{t("emp.title")}</Lien>
      </p>
      <div className="page-entete">
        <h1>
          {e.prenom} {e.nom}
        </h1>
      </div>
      <div className="grille grille-2">
        <section className="carte resume" aria-labelledby="sec-fiche">
          <h2 id="sec-fiche">{t("emp.sheet")}</h2>
          <dl>
            <dt>{t("emp.position")}</dt>
            <dd>{e.poste}</dd>
            <dt>{t("emp.contract")}</dt>
            <dd>{LIBELLE_CONTRAT[e.contrat]}</dd>
            <dt>{t("emp.col.start")}</dt>
            <dd className="chiffres">{dateFr(e.dateEntree)}</dd>
            {e.dateSortie && (
              <>
                <dt>{t("emp.end_date")}</dt>
                <dd className="chiffres">{dateFr(e.dateSortie)}</dd>
              </>
            )}
            <dt>{t("emp.working_time")}</dt>
            <dd className="chiffres">{nombre(e.tempsTravail)} %</dd>
            <dt>{t("emp.gross_salary")}</dt>
            <dd className="chiffres">{t("emp.per_month", { amount: eur(e.salaireBrutMensuelCents) })}</dd>
          </dl>
        </section>
        <section className="carte resume" aria-labelledby="sec-solde">
          <h2 id="sec-solde">{t("emp.leave_title", { date: dateFr(solde.periode) || solde.periode })}</h2>
          <p className="kpi-valeur">{t("emp.available", { days: jours(solde.disponible) })}</p>
          <dl>
            <dt>{t("emp.accrued")}</dt>
            <dd className="chiffres">{jours(solde.acquis)}</dd>
            <dt>{t("emp.taken")}</dt>
            <dd className="chiffres">{jours(solde.pris)}</dd>
            <dt>{t("emp.pending")}</dt>
            <dd className="chiffres">{jours(solde.demandes)}</dd>
          </dl>
          <p className="attenue petit">{t("emp.leave_rule")}</p>
        </section>
      </div>
      <DemandeAbsence employe={e} onFin={d.recharger} />
      <section className="pile-serree" aria-labelledby="sec-absences">
        <h2 id="sec-absences">{t("absences.title")}</h2>
        {absences.length === 0 ? <p className="attenue">{t("absences.empty")}.</p> : <TableauAbsences absences={absences} />}
      </section>
    </div>
  );
}

export function TableauAbsences({
  absences,
  noms,
  decider,
}: {
  absences: import("@auto/client").Absence[];
  noms?: Record<string, string>;
  decider?: (id: string, statut: "validee" | "refusee" | "annulee") => void;
}) {
  return (
    <div className="tableau-conteneur">
      <table className="tableau">
        <thead>
          <tr>
            {noms && <th scope="col">{t("emp.col.employee")}</th>}
            <th scope="col">{t("col.type")}</th>
            <th scope="col">{t("emp.from")}</th>
            <th scope="col">{t("emp.to")}</th>
            <th scope="col" className="num">
              {t("emp.col.business_days")}
            </th>
            <th scope="col">{t("col.status")}</th>
            {decider && (
              <th scope="col">
                <span className="visuellement-cache">{t("emp.col.decision")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {absences.map((a) => (
            <tr key={a.id}>
              {noms && <td data-libelle={t("emp.col.employee")}>{noms[a.employeId] ?? "—"}</td>}
              <td data-libelle={t("col.type")}>{LIBELLE_ABSENCE[a.type]}</td>
              <td data-libelle={t("emp.from")} className="num">
                {dateFr(a.debut)}
              </td>
              <td data-libelle={t("emp.to")} className="num">
                {dateFr(a.fin)}
              </td>
              <td data-libelle={t("emp.col.business_days")} className="num">
                {nombre(a.joursOuvrables)}
              </td>
              <td data-libelle={t("col.status")}>{LIBELLE_STATUT_ABSENCE[a.statut]}</td>
              {decider && (
                <td data-libelle={t("emp.col.decision")}>
                  {a.statut === "demandee" ? (
                    <div className="rangee">
                      <Bouton variante="primaire" onClick={() => decider(a.id, "validee")}>
                        {t("received.approve")}
                      </Bouton>
                      <Bouton onClick={() => decider(a.id, "refusee")}>{t("emp.refuse")}</Bouton>
                    </div>
                  ) : a.statut === "validee" ? (
                    <Bouton variante="fantome" onClick={() => decider(a.id, "annulee")}>
                      {t("common.cancel")}
                    </Bouton>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Employes({ id }: { id?: string }) {
  const { moi } = useSession();
  if (!peut(moi.role, "rh"))
    return (
      <div className="page">
        <h1>{t("emp.title")}</h1>
        <Bandeau ton="avertissement" titre={t("absences.restricted")}>
          <p>{t("emp.restricted_text")}</p>
        </Bandeau>
      </div>
    );
  return id ? <FicheEmployeEcran id={id} /> : <ListeEmployes />;
}
