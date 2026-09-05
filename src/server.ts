import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabaseConnection } from "./database/sql-server.js";

const server = app.listen(env.appPort, () => {
  console.log(`ERP backend berjalan pada http://localhost:${env.appPort}`);
});

async function shutdown(signal: string) {
  console.log(`Menerima ${signal}; menutup server.`);
  server.close(async () => {
    await closeDatabaseConnection();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
