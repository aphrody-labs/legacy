// Mails of the accounts layer (invitation, magic link, password reset, address verification).
// Sending is injected: by default messages are logged; the API plugs in real SMTP sending.

/** Operator contact address, default sender. */
export const EXPEDITEUR = "contact@aphrody.com";

export type ModeleMail = "invitation" | "lien-magique" | "reinitialisation" | "verification" | "code";

export interface MessageMail {
  /** Sender: `AUTO_MAIL_EXPEDITEUR`, defaulting to the operator contact address. */
  de: string;
  a: string;
  sujet: string;
  texte: string;
  /** Template and variables, for a sender that formats the message. */
  modele: ModeleMail;
  donnees: Record<string, string>;
}

export type EnvoyeurMail = (m: MessageMail) => Promise<void>;

/** Default sender (dev): logs the subject without link or token, sends nothing. */
export const envoyeurJournal: EnvoyeurMail = async (m) => {
  if (Bun.env.NODE_ENV === "production") throw new Error("Authentication mail sender not configured");
  console.info(`[mail not sent] to ${m.a}: ${m.sujet}`);
};

let courant: EnvoyeurMail = envoyeurJournal;

/** Plugs in real sending (operator SMTP); tests plug in an in-memory mailbox. */
export function brancherEnvoyeur(e: EnvoyeurMail) {
  courant = e;
}

export function envoyerMail(m: Omit<MessageMail, "de">) {
  return courant({ de: Bun.env.AUTO_MAIL_EXPEDITEUR ?? EXPEDITEUR, ...m });
}
