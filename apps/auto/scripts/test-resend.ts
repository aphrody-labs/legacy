// A single qualification message; OVH reception checked without marking read or deleting.
import { envoyeurDepuisEnv } from "../packages/mail/src/envoyeur";
import { Imap } from "../packages/mail/src/imap";
import { analyser } from "../packages/mail/src/mime";

async function qualifier() {
  if (Bun.env.AUTO_MAIL_FOURNISSEUR !== "resend") throw new Error("Fournisseur Resend requis");
  const utilisateur = Bun.env.AUTO_IMAP_UTILISATEUR ?? Bun.env.AUTO_SMTP_UTILISATEUR;
  const motDePasse = Bun.env.AUTO_IMAP_MOT_DE_PASSE ?? Bun.env.AUTO_SMTP_MOT_DE_PASSE;
  if (!utilisateur || !motDePasse) throw new Error("Qualification inbox required");
  const boite = await Imap.ouvrir({
    hote: Bun.env.AUTO_IMAP_HOTE ?? "imap.mail.ovh.net",
    port: 993,
    securite: "tls",
    identifiants: { utilisateur, motDePasse },
  });
  const debut = Date.now();
  try {
    const etat = await boite.examiner();
    let dernierUid = (await boite.uidsApres(0)).at(-1) ?? 0;
    const marqueur = crypto.randomUUID();
    const contenu = new TextEncoder().encode(`Qualification Resend Aphrody : ${marqueur}\n`);
    const sujet = `Qualification Resend Aphrody ${marqueur}`;
    const envoi = await envoyeurDepuisEnv().envoyer({
      a: [utilisateur],
      sujet,
      texte: `Qualification message. Reference: ${marqueur}`,
      pieces: [{ nom: "resend-aphrody.txt", type: "text/plain", octets: contenu }],
    });
    while (Date.now() - debut < 60_000) {
      if ((await boite.examiner()).uidValidity !== etat.uidValidity) throw new Error("UIDVALIDITY changed");
      for (const uid of (await boite.uidsApres(dernierUid)).slice(0, 50)) {
        const brut = await boite.lire(uid);
        dernierUid = uid;
        if (!brut) continue;
        const message = analyser(brut);
        if (message.sujet !== sujet) continue;
        const piece = message.pieces.find((p) => p.nom === "resend-aphrody.txt");
        if (!message.texte.includes(marqueur) || !piece || !Bun.deepEquals(piece.octets, contenu))
          throw new Error("Content or attachment altered");
        console.log(
          JSON.stringify({
            ok: true,
            fournisseur: "resend",
            idFournisseur: envoi.idFournisseur,
            messageIdDemande: envoi.messageId,
            messageIdRecu: message.messageId,
            uid,
            pieceJointe: true,
            dureeMs: Date.now() - debut,
          }),
        );
        return;
      }
      await Bun.sleep(1000);
    }
    throw new Error("Sent accepted but reception not confirmed");
  } finally {
    await boite.fermer();
  }
}

if (import.meta.main) {
  try {
    await qualifier();
  } catch {
    console.error(
      "Resend qualification failed: configuration, sending or reception not validated. No secret printed.",
    );
    process.exitCode = 1;
  }
}
