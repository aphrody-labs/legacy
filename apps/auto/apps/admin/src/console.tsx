// Operator console: health, public plans and, signed in to the operator tenant (AUTO_TENANT_OPERATEUR), its
// subscription invoices, then the /v1/admin routes: companies, suspension, failed events, audit of all tenants.
import { api, ErreurApi, type Moi } from "@auto/client";
import { dateFr, emailValide, eur, nombre } from "@auto/ui/format";
import {
  Bandeau,
  BasculeTheme,
  Bouton,
  ChampTexte,
  EtatChargement,
  EtatErreur,
  FournisseurToasts,
  ResumeErreurs,
  appliquerTheme,
  themeEnregistre,
  useDonnees,
} from "@auto/ui/react";
import { Activity, Ban, LogIn, LogOut, RotateCcw, ShieldCheck } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { initLocale, t as tr } from "./i18n";

function Connexion({ onSession }: { onSession: () => void }) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [defi, setDefi] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [errEmail, setErrEmail] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!emailValide(email)) return setErrEmail(tr("login.invalid_email"));
    setErrEmail(null);
    setEnvoi(true);
    setErreur(null);
    try {
      if (defi) {
        // Second factor (Better Auth): TOTP code or backup code.
        await admin("/v1/auth/2fa", { defi, code: code.trim() });
        return onSession();
      }
      const r = (await api.connecter(email, motDePasse)) as { deuxFacteurs?: boolean; defi?: string };
      if (r.deuxFacteurs && r.defi) return setDefi(r.defi);
      onSession();
    } catch (x) {
      setErreur(x instanceof ErreurApi ? x : new ErreurApi((x as Error).message, 401));
    } finally {
      setEnvoi(false);
    }
  }
  if (defi)
    return (
      <form className="carte grille" noValidate onSubmit={soumettre} aria-labelledby="titre-connexion">
        <h2 id="titre-connexion">{tr("twofa.title")}</h2>
        <ResumeErreurs erreur={erreur} />
        <ChampTexte
          libelle={tr("twofa.code")}
          autoComplete="one-time-code"
          requis
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <div>
          <Bouton type="submit" variante="primaire" icone={ShieldCheck} chargement={envoi}>
            {tr("twofa.submit")}
          </Bouton>
        </div>
      </form>
    );
  return (
    <form className="carte grille" noValidate onSubmit={soumettre} aria-labelledby="titre-connexion">
      <h2 id="titre-connexion">{tr("login.title")}</h2>
      <ResumeErreurs erreur={erreur} />
      <div className="grille grille-2">
        <ChampTexte
          libelle={tr("login.email")}
          type="email"
          autoComplete="email"
          requis
          value={email}
          erreur={errEmail}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ChampTexte
          libelle={tr("login.password")}
          type="password"
          autoComplete="current-password"
          requis
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
      </div>
      <div>
        <Bouton type="submit" variante="primaire" icone={LogIn} chargement={envoi}>
          {tr("login.submit")}
        </Bouton>
      </div>
    </form>
  );
}

interface TenantAdmin {
  id: string;
  nom: string;
  siren: string;
  plan: string;
  statut: string;
  membres: number;
  suspendu: { depuis: string; motif: string | null } | null;
}

/** Calls an operator route with the cookie session (mutations in JSON, as the anti-CSRF requires). */
async function admin<T>(chemin: string, corps?: unknown): Promise<T> {
  const r = await fetch(chemin, {
    method: corps === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(j?.erreur ?? `HTTP ${r.status}`);
  return j as T;
}

function Entreprises() {
  const d = useDonnees(async () => {
    const [tenants, echecs, audit] = await Promise.all([
      admin<TenantAdmin[]>("/v1/admin/tenants"),
      admin<unknown[]>("/v1/admin/evenements?statut=echec"),
      admin<{ ok: boolean }[]>("/v1/admin/audit"),
    ]);
    return { tenants, echecs: echecs.length, auditRompus: audit.filter((a) => !a.ok).length };
  });
  const [enCours, setEnCours] = useState<string | null>(null);
  const [aSuspendre, setASuspendre] = useState<TenantAdmin | null>(null);
  const [motif, setMotif] = useState("");
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  if (d.etat === "chargement") return <EtatChargement />;
  if (d.etat === "erreur") return <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  async function envoyer(t: TenantAdmin, motif?: string) {
    setEnCours(t.id);
    setErreurMotif(null);
    try {
      await admin(`/v1/admin/tenants/${t.id}/suspension`, { suspendu: !t.suspendu, motif });
      setASuspendre(null);
      setMotif("");
      d.recharger();
    } catch (e) {
      setErreurMotif(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(null);
    }
  }
  /** Restoring is immediate; suspending opens a form that requires a reason (traced in the tenant audit). */
  function basculer(t: TenantAdmin) {
    if (t.suspendu) return envoyer(t);
    setASuspendre(t);
    setErreurMotif(null);
  }
  function confirmer(e: FormEvent) {
    e.preventDefault();
    if (!aSuspendre) return;
    if (!motif.trim()) return setErreurMotif(tr("companies.reason_required"));
    void envoyer(aSuspendre, motif.trim());
  }
  return (
    <section className="carte pile-serree" aria-labelledby="sec-entreprises">
      <h2 id="sec-entreprises">{tr("companies.title")}</h2>
      <p className="attenue">
        {tr("companies.summary", {
          companies: tr("companies.count", { count: d.donnees.tenants.length }),
          failed: tr("companies.failed", { count: d.donnees.echecs }),
          audit: d.donnees.auditRompus
            ? tr("companies.audit_broken", { count: d.donnees.auditRompus })
            : tr("companies.audit_ok"),
        })}
      </p>
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">{tr("companies.company")}</th>
              <th scope="col">SIREN</th>
              <th scope="col">{tr("plans.plan")}</th>
              <th scope="col" className="num">
                {tr("companies.members")}
              </th>
              <th scope="col">{tr("companies.state")}</th>
              <th scope="col">
                <span className="visuellement-cache">{tr("companies.action")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.donnees.tenants.map((t) => (
              <tr key={t.id}>
                <td data-libelle={tr("companies.company")}>{t.nom}</td>
                <td data-libelle="SIREN" className="chiffres">
                  {t.siren}
                </td>
                <td data-libelle={tr("plans.plan")}>
                  {t.plan} ({t.statut})
                </td>
                <td data-libelle={tr("companies.members")} className="num">
                  {nombre(t.membres)}
                </td>
                <td data-libelle={tr("companies.state")}>
                  {t.suspendu ? tr("companies.suspended", { reason: t.suspendu.motif ?? "" }) : tr("companies.active")}
                </td>
                <td data-libelle={tr("companies.action")}>
                  <Bouton
                    variante="secondaire"
                    icone={t.suspendu ? RotateCcw : Ban}
                    chargement={enCours === t.id}
                    onClick={() => basculer(t)}
                  >
                    {t.suspendu ? tr("companies.restore") : tr("companies.suspend")}
                  </Bouton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aSuspendre && (
        <form className="pile-serree" onSubmit={confirmer} aria-labelledby="titre-suspension">
          <h3 id="titre-suspension">{tr("companies.suspend_title", { name: aSuspendre.nom })}</h3>
          <p className="attenue">{tr("companies.suspend_note")}</p>
          <ChampTexte
            libelle={tr("companies.reason")}
            requis
            autoFocus
            value={motif}
            erreur={erreurMotif ?? undefined}
            onChange={(e) => setMotif(e.target.value)}
          />
          <div className="rangee">
            <Bouton type="submit" variante="danger" icone={Ban} chargement={enCours === aSuspendre.id}>
              {tr("companies.suspend")}
            </Bouton>
            <Bouton type="button" variante="secondaire" onClick={() => setASuspendre(null)}>
              {tr("companies.cancel")}
            </Bouton>
          </div>
        </form>
      )}
    </section>
  );
}

function Operateur({ moi }: { moi: Moi }) {
  const d = useDonnees(async () => {
    const [factures, audit] = await Promise.all([api.documents("facture"), api.verifierAudit()]);
    return { factures, audit };
  });
  if (d.etat === "chargement") return <EtatChargement />;
  if (d.etat === "erreur") return <EtatErreur message={d.erreur} onReessayer={d.recharger} />;
  const emises = d.donnees.factures.filter((f) => f.statut !== "brouillon");
  const total = emises.reduce((s, f) => s + f.htCents, 0);
  return (
    <>
      <section className="carte pile-serree" aria-labelledby="sec-factures">
        <h2 id="sec-factures">{tr("operator.title", { name: moi.entreprise.nom })}</h2>
        <p className="attenue">{tr("operator.summary", { count: emises.length, total: eur(total) })}</p>
        {emises.length > 0 && (
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">{tr("operator.number")}</th>
                  <th scope="col">{tr("operator.client")}</th>
                  <th scope="col">{tr("operator.date")}</th>
                  <th scope="col" className="num">
                    {tr("operator.total")}
                  </th>
                  <th scope="col">{tr("operator.status")}</th>
                </tr>
              </thead>
              <tbody>
                {emises.map((f) => (
                  <tr key={f.id}>
                    <td data-libelle={tr("operator.number")} className="chiffres">
                      {f.numero}
                    </td>
                    <td data-libelle={tr("operator.client")}>{f.data.client.nom}</td>
                    <td data-libelle={tr("operator.date")} className="num">
                      {dateFr(f.data.date)}
                    </td>
                    <td data-libelle={tr("operator.total")} className="num">
                      {eur(f.ttcCents)}
                    </td>
                    <td data-libelle={tr("operator.status")}>{f.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Bandeau
        ton={d.donnees.audit.ok ? "succes" : "erreur"}
        titre={d.donnees.audit.ok ? tr("audit.ok") : tr("audit.broken")}
      >
        <p>
          <ShieldCheck className="icone icone-sm" aria-hidden="true" />{" "}
          {tr("audit.entries", { count: d.donnees.audit.entrees })}
        </p>
      </Bandeau>
    </>
  );
}

interface Utilisateur {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  twoFactorEnabled?: boolean | null;
  createdAt: string;
}

/** Calls the Better Auth admin plugin (global `admin` role of the operator tenant's owners and admins). */
async function adminAuth<T>(chemin: string, corps?: unknown): Promise<T> {
  const r = await fetch(`/api/auth/admin/${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`);
  return j as T;
}

/** Accounts of all companies: search, suspension (ban) and closing of sessions. */
function Utilisateurs() {
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("");
  const d = useDonnees(() => {
    const q = new URLSearchParams({ limit: "50", sortBy: "createdAt", sortDirection: "desc" });
    if (filtre) {
      q.set("searchField", "email");
      q.set("searchOperator", "contains");
      q.set("searchValue", filtre);
    }
    return adminAuth<{ users: Utilisateur[]; total: number }>(`list-users?${q}`);
  }, [filtre]);
  const [enCours, setEnCours] = useState<string | null>(null);
  async function agir(u: Utilisateur, f: () => Promise<unknown>) {
    setEnCours(u.id);
    try {
      await f();
      d.recharger();
    } finally {
      setEnCours(null);
    }
  }
  return (
    <section className="carte pile-serree" aria-labelledby="sec-utilisateurs">
      <h2 id="sec-utilisateurs">{tr("users.title")}</h2>
      <form
        className="rangee rangee-bas"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltre(recherche.trim());
        }}
      >
        <ChampTexte libelle={tr("users.search")} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <Bouton type="submit">{tr("users.search_button")}</Bouton>
      </form>
      {d.etat === "chargement" && <EtatChargement lignes={2} />}
      {d.etat === "erreur" && <EtatErreur message={d.erreur} onReessayer={d.recharger} />}
      {d.etat === "ok" && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">{tr("users.account")}</th>
                <th scope="col">{tr("users.twofa")}</th>
                <th scope="col">{tr("users.state")}</th>
                <th scope="col">
                  <span className="visuellement-cache">{tr("users.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.donnees.users.map((u) => (
                <tr key={u.id}>
                  <td data-libelle={tr("users.account")}>
                    {u.email} {u.role === "admin" && <strong>{tr("users.operator")}</strong>}
                  </td>
                  <td data-libelle={tr("users.twofa")}>{u.twoFactorEnabled ? tr("users.twofa_on") : "—"}</td>
                  <td data-libelle={tr("users.state")}>
                    {u.banned
                      ? u.banReason
                        ? tr("users.banned_reason", { reason: u.banReason })
                        : tr("users.banned")
                      : tr("users.active")}
                  </td>
                  <td data-libelle={tr("users.actions")}>
                    <div className="rangee">
                      <Bouton
                        variante={u.banned ? "secondaire" : "danger"}
                        icone={Ban}
                        chargement={enCours === u.id}
                        onClick={() =>
                          agir(u, () =>
                            u.banned
                              ? adminAuth("unban-user", { userId: u.id })
                              : adminAuth("ban-user", { userId: u.id, banReason: "suspended by the operator" }),
                          )
                        }
                      >
                        {u.banned ? tr("companies.restore") : tr("companies.suspend")}
                      </Bouton>
                      <Bouton
                        variante="fantome"
                        icone={LogOut}
                        chargement={enCours === u.id}
                        onClick={() => agir(u, () => adminAuth("revoke-user-sessions", { userId: u.id }))}
                      >
                        {tr("users.revoke")}
                      </Bouton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="attenue petit">{tr("users.total", { count: d.donnees.total })}</p>
        </div>
      )}
    </section>
  );
}

function Console() {
  const sante = useDonnees(async () => (await fetch("/health")).ok);
  const plans = useDonnees(() => api.plans());
  const session = useDonnees<Moi | null>(() =>
    api.moi().catch((e) => {
      if (e instanceof ErreurApi && e.status === 401) return null;
      throw e;
    }),
  );

  return (
    <main className="console" id="contenu">
      <div className="console-entete">
        <h1>{tr("console.title")}</h1>
        <BasculeTheme />
        {session.etat === "ok" && session.donnees && (
          <Bouton
            variante="fantome"
            icone={LogOut}
            onClick={async () => {
              await api.deconnecter().catch(() => {});
              session.recharger();
            }}
          >
            {tr("logout")}
          </Bouton>
        )}
      </div>

      <section className="carte pile-serree" aria-labelledby="sec-sante">
        <h2 id="sec-sante">{tr("health.title")}</h2>
        {sante.etat === "chargement" && <EtatChargement lignes={1} />}
        {sante.etat !== "chargement" && (
          <Bandeau
            ton={sante.donnees ? "succes" : "erreur"}
            titre={sante.donnees ? tr("health.up") : tr("health.down")}
          >
            <p>
              <Activity className="icone icone-sm" aria-hidden="true" /> <code>GET /health</code>
            </p>
          </Bandeau>
        )}
      </section>

      <section className="carte pile-serree" aria-labelledby="sec-plans">
        <h2 id="sec-plans">{tr("plans.title")}</h2>
        {plans.etat === "chargement" && <EtatChargement lignes={2} />}
        {plans.etat === "erreur" && <EtatErreur message={plans.erreur} onReessayer={plans.recharger} />}
        {plans.etat === "ok" && (
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">{tr("plans.plan")}</th>
                  <th scope="col" className="num">
                    {tr("plans.monthly")}
                  </th>
                  <th scope="col" className="num">
                    {tr("plans.yearly")}
                  </th>
                  <th scope="col" className="num">
                    {tr("plans.trial")}
                  </th>
                  <th scope="col" className="num">
                    {tr("plans.invoices")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plans.donnees.map((p) => (
                  <tr key={p.id}>
                    <td data-libelle={tr("plans.plan")}>{p.nom}</td>
                    <td data-libelle={tr("plans.monthly")} className="num">
                      {eur(p.prixHtCents.mensuel)}
                    </td>
                    <td data-libelle={tr("plans.yearly")} className="num">
                      {eur(p.prixHtCents.annuel)}
                    </td>
                    <td data-libelle={tr("plans.trial")} className="num">
                      {p.essaiJours ? tr("plans.trial_days", { count: p.essaiJours }) : "—"}
                    </td>
                    <td data-libelle={tr("plans.invoices")} className="num">
                      {p.quotas.factures === null ? tr("plans.unlimited") : nombre(p.quotas.factures ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {session.etat === "chargement" && <EtatChargement lignes={2} />}
      {session.etat === "erreur" && <EtatErreur message={session.erreur} onReessayer={session.recharger} />}
      {session.etat === "ok" && !session.donnees && <Connexion onSession={session.recharger} />}
      {session.etat === "ok" && session.donnees && <Operateur moi={session.donnees} />}
      {session.etat === "ok" && session.donnees && <Entreprises />}
      {session.etat === "ok" && session.donnees && <Utilisateurs />}
    </main>
  );
}

initLocale();
appliquerTheme(themeEnregistre());
createRoot(document.getElementById("racine")!).render(
  <FournisseurToasts>
    <Console />
  </FournisseurToasts>,
);
