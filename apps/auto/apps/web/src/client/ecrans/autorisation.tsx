// OAuth consent of an MCP client (Claude Code, Claude Desktop…): client name, requested access, choice of the
// company the token will be bound to, then grant or refusal. The signed /oauth2/authorize request is relayed
// by the Better Auth client (oauthProviderClient).
import { Check, ShieldCheck, X } from "@auto/ui/symboles";
import { useEffect, useState } from "react";
import { api, ErreurApi, type Moi } from "@auto/client";
import { Bandeau, Bouton, ChampListe, EtatChargement, ResumeErreurs, parametre, useTitrePage } from "@auto/ui/react";
import { authClient, messageAuth, suivreRedirection } from "../auth";
import { Marque } from "./marque";
import { t } from "../i18n";

// Scopes are OAuth data; each known one maps to a catalog message.
const PORTEES = ["openid", "profile", "email", "offline_access"];

export function Autorisation() {
  useTitrePage(t("oauth.title"));
  const clientId = parametre("client_id") ?? "";
  const portees = (parametre("scope") ?? "").split(" ").filter(Boolean);
  const [client, setClient] = useState<{ client_name?: string; client_uri?: string } | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);
  const [tenant, setTenant] = useState("");
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState<"oui" | "non" | null>(null);

  useEffect(() => {
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setClient)
      .catch(() => setClient({}));
    api
      .moi()
      .then((m) => {
        setMoi(m);
        setTenant(m.tenantId);
      })
      .catch((e) => setErreur(e as ErreurApi));
  }, [clientId]);

  async function repondre(accept: boolean) {
    setEnvoi(accept ? "oui" : "non");
    setErreur(null);
    try {
      if (accept && moi && tenant !== moi.tenantId) await authClient.organization.setActive({ organizationId: tenant });
      const consent = await authClient.$fetch("/oauth2/consent", { method: "POST", body: { accept } });
      if (!consent.error && suivreRedirection(consent.data)) return;
      // "After sign-in" step (company chosen): the authorization resumes.
      const suite = await authClient.$fetch("/oauth2/continue", { method: "POST", body: { postLogin: true } });
      if (!suite.error && suivreRedirection(suite.data)) return;
      const e = (consent.error ?? suite.error) as { code?: string; message?: string; status?: number } | null;
      setErreur(new ErreurApi(messageAuth(e) || t("oauth.failed"), e?.status ?? 400));
    } finally {
      setEnvoi(null);
    }
  }

  const nom = client?.client_name || clientId;
  return (
    <main className="auth" id="contenu">
      <div className="fond-motif pattern-dots-md" aria-hidden="true" />
      <div className="auth-carte carte">
        <Marque />
        <h1>{t("oauth.heading", { name: nom })}</h1>
        {!client || !moi ? (
          erreur ? (
            <ResumeErreurs erreur={erreur} />
          ) : (
            <EtatChargement libelle={t("oauth.reading")} />
          )
        ) : (
          <div className="grille">
            <ResumeErreurs erreur={erreur} />
            <Bandeau ton="info" titre={t("oauth.banner")}>
              <p>{t("oauth.banner_text", { name: nom })}</p>
            </Bandeau>
            {portees.length > 0 && (
              <ul>
                {portees.map((p) => (
                  <li key={p}>{PORTEES.includes(p) ? t(`oauth.scope.${p}`) : p}</li>
                ))}
              </ul>
            )}
            <ChampListe libelle={t("oauth.company")} value={tenant} onChange={(e) => setTenant(e.target.value)}>
              {moi.entreprises.map((e) => (
                <option key={e.id} value={e.id} disabled={e.suspendue}>
                  {e.nom} ({e.role})
                </option>
              ))}
            </ChampListe>
            <div className="grille grille-2">
              <Bouton icone={X} chargement={envoi === "non"} onClick={() => repondre(false)}>
                {t("oauth.refuse")}
              </Bouton>
              <Bouton variante="primaire" icone={Check} chargement={envoi === "oui"} onClick={() => repondre(true)}>
                {t("oauth.allow")}
              </Bouton>
            </div>
            <p className="attenue petit">
              <ShieldCheck className="icone" aria-hidden="true" /> {t("oauth.revocable")}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
