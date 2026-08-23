/**
 * Next.js only inlines env vars that appear as process.env.NAME.
 * A dynamic lookup is empty on Vercel even when the var is set.
 * Keep every name as a literal here. Do not loop keys.
 */

import { cleanEnv } from "./db-clean";

export function envTursoDatabaseUrl(): string {
  return cleanEnv(process.env.TURSO_DATABASE_URL);
}

export function envLibsqlUrl(): string {
  return cleanEnv(process.env.LIBSQL_URL);
}

export function envDatabaseUrl(): string {
  return cleanEnv(process.env.DATABASE_URL);
}

export function envTursoAuthToken(): string {
  return cleanEnv(process.env.TURSO_AUTH_TOKEN);
}

export function envTursoDatabaseAuthToken(): string {
  return cleanEnv(process.env.TURSO_DATABASE_AUTH_TOKEN);
}

export function envLibsqlAuthToken(): string {
  return cleanEnv(process.env.LIBSQL_AUTH_TOKEN);
}

export function envVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

export function configuredRemoteUrl(): string {
  for (const value of [envTursoDatabaseUrl(), envLibsqlUrl(), envDatabaseUrl()]) {
    if (value && !value.startsWith("file:")) return value.replace(/\/+$/, "");
  }
  return "";
}

export function databaseAuthToken(): string {
  return envTursoAuthToken() || envTursoDatabaseAuthToken() || envLibsqlAuthToken();
}
