/**
 * Next.js replaces process.env.NAME at build time. If the Turso keys were
 * missing during that build, the compiled app keeps seeing empty strings
 * even after you add them in Vercel.
 *
 * Read the live Node process first (what Vercel injects into the function),
 * then fall back to the literal process.env.NAME so Next.js still inlines
 * the names. Do not loop keys for the fallback.
 */

import { cleanEnv } from "./db-clean";

function live(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return cleanEnv(env?.[name]);
}

export function envTursoDatabaseUrl(): string {
  return live("TURSO_DATABASE_URL") || cleanEnv(process.env.TURSO_DATABASE_URL);
}

export function envLibsqlUrl(): string {
  return live("LIBSQL_URL") || cleanEnv(process.env.LIBSQL_URL);
}

export function envDatabaseUrl(): string {
  return live("DATABASE_URL") || cleanEnv(process.env.DATABASE_URL);
}

export function envTursoAuthToken(): string {
  return live("TURSO_AUTH_TOKEN") || cleanEnv(process.env.TURSO_AUTH_TOKEN);
}

export function envTursoDatabaseAuthToken(): string {
  return live("TURSO_DATABASE_AUTH_TOKEN") || cleanEnv(process.env.TURSO_DATABASE_AUTH_TOKEN);
}

export function envLibsqlAuthToken(): string {
  return live("LIBSQL_AUTH_TOKEN") || cleanEnv(process.env.LIBSQL_AUTH_TOKEN);
}

export function envVercel(): boolean {
  return Boolean(live("VERCEL") || process.env.VERCEL);
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

/** Booleans and host labels only. Never the URL or token. */
export function databaseHostInfo(): {
  vercel: boolean;
  vercelEnv: string;
  gitRepo: string;
  gitSha: string;
  productionHost: string;
  urlSet: boolean;
  tokenSet: boolean;
} {
  return {
    vercel: envVercel(),
    vercelEnv: live("VERCEL_ENV") || cleanEnv(process.env.VERCEL_ENV),
    gitRepo: live("VERCEL_GIT_REPO_SLUG") || cleanEnv(process.env.VERCEL_GIT_REPO_SLUG),
    gitSha: (live("VERCEL_GIT_COMMIT_SHA") || cleanEnv(process.env.VERCEL_GIT_COMMIT_SHA)).slice(0, 7),
    productionHost:
      live("VERCEL_PROJECT_PRODUCTION_URL") ||
      cleanEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    urlSet: Boolean(configuredRemoteUrl()),
    tokenSet: Boolean(databaseAuthToken()),
  };
}
