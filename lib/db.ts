import { mkdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let cached: LibSQLDatabase<typeof schema> | null = null;
let raw: Client | null = null;

export function databaseUrl(): string {
  return (
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:./data/sere.db"
  );
}

export function getClient(): Client {
  if (raw) return raw;
  const url = databaseUrl();
  if (url.startsWith("file:")) {
    mkdirSync("./data", { recursive: true });
  }
  raw = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return raw;
}

export function db(): LibSQLDatabase<typeof schema> {
  if (cached) return cached;
  cached = drizzle(getClient(), { schema });
  return cached;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function token(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function ensureSchema(): Promise<void> {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address_line1 TEXT NOT NULL DEFAULT '',
      address_line2 TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      next_invoice_number INTEGER NOT NULL DEFAULT 1001,
      payment_terms_days INTEGER NOT NULL DEFAULT 14,
      default_invoice_notes TEXT NOT NULL DEFAULT '',
      default_tax_bps INTEGER NOT NULL DEFAULT 0,
      stripe_status TEXT NOT NULL DEFAULT 'not_connected',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, organization_id)
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      billing_line1 TEXT NOT NULL DEFAULT '',
      billing_city TEXT NOT NULL DEFAULT '',
      billing_state TEXT NOT NULL DEFAULT '',
      billing_postal TEXT NOT NULL DEFAULT '',
      service_line1 TEXT NOT NULL DEFAULT '',
      service_city TEXT NOT NULL DEFAULT '',
      service_state TEXT NOT NULL DEFAULT '',
      service_postal TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      customer_since TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      service_line1 TEXT NOT NULL DEFAULT '',
      service_city TEXT NOT NULL DEFAULT '',
      service_state TEXT NOT NULL DEFAULT '',
      service_postal TEXT NOT NULL DEFAULT '',
      scheduled_start TEXT,
      status TEXT NOT NULL DEFAULT 'unscheduled',
      technician_name TEXT NOT NULL DEFAULT '',
      estimated_revenue_cents INTEGER NOT NULL DEFAULT 0,
      actual_revenue_cents INTEGER NOT NULL DEFAULT 0,
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'miscellaneous',
      description TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      customer_id INTEGER,
      job_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS service_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      unit_price_cents INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      discount_cents INTEGER NOT NULL DEFAULT 0,
      tax_bps INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      public_token TEXT NOT NULL UNIQUE,
      sent_at TEXT,
      viewed_at TEXT,
      voided_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, number)
    );
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity TEXT NOT NULL DEFAULT '1',
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      amount_cents INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      invoice_id INTEGER,
      amount_cents INTEGER NOT NULL,
      paid_on TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'card',
      reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      voided_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      amount_cents INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      amount_cents INTEGER,
      link TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
}
