// Line-by-line stream over `Bun.connect`: implicit TLS, STARTTLS (`upgradeTLS`), backpressure, timeouts.
import type { Socket, SocketHandler } from "bun";

export type Securite = "tls" | "starttls" | "aucune";

export interface Serveur {
  hote: string;
  port: number;
  securite: Securite;
  /** Dev and tests only: accepts a self-signed certificate. */
  certificatNonVerifie?: boolean;
  /** Inactivity timeout, in milliseconds. */
  delaiMs?: number;
}

export class ErreurMail extends Error {}

const CRLF = 0x0a;

export class Flux {
  private sock!: Socket<undefined>;
  private buf = new Uint8Array(64 * 1024);
  private debut = 0;
  private fin = 0;
  private ferme: Error | null = null;
  private reveil: (() => void) | null = null;
  private reste: Uint8Array | null = null;
  private vide: (() => void) | null = null;

  private constructor(private readonly serveur: Serveur) {}

  static async ouvrir(s: Serveur): Promise<Flux> {
    const f = new Flux(s);
    const tls = s.securite === "tls" ? f.optionsTls() : undefined;
    try {
      f.sock = await Bun.connect({ hostname: s.hote, port: s.port, tls, socket: f.gestionnaire() });
    } catch (e) {
      throw new ErreurMail(`connexion impossible à ${s.hote}:${s.port} : ${(e as Error).message}`);
    }
    f.sock.timeout(Math.ceil((s.delaiMs ?? 30_000) / 1000));
    return f;
  }

  private optionsTls() {
    return { serverName: this.serveur.hote, rejectUnauthorized: !this.serveur.certificatNonVerifie };
  }

  /**
   * Each handler belongs to a generation (connection, then STARTTLS): events from the
   * old raw socket are ignored after the switch, including before `sock` is assigned.
   */
  private generation = 0;

  private gestionnaire(): SocketHandler<undefined> {
    const g = ++this.generation;
    const actif = () => g === this.generation;
    return {
      data: (_s, d) => {
        if (actif()) this.recevoir(d);
      },
      drain: () => {
        if (actif()) this.continuer();
      },
      close: () => {
        if (actif()) this.arreter(new ErreurMail("connexion fermée par le serveur"));
      },
      error: (_s, e) => {
        if (actif()) this.arreter(new ErreurMail(`erreur réseau : ${e.message}`));
      },
      timeout: (s) => {
        if (!actif()) return;
        this.arreter(new ErreurMail("délai dépassé"));
        s.end();
      },
      connectError: (_s, e) => this.arreter(new ErreurMail(e.message)),
      // No `end()` in this callback: it crashes the runtime (1.4.6); the caller closes the stream.
      handshake: (_s, ok, err) => {
        if (actif() && !ok && !this.serveur.certificatNonVerifie)
          this.arreter(new ErreurMail(`certificat refusé : ${err?.message ?? "inconnu"}`));
      },
    };
  }

  private recevoir(d: Uint8Array) {
    if (this.fin + d.length > this.buf.length) {
      const utile = this.fin - this.debut;
      if (utile + d.length > this.buf.length) {
        const n = new Uint8Array(Math.max(this.buf.length * 2, utile + d.length));
        n.set(this.buf.subarray(this.debut, this.fin));
        this.buf = n;
      } else this.buf.copyWithin(0, this.debut, this.fin);
      this.debut = 0;
      this.fin = utile;
    }
    this.buf.set(d, this.fin);
    this.fin += d.length;
    this.reveiller();
  }

  private arreter(e: Error) {
    this.ferme ??= e;
    this.reveiller();
    this.vide?.();
  }

  private reveiller() {
    const r = this.reveil;
    this.reveil = null;
    r?.();
  }

  private attendre(): Promise<void> {
    if (this.ferme) throw this.ferme;
    return new Promise((r) => {
      const t = setTimeout(() => {
        this.arreter(new ErreurMail("délai dépassé"));
        this.sock.end();
      }, this.serveur.delaiMs ?? 30_000);
      this.reveil = () => {
        clearTimeout(t);
        r();
      };
    });
  }

  /** Next line, without CRLF. */
  async ligne(): Promise<string> {
    for (;;) {
      const i = this.buf.subarray(this.debut, this.fin).indexOf(CRLF);
      if (i >= 0) {
        let l = this.buf.subarray(this.debut, this.debut + i);
        this.debut += i + 1;
        if (l.at(-1) === 0x0d) l = l.subarray(0, -1);
        return new TextDecoder().decode(l);
      }
      await this.attendre();
    }
  }

  /** Exactly `n` bytes (IMAP literal). */
  async octets(n: number): Promise<Uint8Array> {
    while (this.fin - this.debut < n) await this.attendre();
    const r = this.buf.slice(this.debut, this.debut + n);
    this.debut += n;
    return r;
  }

  private continuer() {
    if (!this.reste) return;
    const n = this.sock.write(this.reste);
    this.reste = n < this.reste.length ? this.reste.subarray(Math.max(n, 0)) : null;
    if (!this.reste) {
      const v = this.vide;
      this.vide = null;
      v?.();
    }
  }

  async ecrire(d: string | Uint8Array): Promise<void> {
    if (this.ferme) throw this.ferme;
    const o = typeof d === "string" ? new TextEncoder().encode(d) : d;
    const n = this.sock.write(o);
    if (n >= o.length) return;
    this.reste = o.subarray(Math.max(n, 0));
    await new Promise<void>((r) => (this.vide = r));
    if (this.ferme) throw this.ferme;
  }

  /** STARTTLS: switches the stream to TLS after the server's positive reply. */
  starttls() {
    const [, tls] = this.sock.upgradeTLS<undefined>({ tls: this.optionsTls(), socket: this.gestionnaire() });
    this.sock = tls;
    this.debut = this.fin = 0;
  }

  fermer() {
    this.ferme ??= new ErreurMail("connexion fermée");
    this.sock.end();
  }
}
