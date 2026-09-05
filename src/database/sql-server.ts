import sql from "mssql";
import { env } from "../config/env.js";

const config: sql.config = {
  user: env.database.user,
  password: env.database.password,
  database: env.database.database,
  server: env.database.server,
  port: env.database.port,
  options: {
    encrypt: env.database.encrypt,
    trustServerCertificate: env.database.trustServerCertificate
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | undefined;

export type DatabaseConnectionInput = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export async function getDatabasePool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    const newPool = await new sql.ConnectionPool(config).connect();
    pool = newPool;
  }

  return pool;
}

export async function executeSqlBatch(sqlText: string): Promise<void> {
  const connection = await getDatabasePool();
  await connection.request().batch(sqlText);
}

export async function checkDatabaseConnection() {
  const connection = await getDatabasePool();
  const result = await connection.request().query<{ databaseName: string; serverName: string }>(`
    SELECT
      DB_NAME() AS databaseName,
      @@SERVERNAME AS serverName;
  `);

  return result.recordset[0];
}

export async function testDatabaseConnection(input: DatabaseConnectionInput) {
  const temporaryPool = await new sql.ConnectionPool({
    user: input.user,
    password: input.password,
    database: input.database,
    server: input.server,
    port: input.port,
    connectionTimeout: 10000,
    options: {
      encrypt: input.encrypt,
      trustServerCertificate: input.trustServerCertificate
    }
  }).connect();

  try {
    const result = await temporaryPool.request().query<{ databaseName: string; serverName: string }>(`
      SELECT DB_NAME() AS databaseName, @@SERVERNAME AS serverName;
    `);

    return result.recordset[0];
  } finally {
    await temporaryPool.close();
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = undefined;
  }
}
