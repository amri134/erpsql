import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function booleanValue(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function jwtSecret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (value && value.length < 32) throw new Error("JWT_SECRET minimal 32 karakter.");
  return value || randomBytes(48).toString("base64");
}

const databasePort = Number(process.env.DB_PORT ?? "1433");
const appPort = Number(process.env.PORT ?? process.env.APP_PORT ?? "3000");
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) throw new Error("DB_PORT harus berupa nomor port yang valid.");
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) throw new Error("APP_PORT harus berupa nomor port yang valid.");

export type SavedDatabaseConnection = {
  server: string; port: number; database: string; user: string; password: string;
  encrypt: boolean; trustServerCertificate: boolean;
};

// Heroku memakai wizard dan memori dyno; lokal tetap dapat memuat .env.
const useLocalEnvironmentDatabase = !process.env.DYNO;
export const env: { appPort: number; jwtSecret: string; database: SavedDatabaseConnection } = {
  appPort,
  jwtSecret: jwtSecret(),
  database: {
    server: useLocalEnvironmentDatabase ? process.env.SERVER?.trim() ?? "" : "",
    port: databasePort,
    database: useLocalEnvironmentDatabase ? process.env.DATABASE?.trim() ?? "" : "",
    user: useLocalEnvironmentDatabase ? process.env.DB_USERNAME?.trim() ?? "" : "",
    password: useLocalEnvironmentDatabase ? process.env.PASSWORD ?? "" : "",
    encrypt: booleanValue(process.env.DB_ENCRYPT, true),
    trustServerCertificate: booleanValue(process.env.DB_TRUST_SERVER_CERTIFICATE, true)
  }
};

export function hasConfiguredDatabase(): boolean {
  return Boolean(env.database.server && env.database.database && env.database.user && env.database.password);
}

export function setDatabaseConnection(connection: SavedDatabaseConnection): void { Object.assign(env.database, connection); }

export async function saveDatabaseConnection(connection: SavedDatabaseConnection): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  const entries: Record<string, string> = {
    SERVER: connection.server, DB_PORT: String(connection.port), DATABASE: connection.database,
    DB_USERNAME: connection.user, PASSWORD: connection.password, DB_ENCRYPT: String(connection.encrypt),
    DB_TRUST_SERVER_CERTIFICATE: String(connection.trustServerCertificate)
  };
  let contents = await readFile(envPath, "utf8").catch(() => "");
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
  }
  const temporaryPath = `${envPath}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, envPath);
}
