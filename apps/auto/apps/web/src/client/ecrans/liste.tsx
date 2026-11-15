import type { Type } from "@auto/domain";
import type { StatutVisuel } from "@auto/ui";
import { FilePlus2, FileText, Search } from "@auto/ui/symboles";
import { useMemo, useState } from "react";
import { api, type DocumentApi } from "@auto/client";
import { aujourdhui, dateFr, eur, LIBELLE_TYPE, libelleStatut, statutVisuel } from "@auto/ui/format";
import {
  BadgeStatut,
  ChampTexte,
  EtatChargement,
  EtatErreur,
  EtatVide,
  Lien,
  useDonnees,
  useTitrePage,
} from "@auto/ui/react";
import { t } from "../i18n";

export function TableauDocuments({ docs, jour = aujourdhui() }: { docs: DocumentApi[]; jour?: string }) {
  return (
    <div className="tableau-conteneur">
      <table className="tableau">
        <thead>
          <tr>
            <th scope="col">{t("col.number")}</th>
            <th scope="col">{t("col.type")}</th>
            <th scope="col">{t("col.customer")}</th>
            <th scope="col">{t("col.date")}</th>
            <th scope="col">{t("col.due")}</th>
            <th scope="col" className="num">
              {t("col.ttc")}
            </th>
            <th scope="col">{t("col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const s = statutVisuel(d, jour);
            return (
              <tr key={d.id}>
                <td data-libelle={t("col.number")} className="chiffres">
                  <Lien href={`/app/documents/${d.id}`}>{d.numero ?? t("doc.draft")}</Lien>
                </td>
                <td data-libelle={t("col.type")}>{LIBELLE_TYPE[d.type]}</td>
                <td data-libelle={t("col.customer")}>{d.data.client.nom}</td>
                <td data-libelle={t("col.date")} className="num">
                  {dateFr(d.data.date)}
                </td>
                <td data-libelle={t("col.due")} className={`num ${s === "en_retard" ? "texte-danger" : ""}`}>
                  {dateFr(d.data.echeance) || "—"}
                </td>
                <td data-libelle={t("col.ttc")} className="num">
                  {eur(d.type === "avoir" ? -d.ttcCents : d.ttcCents)}
                </td>
                <td data-libelle={t("col.status")}>
                  <BadgeStatut statut={s} libelle={libelleStatut(s, d.type)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Filtre = "tous" | StatutVisuel;

const FILTRES: Record<"devis" | "factures" | "avoirs", Filtre[]> = {
  devis: ["tous", "brouillon", "emis", "envoye", "accepte", "refuse"],
  factures: ["tous", "brouillon", "emis", "envoye", "en_retard", "paye", "annule"],
  avoirs: ["tous", "brouillon", "emis"],
};

const TITRES = { devis: "list.title.devis", factures: "list.title.factures", avoirs: "list.title.avoirs" };

/** List filter: status (derived, "overdue" included) and search on number or customer. */
export function filtrer(docs: DocumentApi[], filtre: Filtre, q: string, jour = aujourdhui()) {
  const r = q.trim().toLowerCase();
  return docs.filter((d) => {
    if (filtre !== "tous" && statutVisuel(d, jour) !== filtre) return false;
    if (!r) return true;
    return (d.numero ?? "").toLowerCase().includes(r) || d.data.client.nom.toLowerCase().includes(r);
  });
}

export function ListeDocuments({ types }: { types: Type[] }) {
  const genre = types.includes("devis") ? "devis" : types.includes("avoir") ? "avoirs" : "factures";
  useTitrePage(t(TITRES[genre]));
  const jour = aujourdhui();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [q, setQ] = useState("");
  const d = useDonnees(async () => (await Promise.all(types.map((t) => api.documents(t)))).flat(), [types.join()]);
  const type0 = types[0]!;
  const visibles = useMemo(() => (d.etat === "ok" ? filtrer(d.donnees, filtre, q, jour) : []), [d, filtre, q, jour]);

  const nouveau =
    genre === "avoirs" ? null : (
      <Lien className="bouton bouton-primaire" href={`/app/documents/nouveau?type=${type0}`}>
        <FilePlus2 className="icone" aria-hidden="true" />
        {genre === "devis" ? t("list.new_quote") : t("list.new_invoice")}
      </Lien>
    );

  let corps;
  if (d.etat === "chargement") corps = <EtatChargement />;
  else if (d.etat === "erreur") corps = <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  else if (d.donnees.length === 0)
    corps = (
      <EtatVide icone={FileText} titre={t(`list.empty.${genre}`)}>
        {genre === "avoirs" ? <p>{t("list.empty.avoirs_text")}</p> : nouveau}
      </EtatVide>
    );
  else
    corps = (
      <>
        <div className="rangee rangee-bas">
          <div className="onglets" role="group" aria-label={t("list.filter_label")}>
            {FILTRES[genre].map((f) => (
              <button key={f} type="button" className="onglet" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
                {f === "tous" ? t("list.filter_all") : libelleStatut(f, type0)}
              </button>
            ))}
          </div>
          <span className="espace" />
          <ChampTexte
            libelle={t("list.search")}
            type="search"
            placeholder={t("list.search_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <p className="visuellement-cache" aria-live="polite">
          {t("list.shown", { count: visibles.length })}
        </p>
        {visibles.length === 0 ? (
          <EtatVide icone={Search} titre={t("list.no_match")}>
            <p>{t("list.no_match_text")}</p>
          </EtatVide>
        ) : (
          <TableauDocuments docs={visibles} jour={jour} />
        )}
      </>
    );

  return (
    <div className="page">
      <div className="page-entete">
        <h1>{t(TITRES[genre])}</h1>
        {nouveau}
      </div>
      {corps}
    </div>
  );
}
