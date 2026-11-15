// Better Auth sign-in: password (then second factor), magic link by email, passkey, and Google or Microsoft
// providers when the operator has configured them. Started by an OAuth client (MCP), the sign-in then resumes
// the authorization (signed request relayed by the Better Auth client).
import { KeyRound, LogIn, Send, ShieldCheck } from "@auto/ui/symboles";
import { useEffect, useState, type FormEvent } from "react";
import { ErreurApi } from "@auto/client";
import { emailValide } from "@auto/ui/format";
import { Bandeau, Bouton, ChampTexte, Lien, ResumeErreurs, naviguer, parametre, useTitrePage } from "@auto/ui/react";
import { authClient, messageAuth, suivreRedirection } from "../auth";
import { Marque } from "./marque";
import { ConnexionAppareil, dansApplicationNative } from "./appareil";
import { LogoFournisseur } from "./logo-fournisseur";
import { t } from "../i18n";
import { rich } from "../rich";

/** Destination after sign-in: only an internal application path (no open redirect). */
export const retourSur = (r: string | null) => (r && r.startsWith("/app") && !r.startsWith("//") ? r : "/app");

const NOMS: Record<string, string> = { google: "Google", microsoft: "Microsoft" };

type Etape = "identifiants" | "deuxFacteurs" | "lienEnvoye";

export function Connexion({ onSession }: { onSession: () => Promise<void> | void }) {
  useTitrePage(t("login.title"));
  const [etape, setEtape] = useState<Etape>("identifiants");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [resterConnecte, setResterConnecte] = useState(true);
  const [code, setCode] = useState("");
  const [confiance, setConfiance] = useState(false);
  const [erreurs, setErreurs] = useState<{ email?: string; motDePasse?: string; code?: string }>({});
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  // null until /v1/auth/methodes has answered: reserved places for the buttons (no layout shift).
  const [sociaux, setSociaux] = useState<string[] | null>(null);
  const [appareilActif, setAppareilActif] = useState(false);

  useEffect(() => {
    fetch("/v1/auth/methodes")
      .then((r) => (r.ok ? r.json() : { sociaux: [] }))
      .then((m: { sociaux?: string[]; appareil?: boolean }) => {
        setSociaux(m.sociaux ?? []);
        setAppareilActif(m.appareil === true);
      })
      .catch(() => setSociaux([]));
  }, []);

  const retour = retourSur(parametre("retour"));

  async function apres(d: unknown) {
    if (suivreRedirection(d)) return;
    await onSession();
    naviguer(retour, true);
  }

  function echec(e: { code?: string; message?: string; status?: number }) {
    setErreur(new ErreurApi(messageAuth(e), e.status ?? 400));
  }

  async function motDePasseSoumis(e: FormEvent) {
    e.preventDefault();
    const err = {
      email: emailValide(email) ? undefined : t("login.email_invalid"),
      motDePasse: motDePasse ? undefined : t("login.password_required"),
    };
    setErreurs(err);
    if (err.email || err.motDePasse) return;
    setEnvoi("mdp");
    setErreur(null);
    try {
      const { data, error } = await authClient.signIn.email({
        email: email.trim(),
        password: motDePasse,
        rememberMe: resterConnecte,
      });
      if (error) return echec(error);
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        setEtape("deuxFacteurs");
        return;
      }
      await apres(data);
    } finally {
      setEnvoi(null);
    }
  }

  async function codeSoumis(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return setErreurs({ code: t("login.code_required") });
    setErreurs({});
    setEnvoi("code");
    setErreur(null);
    try {
      const { data, error } = /^\d{6}$/.test(c)
        ? await authClient.twoFactor.verifyTotp({ code: c, trustDevice: confiance })
        : await authClient.twoFactor.verifyBackupCode({ code: c, trustDevice: confiance });
      if (error) return echec(error);
      await apres(data);
    } finally {
      setEnvoi(null);
    }
  }

  async function lienMagique() {
    if (!emailValide(email)) return setErreurs({ email: t("login.email_first") });
    setErreurs({});
    setEnvoi("lien");
    setErreur(null);
    try {
      const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: retour });
      if (error) return echec(error);
      setEtape("lienEnvoye");
    } finally {
      setEnvoi(null);
    }
  }

  async function passkey() {
    setEnvoi("passkey");
    setErreur(null);
    try {
      const r = await authClient.signIn.passkey();
      if (r?.error) return echec(r.error);
      await apres(r?.data);
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <main className="auth" id="contenu">
      <div className="fond-motif pattern-dots-md" aria-hidden="true" />
      <div className="auth-carte carte">
        <Marque />
        {etape === "identifiants" && (
          <>
            <h1>{t("login.heading")}</h1>
            <form className="grille" noValidate onSubmit={motDePasseSoumis}>
              <ResumeErreurs erreur={erreur} />
              <ChampTexte
                libelle={t("common.email")}
                type="email"
                autoComplete="username webauthn"
                requis
                value={email}
                erreur={erreurs.email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <ChampTexte
                libelle={t("common.password")}
                type="password"
                autoComplete="current-password webauthn"
                requis
                value={motDePasse}
                erreur={erreurs.motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
              <label className="rangee permission-option">
                <input type="checkbox" checked={resterConnecte} onChange={(e) => setResterConnecte(e.target.checked)} />
                {t("login.remember")}
              </label>
              <Bouton type="submit" variante="primaire" icone={LogIn} chargement={envoi === "mdp"} plein>
                {t("login.heading")}
              </Bouton>
              <div className="grille grille-2">
                <Bouton icone={Send} chargement={envoi === "lien"} onClick={lienMagique}>
                  {t("login.magic_link")}
                </Bouton>
                <Bouton icone={KeyRound} chargement={envoi === "passkey"} onClick={passkey}>
                  {t("login.passkey")}
                </Bouton>
              </div>
              {sociaux === null &&
                ["google", "microsoft"].map((p) => (
                  <Bouton
                    key={p}
                    plein
                    className="connexion-fournisseur connexion-attente"
                    disabled
                    aria-hidden
                    tabIndex={-1}
                  >
                    {t("login.continue")}
                  </Bouton>
                ))}
              {(sociaux ?? []).map((p) => (
                <Bouton
                  key={p}
                  plein
                  className="connexion-fournisseur"
                  onClick={() => authClient.signIn.social({ provider: p as "google", callbackURL: retour })}
                >
                  <LogoFournisseur fournisseur={p} />
                  {t("login.continue_with", { provider: NOMS[p] ?? p })}
                </Bouton>
              ))}
              {appareilActif && dansApplicationNative() && <ConnexionAppareil onSession={onSession} retour={retour} />}
              <p className="attenue">
                {rich("login.no_account", { link: <Lien href="/app/inscription">{t("login.create_account")}</Lien> })}
              </p>
            </form>
          </>
        )}
        {etape === "deuxFacteurs" && (
          <>
            <h1>{t("login.two_factor.title")}</h1>
            <form className="grille" noValidate onSubmit={codeSoumis}>
              <ResumeErreurs erreur={erreur} />
              <p className="attenue">{t("login.two_factor.help")}</p>
              <ChampTexte
                libelle={t("common.code")}
                inputMode="text"
                autoComplete="one-time-code"
                requis
                value={code}
                erreur={erreurs.code}
                onChange={(e) => setCode(e.target.value)}
              />
              <label className="rangee">
                <input type="checkbox" checked={confiance} onChange={(e) => setConfiance(e.target.checked)} />
                {t("login.two_factor.trust")}
              </label>
              <Bouton type="submit" variante="primaire" icone={ShieldCheck} chargement={envoi === "code"} plein>
                {t("login.two_factor.submit")}
              </Bouton>
            </form>
          </>
        )}
        {etape === "lienEnvoye" && (
          <>
            <h1>{t("login.link_sent.title")}</h1>
            <Bandeau ton="succes" titre={t("login.link_sent.banner")}>
              <p>{t("login.link_sent.text", { email: email.trim() })}</p>
            </Bandeau>
            <Bouton onClick={() => setEtape("identifiants")}>{t("common.back")}</Bouton>
          </>
        )}
      </div>
    </main>
  );
}
