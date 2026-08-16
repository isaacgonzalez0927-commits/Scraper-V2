import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseUrl } from "../lib/db";
import { DEMO_PASSWORD_HASH, verifyPassword } from "../lib/password";

test("Vercel uses /tmp for the local file database", () => {
  const previous = {
    VERCEL: process.env.VERCEL,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.VERCEL = "1";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(databaseUrl(), "file:/tmp/sere.db");
  } finally {
    if (previous.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.VERCEL;
    if (previous.TURSO_DATABASE_URL === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previous.TURSO_DATABASE_URL;
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
  }
});

test("demo password hash matches harborair", async () => {
  assert.equal(await verifyPassword(DEMO_PASSWORD_HASH, "harborair"), true);
  assert.equal(await verifyPassword(DEMO_PASSWORD_HASH, "wrong"), false);
});
