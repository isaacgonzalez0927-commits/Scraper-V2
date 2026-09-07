import type { Client, InValue, Transaction } from '@libsql/client';
import { getClient, nowISO, token } from './db';
import { addDaysISO } from './labels';
import { advanceMonths, integer, localStart, overlaps, PRIORITIES, REQUEST_STATUSES, requiredText, safeEmail, validDate } from './operations-validation';

type Executor = Pick<Client, 'execute'>;
type Row = Record<string, unknown>;
function camel(row: Row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])); }
export async function rows<T>(sql: string, args: InValue[] = [], executor: Executor = getClient()): Promise<T[]> {
  const result = await executor.execute({ sql, args });
  return result.rows.map(row => camel(row as unknown as Row) as T);
}
export async function write<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await getClient().transaction('write');
  try { const result = await fn(tx); await tx.commit(); return result; }
  catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}
async function owned(tx: Executor, table: string, organizationId: number, id: number) {
  const allowed = ['jobs', 'customers', 'crew_members', 'inventory_items', 'service_agreements', 'service_requests', 'equipment_assets'];
  if (!allowed.includes(table)) throw new Error('Unknown record type.');
  const [row] = await rows<Row>(`SELECT * FROM ${table} WHERE organization_id=? AND id=?`, [organizationId, id], tx);
  if (!row) throw new Error('This record is unavailable in your business.');
  return row;
}

export type CrewMember = { id: number; organizationId: number; name: string; email: string; phone: string; skills: string; color: string; hourlyCostCents: number; active: number };
export type ServiceRequest = { id: number; organizationId: number; name: string; email: string; phone: string; address: string; service: string; description: string; priority: string; status: string; source: string; preferredDate: string; customerId: number | null; jobId: number | null; estimateId: number | null; createdAt: string; updatedAt: string };
export type Agreement = { id: number; customerId: number; customerName: string; name: string; status: string; amountCents: number; billingMonths: number; visitMonths: number; nextVisit: string; renewsOn: string; notes: string };
export type Equipment = { id: number; customerId: number; customerName: string; propertyId: number | null; name: string; model: string; serial: string; installedOn: string; warrantyUntil: string; nextService: string; notes: string };
export type InventoryItem = { id: number; name: string; sku: string; location: string; supplier: string; quantity: number; reorderAt: number; unitCostCents: number };
export type FieldEntry = { id: number; jobId: number; kind: string; body: string; minutes: number; capturedAt: string; createdAt: string; userName: string };
export type ChecklistItem = { id: number; jobId: number; label: string; done: number; version: number };
export type OperationsSettings = { bookingEnabled: number; bookingIntro: string; serviceArea: string; timezone: string };
export type DispatchJob = { id: number; customerId: number; customerName: string; title: string; description: string; status: string; scheduledStart: string | null; technicianName: string; teamMemberId: number | null; durationMinutes: number; priority: string; scheduleVersion: number; serviceLine1: string; serviceCity: string; estimatedRevenueCents: number; phone: string };

export const getCrew = (org: number) => rows<CrewMember>('SELECT * FROM crew_members WHERE organization_id=? ORDER BY active DESC, name', [org]);
export const getRequests = (org: number) => rows<ServiceRequest>('SELECT * FROM service_requests WHERE organization_id=? ORDER BY created_at DESC', [org]);
export const getAgreements = (org: number) => rows<Agreement>('SELECT a.*, c.name AS customer_name FROM service_agreements a JOIN customers c ON c.id=a.customer_id AND c.organization_id=a.organization_id WHERE a.organization_id=? ORDER BY a.next_visit, a.id', [org]);
export const getEquipment = (org: number, customerId?: number) => rows<Equipment>(`SELECT e.*, c.name AS customer_name FROM equipment_assets e JOIN customers c ON c.id=e.customer_id AND c.organization_id=e.organization_id WHERE e.organization_id=? ${customerId ? 'AND e.customer_id=?' : ''} ORDER BY e.next_service, e.name`, customerId ? [org, customerId] : [org]);
export const getInventory = (org: number) => rows<InventoryItem>('SELECT * FROM inventory_items WHERE organization_id=? ORDER BY name', [org]);
export const getDispatchJobs = (org: number) => rows<DispatchJob>('SELECT j.*, c.name AS customer_name, c.phone FROM jobs j JOIN customers c ON c.id=j.customer_id AND c.organization_id=j.organization_id WHERE j.organization_id=? ORDER BY j.scheduled_start, j.id', [org]);
export const getChecklist = (org: number, jobId: number) => rows<ChecklistItem>('SELECT * FROM job_checklist WHERE organization_id=? AND job_id=? ORDER BY id', [org, jobId]);
export const getFieldEntries = (org: number, jobId: number) => rows<FieldEntry>('SELECT f.*, u.name AS user_name FROM field_entries f LEFT JOIN users u ON u.id=f.user_id WHERE f.organization_id=? AND f.job_id=? ORDER BY f.created_at DESC', [org, jobId]);
export async function getOperationsSettings(org: number): Promise<OperationsSettings> {
  return (await rows<OperationsSettings>('SELECT * FROM operations_settings WHERE organization_id=?', [org]))[0] || { bookingEnabled: 0, bookingIntro: 'Tell us what you need and we will get back to you.', serviceArea: '', timezone: 'America/New_York' };
}

export async function saveCrew(org: number, data: { id?: number; name: string; email: string; phone: string; skills: string; color: string; hourlyCostCents: number; active: boolean }) {
  const name = requiredText(data.name, 'Name', 120), email = safeEmail(data.email);
  integer(data.hourlyCostCents, 'Hourly cost', 0, 1000000);
  if (!/^#[a-f\d]{6}$/i.test(data.color)) throw new Error('Choose a crew color.');
  return write(async tx => {
    if (data.id) await owned(tx, 'crew_members', org, data.id);
    const duplicate = await rows('SELECT id FROM crew_members WHERE organization_id=? AND lower(name)=lower(?) AND id<>?', [org, name, data.id || 0], tx);
    if (duplicate.length) throw new Error('Use a distinct name for each crew member.');
    const args: InValue[] = [name, email, data.phone.slice(0,80), data.skills.slice(0,500), data.color, data.hourlyCostCents, data.active ? 1 : 0];
    if (data.id) {
      await tx.execute({ sql: 'UPDATE crew_members SET name=?,email=?,phone=?,skills=?,color=?,hourly_cost_cents=?,active=? WHERE organization_id=? AND id=?', args: [...args, org, data.id] });
      await tx.execute({ sql: 'UPDATE jobs SET technician_name=? WHERE organization_id=? AND team_member_id=?', args: [name, org, data.id] });
      return data.id;
    }
    return Number((await tx.execute({ sql: 'INSERT INTO crew_members (name,email,phone,skills,color,hourly_cost_cents,active,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [...args, org, nowISO()] })).lastInsertRowid);
  });
}

async function validateDispatch(tx: Executor, org: number, jobId: number, start: string | null, duration: number, memberId: number | null, legacyName = '') {
  integer(duration, 'Duration', 15, 1440);
  let name = legacyName.trim();
  if (memberId) {
    const member = await owned(tx, 'crew_members', org, memberId);
    if (!member.active) throw new Error('Choose an active crew member.');
    name = String(member.name);
  }
  if (start) localStart(start);
  if (start && name) {
    const others = await rows<DispatchJob>('SELECT * FROM jobs WHERE organization_id=? AND id<>? AND status NOT IN (\'completed\',\'cancelled\') AND scheduled_start IS NOT NULL AND ((team_member_id IS NOT NULL AND team_member_id=?) OR lower(technician_name)=lower(?))', [org, jobId, memberId, name], tx);
    const conflict = others.find(job => { try { return overlaps(start, duration, job.scheduledStart!, job.durationMinutes); } catch { return true; } });
    if (conflict) throw new Error(`${name} is already assigned to ${conflict.title} during that time.`);
  }
  return name;
}

/** Every job form and calendar move uses the same transactional conflict check. */
export async function saveJobWithDispatch(org: number, id: number, data: Record<string, string | number | null>, expectedVersion?: number) {
  return write(async tx => {
    const previous = id ? await owned(tx, 'jobs', org, id) : null;
    if (previous && expectedVersion !== undefined && previous.scheduleVersion !== expectedVersion) throw new Error('This job changed. Refresh to see the latest schedule.');
    const customerId = integer(data.customerId, 'Customer', 1);
    await owned(tx, 'customers', org, customerId);
    const title = requiredText(data.title, 'Job title', 200);
    if (!['unscheduled','scheduled','in_progress','completed','cancelled'].includes(String(data.status))) throw new Error('Choose a valid job status.');
    if (data.propertyId) {
      const property = await rows('SELECT id FROM properties WHERE organization_id=? AND customer_id=? AND id=?', [org, customerId, data.propertyId], tx);
      if (!property.length) throw new Error('Choose a property that belongs to this customer.');
    }
    const start = data.scheduledStart ? localStart(data.scheduledStart) : null;
    const duration = integer(data.durationMinutes ?? previous?.durationMinutes ?? 60, 'Duration', 15, 1440);
    const memberId = data.teamMemberId ? integer(data.teamMemberId, 'Crew member', 1) : null;
    const name = await validateDispatch(tx, org, id, ['completed','cancelled'].includes(String(data.status)) ? null : start, duration, memberId, String(data.technicianName || ''));
    const priority = String(data.priority || 'normal');
    if (!(PRIORITIES as readonly string[]).includes(priority)) throw new Error('Choose a valid priority.');
    const allowed = ['customerId','propertyId','description','serviceLine1','serviceCity','serviceState','servicePostal','status','estimatedRevenueCents','actualRevenueCents','estimatedCostCents','notes','details','completedAt'];
    const clean: Record<string, InValue> = Object.fromEntries(allowed.filter(key => key in data).map(key => [key, data[key]]));
    if (data.status === 'completed' && previous?.status !== 'completed') throw new Error('Use Finish and collect to record the work and final charge.');
    if (previous?.noCharge && data.status === 'completed' && Number(data.actualRevenueCents)) throw new Error('Reopen this no-charge job before changing its charge.');
    if (previous?.noCharge && data.status !== 'completed') clean.noCharge = 0;
    Object.assign(clean, { title, scheduledStart: start, durationMinutes: duration, teamMemberId: memberId, technicianName: name, priority });
    for (const key of ['estimatedRevenueCents','actualRevenueCents','estimatedCostCents']) integer(clean[key] ?? 0, 'Amount', 0, 1_000_000_000);
    const entries = Object.entries(clean);
    const columns = entries.map(([key]) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    if (id) {
      await tx.execute({ sql: `UPDATE jobs SET ${columns.map(key => `${key}=?`).join(',')},schedule_version=schedule_version+1 WHERE organization_id=? AND id=?`, args: [...entries.map(([,v]) => v), org, id] });
      return id;
    }
    return Number((await tx.execute({ sql: `INSERT INTO jobs (${columns.join(',')},organization_id,created_at) VALUES (${entries.map(() => '?').join(',')},?,?)`, args: [...entries.map(([,v]) => v), org, nowISO()] })).lastInsertRowid);
  });
}

export async function scheduleJob(org: number, id: number, input: { start: string; duration?: number; memberId?: number | null; version?: number; priority?: string }) {
  return write(async tx => {
    const job = await owned(tx, 'jobs', org, id);
    if (['completed','cancelled'].includes(String(job.status))) throw new Error('Reopen the job before scheduling it.');
    if (input.version !== undefined && Number(job.scheduleVersion) !== input.version) throw new Error('The schedule changed. Refresh before moving this job.');
    const start = localStart(input.start);
    const duration = input.duration ?? Number(job.durationMinutes || 60);
    const memberId = input.memberId === undefined ? (job.teamMemberId ? Number(job.teamMemberId) : null) : input.memberId;
    const name = await validateDispatch(tx, org, id, start, duration, memberId, memberId ? '' : String(job.technicianName || ''));
    const priority = input.priority || String(job.priority);
    if (!(PRIORITIES as readonly string[]).includes(priority)) throw new Error('Choose a valid priority.');
    await tx.execute({ sql: 'UPDATE jobs SET scheduled_start=?,duration_minutes=?,team_member_id=?,technician_name=?,priority=?,status=CASE WHEN status=\'in_progress\' THEN status ELSE \'scheduled\' END,schedule_version=schedule_version+1 WHERE organization_id=? AND id=?', args: [start, duration, memberId, name, priority, org, id] });
    return id;
  });
}

export async function setJobStatus(org:number,id:number,status:string) {
  if (!['unscheduled','scheduled','in_progress','cancelled'].includes(status)) throw new Error('Use Finish and collect to complete a job.');
  return write(async tx=>{
    const job=await owned(tx,'jobs',org,id);
    if(status==='scheduled'||status==='in_progress') {
      await validateDispatch(tx,org,id,job.scheduledStart?String(job.scheduledStart):null,Number(job.durationMinutes),job.teamMemberId?Number(job.teamMemberId):null,String(job.technicianName));
    }
    await tx.execute({sql:'UPDATE jobs SET status=?,completed_at=NULL,no_charge=0,schedule_version=schedule_version+1 WHERE organization_id=? AND id=?',args:[status,org,id]});
  });
}

export async function createRequest(org: number, data: { name: string; email: string; phone: string; address: string; service: string; description: string; preferredDate: string; priority: string; submissionKey: string }, isPublic = false) {
  const name = requiredText(data.name, 'Name', 120), service = requiredText(data.service, 'Service', 200);
  const email = safeEmail(data.email), phone = data.phone.trim().slice(0,80);
  if (!email && !phone) throw new Error('Add an email or phone number so we can reach you.');
  const preferred = validDate(data.preferredDate, true);
  if (!(PRIORITIES as readonly string[]).includes(data.priority)) throw new Error('Choose a valid priority.');
  const key = requiredText(data.submissionKey, 'Request key', 100);
  return write(async tx => {
    const [existing] = await rows<{ id: number }>('SELECT id FROM service_requests WHERE organization_id=? AND submission_key=?', [org, key], tx);
    if (existing) return existing.id;
    if (isPublic) {
      const [settings] = await rows<OperationsSettings>('SELECT * FROM operations_settings WHERE organization_id=?', [org], tx);
      if (!settings?.bookingEnabled) throw new Error('Online requests are currently closed. Please contact the business.');
      const recent = await rows<{ total: number }>('SELECT count(*) AS total FROM service_requests WHERE organization_id=? AND source=\'website\' AND created_at>? AND (email=? OR phone=?)', [org, new Date(Date.now()-3600000).toISOString(), email || '__no_email__', phone || '__no_phone__'], tx);
      if (recent[0].total >= 5) throw new Error('We already have your requests. Please contact the business for an update.');
    }
    const now = nowISO();
    return Number((await tx.execute({ sql: 'INSERT INTO service_requests (organization_id,name,email,phone,address,service,description,preferred_date,priority,source,created_at,updated_at,submission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [org,name,email,phone,data.address.slice(0,500),service,data.description.slice(0,4000),preferred,data.priority,isPublic ? 'website' : 'office',now,now,key] })).lastInsertRowid);
  });
}

export async function updateRequest(org: number, id: number, status: string) {
  if (!(REQUEST_STATUSES as readonly string[]).includes(status)) throw new Error('Choose a valid stage.');
  if (status === 'booked') throw new Error('Create a job to move this request to Booked.');
  return write(async tx => {
    const request = await owned(tx, 'service_requests', org, id);
    if (request.jobId) throw new Error('This request already has a job. Update the job directly.');
    await tx.execute({ sql: 'UPDATE service_requests SET status=?,updated_at=? WHERE organization_id=? AND id=?', args: [status,nowISO(),org,id] });
  });
}

export async function convertRequest(org: number, id: number, target: 'job' | 'estimate') {
  return write(async tx => {
    const request = await owned(tx, 'service_requests', org, id);
    if (request.jobId) return { customerId: Number(request.customerId), jobId: Number(request.jobId), estimateId: request.estimateId ? Number(request.estimateId) : null };
    if (request.estimateId) return { customerId: Number(request.customerId), jobId: null, estimateId: Number(request.estimateId) };
    if (request.status === 'lost') throw new Error('Reopen the request before creating work.');
    let customerId = Number(request.customerId || 0);
    if (!customerId) {
      const matches = request.email ? await rows<{ id: number }>('SELECT id FROM customers WHERE organization_id=? AND lower(email)=lower(?) AND archived_at IS NULL', [org,String(request.email)],tx) : [];
      if (matches.length > 1) throw new Error('More than one customer uses that email. Resolve the duplicate customer records first.');
      customerId = matches[0]?.id || Number((await tx.execute({ sql: 'INSERT INTO customers (organization_id,name,email,phone,service_line1,billing_line1,customer_since,public_token,created_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [org,String(request.name),String(request.email),String(request.phone),String(request.address),String(request.address),nowISO().slice(0,10),token(),nowISO()] })).lastInsertRowid);
    }
    const customer = await owned(tx, 'customers', org, customerId);
    if (customer.archivedAt) throw new Error('Restore this customer before creating work.');
    let jobId: number | null = null;
    let estimateId: number | null = null;
    if (target === 'job') {
      jobId = Number((await tx.execute({ sql: 'INSERT INTO jobs (organization_id,customer_id,title,description,service_line1,service_city,service_state,service_postal,priority,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,\'unscheduled\',?)', args: [org,customerId,String(request.service),String(request.description),String(request.address||customer.serviceLine1),request.address?'':String(customer.serviceCity),request.address?'':String(customer.serviceState),request.address?'':String(customer.servicePostal),String(request.priority),nowISO()] })).lastInsertRowid);
    } else {
      const [shop] = await rows<{estimatePrefix:string;nextEstimateNumber:number;defaultTaxBps:number}>('SELECT estimate_prefix,next_estimate_number,default_tax_bps FROM organizations WHERE id=?',[org],tx);
      if (!shop) throw new Error('Business not found.');
      const number = `${shop.estimatePrefix}${shop.nextEstimateNumber}`, now = nowISO();
      await tx.execute({sql:'UPDATE organizations SET next_estimate_number=next_estimate_number+1 WHERE id=?',args:[org]});
      estimateId = Number((await tx.execute({sql:'INSERT INTO estimates (organization_id,customer_id,number,status,issue_date,valid_until,notes,tax_bps,public_token,created_at,updated_at) VALUES (?,?,?,\'draft\',?,?,?,?,?,?,?)',args:[org,customerId,number,now.slice(0,10),addDaysISO(now.slice(0,10),30),String(request.description),shop.defaultTaxBps,token(),now,now]})).lastInsertRowid);
      await tx.execute({sql:'INSERT INTO estimate_lines (organization_id,estimate_id,description,quantity,unit_price_cents,amount_cents) VALUES (?,?,?,\'1\',0,0)',args:[org,estimateId,String(request.service)]});
      await tx.execute({sql:'INSERT INTO estimate_events (organization_id,estimate_id,kind,message,created_at) VALUES (?,?,\'created\',?,?)',args:[org,estimateId,`Draft created from request #${id}; pricing required.`,now]});
    }
    await tx.execute({ sql: 'UPDATE service_requests SET customer_id=?,job_id=?,estimate_id=?,status=?,updated_at=? WHERE organization_id=? AND id=?', args: [customerId,jobId,estimateId,jobId ? 'booked' : 'qualified',nowISO(),org,id] });
    return { customerId, jobId, estimateId };
  });
}

export async function saveAgreement(org: number, data: { id?: number; customerId: number; name: string; amountCents: number; billingMonths: number; visitMonths: number; nextVisit: string; renewsOn: string; notes: string }) {
  const name = requiredText(data.name, 'Plan name', 160);
  integer(data.amountCents,'Amount',0,100_000_000); integer(data.billingMonths,'Billing interval',1,36); integer(data.visitMonths,'Visit interval',1,36);
  const next = validDate(data.nextVisit), renewal = validDate(data.renewsOn,true);
  return write(async tx => {
    await owned(tx,'customers',org,data.customerId);
    if (data.id) await owned(tx,'service_agreements',org,data.id);
    const args: InValue[] = [data.customerId,name,data.amountCents,data.billingMonths,data.visitMonths,next,renewal,data.notes.slice(0,3000)];
    if (data.id) return tx.execute({ sql: 'UPDATE service_agreements SET customer_id=?,name=?,amount_cents=?,billing_months=?,visit_months=?,next_visit=?,renews_on=?,notes=? WHERE organization_id=? AND id=?', args: [...args,org,data.id] });
    return tx.execute({ sql: 'INSERT INTO service_agreements (customer_id,name,amount_cents,billing_months,visit_months,next_visit,renews_on,notes,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', args: [...args,org,nowISO()] });
  });
}
export async function setAgreementStatus(org: number, id: number, status: string) {
  if (!['active','paused','cancelled'].includes(status)) throw new Error('Choose a valid agreement status.');
  await getClient().execute({ sql: 'UPDATE service_agreements SET status=? WHERE organization_id=? AND id=?', args: [status,org,id] });
}
export async function createAgreementVisit(org: number, id: number, occurrence: string) {
  validDate(occurrence);
  return write(async tx => {
    const agreement = await owned(tx,'service_agreements',org,id);
    const [existing] = await rows<{jobId:number}>('SELECT job_id FROM agreement_visits WHERE organization_id=? AND agreement_id=? AND occurrence=?',[org,id,occurrence],tx);
    if (existing) return existing.jobId;
    if (agreement.status !== 'active') throw new Error('Resume the agreement before creating a visit.');
    if (agreement.nextVisit !== occurrence) throw new Error('The next visit has changed. Refresh the agreement.');
    const customer = await owned(tx,'customers',org,Number(agreement.customerId));
    const jobId = Number((await tx.execute({ sql: 'INSERT INTO jobs (organization_id,customer_id,title,description,service_line1,service_city,service_state,service_postal,status,created_at) VALUES (?,?,?,?,?,?,?,?,\'unscheduled\',?)', args: [org,Number(customer.id),String(agreement.name),`Service agreement visit due ${occurrence}. ${agreement.notes || ''}`,String(customer.serviceLine1),String(customer.serviceCity),String(customer.serviceState),String(customer.servicePostal),nowISO()] })).lastInsertRowid);
    await tx.execute({ sql: 'INSERT INTO agreement_visits (organization_id,agreement_id,occurrence,job_id,created_at) VALUES (?,?,?,?,?)', args: [org,id,occurrence,jobId,nowISO()] });
    await tx.execute({ sql: 'UPDATE service_agreements SET next_visit=? WHERE organization_id=? AND id=?', args: [advanceMonths(occurrence,Number(agreement.visitMonths)),org,id] });
    return jobId;
  });
}

export async function saveEquipment(org: number, data: { id?: number; customerId:number; propertyId:number|null; name:string; model:string; serial:string; installedOn:string; warrantyUntil:string; nextService:string; notes:string }) {
  const name = requiredText(data.name,'Equipment name',160);
  const dates = [data.installedOn,data.warrantyUntil,data.nextService].map(d => validDate(d,true));
  return write(async tx => {
    await owned(tx,'customers',org,data.customerId);
    if (data.id) await owned(tx,'equipment_assets',org,data.id);
    if (data.propertyId && !(await rows('SELECT id FROM properties WHERE organization_id=? AND customer_id=? AND id=?',[org,data.customerId,data.propertyId],tx)).length) throw new Error('Choose a property belonging to this customer.');
    const args:InValue[] = [data.customerId,data.propertyId,name,data.model.slice(0,200),data.serial.slice(0,200),...dates,data.notes.slice(0,3000)];
    if (data.id) return tx.execute({sql:'UPDATE equipment_assets SET customer_id=?,property_id=?,name=?,model=?,serial=?,installed_on=?,warranty_until=?,next_service=?,notes=? WHERE organization_id=? AND id=?',args:[...args,org,data.id]});
    return tx.execute({sql:'INSERT INTO equipment_assets (customer_id,property_id,name,model,serial,installed_on,warranty_until,next_service,notes,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',args:[...args,org,nowISO()]});
  });
}

export async function saveInventoryItem(org: number, data: {name:string;sku:string;location:string;supplier:string;quantity:number;reorderAt:number;unitCostCents:number}) {
  const name=requiredText(data.name,'Item name',160);
  integer(data.quantity,'Quantity'); integer(data.reorderAt,'Reorder level'); integer(data.unitCostCents,'Unit cost',0,10000000);
  return getClient().execute({sql:'INSERT INTO inventory_items (organization_id,name,sku,location,supplier,quantity,reorder_at,unit_cost_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)',args:[org,name,data.sku.slice(0,100),data.location.slice(0,100)||'Shop',data.supplier.slice(0,200),data.quantity,data.reorderAt,data.unitCostCents,nowISO()]});
}
export async function moveStock(org:number, data:{itemId:number;jobId:number|null;delta:number;note:string;mutationId:string}) {
  integer(data.delta,'Stock change',-100000,100000); if (!data.delta) throw new Error('Enter a stock change.');
  const key=requiredText(data.mutationId,'Stock change key',100);
  return write(async tx=>{
    const prior=await rows<{id:number;itemId:number;jobId:number|null;delta:number}>('SELECT id,item_id,job_id,delta FROM stock_movements WHERE organization_id=? AND mutation_id=?',[org,key],tx);
    if (prior.length) {
      if (prior[0].itemId!==data.itemId || prior[0].delta!==data.delta || prior[0].jobId!==data.jobId) throw new Error('This stock change key was already used for another operation.');
      return;
    }
    const item=await owned(tx,'inventory_items',org,data.itemId);
    if (data.jobId) await owned(tx,'jobs',org,data.jobId);
    if (data.delta<0 && !data.jobId) throw new Error('Choose the job using these parts.');
    if (Number(item.quantity)+data.delta<0) throw new Error('There is not enough stock for this job.');
    await tx.execute({sql:'UPDATE inventory_items SET quantity=quantity+? WHERE organization_id=? AND id=?',args:[data.delta,org,data.itemId]});
    await tx.execute({sql:'INSERT INTO stock_movements (organization_id,item_id,job_id,delta,note,created_at,mutation_id) VALUES (?,?,?,?,?,?,?)',args:[org,data.itemId,data.jobId,data.delta,data.note.slice(0,500),nowISO(),key]});
    if (data.delta<0 && data.jobId) await tx.execute({sql:'INSERT INTO job_costs (organization_id,job_id,category,description,amount_cents,created_at) VALUES (?,?,\'materials\',?,?,?)',args:[org,data.jobId,`${-data.delta} × ${item.name}`,(-data.delta)*Number(item.unitCostCents),nowISO()]});
  });
}

export async function addChecklist(org:number,jobId:number,label:string) {
  requiredText(label,'Checklist item',240);
  return write(async tx=>{ await owned(tx,'jobs',org,jobId); await tx.execute({sql:'INSERT INTO job_checklist (organization_id,job_id,label,updated_at) VALUES (?,?,?,?)',args:[org,jobId,label.trim(),nowISO()]}); });
}
export async function saveFieldEntry(org:number,userId:number,data:{jobId:number;kind:string;body:string;minutes:number;capturedAt:string;mutationId:string;checklistId?:number;done?:boolean;version?:number}) {
  const kind=data.kind;
  if (!['note','time','checklist','photo'].includes(kind)) throw new Error('Choose a supported field update.');
  const key=requiredText(data.mutationId,'Field update key',100);
  if (kind==='note') requiredText(data.body,'Note',6000);
  if (kind==='time') { integer(data.minutes,'Minutes',1,1440); requiredText(data.body,'Work performed',1000); }
  if (kind==='photo' && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.body) || data.body.length>500000)) throw new Error('Choose a JPEG, PNG, or WebP photo under 350 KB.');
  if (!Number.isFinite(Date.parse(data.capturedAt)) || Date.parse(data.capturedAt)>Date.now()+86400000) throw new Error('The capture time is invalid.');
  return write(async tx=>{
    await owned(tx,'jobs',org,data.jobId);
    const previous=await rows<{id:number;jobId:number;kind:string}>('SELECT id,job_id,kind FROM field_entries WHERE organization_id=? AND mutation_id=?',[org,key],tx);
    if (previous.length) {
      if (previous[0].jobId!==data.jobId || previous[0].kind!==kind) throw new Error('This field update key was already used.');
      return { duplicate:true };
    }
    if (kind==='checklist') {
      integer(data.checklistId,'Checklist item',1); integer(data.version,'Checklist version',0);
      if (typeof data.done !== 'boolean') throw new Error('Choose a valid checklist state.');
      const [item]=await rows<ChecklistItem>('SELECT * FROM job_checklist WHERE organization_id=? AND job_id=? AND id=?',[org,data.jobId,data.checklistId!],tx);
      if (!item) throw new Error('This checklist item is unavailable.');
      if (item.version!==data.version) throw new Error('This checklist changed on another device. Refresh the job before trying again.');
      await tx.execute({sql:'UPDATE job_checklist SET done=?,version=version+1,updated_at=? WHERE organization_id=? AND id=?',args:[data.done ? 1:0,nowISO(),org,item.id]});
      data.body=`${data.done ? 'Completed' : 'Reopened'}: ${item.label}`;
    }
    if (kind==='photo') {
      const [count]=await rows<{total:number}>('SELECT count(*) AS total FROM field_entries WHERE organization_id=? AND job_id=? AND kind=\'photo\'',[org,data.jobId],tx);
      if (count.total>=25) throw new Error('This job already has 25 field photos. Add additional photos to your document storage.');
    }
    await tx.execute({sql:'INSERT INTO field_entries (organization_id,job_id,user_id,kind,body,minutes,captured_at,created_at,mutation_id) VALUES (?,?,?,?,?,?,?,?,?)',args:[org,data.jobId,userId,kind,data.body,kind==='time'?data.minutes:0,data.capturedAt,nowISO(),key]});
    if (kind==='note') await tx.execute({sql:'INSERT INTO notes (organization_id,job_id,body,created_at) VALUES (?,?,?,?)',args:[org,data.jobId,data.body,nowISO()]});
    if (kind==='time') {
      const [job]=await rows<{teamMemberId:number|null}>('SELECT team_member_id FROM jobs WHERE organization_id=? AND id=?',[org,data.jobId],tx);
      if (job?.teamMemberId) {
        const [member]=await rows<CrewMember>('SELECT * FROM crew_members WHERE organization_id=? AND id=?',[org,job.teamMemberId],tx);
        if (member?.hourlyCostCents) await tx.execute({sql:'INSERT INTO job_costs (organization_id,job_id,category,description,amount_cents,created_at) VALUES (?,?,\'labor\',?,?,?)',args:[org,data.jobId,`${data.minutes} minutes · ${member.name}: ${data.body}`,Math.round(member.hourlyCostCents*data.minutes/60),nowISO()]});
      }
    }
    return { duplicate:false };
  });
}

export async function operationsSnapshot(org:number) {
  const [requests,crew,agreements,inventory,equipment,dispatch]=await Promise.all([getRequests(org),getCrew(org),getAgreements(org),getInventory(org),getEquipment(org),getDispatchJobs(org)]);
  return {requests,crew,agreements,inventory,equipment,dispatch};
}
