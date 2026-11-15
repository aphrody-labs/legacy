import { useDeferredValue, useState } from "react";
import { api } from "@auto/client";
import { ChampTexte, EtatChargement, EtatErreur, EtatVide, Lien, useDonnees, useTitrePage } from "@auto/ui/react";
import { Search } from "@auto/ui/symboles";
import { t } from "../i18n";
// Document kinds (segments) have catalog labels `kind.<segment>`.
const TYPES = new Set([
  "devis",
  "facture",
  "acompte",
  "avoir",
  "achat",
  "bon_livraison",
  "confirmation_commande",
  "chantier",
  "devis_recu",
  "fichier_clients",
  "fichier_fournisseurs",
  "fichier_chantiers",
  "fichier_livraisons",
  "fichier_commandes",
]);
export function RechercheGestion() {
  useTitrePage(t("search.title"));
  const [q, setQ] = useState("");
  const recherche = useDeferredValue(q.trim());
  const d = useDonnees(
    () => (recherche.length >= 2 ? api.rechercherGestion(recherche) : Promise.resolve({ resultats: [], total: 0 })),
    [recherche],
  );
  return (
    <div className="page pile">
      <div className="page-entete">
        <div>
          <h1>{t("search.title")}</h1>
          <p className="attenue">{t("search.intro")}</p>
        </div>
      </div>
      <ChampTexte
        libelle={t("search.query")}
        type="search"
        value={q}
        minLength={2}
        maxLength={200}
        placeholder={t("search.placeholder")}
        onChange={(e) => setQ(e.target.value)}
      />
      {recherche.length < 2 ? (
        <EtatVide icone={Search} titre={t("search.prompt")}>
          <p>{t("search.prompt_text")}</p>
        </EtatVide>
      ) : d.etat === "chargement" ? (
        <EtatChargement />
      ) : d.etat === "erreur" ? (
        <EtatErreur message={d.erreur} onReessayer={d.recharger} />
      ) : !d.donnees.resultats.length ? (
        <EtatVide titre={t("search.none")}>
          <p>{t("search.none_text")}</p>
        </EtatVide>
      ) : (
        <>
          <p className="attenue">
            {t("search.count", { count: d.donnees.total })}
            {d.donnees.total > 100 ? ` · ${t("search.limit")}` : ""}
          </p>
          <div className="tableau-conteneur" tabIndex={0} role="region" aria-label={t("search.results_label")}>
            <table className="tableau">
              <thead>
                <tr>
                  {["reference", "space", "third_party", "site", "archive"].map((l) => (
                    <th scope="col" key={l}>
                      {t(`search.col.${l}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.donnees.resultats.map((r) => (
                  <tr key={r.segment + r.id}>
                    <td data-libelle={t("search.col.reference")}>
                      {r.url.startsWith("/v1/") ? (
                        <a href={r.url} target="_blank" rel="noopener">
                          {r.reference}
                        </a>
                      ) : (
                        <Lien href={r.url}>{r.reference}</Lien>
                      )}
                    </td>
                    <td data-libelle={t("search.col.space")}>
                      {TYPES.has(r.segment) ? t(`kind.${r.segment}`) : r.segment}
                    </td>
                    <td data-libelle={t("search.col.third_party")}>{r.tiers || "—"}</td>
                    <td data-libelle={t("search.col.site")}>{r.chantier || "—"}</td>
                    <td data-libelle={t("search.col.archive")}>{r.archive ? t("search.archived") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
