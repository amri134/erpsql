import "dotenv/config";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variabel lingkungan ${name} wajib diisi.`);
  }

  return value;
}

function booleanValue(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function jwtSecret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (process.env.DYNO && (!value || value.length < 32)) throw new Error("JWT_SECRET minimal 32 karakter wajib diatur pada Heroku Config Vars.");
  return value || "local-development-secret-change-before-deploy";
}

const databasePort = Number(process.env.DB_PORT ?? "1433");
const appPort = Number(process.env.PORT ?? process.env.APP_PORT ?? "3000");

if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error("DB_PORT harus berupa nomor port yang valid.");
}

if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) {
  throw new Error("APP_PORT harus berupa nomor port yang valid.");
}

export const env = {
  appPort,
  jwtSecret: jwtSecret(),
  database: {
    server: required("SERVER"),
    port: databasePort,
    database: required("DATABASE"),
    user: required("DB_USERNAME"),
    password: required("PASSWORD"),
    encrypt: booleanValue(process.env.DB_ENCRYPT, true),
    trustServerCertificate: booleanValue(process.env.DB_TRUST_SERVER_CERTIFICATE, true)
  }
};

export type SavedDatabaseConnection = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export async function saveDatabaseConnection(connection: SavedDatabaseConnection): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  const entries: Record<string, string> = {
    SERVER: connection.server,
    DB_PORT: String(connection.port),
    DATABASE: connection.database,
    DB_USERNAME: connection.user,
    PASSWORD: connection.password,
    DB_ENCRYPT: String(connection.encrypt),
    DB_TRUST_SERVER_CERTIFICATE: String(connection.trustServerCertificate)
  };
  let contents = await readFile(envPath, "utf8");

  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
  }

  const temporaryPath = `${envPath}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, envPath);
  Object.assign(env.database, connection);
}
