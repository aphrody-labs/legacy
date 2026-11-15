import { sirenValide, siretValide, type Partie } from "@auto/domain";
import { Pencil, Search, UserPlus, Users } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi, type Client } from "@auto/client";
import { chiffres, emailValide, grouperSiret } from "@auto/ui/format";
import { peut, useSession } from "../session";
import {
  Bouton,
  ChampTexte,
  ChampZone,
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

const vide: Partie = { nom: "", siret: "", adresse: "", email: "", tvaIntracom: "" };

/** Customer form errors, by field. */
export function erreursClient(p: Partie): Record<string, string | undefined> {
  const s = chiffres(p.siret);
  return {
    nom: p.nom.trim() ? undefined : t("customers.err.name"),
    adresse: p.adresse.trim() ? undefined : t("customers.err.address"),
    siret: !s || siretValide(s) ? undefined : t("customers.err.siret"),
    email: !p.email || emailValide(p.email) ? undefined : t("customers.err.email"),
  };
}

function FormulaireClient({ client, onFin }: { client: Client | null; onFin: (ok: boolean) => void }) {
  const toast = useToast();
  const [p, setP] = useState<Partie>(client ? { ...vide, ...client } : vide);
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [cherche, setCherche] = useState(false);

  async function prefill() {
    const s = chiffres(p.siret).slice(0, 9);
    if (!sirenValide(s)) {
      setErr({ ...err, siret: t("customers.err.siren") });
      return;
    }
    setCherche(true);
    try {
      const r = await api.siren(s);
      setP({ ...p, nom: p.nom || r.nom, siret: grouperSiret(r.siretSiege), adresse: p.adresse || r.adresse });
      setErr({});
    } catch {
      setErr({ ...err, siret: t("customers.err.not_found") });
    } finally {
      setCherche(false);
    }
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const x = erreursClient(p);
    setErr(x);
    if (Object.values(x).some(Boolean)) return;
    setEnvoi(true);
    setErreur(null);
    const corps: Partie = {
      nom: p.nom.trim(),
      siret: chiffres(p.siret),
      adresse: p.adresse.trim(),
      ...(p.email?.trim() ? { email: p.email.trim() } : {}),
      ...(p.tvaIntracom?.trim() ? { tvaIntracom: p.tvaIntracom.trim() } : {}),
    };
    try {
      if (client) await api.modifierClient(client.id, corps);
      else await api.creerClient(corps);
      toast(client ? t("customers.updated") : t("customers.added"));
      onFin(true);
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="grille" noValidate onSubmit={soumettre} id="form-client">
      <ResumeErreurs erreur={erreur} />
      <div className="rangee rangee-bas">
        <ChampTexte
          className="espace"
          libelle="SIRET"
          inputMode="numeric"
          aide={t("customers.siret_help")}
          value={p.siret}
          erreur={err.siret}
          onChange={(e) => setP({ ...p, siret: e.target.value })}
          onBlur={() => setP((x) => ({ ...x, siret: grouperSiret(x.siret) }))}
        />
        <Bouton icone={Search} chargement={cherche} onClick={prefill}>
          {t("customers.prefill")}
        </Bouton>
      </div>
      <ChampTexte
        libelle={t("customers.company_name")}
        requis
        autoComplete="organization"
        value={p.nom}
        erreur={err.nom}
        onChange={(e) => setP({ ...p, nom: e.target.value })}
      />
      <ChampZone
        libelle={t("common.address")}
        requis
        rows={2}
        autoComplete="street-address"
        value={p.adresse}
        erreur={err.adresse}
        onChange={(e) => setP({ ...p, adresse: e.target.value })}
      />
      <div className="grille grille-2">
        <ChampTexte
          libelle={t("common.email")}
          type="email"
          autoComplete="email"
          value={p.email ?? ""}
          erreur={err.email}
          onChange={(e) => setP({ ...p, email: e.target.value })}
        />
        <ChampTexte
          libelle={t("customers.vat_number")}
          value={p.tvaIntracom ?? ""}
          onChange={(e) => setP({ ...p, tvaIntracom: e.target.value })}
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

export function Clients() {
  useTitrePage(t("customers.title"));
  const { moi } = useSession();
  const ecrire = peut(moi.role, "ecrire");
  const [q, setQ] = useState("");
  const [edition, setEdition] = useState<Client | null | undefined>(undefined);
  const d = useDonnees(() => api.clients(q.trim() || undefined), [q]);

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.length === 0)
    corps = (
      <EtatVide icone={Users} titre={q ? t("customers.empty_match") : t("customers.empty")}>
        {!q && <p>{t("customers.empty_text")}</p>}
      </EtatVide>
    );
  else
    corps = (
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">{t("common.name")}</th>
              <th scope="col">SIRET</th>
              <th scope="col">{t("common.address")}</th>
              <th scope="col">{t("common.email")}</th>
              {ecrire && (
                <th scope="col">
                  <span className="visuellement-cache">{t("common.actions")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {d.donnees.map((c) => (
              <tr key={c.id}>
                <td data-libelle={t("common.name")}>{c.nom}</td>
                <td data-libelle="SIRET" className="chiffres">
                  {c.siret ? grouperSiret(c.siret) : "—"}
                </td>
                <td data-libelle={t("common.address")}>{c.adresse}</td>
                <td data-libelle={t("common.email")}>{c.email ?? "—"}</td>
                {ecrire && (
                  <td data-libelle={t("common.actions")}>
                    <Bouton
                      variante="fantome"
                      icone={Pencil}
                      aria-label={t("common.edit_named", { name: c.nom })}
                      onClick={() => setEdition(c)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t("customers.title")}</h1>
        {ecrire && (
          <Bouton variante="primaire" icone={UserPlus} onClick={() => setEdition(null)}>
            {t("customers.add")}
          </Bouton>
        )}
      </div>
      <ChampTexte
        libelle={t("customers.search")}
        type="search"
        placeholder={t("customers.search_placeholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {corps}
      <Modale
        ouverte={edition !== undefined}
        titre={edition ? t("customers.edit") : t("customers.add")}
        onFermer={() => setEdition(undefined)}
      >
        {edition !== undefined && (
          <FormulaireClient
            key={edition?.id ?? "nouveau"}
            client={edition}
            onFin={(ok) => {
              setEdition(undefined);
              if (ok) d.recharger();
            }}
          />
        )}
      </Modale>
    </div>
  );
}
