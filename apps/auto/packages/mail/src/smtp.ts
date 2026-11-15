// SMTP client (RFC 5321): EHLO, STARTTLS, AUTH PLAIN or LOGIN, envelope, DATA with dot-stuffing.
import { ErreurMail, Flux, type Serveur } from "./flux";

export interface Identifiants {
  utilisateur: string;
  motDePasse: string;
}

export interface ConfigSmtp extends Serveur {
  identifiants?: Identifiants;
  /** Name announced in EHLO. */
  ehlo?: string;
}

interface Reponse {
  code: number;
  lignes: string[];
}

async function reponse(f: Flux): Promise<Reponse> {
  const lignes: string[] = [];
  for (;;) {
    const l = await f.ligne();
    if (!/^\d{3}[ -]?/.test(l)) throw new ErreurMail(`réponse SMTP invalide : ${l}`);
    lignes.push(l.slice(4));
    if (l[3] !== "-") return { code: Number(l.slice(0, 3)), lignes };
  }
}

async function attendre(f: Flux, attendu: number, quoi: string): Promise<Reponse> {
  const r = await reponse(f);
  if (Math.floor(r.code / 100) !== Math.floor(attendu / 100))
    throw new ErreurMail(`SMTP ${quoi} : ${r.code} ${r.lignes.join(" ")}`);
  return r;
}

async function commande(f: Flux, cmd: string, attendu: number, quoi = cmd.split(" ")[0]!) {
  if (/[\r\n]/.test(cmd)) throw new ErreurMail("commande SMTP : saut de ligne interdit");
  await f.ecrire(`${cmd}\r\n`);
  return attendre(f, attendu, quoi);
}

const b64 = (s: string) => new TextEncoder().encode(s).toBase64();

/** Dot-stuffing (RFC 5321 §4.5.2) and `CRLF.CRLF` termination. */
export function preparerData(o: Uint8Array): Uint8Array {
  const out: number[] = [];
  let debutLigne = true;
  for (let i = 0; i < o.length; i++) {
    const b = o[i]!;
    if (debutLigne && b === 0x2e) out.push(0x2e);
    out.push(b);
    debutLigne = b === 0x0a;
  }
  if (!debutLigne) out.push(0x0d, 0x0a);
  out.push(0x2e, 0x0d, 0x0a);
  return new Uint8Array(out);
}

/** Open, authenticated session: `fn` receives the stream, QUIT is sent at the end. */
async function session<T>(c: ConfigSmtp, fn: (f: Flux) => Promise<T>): Promise<T> {
  const f = await Flux.ouvrir(c);
  try {
    await attendre(f, 220, "accueil");
    const ehlo = `EHLO ${c.ehlo ?? "auto.localhost"}`;
    let caps = (await commande(f, ehlo, 250)).lignes;
    if (c.securite === "starttls") {
      if (!caps.some((l) => /^STARTTLS\b/i.test(l))) throw new ErreurMail("SMTP : STARTTLS non proposé par le serveur");
      await commande(f, "STARTTLS", 220);
      f.starttls();
      caps = (await commande(f, ehlo, 250)).lignes;
    }
    if (c.identifiants) {
      const auth =
        caps
          .find((l) => /^AUTH\b/i.test(l))
          ?.toUpperCase()
          .split(/\s+/) ?? [];
      const { utilisateur, motDePasse } = c.identifiants;
      if (auth.includes("PLAIN"))
        await commande(f, `AUTH PLAIN ${b64(`\0${utilisateur}\0${motDePasse}`)}`, 235, "AUTH");
      else if (auth.includes("LOGIN")) {
        await commande(f, "AUTH LOGIN", 334);
        await commande(f, b64(utilisateur), 334, "AUTH");
        await commande(f, b64(motDePasse), 235, "AUTH");
      } else throw new ErreurMail("SMTP : aucune authentification PLAIN ou LOGIN proposée");
    }
    const r = await fn(f);
    await commande(f, "QUIT", 221).catch(() => {});
    return r;
  } finally {
    f.fermer();
  }
}

/** Checks connection, TLS and authentication. */
export const testerSmtp = (c: ConfigSmtp) => session(c, async () => {});

/** Sends an already built message (RFC 5322 bytes) to its recipients. */
export function envoyerSmtp(c: ConfigSmtp, expediteur: string, destinataires: string[], message: Uint8Array) {
  return session(c, async (f) => {
    await commande(f, `MAIL FROM:<${expediteur}>`, 250, "MAIL FROM");
    for (const d of destinataires) await commande(f, `RCPT TO:<${d}>`, 250, "RCPT TO");
    await commande(f, "DATA", 354);
    await f.ecrire(preparerData(message));
    await attendre(f, 250, "DATA");
  });
}
