// Invitation acceptance: Better Auth link (`/app/invitation?id=…`) or old link (`#token`).
// Signed in with the right address: direct acceptance. Otherwise: password of the existing account, or of the
// account to create (12 characters minimum); the account's 2FA then applies at sign-in.
import { Check, LogIn } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { api, ErreurApi } from "@auto/client";
import { Bandeau, Bouton, ChampTexte, Lien, ResumeErreurs, naviguer, parametre, useTitrePage } from "@auto/ui/react";
import { authClient, messageAuth } from "../auth";
import { Marque } from "./marque";
import { t } from "../i18n";
import { rich } from "../rich";

export function Invitation({ onSession }: { onSession: () => Promise<void> | void }) {
  useTitrePage(t("invite.title"));
  const id = parametre("id");
  const jeton = location.hash.slice(1) || null;
  const session = authClient.useSession();
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [deuxFacteurs, setDeuxFacteurs] = useState(false);

  async function accepterConnecte() {
    if (!id) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { data, error } = await authClient.organization.acceptInvitation({ invitationId: id });
      if (error) return setErreur(new ErreurApi(messageAuth(error), error.status ?? 400));
      await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
      await onSession();
      naviguer("/app", true);
    } finally {
      setEnvoi(false);
    }
  }

  async function accepter(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.accepterInvitation({ ...(id ? { id } : { jeton: jeton ?? "" }), motDePasse });
      if (r.deuxFacteurs) return setDeuxFacteurs(true);
      await onSession();
      naviguer("/app", true);
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
        <h1>{t("invite.heading")}</h1>
        {!id && !jeton ? (
          <Bandeau ton="erreur" titre={t("invite.incomplete")}>
            <p>{t("invite.incomplete_text")}</p>
          </Bandeau>
        ) : deuxFacteurs ? (
          <Bandeau ton="succes" titre={t("invite.accepted")}>
            <p>{rich("invite.two_factor", { link: <Lien href="/app/connexion">{t("invite.sign_in_link")}</Lien> })}</p>
          </Bandeau>
        ) : session.data && id ? (
          <div className="grille">
            <ResumeErreurs erreur={erreur} />
            <p>{rich("invite.signed_in_as", { email: <strong>{session.data.user.email}</strong> })}</p>
            <Bouton variante="primaire" icone={Check} chargement={envoi} plein onClick={accepterConnecte}>
              {t("invite.accept")}
            </Bouton>
            <Bouton
              variante="fantome"
              disabled={envoi}
              onClick={async () => {
                setEnvoi(true);
                setErreur(null);
                try {
                  const { error } = await authClient.signOut();
                  if (error) return setErreur(new ErreurApi(messageAuth(error), error.status ?? 400));
                  await onSession();
                } catch {
                  setErreur(new ErreurApi(t("invite.switch_failed"), 0));
                } finally {
                  setEnvoi(false);
                }
              }}
            >
              {t("invite.other_account")}
            </Bouton>
          </div>
        ) : (
          <form className="grille" noValidate onSubmit={accepter}>
            <ResumeErreurs erreur={erreur} />
            <p className="attenue">{t("invite.password_help")}</p>
            <ChampTexte
              libelle={t("common.password")}
              type="password"
              autoComplete="current-password"
              requis
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            <Bouton type="submit" variante="primaire" icone={LogIn} chargement={envoi} plein>
              {t("invite.join")}
            </Bouton>
          </form>
        )}
      </div>
    </main>
  );
}
