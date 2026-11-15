// Idempotent migration of the old two-factor authentication to Better Auth (also run at API startup).
// Usage, at the repository root, with DATABASE_URL and AUTO_CLE_MAITRE: bun scripts/migrer-auth.ts
import { connect, migrate } from "../packages/store/src/db";
import { authDe, migrerDeuxFacteurs, synchroniserOperateurs } from "../packages/tenancy/src/index";

const sql = connect();
await migrate(sql);
console.log(`2FA reprise : ${await migrerDeuxFacteurs(sql, authDe(sql))} compte(s)`);
await synchroniserOperateurs(sql);
await sql.close();
