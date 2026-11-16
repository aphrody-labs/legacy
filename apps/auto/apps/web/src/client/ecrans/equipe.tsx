// Settings, team: members and roles, email invitations, company API keys.
import { Copy, KeyRound, Send, Trash2, UserPlus } from "@auto/ui/symboles";
import { useState, type FormEvent } from "react";
import { PermissionsMembres } from "./arrivages";
import { api, ErreurApi, type Role } from "@auto/client";
import { ROLES } from "@auto/tenancy/droits";
import { emailValide } from "@auto/ui/format";
import {
  Bandeau,
  BadgeStatut,
  Bouton,
  ChampListe,
  ChampTexte,
  EtatChargement,
  EtatErreur,
  ResumeErreurs,
  useDonnees,
  useToast,
} from "@auto/ui/react";
import { authClient, messageAuth } from "../auth";
import { LIBELLE_ROLE, useSession } from "../session";
import { date, t } from "../i18n";
import { rich } from "../rich";

const jour = (iso: string | null) => (iso ? date(iso, { dateStyle: "short" }) : "—");

function ChoixRole({
  value,
  onChange,
  libelle = t("team.role"),
}: {
  value: Role;
  onChange: (r: Role) => void;
  libelle?: string;
}) {
  const { moi } = useSession();
  return (
    <ChampListe libelle={libelle} value={value} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.filter((r) => r !== "owner" || moi.role === "owner").map((r) => (
        <option key={r} value={r}>
          {LIBELLE_ROLE[r]}
        </option>
      ))}
    </ChampListe>
  );
}

const VISUEL = { en_attente: "envoye", acceptee: "accepte", revoquee: "annule", expiree: "en_retard" } as const;

export function Membres() {
  const toast = useToast();
  const { moi } = useSession();
  const membres = useDonnees(() => api.membres());
  const invitations = useDonnees(() => api.invitations());
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("comptable");
  const [errEmail, setErrEmail] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function inviter(e: FormEvent) {
    e.preventDefault();
    if (!emailValide(email)) return setErrEmail(t("customers.err.email"));
    setErrEmail(null);
    setEnvoi(true);
    setErreur(null);
    try {
      await api.inviter(email.trim(), role);
      toast(t("team.invited", { email: email.trim(), role: LIBELLE_ROLE[role] }));
      setEmail("");
      invitations.recharger();
    } catch (x) {
      setErreur(x as ErreurApi);
    } finally {
      setEnvoi(false);
    }
  }

  async function changerRole(memberId: string, r: Role) {
    setErreur(null);
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role: r,
      organizationId: moi.tenantId,
    });
    if (error) return setErreur(new ErreurApi(messageAuth(error), error.status ?? 400));
    toast(t("team.role_changed", { role: LIBELLE_ROLE[r] }));
    membres.recharger();
  }

  async function agir(f: () => Promise<unknown>, message: string, apres: () => void) {
    setErreur(null);
    try {
      await f();
      toast(message);
      apres();
    } catch (x) {
      setErreur(x as ErreurApi);
    }
  }

  return (
    <div className="grille">
      <p>{rich("team.intro", { company: <strong>{moi.entreprise.nom}</strong> })}</p>
      <ResumeErreurs erreur={erreur} />
      {membres.etat === "chargement" && <EtatChargement lignes={2} />}
      {membres.etat === "erreur" && <EtatErreur message={membres.erreur} onReessayer={membres.recharger} />}
      {membres.etat === "ok" && (
        <table className="tableau">
          <caption className="visuellement-cache">{t("team.members_caption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("team.col.member")}</th>
              <th scope="col">{t("team.role")}</th>
              <th scope="col">{t("team.col.since")}</th>
              <th scope="col">
                <span className="visuellement-cache">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {membres.donnees.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.nom}</strong>
                  <br />
                  <span className="attenue">{m.email}</span>
                </td>
                <td>
                  {m.userId === moi.userId || (m.role === "owner" && moi.role !== "owner") ? (
                    LIBELLE_ROLE[m.role]
                  ) : (
                    <ChoixRole libelle={t("team.role_of", { email: m.email })} value={m.role} onChange={(r) => changerRole(m.id, r)} />
                  )}
                </td>
                <td>{jour(m.depuis)}</td>
                <td>
                  {m.userId !== moi.userId && (
                    <Bouton
                      variante="fantome"
                      icone={Trash2}
                      aria-label={t("team.remove", { email: m.email })}
                      onClick={() => agir(() => api.retirerMembre(m.id), t("team.removed", { email: m.email }), membres.recharger)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {membres.etat === "ok" && <PermissionsMembres membres={membres.donnees} />}
      <form className="grille" noValidate onSubmit={inviter}>
        <h3>{t("team.invite_member")}</h3>
        <div className="grille grille-3 rangee-bas">
          <ChampTexte
            libelle={t("common.email")}
            type="email"
            value={email}
            erreur={errEmail}
            onChange={(e) => setEmail(e.target.value)}
          />
          <ChoixRole value={role} onChange={setRole} />
          <div>
            <Bouton type="submit" icone={UserPlus} chargement={envoi}>
              {t("team.invite")}
            </Bouton>
          </div>
        </div>
        <p className="attenue petit">{t("team.invite_help")}</p>
      </form>

      {invitations.etat === "ok" && invitations.donnees.length > 0 && (
        <table className="tableau">
          <caption>{t("team.invitations")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("common.email")}</th>
              <th scope="col">{t("team.role")}</th>
              <th scope="col">{t("col.status")}</th>
              <th scope="col">{t("team.col.expires")}</th>
              <th scope="col">
                <span className="visuellement-cache">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitations.donnees.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{LIBELLE_ROLE[i.role]}</td>
                <td>
                  <BadgeStatut statut={VISUEL[i.statut]} libelle={t(`team.status.${i.statut}`)} />
                </td>
                <td>{jour(i.expiresAt)}</td>
                <td>
                  {i.statut === "en_attente" && (
                    <div className="rangee">
                      <Bouton
                        variante="fantome"
                        icone={Send}
                        aria-label={t("team.resend", { email: i.email })}
                        onClick={() =>
                          agir(() => api.inviter(i.email, i.role), t("team.resent"), invitations.recharger)
                        }
                      />
                      <Bouton
                        variante="fantome"
                        icone={Trash2}
                        aria-label={t("team.revoke_invitation", { email: i.email })}
                        onClick={() =>
                          agir(() => api.revoquerInvitation(i.id), t("team.invitation_revoked"), invitations.recharger)
                        }
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Jetons() {
  const [nom, setNom] = useState("");
  const [jours, setJours] = useState("");
  const [jeton, setJeton] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const cles = useDonnees(() => api.jetons());
  const toast = useToast();
  return (
    <div className="grille">
      <form
        className="grille"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setEnvoi(true);
          setErreur(null);
          try {
            setJeton((await api.creerJeton(nom.trim() || "api", Number(jours) || undefined)).jeton);
            setNom("");
            cles.recharger();
          } catch (x) {
            setErreur(x as ErreurApi);
          } finally {
            setEnvoi(false);
          }
        }}
      >
        <ResumeErreurs erreur={erreur} />
        <div className="rangee rangee-bas">
          <ChampTexte
            className="espace"
            libelle={t("keys.name")}
            placeholder={t("keys.name_placeholder")}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <ChampTexte
            libelle={t("keys.expires_in")}
            inputMode="numeric"
            placeholder={t("keys.never")}
            value={jours}
            onChange={(e) => setJours(e.target.value.replace(/\D/g, ""))}
          />
          <Bouton type="submit" icone={KeyRound} chargement={envoi}>
            {t("keys.create")}
          </Bouton>
        </div>
        {jeton && (
          <Bandeau ton="avertissement" titre={t("keys.copy_now")}>
            <p className="jeton">{jeton}</p>
            <Bouton
              icone={Copy}
              onClick={async () => {
                await navigator.clipboard?.writeText(jeton);
                toast(t("keys.copied"));
              }}
            >
              {t("keys.copy")}
            </Bouton>
          </Bandeau>
        )}
        <p className="attenue petit">
          {rich("keys.header_help", {
            bearer: <code>Authorization: Bearer auto_…</code>,
            apikey: <code>x-api-key</code>,
            api: <code>/v1</code>,
          })}
        </p>
      </form>
      {cles.etat === "ok" && cles.donnees.length > 0 && (
        <table className="tableau">
          <caption>{t("keys.caption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("common.name")}</th>
              <th scope="col">{t("keys.col.created_by")}</th>
              <th scope="col">{t("keys.col.created_on")}</th>
              <th scope="col">{t("keys.col.last_used")}</th>
              <th scope="col">{t("team.col.expires")}</th>
              <th scope="col">
                <span className="visuellement-cache">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cles.donnees.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.nom ?? "—"} {c.debut && <code className="attenue">{c.debut}…</code>}
                </td>
                <td>{c.email ?? "—"}</td>
                <td>{jour(c.creeLe)}</td>
                <td>{jour(c.dernierUsage)}</td>
                <td>{jour(c.expireLe)}</td>
                <td>
                  <Bouton
                    variante="fantome"
                    icone={Trash2}
                    aria-label={t("keys.revoke", { name: c.nom ?? c.id })}
                    onClick={async () => {
                      try {
                        await api.revoquerJeton(c.id);
                        toast(t("keys.revoked"));
                        cles.recharger();
                      } catch (x) {
                        setErreur(x as ErreurApi);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
