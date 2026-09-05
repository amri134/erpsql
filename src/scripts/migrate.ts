import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sql from "mssql";
import { closeDatabaseConnection, getDatabasePool } from "../database/sql-server.js";

const migrationsDirectory = resolve(process.cwd(), "database", "migrations");

async function migrate() {
  try {
    const connection = await getDatabasePool();
    await connection.request().batch(`
      IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        migration_name NVARCHAR(255) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
        applied_at DATETIME2(0) NOT NULL CONSTRAINT DF_schema_migrations_applied_at DEFAULT (SYSUTCDATETIME())
      );
    `);
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await connection.request().input("name", sql.NVarChar(255), file)
        .query<{ exists: number }>("SELECT 1 AS exists FROM dbo.schema_migrations WHERE migration_name = @name;");
      if (applied.recordset.length) continue;
      await connection.request().batch(await readFile(resolve(migrationsDirectory, file), "utf8"));
      await connection.request().input("name", sql.NVarChar(255), file)
        .query("INSERT INTO dbo.schema_migrations (migration_name) VALUES (@name);");
      console.log(`Migrasi berhasil: ${file}`);
    }
  } finally {
    await closeDatabaseConnection();
  }
}

migrate().catch((error: unknown) => {
  console.error("Migrasi gagal:", error);
  process.exitCode = 1;
});
