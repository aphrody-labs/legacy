import { useEffect, useState } from "react";
import { Bouton, Lien, naviguer, useTitrePage } from "@auto/ui/react";
import { authClient } from "../auth";
import { t } from "../i18n";
import { rich } from "../rich";

interface Demande {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
  expire: number;
}
const formatCode = (s: string) => s.toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
async function requete(path: string, body: unknown, signal?: AbortSignal) {
  return fetch("/api/auth/device" + path, {
    method: "POST",
    credentials: "same-origin",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
export const dansApplicationNative = () =>
  typeof window !== "undefined" && (window as Window & { __AUTO_NATIVE__?: boolean }).__AUTO_NATIVE__ === true;

/** RFC 8628: the device secret stays in memory; the server sets the HttpOnly cookie after validation. */
export function ConnexionAppareil({ onSession, retour }: { onSession: () => Promise<void> | void; retour: string }) {
  const [demande, setDemande] = useState<Demande | null>(null),
    [erreur, setErreur] = useState(""),
    [chargement, setChargement] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!demande) return;
    let actif = true,
      timer: ReturnType<typeof setTimeout>,
      intervalle = Math.max(5, demande.interval) * 1000;
    const controle = new AbortController();
    const poll = async () => {
      if (!actif) return;
      if (Date.now() >= demande.expire) {
        setMessage(t("device.code_expired"));
        setDemande(null);
        return;
      }
      try {
        const r = await requete(
          "/token",
          {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: "auto-native",
            device_code: demande.device_code,
          },
          controle.signal,
        );
        if (r.ok) {
          if (actif) {
            setDemande(null);
            await onSession();
            naviguer(retour);
          }
          return;
        }
        const b = (await r.json()) as { error?: string };
        if (b.error === "slow_down") intervalle += 5000;
        else if (b.error !== "authorization_pending") {
          setErreur(b.error === "access_denied" ? t("device.denied") : t("device.unusable"));
          setDemande(null);
          return;
        }
      } catch {
        if (!actif) return;
        setMessage(t("device.retrying"));
      }
      if (actif) timer = setTimeout(poll, intervalle);
    };
    timer = setTimeout(poll, intervalle);
    return () => {
      actif = false;
      clearTimeout(timer);
      controle.abort();
    };
  }, [demande, onSession, retour]);
  async function commencer() {
    setChargement(true);
    setErreur("");
    setMessage("");
    try {
      const r = await requete("/code", { client_id: "auto-native" });
      if (!r.ok) throw Error(t("device.prepare_failed"));
      const b = (await r.json()) as Omit<Demande, "expire">;
      const u = new URL(b.verification_uri_complete);
      if (
        u.origin !== location.origin ||
        u.pathname !== "/app/verification-appareil" ||
        !b.device_code ||
        !b.user_code ||
        !Number.isFinite(b.expires_in) ||
        b.expires_in <= 0 ||
        !Number.isFinite(b.interval)
      )
        throw Error(t("device.invalid_url"));
      setDemande({ ...b, expire: Date.now() + Math.min(600, b.expires_in) * 1000 });
      setMessage(t("device.validate_here"));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }
  return (
    <section className="grille" aria-label={t("device.browser_signin")}>
      {erreur && <p role="alert">{erreur}</p>}
      {message && <p role="status">{message}</p>}
      {demande ? (
        <>
          <p>
            {rich("device.your_code", { code: <strong className="chiffres">{formatCode(demande.user_code)}</strong> })}
          </p>
          <Bouton onClick={() => location.assign(demande.verification_uri_complete)}>{t("device.open_browser")}</Bouton>
          <Bouton
            variante="fantome"
            onClick={() => {
              setDemande(null);
              setMessage(t("device.cancelled"));
            }}
          >
            {t("device.cancel")}
          </Bouton>
        </>
      ) : (
        <Bouton disabled={chargement} onClick={commencer}>
          {t("device.signin_button")}
        </Bouton>
      )}
    </section>
  );
}

export function VerificationAppareil() {
  useTitrePage(t("device.verify_title"));
  const code = new URLSearchParams(location.search).get("user_code") ?? "";
  const [email, setEmail] = useState(""),
    [etat, setEtat] = useState("chargement"),
    [erreur, setErreur] = useState(""),
    [occupe, setOccupe] = useState(false);
  useEffect(() => {
    let actif = true;
    if (!/^[a-z0-9-]{4,32}$/i.test(code)) {
      setErreur(t("device.bad_code"));
      setEtat("erreur");
      return;
    }
    Promise.all([
      authClient.getSession(),
      fetch(`/api/auth/device?${new URLSearchParams({ user_code: code })}`, { credentials: "same-origin" }),
    ])
      .then(async ([s, r]) => {
        if (!actif) return;
        if (!s.data) throw Error(t("device.sign_in_first"));
        if (!r.ok) throw Error(t("device.unknown_code"));
        const b = (await r.json()) as { client_id?: string; status?: string };
        if (b.client_id !== "auto-native") throw Error(t("device.unknown_app"));
        setEmail(s.data.user.email);
        setEtat(b.status ?? "pending");
      })
      .catch((e) => {
        if (actif) {
          setErreur(e.message);
          setEtat("erreur");
        }
      });
    return () => {
      actif = false;
    };
  }, [code]);
  async function decider(accord: boolean) {
    setOccupe(true);
    setErreur("");
    try {
      const r = await requete(accord ? "/approve" : "/deny", { userCode: code });
      if (!r.ok) throw Error(t("device.validation_failed"));
      setEtat(accord ? "approved" : "denied");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  }
  return (
    <main className="courrier-app">
      <Lien href="/app/courrier">auto · Aphrody</Lien>
      <h1>{t("device.heading")}</h1>
      {erreur && <p role="alert">{erreur}</p>}
      {etat === "chargement" ? (
        <p>{t("device.checking")}</p>
      ) : etat === "pending" ? (
        <section className="courrier-lecture">
          <h2>{t("device.native")}</h2>
          <p>{rich("device.account", { email: <strong>{email}</strong> })}</p>
          <p>{t("device.confirm")}</p>
          <p className="chiffres">
            <strong>{formatCode(code)}</strong>
          </p>
          <p>{t("device.consent")}</p>
          <div className="courrier-actions">
            <Bouton disabled={occupe} onClick={() => decider(true)}>
              {t("device.authorize")}
            </Bouton>
            <Bouton disabled={occupe} variante="fantome" onClick={() => decider(false)}>
              {t("device.refuse")}
            </Bouton>
          </div>
        </section>
      ) : etat === "approved" ? (
        <p role="status">{t("device.approved")}</p>
      ) : etat === "denied" ? (
        <p role="status">{t("device.refused")}</p>
      ) : null}
    </main>
  );
}
