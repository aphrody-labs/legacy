import { connectMigrations, migrate } from "./db";

const sql = connectMigrations();
const applied = await migrate(sql);
console.log(applied.length ? `migrations applied: ${applied.join(", ")}` : "schema up to date");
await sql.close();
