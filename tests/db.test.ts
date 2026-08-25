import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  cleanEnv,
  configuredRemoteUrl,
  databaseAuthToken,
  databaseRefusalMessage,
  databaseUrl,
  EPHEMERAL_DB_MESSAGE,
  isDurableDatabase,
  TURSO_CONNECT_FAILED,
  TURSO_TOKEN_MISSING,
} from "../lib/db";
import { databaseHostInfo } from "../lib/db-env";
import { DEMO_PASSWORD_HASH, verifyPassword } from "../lib/password";

const KEYS = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_GIT_REPO_SLUG",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "TURSO_DATABASE_AUTH_TOKEN",
  "LIBSQL_URL",
  "LIBSQL_AUTH_TOKEN",
  "DATABASE_URL",
] as const;

function snapshotEnv() {
  const previous: Record<string, string | undefined> = {};
  for (const key of KEYS) previous[key] = process.env[key];
  return previous;
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

function clearDbEnv() {
  for (const key of KEYS) {
    if (key !== "VERCEL") delete process.env[key];
  }
}

test("Vercel uses /tmp for the local file database", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  try {
    assert.equal(databaseUrl(), "file:/tmp/sere.db");
  } finally {
    restoreEnv(previous);
  }
});

test("Vercel without Turso is not a durable database", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  try {
    assert.equal(isDurableDatabase(), false);
    assert.equal(databaseRefusalMessage(), EPHEMERAL_DB_MESSAGE);
  } finally {
    restoreEnv(previous);
  }
});

test("a Turso URL and token are durable even on Vercel", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  process.env.TURSO_DATABASE_URL = "libsql://sere.turso.io";
  process.env.TURSO_AUTH_TOKEN = "tok_test";
  try {
    assert.equal(isDurableDatabase(), true);
    assert.equal(databaseUrl(), "libsql://sere.turso.io");
    assert.equal(databaseRefusalMessage(), "");
    assert.equal(databaseRefusalMessage(true), TURSO_CONNECT_FAILED);
  } finally {
    restoreEnv(previous);
  }
});

test("quoted Turso values still count as configured", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  process.env.TURSO_DATABASE_URL = '"https://sere-isaac.turso.io/"';
  process.env.TURSO_AUTH_TOKEN = "'abc.def.ghi'";
  try {
    assert.equal(configuredRemoteUrl(), "https://sere-isaac.turso.io");
    assert.equal(databaseAuthToken(), "abc.def.ghi");
    assert.equal(isDurableDatabase(), true);
    assert.equal(databaseUrl(), "https://sere-isaac.turso.io");
  } finally {
    restoreEnv(previous);
  }
});

test("LIBSQL_URL and LIBSQL_AUTH_TOKEN are accepted aliases", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  process.env.LIBSQL_URL = "libsql://alias.turso.io";
  process.env.LIBSQL_AUTH_TOKEN = "alias-token";
  try {
    assert.equal(isDurableDatabase(), true);
    assert.equal(databaseUrl(), "libsql://alias.turso.io");
    assert.equal(databaseAuthToken(), "alias-token");
  } finally {
    restoreEnv(previous);
  }
});

test("a Turso URL without a token is not ready", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  process.env.TURSO_DATABASE_URL = "libsql://sere.turso.io";
  try {
    assert.equal(isDurableDatabase(), false);
    assert.equal(databaseRefusalMessage(), TURSO_TOKEN_MISSING);
    assert.equal(databaseRefusalMessage(true), TURSO_TOKEN_MISSING);
  } finally {
    restoreEnv(previous);
  }
});

test("Turso env names are read as process.env.NAME so Next.js inlines them", () => {
  const source = readFileSync(new URL("../lib/db-env.ts", import.meta.url), "utf8");
  assert.ok(source.includes("process.env.TURSO_DATABASE_URL"));
  assert.ok(source.includes("process.env.TURSO_AUTH_TOKEN"));
  assert.ok(source.includes("process.env.LIBSQL_URL"));
  assert.ok(source.includes("process.env.DATABASE_URL"));
  assert.ok(source.includes("globalThis"));
});

test("host info never includes the Turso URL or token", () => {
  const previous = snapshotEnv();
  process.env.VERCEL = "1";
  clearDbEnv();
  process.env.TURSO_DATABASE_URL = "libsql://secret-host.turso.io";
  process.env.TURSO_AUTH_TOKEN = "super-secret-token";
  process.env.VERCEL_GIT_REPO_SLUG = "Scraper-V2";
  process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";
  try {
    const info = databaseHostInfo();
    const blob = JSON.stringify(info);
    assert.equal(info.urlSet, true);
    assert.equal(info.tokenSet, true);
    assert.equal(info.gitRepo, "Scraper-V2");
    assert.equal(info.gitSha, "abcdef1");
    assert.equal(blob.includes("secret-host"), false);
    assert.equal(blob.includes("super-secret-token"), false);
  } finally {
    restoreEnv(previous);
  }
});

test("cleanEnv strips wrapping quotes and leaves the value", () => {
  assert.equal(cleanEnv('  "libsql://x.turso.io"  '), "libsql://x.turso.io");
  assert.equal(cleanEnv("'tok'"), "tok");
  assert.equal(cleanEnv(""), "");
  assert.equal(cleanEnv(undefined), "");
});

test("demo password hash matches harborair", async () => {
  assert.equal(await verifyPassword(DEMO_PASSWORD_HASH, "harborair"), true);
  assert.equal(await verifyPassword(DEMO_PASSWORD_HASH, "wrong"), false);
});
