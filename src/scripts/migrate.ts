import { hasConfiguredDatabase } from "../config/env.js";
import { runMigrations } from "../database/migrations.js";
import { closeDatabaseConnection, getDatabasePool } from "../database/sql-server.js";

async function migrate() {
  if (!hasConfiguredDatabase()) { console.log("Migrasi release dilewati: koneksi akan diatur melalui wizard ERPJIN."); return; }
  try {
    const applied = await runMigrations(await getDatabasePool());
    for (const file of applied) console.log(`Migrasi berhasil: ${file}`);
  } finally { await closeDatabaseConnection(); }
}
migrate().catch((error: unknown) => { console.error("Migrasi gagal:", error); process.exitCode = 1; });
