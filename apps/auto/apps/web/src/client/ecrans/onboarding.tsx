// Onboarding in 3 steps: account, company (prefilled from the SIREN), optional connections.
import { sirenValide, siretValide } from "@auto/domain";
import { ArrowLeft, ArrowRight, Building2, Inbox, PlugZap, Search } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi } from "@auto/client";
import { chiffres, emailValide, grouperSiret } from "@auto/ui/format";
import { Bandeau, Bouton, ChampTexte, ChampZone, Lien, ResumeErreurs, naviguer, useTitrePage } from "@auto/ui/react";
import { Marque } from "./marque";
import { t } from "../i18n";
import { rich } from "../rich";

const ETAPES = ["account", "company", "connections"] as const;

function Etapes({ courante }: { courante: number }) {
  return (
    <ol className="etapes" aria-label={t("signup.steps_label")}>
      {ETAPES.map((e, i) => (
        <li
          key={e}
          data-etat={i < courante ? "faite" : i === courante ? "courante" : "a-venir"}
          aria-current={i === courante ? "step" : undefined}
        >
          <span>
            <span className="visuellement-cache">{t("signup.step_of", { n: i + 1 })} </span>
            {t(`signup.step.${e}`)}
            {i < courante && <span className="visuellement-cache"> {t("signup.step_done")}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * `connecte`: account already open (magic link, Google, Microsoft) without a company; sign-up starts at the
 * company step and only creates the company.
 */
export function Onboarding({
  onSession,
  connecte = false,
}: {
  onSession: () => Promise<void> | void;
  connecte?: boolean;
}) {
  const [etape, setEtape] = useState(connecte ? 1 : 0);
  useTitrePage(t("signup.title", { step: t(`signup.step.${ETAPES[etape]}`) }));
  const [compte, setCompte] = useState({ email: "", motDePasse: "" });
  const [ent, setEnt] = useState({ siren: "", nom: "", siret: "", adresse: "", franchiseTva: false });
  const [erreurs, setErreurs] = useState<Record<string, string | undefined>>({});
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [recherche, setRecherche] = useState<"repos" | "cours" | "trouve" | "absent">("repos");
  const [envoi, setEnvoi] = useState(false);

  function validerCompte(e: FormEvent) {
    e.preventDefault();
    const err = {
      email: emailValide(compte.email) ? undefined : t("login.email_invalid"),
      motDePasse: compte.motDePasse.length >= 12 ? undefined : t("signup.password_min"),
    };
    setErreurs(err);
    if (!err.email && !err.motDePasse) setEtape(1);
  }

  async function chercherSiren() {
    const s = chiffres(ent.siren);
    if (!sirenValide(s)) {
      setErreurs({ siren: t("signup.siren_invalid") });
      return;
    }
    setErreurs({});
    setRecherche("cours");
    try {
      const r = await api.siren(s);
      setEnt((x) => ({ ...x, nom: r.nom, siret: grouperSiret(r.siretSiege), adresse: r.adresse }));
      setRecherche("trouve");
    } catch {
      setRecherche("absent");
    }
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    const err = {
      nom: ent.nom.trim() ? undefined : t("signup.err.name"),
      siret: siretValide(chiffres(ent.siret)) ? undefined : t("customers.err.siret"),
      adresse: ent.adresse.trim() ? undefined : t("signup.err.address"),
    };
    setErreurs(err);
    if (err.nom || err.siret || err.adresse) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const entreprise = {
        nom: ent.nom.trim(),
        siret: chiffres(ent.siret),
        adresse: ent.adresse.trim(),
        franchiseTva: ent.franchiseTva,
      };
      if (connecte) await api.creerEntreprise(entreprise);
      else await api.inscrire({ email: compte.email.trim(), motDePasse: compte.motDePasse, entreprise });
      setEtape(2);
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="auth" id="contenu">
      <div className="fond-motif pattern-dots-md" aria-hidden="true" />
      <div className="auth-carte carte">
        <Marque />
        <h1>{t("signup.heading")}</h1>
        <Etapes courante={etape} />

        {etape === 0 && (
          <form className="grille" noValidate onSubmit={validerCompte}>
            <ChampTexte
              libelle={t("signup.work_email")}
              type="email"
              autoComplete="email"
              requis
              value={compte.email}
              erreur={erreurs.email}
              onChange={(e) => setCompte({ ...compte, email: e.target.value })}
            />
            <ChampTexte
              libelle={t("common.password")}
              type="password"
              autoComplete="new-password"
              requis
              aide={t("signup.password_help")}
              value={compte.motDePasse}
              erreur={erreurs.motDePasse}
              onChange={(e) => setCompte({ ...compte, motDePasse: e.target.value })}
            />
            <Bouton type="submit" variante="primaire" icone={ArrowRight} plein>
              {t("signup.continue")}
            </Bouton>
            <p className="attenue">
              {rich("signup.already", { link: <Lien href="/app/connexion">{t("login.heading")}</Lien> })}
            </p>
          </form>
        )}

        {etape === 1 && (
          <form className="grille" noValidate onSubmit={creer}>
            <ResumeErreurs erreur={erreur} />
            <div className="rangee rangee-bas">
              <ChampTexte
                className="espace"
                libelle="SIREN"
                inputMode="numeric"
                autoComplete="off"
                aide={t("signup.siren_help")}
                value={ent.siren}
                erreur={erreurs.siren}
                onChange={(e) => setEnt({ ...ent, siren: e.target.value })}
              />
              <Bouton icone={Search} chargement={recherche === "cours"} onClick={chercherSiren}>
                {t("signup.search")}
              </Bouton>
            </div>
            <div aria-live="polite">
              {recherche === "trouve" && (
                <Bandeau ton="succes" titre={t("signup.found")}>
                  <p>{t("signup.found_text")}</p>
                </Bandeau>
              )}
              {recherche === "absent" && (
                <Bandeau ton="avertissement" titre={t("signup.absent")}>
                  <p>{t("signup.absent_text")}</p>
                </Bandeau>
              )}
            </div>
            <ChampTexte
              libelle={t("signup.company_name")}
              autoComplete="organization"
              requis
              value={ent.nom}
              erreur={erreurs.nom}
              onChange={(e) => setEnt({ ...ent, nom: e.target.value })}
            />
            <ChampTexte
              libelle="SIRET"
              inputMode="numeric"
              requis
              value={ent.siret}
              erreur={erreurs.siret}
              onChange={(e) => setEnt({ ...ent, siret: e.target.value })}
              onBlur={() => setEnt((x) => ({ ...x, siret: grouperSiret(x.siret) }))}
            />
            <ChampZone
              libelle={t("common.address")}
              autoComplete="street-address"
              rows={2}
              requis
              value={ent.adresse}
              erreur={erreurs.adresse}
              onChange={(e) => setEnt({ ...ent, adresse: e.target.value })}
            />
            <label className="case">
              <input
                type="checkbox"
                checked={ent.franchiseTva}
                onChange={(e) => setEnt({ ...ent, franchiseTva: e.target.checked })}
              />
              {t("signup.franchise")}
            </label>
            <div className="rangee">
              <Bouton icone={ArrowLeft} onClick={() => setEtape(0)}>
                {t("common.back")}
              </Bouton>
              <span className="espace" />
              <Bouton type="submit" variante="primaire" icone={Building2} chargement={envoi}>
                {t("signup.create_company")}
              </Bouton>
            </div>
          </form>
        )}

        {etape === 2 && (
          <div className="grille">
            <Bandeau ton="succes" titre={t("signup.created")}>
              <p>{t("signup.created_text")}</p>
            </Bandeau>
            <ul className="liste-connexions">
              <li className="carte">
                <PlugZap className="icone" aria-hidden="true" />
                <div>
                  <strong>{t("signup.pa")}</strong>
                  <p className="attenue">{t("signup.pa_text")}</p>
                  <Bouton
                    onClick={async () => {
                      await onSession();
                      naviguer("/app/parametres", true);
                    }}
                  >
                    {t("signup.configure")}
                  </Bouton>
                </div>
                <span className="pastille-etat">{t("signup.to_connect")}</span>
              </li>
              <li className="carte">
                <Inbox className="icone" aria-hidden="true" />
                <div>
                  <strong>{t("signup.mailbox")}</strong>
                  <p className="attenue">{t("signup.mailbox_text")}</p>
                  <Bouton
                    onClick={async () => {
                      await onSession();
                      naviguer("/app/courrier", true);
                    }}
                  >
                    {t("signup.open_inbox")}
                  </Bouton>
                </div>
                <span className="pastille-etat">{t("signup.to_connect")}</span>
              </li>
            </ul>
            <Bouton
              variante="primaire"
              icone={ArrowRight}
              plein
              onClick={async () => {
                await onSession();
                naviguer("/app", true);
              }}
            >
              {t("signup.to_dashboard")}
            </Bouton>
          </div>
        )}
      </div>
    </main>
  );
}
