import sql from "mssql";
import { env, hasConfiguredDatabase, setDatabaseConnection } from "../config/env.js";

let pool: sql.ConnectionPool | undefined;
export type DatabaseConnectionInput = SavedConnection;
type SavedConnection = { server: string; port: number; database: string; user: string; password: string; encrypt: boolean; trustServerCertificate: boolean };

function sqlConfig(input: SavedConnection): sql.config {
  return { user: input.user, password: input.password, database: input.database, server: input.server, port: input.port,
    connectionTimeout: 10000, options: { encrypt: input.encrypt, trustServerCertificate: input.trustServerCertificate },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 } };
}

export async function getDatabasePool(): Promise<sql.ConnectionPool> {
  if (!hasConfiguredDatabase()) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool) pool = await new sql.ConnectionPool(sqlConfig(env.database)).connect();
  return pool;
}

export async function activateDatabaseConnection(input: DatabaseConnectionInput) {
  const candidate = await new sql.ConnectionPool(sqlConfig(input)).connect();
  try {
    const result = await candidate.request().query<{ databaseName: string; serverName: string }>("SELECT DB_NAME() AS databaseName, @@SERVERNAME AS serverName;");
    await closeDatabaseConnection();
    setDatabaseConnection(input);
    pool = candidate;
    return { pool: candidate, ...result.recordset[0] };
  } catch (error) {
    await candidate.close().catch(() => undefined);
    throw error;
  }
}

export async function executeSqlBatch(sqlText: string): Promise<void> { await (await getDatabasePool()).request().batch(sqlText); }
export async function checkDatabaseConnection() {
  const result = await (await getDatabasePool()).request().query<{ databaseName: string; serverName: string }>("SELECT DB_NAME() AS databaseName, @@SERVERNAME AS serverName;");
  return result.recordset[0];
}
export async function closeDatabaseConnection(): Promise<void> {
  if (pool) { const current = pool; pool = undefined; await current.close(); }
}
