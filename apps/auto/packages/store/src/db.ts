import { SQL, type TransactionSQL } from "bun";

export type Sql = SQL;
export type Tx = TransactionSQL;

export const DEFAULT_URL = "postgres://auto:auto@localhost:5433/auto";

export function connect(url = Bun.env.DATABASE_URL ?? DEFAULT_URL): Sql {
  return new SQL(url);
}

/**
 * Migration connection: `DATABASE_URL_DIRECT` when the application goes through a pooler (Neon: PgBouncer
 * in transaction mode for the API and the worker, direct endpoint for DDL and pg_dump), otherwise `DATABASE_URL`.
 */
export function connectMigrations(): Sql {
  return new SQL(Bun.env.DATABASE_URL_DIRECT || Bun.env.DATABASE_URL || DEFAULT_URL, { max: 1 });
}

const MIGRATIONS = Bun.env.AUTO_MIGRATIONS_DIR
  ? Bun.pathToFileURL(`${Bun.env.AUTO_MIGRATIONS_DIR.replace(/[\\/]+$/, "")}/`)
  : new URL("../migrations/", import.meta.url);

/** Applies the `migrations/NNN_*.sql` migrations not yet applied, in order. */
export async function migrate(sql: Sql): Promise<string[]> {
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan(Bun.fileURLToPath(MIGRATIONS)))).sort();
  // The lock also covers the creation of schema_migration and guarantees ordering across instances.
  // It is released automatically at the end of the transaction, including on error.
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(1635087471, 1835624306)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Map(
      (await tx`SELECT name, checksum FROM schema_migration`).map((r: { name: string; checksum: string }) => [
        r.name,
        r.checksum,
      ]),
    );
    const applied: string[] = [];
    for (const name of files) {
      const text = await Bun.file(new URL(name, MIGRATIONS)).text();
      const checksum = new Bun.CryptoHasher("sha256").update(text).digest("hex");
      const prev = done.get(name);
      if (prev) {
        if (prev !== checksum) throw new Error(`migration ${name} modified after application`);
        continue;
      }
      await tx.unsafe(text);
      await tx`INSERT INTO schema_migration (name, checksum) VALUES (${name}, ${checksum})`;
      applied.push(name);
    }
    return applied;
  });
}

/**
 * Runs `fn` in a transaction isolated on a tenant: role `auto_app` (subject to RLS)
 * and `app.tenant` set locally. Without a tenant, RLS returns no rows.
 */
export function withTenant<T>(sql: Sql, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE auto_app`;
    await tx`SELECT set_config('app.tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}

/** Disposable database for tests: created, migrated, dropped by `drop()`. */
export async function testDb(url = Bun.env.DATABASE_URL ?? DEFAULT_URL) {
  const admin = new SQL(url, { max: 1, idleTimeout: 2, connectionTimeout: 10 });
  const name = `auto_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(url);
  u.pathname = `/${name}`;
  const sql = new SQL(u.toString(), { max: 4, idleTimeout: 5, connectionTimeout: 10 });
  try {
    await migrate(sql);
  } catch (erreur) {
    await sql.close();
    try {
      await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
    } finally {
      await admin.close();
    }
    throw erreur;
  }
  return {
    sql,
    async drop() {
      await sql.close();
      try {
        await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
      } finally {
        await admin.close();
      }
    },
  };
}
