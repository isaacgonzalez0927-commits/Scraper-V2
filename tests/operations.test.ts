import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import { migrateOperations } from '../lib/operations-migrations';
import { advanceMonths, localStart, overlaps, validDate } from '../lib/operations-validation';

test('operations migration is additive and safe to run more than once', async () => {
  const client=createClient({url:':memory:'});
  await client.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, scheduled_start TEXT, technician_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'unscheduled')");
  await migrateOperations(client);
  await migrateOperations(client);
  const columns=(await client.execute('PRAGMA table_info(jobs)')).rows.map(row=>String(row.name));
  assert.deepEqual(['duration_minutes','team_member_id','priority','schedule_version'].filter(name=>columns.includes(name)),['duration_minutes','team_member_id','priority','schedule_version']);
  const tables=(await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(row=>String(row.name));
  for (const name of ['crew_members','service_requests','service_agreements','equipment_assets','inventory_items','field_entries','job_checklist','outbox_messages']) assert.ok(tables.includes(name),name);
  client.close();
});

test('request idempotency keys are isolated per business', async () => {
  const client=createClient({url:':memory:'});
  await client.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, scheduled_start TEXT, technician_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'unscheduled')");
  await migrateOperations(client);
  const args=[1,'Pat','','555','','Repair','','office','normal','new','',null,null,'2026-01-01','2026-01-01','same-key'];
  const sql='INSERT INTO service_requests (organization_id,name,email,phone,address,service,description,source,priority,status,preferred_date,customer_id,job_id,created_at,updated_at,submission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
  await client.execute({sql,args});
  await assert.rejects(()=>client.execute({sql,args}));
  await client.execute({sql,args:[2,...args.slice(1)]});
  assert.equal((await client.execute('SELECT count(*) AS total FROM service_requests')).rows[0].total,2);
  client.close();
});

test('dispatch validation understands shop-local time and exact boundaries', () => {
  assert.equal(localStart('2026-09-06T09:30'),'2026-09-06T09:30');
  assert.equal(overlaps('2026-09-06T09:00',60,'2026-09-06T09:59',30),true);
  assert.equal(overlaps('2026-09-06T09:00',60,'2026-09-06T10:00',30),false);
  assert.throws(()=>localStart('2026-09-06T25:00'));
});

test('agreement visit cadence clamps safely at month end', () => {
  assert.equal(advanceMonths('2026-01-31',1),'2026-02-28');
  assert.equal(advanceMonths('2028-01-31',1),'2028-02-29');
  assert.equal(validDate('2026-09-06'),'2026-09-06');
});

test('every schedule entry point uses the transactional dispatcher', () => {
  const actions=readFileSync(new URL('../app/actions.ts',import.meta.url),'utf8');
  const api=readFileSync(new URL('../app/api/jobs/[id]/reschedule/route.ts',import.meta.url),'utf8');
  assert.match(actions,/saveJobWithDispatch\(/);
  assert.match(actions,/scheduleJob\(org\.id/);
  assert.match(api,/scheduleJob\(org\.id/);
});
