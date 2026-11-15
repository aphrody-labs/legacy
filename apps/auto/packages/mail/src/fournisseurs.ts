// Presets of common providers for the mailbox connection screen (values in docs/MAIL.md); notes come from the catalogs.
import { SOURCE_LOCALE } from "@auto/i18n";
import type { Securite } from "./flux";
import { traducteur } from "./i18n";

export interface Prereglage {
  id: string;
  nom: string;
  imap: { hote: string; port: number; securite: Securite };
  smtp: { hote: string; port: number; securite: Securite };
  /** Hint shown next to the form (language of the request). */
  note: string;
  doc: string;
}

const BASE: Omit<Prereglage, "note">[] = [
  {
    id: "ovh-zimbra",
    nom: "OVHcloud Zimbra Starter",
    imap: { hote: "imap.mail.ovh.net", port: 993, securite: "tls" },
    smtp: { hote: "smtp.mail.ovh.net", port: 465, securite: "tls" },
    doc: "https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/zimbra/mail-apps",
  },
  {
    id: "ovh-mxplan",
    nom: "OVHcloud MX Plan",
    imap: { hote: "ssl0.ovh.net", port: 993, securite: "tls" },
    smtp: { hote: "ssl0.ovh.net", port: 465, securite: "tls" },
    doc: "https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/mx-plan/email-generalities",
  },
  {
    id: "ovh-emailpro",
    nom: "OVHcloud E-mail Pro",
    imap: { hote: "pro1.mail.ovh.net", port: 993, securite: "tls" },
    smtp: { hote: "pro1.mail.ovh.net", port: 587, securite: "starttls" },
    doc: "https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/email-pro/outlook-windows-configuration",
  },
  {
    id: "ovh-exchange",
    nom: "OVHcloud Hosted Exchange",
    imap: { hote: "ex5.mail.ovh.net", port: 993, securite: "tls" },
    smtp: { hote: "ex5.mail.ovh.net", port: 587, securite: "starttls" },
    doc: "https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/microsoft-exchange",
  },
  {
    id: "google",
    nom: "Gmail / Google Workspace",
    imap: { hote: "imap.gmail.com", port: 993, securite: "tls" },
    smtp: { hote: "smtp.gmail.com", port: 465, securite: "tls" },
    doc: "https://support.google.com/mail/answer/185833",
  },
  {
    id: "microsoft",
    nom: "Outlook.com / Microsoft 365",
    imap: { hote: "outlook.office365.com", port: 993, securite: "tls" },
    smtp: { hote: "smtp.office365.com", port: 587, securite: "starttls" },
    doc: "https://support.microsoft.com/fr-fr/office/paramètres-pop-imap-et-smtp-pour-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040",
  },
  {
    id: "ionos",
    nom: "IONOS",
    imap: { hote: "imap.ionos.fr", port: 993, securite: "tls" },
    smtp: { hote: "smtp.ionos.fr", port: 465, securite: "tls" },
    doc: "https://www.ionos.fr/assistance/email/configurer-une-adresse-email-ionos-dans-un-programme-de-messagerie/",
  },
  {
    id: "orange",
    nom: "Orange",
    imap: { hote: "imap.orange.fr", port: 993, securite: "tls" },
    smtp: { hote: "smtp.orange.fr", port: 465, securite: "tls" },
    doc: "https://assistance.orange.fr/ordinateurs-peripheriques/installer-et-utiliser/l-utilisation-du-mail-et-du-cloud/mail-orange/parametrer-la-boite-mail/",
  },
];

/** Presets with the hint in the language of the request (language tag or Accept-Language value). */
export const fournisseursPour = (locale?: string | null): Prereglage[] => {
  const { t } = traducteur(locale);
  return BASE.map((p) => ({ ...p, note: t(`provider.${p.id}.note`) }));
};

/** Presets with hints in the source locale. */
export const FOURNISSEURS: Prereglage[] = fournisseursPour(SOURCE_LOCALE);

export const prereglage = (id: string) => FOURNISSEURS.find((f) => f.id === id);
