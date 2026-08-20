/**
 * Outreach lives in its own database file.
 *
 * Prospect lists are operator data, not shop data. Keeping them out of the
 * tenant database means a shop's rows never sit next to a cold list, and the
 * whole module lifts into another product by pointing at a different file.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";

let cached: Client | null = null;

export function outreachDatabaseUrl(): string {
  return process.env.OUTREACH_DATABASE_URL || "file:./data/outreach.db";
}

export function outreachClient(): Client {
  if (cached) return cached;
  const url = outreachDatabaseUrl();
  if (url.startsWith("file:")) {
    const path = url.replace(/^file:\/\//, "").replace(/^file:/, "");
    const dir = dirname(path);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  }
  cached = createClient({
    url,
    ...(url.startsWith("file:") ? {} : { authToken: process.env.OUTREACH_AUTH_TOKEN }),
  });
  return cached;
}

/**
 * One row per prospect, one row per email we drafted. Outcomes hang off the
 * email row because the outcome is the only thing that teaches Nova anything.
 */
export async function ensureOutreachSchema(): Promise<void> {
  await outreachClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      trade TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      fact TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      unsubscribed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      product TEXT NOT NULL DEFAULT 'sere',
      variant TEXT NOT NULL DEFAULT 'a',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      approved_at TEXT,
      sent_at TEXT,
      provider_id TEXT NOT NULL DEFAULT '',
      opened_demo_at TEXT,
      replied_at TEXT,
      signed_up_at TEXT,
      bounced_at TEXT,
      complained_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS emails_prospect ON emails (prospect_id);
    CREATE INDEX IF NOT EXISTS emails_sent ON emails (sent_at);
  `);
}

export function nowISO(): string {
  return new Date().toISOString();
}
