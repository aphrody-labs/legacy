import { useEffect, useState } from "react";
import { Bouton, Lien, useTitrePage } from "@auto/ui/react";
import { date, t } from "../i18n";
interface Agent {
  id: string;
  nom: string;
  actif: boolean;
  expire_at: string;
  dernier_acces: string | null;
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/v1/admin" + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.status === 204) return null as T;
  const data = await r.json();
  if (!r.ok) throw Error(data.erreur ?? t("admin.denied"));
  return data;
}
export function Administration() {
  useTitrePage(t("admin.title"));
  const [agents, setAgents] = useState<Agent[]>([]),
    [erreur, setErreur] = useState(""),
    [token, setToken] = useState(""),
    [nom, setNom] = useState(""),
    [occupe, setOccupe] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let actif = true;
    Promise.all([api("/moi"), api<Agent[]>("/agents")])
      .then(([, a]) => {
        if (actif) setAgents(a);
      })
      .catch((e) => {
        if (actif) setErreur(e.message);
      });
    return () => {
      actif = false;
    };
  }, [revision]);
  async function agir(fn: () => Promise<void>) {
    setOccupe(true);
    setErreur("");
    try {
      await fn();
      setRevision((x) => x + 1);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  }
  return (
    <main className="courrier-app">
      <header className="courrier-entete">
        <div>
          <Lien href="/app/courrier">{t("admin.back")}</Lien>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.intro")}</p>
        </div>
      </header>
      {erreur && <p role="alert">{erreur}</p>}
      <section className="courrier-lecture">
        <h2>{t("admin.agents.title")}</h2>
        <p>{t("admin.agents.text")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void agir(async () => {
              const a = await api<{ token: string }>("/agents", "POST", { nom });
              setToken(a.token);
              setNom("");
            });
          }}
        >
          <label>
            {t("admin.agent_name")}
            <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={100} />
          </label>
          <Bouton type="submit" disabled={occupe || !nom.trim()}>
            {t("admin.create_key")}
          </Bouton>
        </form>
        {token && (
          <div role="status">
            <label>
              {t("admin.key_once")}
              <input
                readOnly
                value={token}
                onFocus={(e) => e.currentTarget.select()}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <Bouton onClick={() => setToken("")}>{t("admin.hide_key")}</Bouton>
          </div>
        )}
        <ul>
          {agents.map((a) => (
            <li key={a.id}>
              <strong>{a.nom}</strong> · {a.actif ? t("admin.active") : t("admin.revoked")} ·{" "}
              {t("admin.expires", { date: date(a.expire_at, { dateStyle: "short" }) })}{" "}
              {a.actif && (
                <Bouton disabled={occupe} onClick={() => agir(() => api(`/agents/${a.id}`, "DELETE"))}>
                  {t("admin.revoke")}
                </Bouton>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
