import {
  ArrowLeftRight,
  CalendarDays,
  FileInput,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings,
  Search,
  Undo2,
  Users,
  UserRound,
  Workflow,
  X,
} from "@auto/ui/symboles";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ErreurApi, type Moi } from "@auto/client";
import { grouperSiret } from "@auto/ui/format";
import { accesSegment, pagePermise, segmentsDe } from "@auto/tenancy/segments";
import { useSession } from "./session";
import { Connexion, retourSur } from "./ecrans/connexion";
import { Marque } from "./ecrans/marque";
import { authClient } from "./auth";

// Screens loaded on demand (bundle splitting): only sign-in is part of the first load.
const Absences = lazy(() => import("./ecrans/absences").then((m) => ({ default: m.Absences })));
const EditeurAutomatisation = lazy(() =>
  import("./ecrans/automatisations/editeur").then((m) => ({ default: m.EditeurAutomatisation })),
);
const ExecutionsAutomatisation = lazy(() =>
  import("./ecrans/automatisations/executions").then((m) => ({ default: m.ExecutionsAutomatisation })),
);
const Automatisations = lazy(() =>
  import("./ecrans/automatisations/liste").then((m) => ({ default: m.Automatisations })),
);
const Clients = lazy(() => import("./ecrans/clients").then((m) => ({ default: m.Clients })));
const Courrier = lazy(() => import("./ecrans/courrier").then((m) => ({ default: m.Courrier })));
const Administration = lazy(() => import("./ecrans/administration").then((m) => ({ default: m.Administration })));
const VerificationAppareil = lazy(() => import("./ecrans/appareil").then((m) => ({ default: m.VerificationAppareil })));
const Chantiers = lazy(() => import("./ecrans/chantiers").then((m) => ({ default: m.Chantiers })));
const DetailChantier = lazy(() => import("./ecrans/chantiers").then((m) => ({ default: m.DetailChantier })));
const DetailFournisseur = lazy(() => import("./ecrans/chantiers").then((m) => ({ default: m.DetailFournisseur })));
const Fournisseurs = lazy(() => import("./ecrans/chantiers").then((m) => ({ default: m.Fournisseurs })));
const PiecesChantier = lazy(() => import("./ecrans/pieces-chantier").then((m) => ({ default: m.PiecesChantier })));
const RechercheGestion = lazy(() =>
  import("./ecrans/recherche-gestion").then((m) => ({ default: m.RechercheGestion })),
);
const SourcesFichiers = lazy(() => import("./ecrans/arrivages").then((m) => ({ default: m.SourcesFichiers })));
const FichiersIndexes = lazy(() => import("./ecrans/arrivages").then((m) => ({ default: m.FichiersIndexes })));
const DevisRecus = lazy(() => import("./ecrans/arrivages").then((m) => ({ default: m.DevisRecus })));
const Atelier = lazy(() => import("./ecrans/atelier").then((m) => ({ default: m.Atelier })));
const EditeurAtelier = lazy(() => import("./ecrans/atelier").then((m) => ({ default: m.EditeurAtelier })));
const Autorisation = lazy(() => import("./ecrans/autorisation").then((m) => ({ default: m.Autorisation })));
const Invitation = lazy(() => import("./ecrans/invitation").then((m) => ({ default: m.Invitation })));
const DetailDocument = lazy(() => import("./ecrans/detail").then((m) => ({ default: m.DetailDocument })));
const Editeur = lazy(() => import("./ecrans/editeur").then((m) => ({ default: m.Editeur })));
const Employes = lazy(() => import("./ecrans/employes").then((m) => ({ default: m.Employes })));
const Exports = lazy(() => import("./ecrans/exports").then((m) => ({ default: m.Exports })));
const FacturesRecues = lazy(() => import("./ecrans/recues").then((m) => ({ default: m.FacturesRecues })));
const Imports = lazy(() => import("./ecrans/imports").then((m) => ({ default: m.Imports })));
const ListeDocuments = lazy(() => import("./ecrans/liste").then((m) => ({ default: m.ListeDocuments })));
const Onboarding = lazy(() => import("./ecrans/onboarding").then((m) => ({ default: m.Onboarding })));
const Parametres = lazy(() => import("./ecrans/parametres").then((m) => ({ default: m.Parametres })));
const Produits = lazy(() => import("./ecrans/produits").then((m) => ({ default: m.Produits })));
const TableauDeBord = lazy(() => import("./ecrans/tableau").then((m) => ({ default: m.TableauDeBord })));
import { ContexteSession, peut } from "./session";
import {
  BasculeTheme,
  Bouton,
  EtatChargement,
  EtatErreur,
  EtatVide,
  FournisseurToasts,
  Lien,
  correspond,
  naviguer,
  useChemin,
  useTitrePage,
  type Etat,
} from "@auto/ui/react";
import { t } from "./i18n";

const PUBLIQUES = ["/app/connexion", "/app/inscription", "/app/invitation"];

function Navigation({ moi, ouverte, fermer }: { moi: Moi; ouverte: boolean; fermer: () => void }) {
  const rh = peut(moi.role, "rh");
  const lien = (href: string, Icone: typeof FileText, texte: string) =>
    pagePermise(moi, href) ? (
      <Lien className="nav-lien" href={href} onClick={fermer}>
        <Icone className="icone" aria-hidden="true" />
        {texte}
      </Lien>
    ) : null;
  return (
    <nav className="navigation" id="navigation" aria-label={t("app.nav.label")} data-ouverte={ouverte}>
      <Marque />
      {lien("/app", LayoutDashboard, t("app.nav.dashboard"))}
      {lien("/app/courrier", Inbox, t("app.nav.mailbox"))}
      {accesSegment(moi, "clients") && <p className="nav-titre">{t("app.nav.sales")}</p>}
      {lien("/app/devis", FileText, t("app.nav.quotes"))}
      {lien("/app/factures", ReceiptText, t("app.nav.invoices"))}
      {lien("/app/avoirs", Undo2, t("app.nav.credit_notes"))}
      {lien("/app/clients", Users, t("app.nav.customers"))}
      {lien("/app/produits", Package, t("app.nav.products"))}
      {accesSegment(moi, "fournisseurs") && <p className="nav-titre">{t("app.nav.purchases")}</p>}
      {lien("/app/achats", Inbox, t("app.nav.received_invoices"))}
      {lien("/app/fournisseurs", Users, t("app.nav.suppliers"))}
      {lien("/app/devis-recus", FileInput, t("app.nav.received_quotes"))}
      {["chantiers", "livraisons", "commandes"].some((s) =>
        segmentsDe(moi).includes(s as "chantiers" | "livraisons" | "commandes"),
      ) && <p className="nav-titre">{t("app.nav.sites_section")}</p>}
      {lien("/app/chantiers", Package, t("app.nav.sites"))}
      {lien("/app/livraisons", FileInput, t("app.nav.delivery_notes"))}
      {lien("/app/commandes", FileText, t("app.nav.order_confirmations"))}
      {rh && (
        <>
          <p className="nav-titre">{t("app.nav.team")}</p>
          {lien("/app/employes", UserRound, t("app.nav.employees"))}
          {lien("/app/absences", CalendarDays, t("app.nav.absences"))}
        </>
      )}
      <p className="nav-titre">{t("app.nav.data")}</p>
      {lien("/app/recherche", Search, t("app.nav.search"))}
      {lien("/app/atelier", FileText, t("app.nav.workshop"))}
      {lien("/app/fichiers", FileInput, t("app.nav.files"))}
      {lien("/app/sources-fichiers", Settings, t("app.nav.file_server"))}
      {lien("/app/imports", FileInput, t("app.nav.imports"))}
      {lien("/app/exports", ArrowLeftRight, t("app.nav.exports"))}
      {lien("/app/automatisations", Workflow, t("app.nav.automations"))}
      <div className="nav-pied">
        <div className="nav-entreprise">
          {moi.entreprises.length > 1 ? (
            <label>
              <span className="visuellement-cache">{t("app.nav.active_company")}</span>
              <select
                value={moi.tenantId}
                onChange={async (e) => {
                  await authClient.organization.setActive({ organizationId: e.target.value });
                  location.assign("/app");
                }}
              >
                {moi.entreprises.map((x) => (
                  <option key={x.id} value={x.id} disabled={x.suspendue}>
                    {x.nom}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <strong>{moi.entreprise.nom}</strong>
          )}
          <span className="attenue chiffres">SIRET {grouperSiret(moi.entreprise.siret)}</span>
        </div>
        {lien("/app/parametres", Settings, t("app.nav.settings"))}
        <BasculeTheme avecLibelle />
        <Bouton
          variante="fantome"
          icone={LogOut}
          onClick={async () => {
            await authClient.signOut().catch(() => {});
            location.assign("/app/connexion");
          }}
        >
          {t("app.nav.sign_out")}
        </Bouton>
      </div>
    </nav>
  );
}

function PageIntrouvable() {
  useTitrePage(t("app.not_found"));
  return (
    <div className="page">
      <h1 className="visuellement-cache">{t("app.not_found")}</h1>
      <EtatVide titre={t("app.not_found")}>
        <Lien className="bouton" href="/app">
          {t("app.back_dashboard")}
        </Lien>
      </EtatVide>
    </div>
  );
}

function Routes({ chemin }: { chemin: string }) {
  const { moi } = useSession();
  const p = chemin.split("?")[0]!;
  if (!pagePermise(moi, p))
    return (
      <div className="page">
        <h1>{t("app.restricted")}</h1>
        <EtatVide titre={t("app.segment_unassigned")}>
          <Lien href="/app">{t("app.open_workspace")}</Lien>
        </EtatVide>
      </div>
    );
  if ((p === "/app" || p === "/app/") && !accesSegment(moi, "clients"))
    return (
      <div className="page pile">
        <h1>{t("app.workspace.title")}</h1>
        <p>{t("app.workspace.segments")}</p>
        {segmentsDe(moi).map((s) => (
          <Lien
            key={s}
            className="bouton"
            href={
              {
                clients: "/app/clients",
                fournisseurs: "/app/fournisseurs",
                chantiers: "/app/chantiers",
                livraisons: "/app/livraisons",
                commandes: "/app/commandes",
              }[s]
            }
          >
            {t(`app.segment.${s}`)}
          </Lien>
        ))}
      </div>
    );
  let m: Record<string, string> | null;
  if (p === "/app" || p === "/app/") return <TableauDeBord />;
  if (p === "/app/devis") return <ListeDocuments key="devis" types={["devis"]} />;
  if (p === "/app/factures") return <ListeDocuments key="factures" types={["facture", "acompte"]} />;
  if (p === "/app/avoirs") return <ListeDocuments key="avoirs" types={["avoir"]} />;
  if (p === "/app/documents/nouveau") return <Editeur key={chemin} />;
  if ((m = correspond("/app/documents/:id", p))) return <DetailDocument key={m.id} id={m.id!} />;
  if ((m = correspond("/app/documents/:id/modifier", p))) return <Editeur key={m.id} id={m.id} />;
  if (p === "/app/clients") return <Clients />;
  if (p === "/app/fournisseurs") return <Fournisseurs />;
  if ((m = correspond("/app/fournisseurs/:id", p))) return <DetailFournisseur key={m.id} id={m.id!} />;
  if (p === "/app/chantiers") return <Chantiers />;
  if ((m = correspond("/app/chantiers/:id", p))) return <DetailChantier key={m.id} id={m.id!} />;
  if (p === "/app/pieces") return <PiecesChantier />;
  if (p === "/app/livraisons") return <PiecesChantier key="livraisons" typePiece="bon_livraison" />;
  if (p === "/app/commandes") return <PiecesChantier key="commandes" typePiece="confirmation_commande" />;
  if (p === "/app/recherche") return <RechercheGestion />;
  if (p === "/app/sources-fichiers") return <SourcesFichiers />;
  if (p === "/app/fichiers") return <FichiersIndexes />;
  if (p === "/app/devis-recus") return <DevisRecus />;
  if (p === "/app/atelier") return <Atelier />;
  if ((m = correspond("/app/atelier/:id", p))) return <EditeurAtelier key={m.id} id={m.id!} />;
  if (p === "/app/produits") return <Produits />;
  if (p === "/app/achats") return <FacturesRecues />;
  if (p === "/app/employes") return <Employes />;
  if ((m = correspond("/app/employes/:id", p))) return <Employes key={m.id} id={m.id} />;
  if (p === "/app/absences") return <Absences />;
  if (p === "/app/imports") return <Imports />;
  if (p === "/app/exports") return <Exports />;
  if (p === "/app/automatisations") return <Automatisations />;
  if (p === "/app/automatisations/nouveau") return <EditeurAutomatisation key={chemin} />;
  if ((m = correspond("/app/automatisations/:id", p))) return <EditeurAutomatisation key={m.id} id={m.id} />;
  if ((m = correspond("/app/automatisations/:id/executions", p)))
    return <ExecutionsAutomatisation key={m.id} id={m.id!} />;
  if (p === "/app/parametres") return <Parametres />;
  return <PageIntrouvable />;
}

function Coque({ moi, children }: { moi: Moi; children: ReactNode }) {
  const [ouverte, setOuverte] = useState(false);
  useEffect(() => {
    if (!ouverte) return;
    const navigation = document.getElementById("navigation");
    const precedent = document.activeElement as HTMLElement | null;
    const ancienDebordement = document.body.style.overflow;
    const media = matchMedia("(min-width: 1024px)");
    const fermer = () => setOuverte(false);
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      if (e.key !== "Tab") return;
      const elements = Array.from(navigation?.querySelectorAll<HTMLElement>("a[href], button, select") ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0,
      );
      const premier = elements[0];
      const dernier = elements.at(-1);
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier?.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier?.focus();
      }
    };
    if (media.matches) {
      fermer();
      return;
    }
    document.body.style.overflow = "hidden";
    navigation?.querySelector<HTMLElement>(".nav-lien")?.focus();
    document.addEventListener("keydown", clavier);
    media.addEventListener("change", fermer);
    return () => {
      document.body.style.overflow = ancienDebordement;
      document.removeEventListener("keydown", clavier);
      media.removeEventListener("change", fermer);
      precedent?.focus();
    };
  }, [ouverte]);
  return (
    <div className="coque">
      <a className="lien-evitement" href="#contenu">
        {t("site.skip")}
      </a>
      <header className="barre-haut">
        <Bouton
          variante="fantome"
          icone={ouverte ? X : Menu}
          aria-label={ouverte ? t("app.menu.close") : t("app.menu.open")}
          aria-expanded={ouverte}
          aria-controls="navigation"
          onClick={() => setOuverte(!ouverte)}
        />
        <Marque />
      </header>
      <Navigation moi={moi} ouverte={ouverte} fermer={() => setOuverte(false)} />
      <main className="principal" id="contenu" tabIndex={-1} inert={ouverte}>
        <Suspense fallback={<EtatChargement libelle={t("app.loading_screen")} />}>{children}</Suspense>
      </main>
    </div>
  );
}

/**
 * Current session (`/v1/moi`): `recharger` waits for the new response, so a navigation that follows a sign-in or a
 * sign-up never starts from a stale session.
 */
function useSessionApi() {
  const [etat, setEtat] = useState<Etat<Moi | null>>({ etat: "chargement" });
  const [sansEntreprise, setSansEntreprise] = useState(false);
  const lecture = useRef(0);
  const recharger = useCallback(async () => {
    const numero = ++lecture.current;
    // This public call receives the official renewal Set-Cookie headers, before the business read.
    const courante = await authClient.getSession().catch(() => null);
    // No Better Auth session (200 response without data): no /v1/moi read doomed to a 401.
    if (courante && !courante.error && !courante.data) {
      if (numero !== lecture.current) return;
      setSansEntreprise(false);
      setEtat({ etat: "ok", donnees: null });
      return;
    }
    try {
      const moi = await api.moi();
      if (numero !== lecture.current) return;
      setEtat({ etat: "ok", donnees: moi });
      setSansEntreprise(false);
    } catch (e) {
      if (numero !== lecture.current) return;
      if (e instanceof ErreurApi && e.status === 401) {
        // Session open (magic link, Google…) but no company: company sign-up.
        setSansEntreprise(!!courante?.data);
        setEtat({ etat: "ok", donnees: null });
      } else setEtat({ etat: "erreur", erreur: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void recharger();
    const reprendre = () => {
      if (document.visibilityState === "visible") void recharger();
    };
    window.addEventListener("focus", reprendre);
    document.addEventListener("visibilitychange", reprendre);
    return () => {
      window.removeEventListener("focus", reprendre);
      document.removeEventListener("visibilitychange", reprendre);
    };
  }, [recharger]);
  return { ...etat, recharger, sansEntreprise };
}

export function App() {
  const chemin = useChemin();
  const publique = PUBLIQUES.some((p) => chemin.startsWith(p));
  const session = useSessionApi();
  const recharger = session.recharger;

  useEffect(() => {
    if (chemin.startsWith("/app/connexion") && session.etat === "ok" && (session.donnees || session.sansEntreprise)) {
      const retour = retourSur(new URLSearchParams(location.search).get("retour"));
      naviguer(retour.startsWith("/app/connexion") ? "/app" : retour, true);
      return;
    }
    if (session.etat === "ok" && !session.donnees && !publique && !session.sansEntreprise) {
      const retour = encodeURIComponent(chemin);
      naviguer(`/app/connexion?retour=${retour}`, true);
    }
  }, [session.etat, session.donnees, session.sansEntreprise, publique, chemin]);

  let contenu: ReactNode;
  if (chemin.startsWith("/app/inscription")) contenu = <Onboarding onSession={recharger} />;
  else if (chemin.startsWith("/app/connexion")) contenu = <Connexion onSession={recharger} />;
  else if (chemin.startsWith("/app/invitation")) contenu = <Invitation onSession={recharger} />;
  else if (
    chemin.split("?")[0] === "/app/verification-appareil" &&
    session.etat === "ok" &&
    (session.sansEntreprise || session.donnees)
  )
    contenu = <VerificationAppareil />;
  else if (
    chemin.split("?")[0] === "/app/administration" &&
    session.etat === "ok" &&
    (session.sansEntreprise || session.donnees)
  )
    contenu = <Administration />;
  else if ((chemin === "/app" || chemin === "/app/") && session.etat === "ok" && session.sansEntreprise)
    contenu = <Courrier />;
  else if (
    chemin.split("?")[0] === "/app/courrier" &&
    session.etat === "ok" &&
    (session.sansEntreprise || session.donnees)
  )
    contenu = <Courrier />;
  else if (session.etat === "ok" && session.sansEntreprise) contenu = <Onboarding onSession={recharger} connecte />;
  else if (chemin.startsWith("/app/autorisation") && session.etat === "ok" && session.donnees)
    contenu = <Autorisation />;
  else if (session.etat === "chargement")
    contenu = (
      <div className="auth">
        <div className="auth-carte">
          <EtatChargement libelle={t("app.opening_session")} />
        </div>
      </div>
    );
  else if (session.etat === "erreur")
    contenu = (
      <div className="auth">
        <EtatErreur message={session.erreur} onReessayer={session.recharger} />
      </div>
    );
  else if (!session.donnees) contenu = null;
  else
    contenu = (
      <ContexteSession.Provider value={{ moi: session.donnees, recharger }}>
        <Coque moi={session.donnees}>
          <Routes chemin={chemin} />
        </Coque>
      </ContexteSession.Provider>
    );

  return (
    <FournisseurToasts>
      <Suspense
        fallback={
          <div className="auth">
            <div className="auth-carte">
              <EtatChargement libelle={t("app.loading")} />
            </div>
          </div>
        }
      >
        {contenu}
      </Suspense>
    </FournisseurToasts>
  );
}
