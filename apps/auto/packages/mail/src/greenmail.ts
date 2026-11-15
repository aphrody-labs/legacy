// Dev GreenMail server (compose.yaml, greenmail service) for integration tests.
import { Flux } from "./flux";
import type { ConfigImap } from "./imap";
import type { ConfigSmtp } from "./smtp";

export const GREENMAIL_HOTE = Bun.env.GREENMAIL_HOTE ?? "127.0.0.1";

/** Docker Desktop's port proxy accepts the connection even with the container stopped: wait for the greeting. */
async function joignable(port: number, accueil: string): Promise<boolean> {
  try {
    const f = await Flux.ouvrir({ hote: GREENMAIL_HOTE, port, securite: "aucune", delaiMs: 1500 });
    const l = await f.ligne().catch(() => "");
    f.fermer();
    return l.startsWith(accueil);
  } catch {
    return false;
  }
}

/** True if GreenMail answers (otherwise integration tests are skipped). */
export const greenmailDisponible = (await joignable(3025, "220")) && (await joignable(3143, "* OK"));

/** Disposable mailbox: GreenMail (auth disabled) creates it on first connection. */
export function boiteJetable(prefixe = "boite", tls = false) {
  const adresse = `${prefixe}-${crypto.randomUUID().slice(0, 8)}@exemple.test`;
  const identifiants = { utilisateur: adresse, motDePasse: "mot de passe" };
  const smtp: ConfigSmtp = tls
    ? { hote: GREENMAIL_HOTE, port: 3465, securite: "tls", certificatNonVerifie: true, identifiants }
    : { hote: GREENMAIL_HOTE, port: 3025, securite: "aucune", identifiants };
  const imap: ConfigImap = tls
    ? { hote: GREENMAIL_HOTE, port: 3993, securite: "tls", certificatNonVerifie: true, identifiants }
    : { hote: GREENMAIL_HOTE, port: 3143, securite: "aucune", identifiants };
  return { adresse, identifiants, smtp, imap };
}
