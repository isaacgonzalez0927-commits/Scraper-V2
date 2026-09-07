import type { Client } from "@libsql/client";

/** Additive migration: existing shops, invoices and integrations keep their identity. */
export async function migrateOperations(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS crew_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL,
      name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#7259e8',
      hourly_cost_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS crew_org ON crew_members(organization_id, active);
    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL,
      name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '', service TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'office', priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'new', preferred_date TEXT NOT NULL DEFAULT '',
      customer_id INTEGER, job_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submission_key TEXT NOT NULL, UNIQUE(organization_id, submission_key)
    );
    CREATE INDEX IF NOT EXISTS requests_org ON service_requests(organization_id, status, created_at);
    CREATE TABLE IF NOT EXISTS service_agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, customer_id INTEGER NOT NULL,
      name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', amount_cents INTEGER NOT NULL DEFAULT 0,
      billing_months INTEGER NOT NULL DEFAULT 1, visit_months INTEGER NOT NULL DEFAULT 6,
      next_visit TEXT NOT NULL, renews_on TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS agreements_org ON service_agreements(organization_id, status, next_visit);
    CREATE TABLE IF NOT EXISTS agreement_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, agreement_id INTEGER NOT NULL,
      occurrence TEXT NOT NULL, job_id INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(organization_id, agreement_id, occurrence)
    );
    CREATE TABLE IF NOT EXISTS equipment_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, customer_id INTEGER NOT NULL,
      property_id INTEGER, name TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', serial TEXT NOT NULL DEFAULT '',
      installed_on TEXT NOT NULL DEFAULT '', warranty_until TEXT NOT NULL DEFAULT '',
      next_service TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS equipment_org ON equipment_assets(organization_id, customer_id);
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL,
      name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT 'Shop',
      supplier TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0,
      reorder_at INTEGER NOT NULL DEFAULT 2, unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS inventory_org ON inventory_items(organization_id);
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
      job_id INTEGER, delta INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      mutation_id TEXT NOT NULL, UNIQUE(organization_id, mutation_id)
    );
    CREATE TABLE IF NOT EXISTS field_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, job_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'note', body TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, captured_at TEXT NOT NULL,
      mutation_id TEXT NOT NULL, UNIQUE(organization_id, mutation_id)
    );
    CREATE INDEX IF NOT EXISTS field_entries_job ON field_entries(organization_id, job_id, created_at);
    CREATE TABLE IF NOT EXISTS job_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, job_id INTEGER NOT NULL,
      label TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS checklist_job ON job_checklist(organization_id, job_id);
    CREATE TABLE IF NOT EXISTS operations_settings (
      organization_id INTEGER PRIMARY KEY, booking_enabled INTEGER NOT NULL DEFAULT 0,
      booking_intro TEXT NOT NULL DEFAULT 'Tell us what you need and we will get back to you.',
      service_area TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'America/New_York'
    );
    CREATE TABLE IF NOT EXISTS automation_rules (
      organization_id INTEGER NOT NULL, kind TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
      delay_days INTEGER NOT NULL DEFAULT 3, PRIMARY KEY(organization_id, kind)
    );
    CREATE TABLE IF NOT EXISTS outbox_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL, entity_id INTEGER NOT NULL, kind TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      recipient TEXT NOT NULL, provider_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, sent_at TEXT, locked_at TEXT, dedupe_key TEXT NOT NULL,
      UNIQUE(organization_id, dedupe_key)
    );
    CREATE INDEX IF NOT EXISTS outbox_org ON outbox_messages(organization_id, status);
    CREATE TABLE IF NOT EXISTS operation_seed_markers (
      organization_id INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, name)
    );
    CREATE TABLE IF NOT EXISTS job_closeouts (
      organization_id INTEGER NOT NULL, mutation_id TEXT NOT NULL,
      job_id INTEGER NOT NULL, fingerprint TEXT NOT NULL, invoice_id INTEGER,
      created_at TEXT NOT NULL, PRIMARY KEY(organization_id, mutation_id)
    );
  `);
  const columns = new Set((await client.execute('PRAGMA table_info(jobs)')).rows.map(r => String(r.name)));
  for (const [name, definition] of [
    ['duration_minutes', 'INTEGER NOT NULL DEFAULT 60'],
    ['team_member_id', 'INTEGER'],
    ['priority', "TEXT NOT NULL DEFAULT 'normal'"],
    ['schedule_version', 'INTEGER NOT NULL DEFAULT 0'],
    ['no_charge', 'INTEGER NOT NULL DEFAULT 0'],
    ['completion_summary', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!columns.has(name)) {
      try { await client.execute(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`); }
      catch (error) {
        // Concurrent cold starts may have applied this exact column already.
        const actual = await client.execute('PRAGMA table_info(jobs)');
        if (!actual.rows.some(r => r.name === name)) throw error;
      }
    }
  }
  await client.execute('CREATE INDEX IF NOT EXISTS jobs_dispatch ON jobs(organization_id, team_member_id, scheduled_start)');
  const requestColumns = await client.execute('PRAGMA table_info(service_requests)');
  if (!requestColumns.rows.some(row => row.name === 'estimate_id')) {
    try { await client.execute('ALTER TABLE service_requests ADD COLUMN estimate_id INTEGER'); }
    catch (error) { if (!(await client.execute('PRAGMA table_info(service_requests)')).rows.some(row => row.name === 'estimate_id')) throw error; }
  }
}
