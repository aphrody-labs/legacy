// Kysely dialect over `Bun.SQL` (Postgres): Better Auth talks to the application database through the same
// pool as the rest of auto, without the `pg` driver. Standalone queries go through the pool; a transaction
// reserves a connection (`sql.reserve()`) until COMMIT or ROLLBACK.
import type { SQL, ReservedSQL } from "bun";
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
} from "kysely";

const MODIFICATIONS = new Set(["INSERT", "UPDATE", "DELETE", "MERGE"]);

async function executer<R>(cible: SQL | ReservedSQL, q: CompiledQuery): Promise<QueryResult<R>> {
  const r = (await cible.unsafe(q.sql, q.parameters as unknown[])) as R[] & { count?: number; command?: string };
  const rows = [...r];
  return MODIFICATIONS.has(r.command ?? "") ? { rows, numAffectedRows: BigInt(r.count ?? 0) } : { rows };
}

/** Lazy connection: the pool while no transaction is open, a reserved connection afterwards. */
class ConnexionBun implements DatabaseConnection {
  reservee: ReservedSQL | null = null;

  constructor(private readonly sql: SQL) {}

  executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
    return executer<R>(this.reservee ?? this.sql, q);
  }

  async *streamQuery<R>(q: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    yield await this.executeQuery<R>(q);
  }

  async debuter(settings: TransactionSettings) {
    this.reservee = await this.sql.reserve();
    const options = [
      settings.isolationLevel && `ISOLATION LEVEL ${settings.isolationLevel.toUpperCase()}`,
      settings.accessMode?.toUpperCase(),
    ].filter(Boolean);
    await this.reservee.unsafe(`BEGIN${options.length ? ` ${options.join(", ")}` : ""}`);
  }

  async finir(ordre: "COMMIT" | "ROLLBACK") {
    const r = this.reservee;
    this.reservee = null;
    if (!r) return;
    try {
      await r.unsafe(ordre);
    } finally {
      r.release();
    }
  }
}

class PiloteBun implements Driver {
  constructor(private readonly sql: SQL) {}
  async init() {}
  async acquireConnection() {
    return new ConnexionBun(this.sql);
  }
  async beginTransaction(c: DatabaseConnection, settings: TransactionSettings) {
    await (c as ConnexionBun).debuter(settings);
  }
  async commitTransaction(c: DatabaseConnection) {
    await (c as ConnexionBun).finir("COMMIT");
  }
  async rollbackTransaction(c: DatabaseConnection) {
    await (c as ConnexionBun).finir("ROLLBACK");
  }
  async savepoint(c: DatabaseConnection, nom: string, compiler: QueryCompiler["compileQuery"]) {
    await c.executeQuery(CompiledQuery.raw(`SAVEPOINT ${nom}`));
    void compiler;
  }
  async rollbackToSavepoint(c: DatabaseConnection, nom: string) {
    await c.executeQuery(CompiledQuery.raw(`ROLLBACK TO SAVEPOINT ${nom}`));
  }
  async releaseSavepoint(c: DatabaseConnection, nom: string) {
    await c.executeQuery(CompiledQuery.raw(`RELEASE SAVEPOINT ${nom}`));
  }
  async releaseConnection(c: DatabaseConnection) {
    // Transaction abandoned without COMMIT or ROLLBACK: the reserved connection returns to the pool rolled back.
    await (c as ConnexionBun).finir("ROLLBACK");
  }
  async destroy() {}
}

/** `new Kysely({ dialect: new DialecteBunSql(sql) })`: the pool stays the caller's (never closed here). */
export class DialecteBunSql implements Dialect {
  constructor(private readonly sql: SQL) {}
  createAdapter() {
    return new PostgresAdapter();
  }
  createDriver(): Driver {
    return new PiloteBun(this.sql);
  }
  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }
  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}
