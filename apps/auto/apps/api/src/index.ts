import { refus } from "./i18n";
import { envoyeurDepuisEnv } from "@auto/mail";
import { connect, connectMigrations, migrate } from "@auto/store";
import { authDe, brancherEnvoyeur, migrerDeuxFacteurs, synchroniserOperateurs } from "@auto/tenancy";
import { creerApp } from "./app";
import { instrumenter } from "./observabilite";

const sql = connect();
const sqlMigrations = connectMigrations();
await migrate(sqlMigrations);
await sqlMigrations.close();

// Better Auth mails (invitations, magic links, resets) through the operator's SMTP relay.
const smtp = envoyeurDepuisEnv();
brancherEnvoyeur(async (m) => {
  await smtp.envoyer({ a: [m.a], sujet: m.sujet, texte: m.texte });
});

const routes = instrumenter(creerApp(sql));
// Idempotent import of the former 2FA and global operator role (admin plugin).
const repris = await migrerDeuxFacteurs(sql, authDe(sql));
if (repris) console.log(`2FA imported for ${repris} account(s)`);
await synchroniserOperateurs(sql);

const server = Bun.serve({
  idleTimeout: 120,
  port: Number(Bun.env.PORT ?? 3000),
  hostname: Bun.env.AUTO_BIND_HOST ?? "0.0.0.0",
  // Events written to the outbox; delivered by the worker (bun run worker).
  routes,
  fetch: (req) => refus(req, "route_not_found", 404),
});

console.log(`auto api : ${server.url}`);

let arret = false;
async function arreter() {
  if (arret) return;
  arret = true;
  // Let requests finish; bound long connections before Docker's 60 second limit.
  const limite = setTimeout(() => {
    void server.stop(true);
  }, 25_000);
  limite.unref();
  await server.stop();
  clearTimeout(limite);
  await sql.close();
  process.exit(0);
}
process.on("SIGINT", arreter);
process.on("SIGTERM", arreter);
