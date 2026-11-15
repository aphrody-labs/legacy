// Restore of an encrypted backup (scripts/sauvegarde.ts) into an existing, empty database:
//
//   bun scripts/restauration.ts <fichier.dump.chiffre> <base-cible> [base-d-origine]
//
// The original database (deduced from the file name) sets the decryption key. Restoring into a new
// database, then switching over, avoids overwriting production on failure.
import { dechiffrer } from "../packages/tenancy/src/chiffrement";
import { ENTETE, envLibpq, executer, infoCle, local } from "./sauvegarde";

export interface OptionsRestauration {
  fichier: string;
  base: string;
  /** Backed-up database (decryption key); by default, prefix of the file name. */
  origine?: string;
  conteneur?: string;
  utilisateur?: string;
  cle?: Uint8Array<ArrayBuffer>;
}

export async function restaurer(o: OptionsRestauration) {
  const octets = await Bun.file(o.fichier).bytes();
  if (!ENTETE.every((b, i) => octets[i] === b)) throw new Error("restauration : fichier de sauvegarde inconnu");
  const origine = o.origine ?? (o.fichier.split(/[\\/]/).pop() ?? "").replace(/-\d{4}-\d\d-\d\dT.*$/, "");
  const dump = await dechiffrer(infoCle(origine), octets.subarray(ENTETE.length), o.cle);
  // AUTO_PG_LOCAL=1: local pg_restore to DATABASE_URL_DIRECT, database `o.base`, without docker.
  if (local() && Bun.env.DATABASE_URL_DIRECT) {
    const libpq = { ...envLibpq(Bun.env.DATABASE_URL_DIRECT), PGDATABASE: o.base };
    await executer(["pg_restore", "-d", o.base, "--no-owner", "--exit-on-error"], dump, libpq);
    return;
  }
  await executer(
    [
      "docker",
      "exec",
      "-i",
      o.conteneur ?? Bun.env.AUTO_PG_CONTENEUR ?? "auto-pg",
      "pg_restore",
      "-U",
      o.utilisateur ?? Bun.env.AUTO_PG_UTILISATEUR ?? "auto",
      "-d",
      o.base,
      "--no-owner",
      "--exit-on-error",
    ],
    dump,
  );
}

if (import.meta.main) {
  const [fichier, base, origine] = Bun.argv.slice(2);
  if (!fichier || !base) throw new Error("usage : bun scripts/restauration.ts <fichier> <base-cible> [origine]");
  await restaurer({ fichier, base, origine });
  console.log(`restored into ${base}`);
}
