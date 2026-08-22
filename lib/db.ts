import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let cached: LibSQLDatabase<typeof schema> | null = null;
let raw: Client | null = null;

export function databaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Vercel’s app filesystem is read-only. /tmp is the only writable place.
  if (process.env.VERCEL) return "file:/tmp/sere.db";
  return "file:./data/sere.db";
}

function ensureLocalDir(url: string) {
  if (!url.startsWith("file:")) return;
  const filePath = url.replace(/^file:\/\//, "").replace(/^file:/, "");
  const dir = dirname(filePath);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
}

export function getClient(): Client {
  if (raw) return raw;
  const url = databaseUrl();
  ensureLocalDir(url);
  raw = createClient({
    url,
    ...(url.startsWith("file:") ? {} : { authToken: process.env.TURSO_AUTH_TOKEN }),
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
      business_type TEXT NOT NULL DEFAULT 'general',
      plan TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected',
      label TEXT NOT NULL DEFAULT '',
      secret_cipher TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, provider)
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
    CREATE TABLE IF NOT EXISTS nova_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nova_messages_org ON nova_messages (organization_id, id);
    CREATE TABLE IF NOT EXISTS nova_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      key TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nova_memory_org ON nova_memory (organization_id, updated_at);
    CREATE TABLE IF NOT EXISTS nexus_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      website TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      trade TEXT NOT NULL DEFAULT '',
      review_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'places',
      search_query TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'new',
      disqualified_reason TEXT NOT NULL DEFAULT '',
      research_status TEXT NOT NULL DEFAULT 'pending',
      research_error TEXT NOT NULL DEFAULT '',
      research_pages INTEGER NOT NULL DEFAULT 0,
      fact TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS nexus_companies_place ON nexus_companies (place_id);
    CREATE INDEX IF NOT EXISTS nexus_companies_stage ON nexus_companies (stage);
    CREATE TABLE IF NOT EXISTS nexus_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS nexus_contacts_email ON nexus_contacts (email);
    CREATE TABLE IF NOT EXISTS nexus_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      contact_id INTEGER,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT 'a',
      status TEXT NOT NULL DEFAULT 'pending_review',
      confidence INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      sent_at TEXT,
      provider_id TEXT NOT NULL DEFAULT '',
      opened_demo_at TEXT,
      replied_at TEXT,
      signed_up_at TEXT,
      bounced_at TEXT,
      complained_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nexus_drafts_status ON nexus_drafts (status);
    CREATE INDEX IF NOT EXISTS nexus_drafts_sent ON nexus_drafts (sent_at);
    CREATE TABLE IF NOT EXISTS nexus_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued',
      run_after TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 4,
      locked_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      dedupe_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nexus_jobs_ready ON nexus_jobs (status, run_after);
    CREATE TABLE IF NOT EXISTS nexus_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'nova',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nexus_actions_at ON nexus_actions (created_at);
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
      details TEXT NOT NULL DEFAULT '{}',
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
      details TEXT NOT NULL DEFAULT '{}',
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
  await addColumnIfMissing("organizations", "business_type", "TEXT NOT NULL DEFAULT 'general'");
  await addColumnIfMissing("organizations", "plan", "TEXT NOT NULL DEFAULT 'trial'");
  await addColumnIfMissing("organizations", "trial_ends_at", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("customers", "details", "TEXT NOT NULL DEFAULT '{}'");
  await addColumnIfMissing("jobs", "details", "TEXT NOT NULL DEFAULT '{}'");
  await addColumnIfMissing("customers", "stripe_customer_id", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("invoices", "stripe_invoice_id", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("invoices", "stripe_hosted_url", "TEXT NOT NULL DEFAULT ''");
  await getClient().execute(
    "CREATE INDEX IF NOT EXISTS customers_stripe ON customers (stripe_customer_id)",
  );
}

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  try {
    await getClient().execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists on a database created before this release.
  }
}
