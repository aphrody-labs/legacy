// Transactional sending of the SaaS (invitations, alerts) through the operator's SMTP relay.
import type { Securite } from "./flux";
import { adresseDe, construire, type Adresse, type Message } from "./mime";
import { envoyerSmtp, type ConfigSmtp } from "./smtp";
import { envoyeurResend } from "./resend";

/** Transactional message: the default sender is the sender's own. */
export type MessageTransactionnel = Omit<Message, "de"> & { de?: Adresse };

/** Interface shared by the batches: `await envoyeur.envoyer({ a: [...], sujet, texte, html })`. */
export interface EnvoyeurMail {
  envoyer(m: MessageTransactionnel): Promise<{ messageId: string; idFournisseur?: string }>;
}

/** SMTP sender: builds the MIME message and hands it to the server. */
export function envoyeurSmtp(c: ConfigSmtp, expediteur: Adresse): EnvoyeurMail {
  adresseDe(expediteur);
  return {
    async envoyer(m) {
      const x = construire({ ...m, de: m.de ?? expediteur });
      await envoyerSmtp(c, x.expediteur, x.destinataires, x.octets);
      return { messageId: x.messageId };
    },
  };
}

/** Sender for tests: keeps the built messages in memory. */
export function envoyeurMemoire(expediteur: Adresse = "no-reply@auto.localhost") {
  const envoyes: (Message & { messageId: string; octets: Uint8Array })[] = [];
  const e: EnvoyeurMail & { envoyes: typeof envoyes } = {
    envoyes,
    async envoyer(m) {
      const complet = { ...m, de: m.de ?? expediteur };
      const x = construire(complet);
      envoyes.push({ ...complet, messageId: x.messageId, octets: x.octets });
      return { messageId: x.messageId };
    },
  };
  return e;
}

/** Reads `Name <address>` or `address`. */
export function lireAdresse(s: string): Adresse {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s);
  return m ? { nom: m[1]!.replace(/^"|"$/g, "") || undefined, adresse: m[2]! } : s.trim();
}

export const EXPEDITEUR_DEFAUT = "Auto <contact@aphrody.com>";

/**
 * Operator relay from the environment (credentials never in the repository):
 * `AUTO_SMTP_HOTE` (`ssl0.ovh.net`), `AUTO_SMTP_PORT` (465 with `tls`, 587 otherwise),
 * `AUTO_SMTP_SECURITE` (`tls` by default, `starttls`, `aucune`), `AUTO_SMTP_UTILISATEUR` (defaults to
 * the sending address), `AUTO_SMTP_MOT_DE_PASSE`, `AUTO_SMTP_EXPEDITEUR` (`Auto <contact@aphrody.com>`).
 * Preset for the operator's OVHcloud MX Plan mailbox. `smtp: null` without a password or explicit host
 * (an explicit host without a password is a local relay without authentication).
 */
export function configRelais(env: Record<string, string | undefined> = Bun.env) {
  const expediteur = lireAdresse(env.AUTO_SMTP_EXPEDITEUR ?? EXPEDITEUR_DEFAUT);
  adresseDe(expediteur);
  const motDePasse = env.AUTO_SMTP_MOT_DE_PASSE;
  if (!motDePasse && !env.AUTO_SMTP_HOTE) return { expediteur, smtp: null };
  const securite = (env.AUTO_SMTP_SECURITE ?? "tls") as Securite;
  if (!["tls", "starttls", "aucune"].includes(securite)) throw new Error(`AUTO_SMTP_SECURITE invalide : ${securite}`);
  const port = Number(env.AUTO_SMTP_PORT ?? (securite === "tls" ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AUTO_SMTP_PORT invalide");
  if (env.NODE_ENV === "production" && securite === "aucune") throw new Error("SMTP: TLS required in production");
  const smtp: ConfigSmtp = {
    hote: env.AUTO_SMTP_HOTE ?? "ssl0.ovh.net",
    port,
    securite,
    identifiants: motDePasse
      ? { utilisateur: env.AUTO_SMTP_UTILISATEUR ?? adresseDe(expediteur), motDePasse }
      : undefined,
  };
  return { expediteur, smtp };
}

/** Transactional sender of the SaaS; without a relay: console log outside production, error in production. */
export function envoyeurDepuisEnv(env: Record<string, string | undefined> = Bun.env): EnvoyeurMail {
  const fournisseur = env.AUTO_MAIL_FOURNISSEUR ?? "smtp";
  if (fournisseur === "resend") {
    return envoyeurResend({
      cle: env.AUTO_RESEND_CLE_API ?? "",
      expediteur: lireAdresse(env.AUTO_RESEND_EXPEDITEUR ?? "Auto <auto@notifications.aphrody.com>"),
      repondreA: lireAdresse(env.AUTO_RESEND_REPONDRE_A ?? "auto@aphrody.com"),
    });
  }
  if (fournisseur !== "smtp") throw new Error("AUTO_MAIL_FOURNISSEUR invalide");
  const { expediteur, smtp } = configRelais(env);
  if (smtp) return envoyeurSmtp(smtp, expediteur);
  if (env.NODE_ENV === "production") throw new Error("AUTO_SMTP_MOT_DE_PASSE (or AUTO_SMTP_HOTE) required in production");
  return {
    async envoyer(m) {
      const x = construire({ ...m, de: m.de ?? expediteur });
      console.info(`mail not sent (no relay) → ${x.destinataires.join(", ")} : ${m.sujet}`);
      return { messageId: x.messageId };
    },
  };
}
